import { VIDEO_JOB_TTL_MS } from '@studio/contracts';
import { aiUsageOutcomeForJobStatus, type AiUsageEntry } from '@studio/domain';
import type {
  DurableProcessingJobOutcome,
  DurableProcessingJobRepository,
} from '../processing-jobs/file-processing-job-repository.js';
import type { AiUsageLedgerRepository } from './ai-usage-ledger-repository.js';

/**
 * The reconciler's only way to say something went wrong: ids and an error class, never a provider
 * body, a job's inputs or a store's own message. Shaped so a pino logger satisfies it directly,
 * because the runner that schedules a pass already has a child logger for the subsystem.
 */
export interface AiUsageReconcilerLog {
  warn(details: Record<string, string>, message: string): void;
}

export interface AiUsageReconcilerOptions {
  readonly now?: () => number;
  readonly log?: AiUsageReconcilerLog;
}

/**
 * One line for every reconciliation failure, whichever pass produced it. It names the runner rather
 * than this module because both passes an operator can see — the one at startup and the periodic
 * one — belong to video job progression, and one string should find all of them.
 */
const RECONCILIATION_FAILED = '[video-job-progression] Ledger reconciliation failed.';

const errorClassOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : 'Error';

/**
 * What a pass built without a logger writes to. A sweep that fails every minute in silence is
 * indistinguishable from one that has nothing to do, so the fallback is loud rather than absent; it
 * matches the argument order the rest of this feature uses for the console.
 */
const consoleLog: AiUsageReconcilerLog = {
  warn: (details, message) => {
    console.warn(message, details);
  },
};

/**
 * Preserves the order `listOpen` chose, which is oldest submission first, both between owners and
 * within one: a bounded pass should spend its budget on the rows that have waited longest.
 */
const byOwner = (
  entries: readonly AiUsageEntry[],
): ReadonlyMap<string, readonly AiUsageEntry[]> => {
  const grouped = new Map<string, AiUsageEntry[]>();
  for (const entry of entries) {
    const owned = grouped.get(entry.ownerUserId);
    if (owned === undefined) grouped.set(entry.ownerUserId, [entry]);
    else owned.push(entry);
  }
  return grouped;
};

/**
 * Closes the usage rows nobody was watching.
 *
 * A row opens before a paid submission and normally closes when the path that observed the terminal
 * status writes the outcome. Two things break that pairing: a restart settles a durable job without
 * any in-process job to observe it, and a close can itself fail. Both leave a row that says a
 * submission is still running long after it stopped, so a third writer has to read the durable
 * answer and finish the row.
 *
 * It is read-only toward the durable store — it observes outcomes and transitions nothing, so a
 * sweep can never disturb restart recovery — and it only ever closes. Reopening and re-timing are
 * refused by `applyAiUsageTransition` inside `record`, which stays the sole owner of that rule.
 */
export class AiUsageReconciler {
  readonly #ledger: AiUsageLedgerRepository;
  readonly #durable: DurableProcessingJobRepository;
  readonly #now: () => number;
  readonly #log: AiUsageReconcilerLog;

  constructor(
    ledger: AiUsageLedgerRepository,
    durable: DurableProcessingJobRepository,
    options: AiUsageReconcilerOptions = {},
  ) {
    this.#ledger = ledger;
    this.#durable = durable;
    this.#now = options.now ?? Date.now;
    this.#log = options.log ?? consoleLog;
  }

  /**
   * One bounded pass: at most `limit` open rows, one durable read per distinct owner among them —
   * never one per row — and at most one ledger write each. Returns the rows this pass wrote an
   * outcome for, which is the work it did rather than a claim about the store: a write whose row a
   * closer settled first is dropped by the transition rule, correctly and invisibly.
   *
   * Two instants, deliberately. `nowMs` is when the pass was taken and is the only thing the
   * deadline is judged against, so a pass spanning several owners' reads cannot close a row that was
   * still inside its hour when the pass began. The injected clock stamps what the pass writes, read
   * at the write: the ambiguity is discovered now, not when the sweep started.
   *
   * Nothing here abandons the pass. One owner's unreadable store, or one row's failed write, costs
   * that owner or that row and no more — the alternative leaves every other account's finished
   * submissions reading as still running until the next pass, for a fault they had no part in.
   */
  async reconcile(nowMs: number, limit: number): Promise<number> {
    let open: readonly AiUsageEntry[];
    try {
      open = await this.#ledger.listOpen(limit);
    } catch (error) {
      this.#log.warn({ errorClass: errorClassOf(error) }, RECONCILIATION_FAILED);
      return 0;
    }

    let closed = 0;
    // Owners are read one after another rather than at once: a sweep runs unattended beside real
    // work, and the whole point of the budget is that it stays out of the way.
    for (const [ownerUserId, entries] of byOwner(open)) {
      let outcomes: ReadonlyMap<string, DurableProcessingJobOutcome>;
      try {
        outcomes = await this.#durable.findOutcomes(
          ownerUserId,
          entries.map((entry) => entry.jobId),
        );
      } catch (error) {
        this.#log.warn({ ownerUserId, errorClass: errorClassOf(error) }, RECONCILIATION_FAILED);
        continue;
      }

      for (const entry of entries) {
        const settled = this.#settle(entry, outcomes.get(entry.jobId), nowMs);
        if (settled === null) continue;
        try {
          await this.#ledger.record(settled);
          closed += 1;
        } catch (error) {
          this.#log.warn(
            { ownerUserId, jobId: entry.jobId, errorClass: errorClassOf(error) },
            RECONCILIATION_FAILED,
          );
        }
      }
    }
    return closed;
  }

  /**
   * The row to write for one open entry, or null to leave it open.
   *
   * Identity, operation, provider and `submittedAt` come from the ledger's own row: this writer saw
   * a durable trace, not the submission, and must not be able to restate what was submitted.
   */
  #settle(
    entry: AiUsageEntry,
    durable: DurableProcessingJobOutcome | undefined,
    nowMs: number,
  ): AiUsageEntry | null {
    if (durable !== undefined) {
      const outcome = aiUsageOutcomeForJobStatus(durable.status);
      // A durable row that is still running is the answer, not a missing one.
      if (outcome === null) return null;
      // A store that transitioned a job without recording a completion still dated the transition.
      return { ...entry, outcome, completedAt: durable.completedAt ?? durable.updatedAt };
    }

    // No durable row at all: nothing survived to say how the submission ended. Ambiguity is only
    // claimed once the job's own deadline has certainly passed, so a job a live process is still
    // about to close properly is never labelled from here — that deadline is `createdAt + TTL`,
    // always the earlier of the two, since a row opens after its job is created. An unreadable
    // instant yields no deadline at all, and the row waits for a reader that can make sense of it
    // rather than being called ambiguous over a parse failure.
    const deadlineMs = Date.parse(entry.submittedAt) + VIDEO_JOB_TTL_MS;
    if (Number.isNaN(deadlineMs) || deadlineMs > nowMs) return null;
    return { ...entry, outcome: 'ambiguous', completedAt: new Date(this.#now()).toISOString() };
  }
}
