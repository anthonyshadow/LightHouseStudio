import { VIDEO_JOB_TTL_MS } from '@studio/contracts';
import { applyAiUsageTransition, type AiUsageEntry } from '@studio/domain';
import { describe, expect, it, vi } from 'vitest';
import type {
  DurableProcessingJobOutcome,
  DurableProcessingJobRepository,
} from '../processing-jobs/file-processing-job-repository.js';
import type { AiUsageLedgerRepository } from './ai-usage-ledger-repository.js';
import { AiUsageReconciler, type AiUsageReconcilerLog } from './ai-usage-reconciler.js';

const OWNER = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const OTHER_OWNER = '5f2f1f0e-6a48-4f2f-9c2b-1f3d6f0b8a11';
const JOB = '720620f6-446b-4987-828e-bc23470e613d';
const OTHER_JOB = '9826fc75-4759-47cc-b07d-d7325ce0ad14';
const THIRD_JOB = '1a3d2e5c-7b40-4a9e-8c1f-3d5b7e9a0c24';
const SUBMITTED_AT = '2026-09-05T10:00:00.000Z';
const SUBMITTED_MS = Date.parse(SUBMITTED_AT);
const RECONCILIATION_FAILED = '[video-job-progression] Ledger reconciliation failed.';

const entry = (overrides: Partial<AiUsageEntry> = {}): AiUsageEntry => ({
  ownerUserId: OWNER,
  jobId: JOB,
  operation: 'character-swap',
  provider: 'decart',
  outcome: null,
  submittedAt: SUBMITTED_AT,
  completedAt: null,
  ...overrides,
});

/** A port stand-in that answers only the methods a test names, so an unexpected call is visible. */
const unstubbed = (method: string) => (): Promise<never> =>
  Promise.reject(new Error(`${method} is not stubbed for this test.`));

/**
 * The ledger the reconciler writes through, applying the real transition rule. The rule is the only
 * thing standing between a sweep and a reopened row, so a fake that merely stored what it was handed
 * would prove nothing about the pair.
 */
class InMemoryLedger implements AiUsageLedgerRepository {
  rows: readonly AiUsageEntry[];
  readonly recorded: AiUsageEntry[] = [];
  readonly #open: readonly AiUsageEntry[] | null;
  readonly #failFor: ReadonlySet<string>;

  constructor(options: {
    readonly rows: readonly AiUsageEntry[];
    /** A deliberately stale snapshot, for the window between a listing and a write. */
    readonly open?: readonly AiUsageEntry[];
    readonly failFor?: readonly string[];
  }) {
    this.rows = options.rows;
    this.#open = options.open ?? null;
    this.#failFor = new Set(options.failFor ?? []);
  }

  listForOwner = unstubbed('listForOwner');
  countByOutcome = unstubbed('countByOutcome');

  record(incoming: AiUsageEntry): Promise<void> {
    this.recorded.push(incoming);
    if (this.#failFor.has(incoming.jobId)) return Promise.reject(new TypeError('ledger is down'));
    const existing =
      this.rows.find(
        (row) => row.ownerUserId === incoming.ownerUserId && row.jobId === incoming.jobId,
      ) ?? null;
    const next = applyAiUsageTransition(existing, incoming);
    if (next === null) return Promise.resolve();
    this.rows =
      existing === null
        ? [...this.rows, next]
        : this.rows.map((row) =>
            row.ownerUserId === next.ownerUserId && row.jobId === next.jobId ? next : row,
          );
    return Promise.resolve();
  }

  listOpen(limit: number): Promise<readonly AiUsageEntry[]> {
    const open = this.#open ?? this.rows.filter((row) => row.outcome === null);
    return Promise.resolve(open.slice(0, limit));
  }

  stored(ownerUserId: string, jobId: string): AiUsageEntry | undefined {
    return this.rows.find((row) => row.ownerUserId === ownerUserId && row.jobId === jobId);
  }
}

type DurableOutcomesByOwner = Readonly<
  Record<string, Readonly<Record<string, DurableProcessingJobOutcome>>>
>;

const durableStore = (outcomes: DurableOutcomesByOwner, unreachable: readonly string[] = []) => {
  const down = new Set(unreachable);
  const findOutcomes = vi.fn((ownerUserId: string, jobIds: readonly string[]) => {
    if (down.has(ownerUserId)) return Promise.reject(new RangeError('durable store is down'));
    const owned = outcomes[ownerUserId] ?? {};
    const found = new Map<string, DurableProcessingJobOutcome>();
    for (const jobId of jobIds) {
      const outcome = owned[jobId];
      if (outcome !== undefined) found.set(jobId, outcome);
    }
    return Promise.resolve(found);
  });
  const repository: DurableProcessingJobRepository = {
    admit: unstubbed('admit'),
    upsert: unstubbed('upsert'),
    listResumable: unstubbed('listResumable'),
    findOutcomes,
  };
  return { repository, findOutcomes };
};

const recordingLog = () => {
  const warn = vi.fn<AiUsageReconcilerLog['warn']>();
  const log: AiUsageReconcilerLog = { warn };
  return { log, warn };
};

describe('AiUsageReconciler', () => {
  it('closes a row whose durable job a restart expired', async () => {
    const ledger = new InMemoryLedger({ rows: [entry()] });
    const durable = durableStore({
      [OWNER]: {
        [JOB]: {
          status: 'expired',
          completedAt: '2026-09-05T11:00:00.000Z',
          updatedAt: '2026-09-05T11:00:01.000Z',
        },
      },
    });
    const reconciler = new AiUsageReconciler(ledger, durable.repository);

    await expect(reconciler.reconcile(SUBMITTED_MS + 60_000, 25)).resolves.toBe(1);
    expect(ledger.stored(OWNER, JOB)).toEqual(
      entry({ outcome: 'expired', completedAt: '2026-09-05T11:00:00.000Z' }),
    );
  });

  it('dates a durable job that recorded no completion by its last update', async () => {
    const ledger = new InMemoryLedger({ rows: [entry()] });
    const durable = durableStore({
      [OWNER]: {
        [JOB]: { status: 'failed', completedAt: null, updatedAt: '2026-09-05T10:30:00.000Z' },
      },
    });
    const reconciler = new AiUsageReconciler(ledger, durable.repository);

    await expect(reconciler.reconcile(SUBMITTED_MS + 60_000, 25)).resolves.toBe(1);
    expect(ledger.stored(OWNER, JOB)).toEqual(
      entry({ outcome: 'failed', completedAt: '2026-09-05T10:30:00.000Z' }),
    );
  });

  it('leaves a row alone while its durable job is still running', async () => {
    const ledger = new InMemoryLedger({ rows: [entry()] });
    const durable = durableStore({
      [OWNER]: {
        [JOB]: { status: 'processing', completedAt: null, updatedAt: '2026-09-05T10:30:00.000Z' },
      },
    });
    const reconciler = new AiUsageReconciler(ledger, durable.repository);

    await expect(reconciler.reconcile(SUBMITTED_MS + VIDEO_JOB_TTL_MS, 25)).resolves.toBe(0);
    expect(ledger.recorded).toEqual([]);
    expect(ledger.stored(OWNER, JOB)?.outcome).toBeNull();
  });

  it('calls a row with no durable job ambiguous only once its deadline has passed', async () => {
    const ledger = new InMemoryLedger({ rows: [entry()] });
    const durable = durableStore({});
    const closedAtMs = SUBMITTED_MS + VIDEO_JOB_TTL_MS + 250;
    const reconciler = new AiUsageReconciler(ledger, durable.repository, {
      now: () => closedAtMs,
    });

    await expect(reconciler.reconcile(SUBMITTED_MS + VIDEO_JOB_TTL_MS - 1, 25)).resolves.toBe(0);
    expect(ledger.recorded).toEqual([]);

    await expect(reconciler.reconcile(SUBMITTED_MS + VIDEO_JOB_TTL_MS, 25)).resolves.toBe(1);
    expect(ledger.stored(OWNER, JOB)).toEqual(
      entry({ outcome: 'ambiguous', completedAt: new Date(closedAtMs).toISOString() }),
    );
  });

  it('never reopens or re-times a row a closer settled first', async () => {
    const settled = entry({ outcome: 'succeeded', completedAt: '2026-09-05T10:02:00.000Z' });
    // The listing is the snapshot the pass began with; the row settled while it was reading.
    const ledger = new InMemoryLedger({ rows: [settled], open: [entry()] });
    const durable = durableStore({
      [OWNER]: {
        [JOB]: {
          status: 'failed',
          completedAt: '2026-09-05T10:09:00.000Z',
          updatedAt: '2026-09-05T10:09:00.000Z',
        },
      },
    });
    const reconciler = new AiUsageReconciler(ledger, durable.repository);

    await reconciler.reconcile(SUBMITTED_MS + 60_000, 25);

    expect(ledger.stored(OWNER, JOB)).toEqual(settled);
  });

  it('reads the durable store once per owner, not once per row', async () => {
    const ledger = new InMemoryLedger({
      rows: [
        entry(),
        entry({ jobId: OTHER_JOB }),
        entry({ ownerUserId: OTHER_OWNER, jobId: JOB }),
        entry({ ownerUserId: OTHER_OWNER, jobId: THIRD_JOB }),
      ],
    });
    const terminal: DurableProcessingJobOutcome = {
      status: 'ready',
      completedAt: '2026-09-05T10:20:00.000Z',
      updatedAt: '2026-09-05T10:20:00.000Z',
    };
    const durable = durableStore({
      [OWNER]: { [JOB]: terminal, [OTHER_JOB]: terminal },
      [OTHER_OWNER]: { [JOB]: terminal, [THIRD_JOB]: terminal },
    });
    const reconciler = new AiUsageReconciler(ledger, durable.repository);

    await expect(reconciler.reconcile(SUBMITTED_MS + 60_000, 25)).resolves.toBe(4);
    expect(durable.findOutcomes).toHaveBeenCalledTimes(2);
    expect(durable.findOutcomes).toHaveBeenNthCalledWith(1, OWNER, [JOB, OTHER_JOB]);
    expect(durable.findOutcomes).toHaveBeenNthCalledWith(2, OTHER_OWNER, [JOB, THIRD_JOB]);
    expect(ledger.rows.every((row) => row.outcome === 'succeeded')).toBe(true);
  });

  it('finishes the pass when one row cannot be written, naming ids only', async () => {
    const ledger = new InMemoryLedger({
      rows: [entry(), entry({ jobId: OTHER_JOB })],
      failFor: [JOB],
    });
    const terminal: DurableProcessingJobOutcome = {
      status: 'cancelled',
      completedAt: '2026-09-05T10:20:00.000Z',
      updatedAt: '2026-09-05T10:20:00.000Z',
    };
    const durable = durableStore({ [OWNER]: { [JOB]: terminal, [OTHER_JOB]: terminal } });
    const { log, warn } = recordingLog();
    const reconciler = new AiUsageReconciler(ledger, durable.repository, { log });

    await expect(reconciler.reconcile(SUBMITTED_MS + 60_000, 25)).resolves.toBe(1);
    expect(ledger.stored(OWNER, JOB)?.outcome).toBeNull();
    expect(ledger.stored(OWNER, OTHER_JOB)?.outcome).toBe('cancelled');
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { ownerUserId: OWNER, jobId: JOB, errorClass: 'TypeError' },
      RECONCILIATION_FAILED,
    );
  });

  it('skips an owner whose durable store is unreachable and closes the rest', async () => {
    const ledger = new InMemoryLedger({
      rows: [entry(), entry({ ownerUserId: OTHER_OWNER, jobId: OTHER_JOB })],
    });
    const durable = durableStore(
      {
        [OTHER_OWNER]: {
          [OTHER_JOB]: {
            status: 'ready',
            completedAt: '2026-09-05T10:20:00.000Z',
            updatedAt: '2026-09-05T10:20:00.000Z',
          },
        },
      },
      [OWNER],
    );
    const { log, warn } = recordingLog();
    const reconciler = new AiUsageReconciler(ledger, durable.repository, { log });

    await expect(reconciler.reconcile(SUBMITTED_MS + 60_000, 25)).resolves.toBe(1);
    expect(ledger.stored(OWNER, JOB)?.outcome).toBeNull();
    expect(ledger.stored(OTHER_OWNER, OTHER_JOB)?.outcome).toBe('succeeded');
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { ownerUserId: OWNER, errorClass: 'RangeError' },
      RECONCILIATION_FAILED,
    );
  });

  it('gives up the pass, quietly and safely, when the ledger cannot be listed', async () => {
    const ledger: AiUsageLedgerRepository = {
      listForOwner: unstubbed('listForOwner'),
      countByOutcome: unstubbed('countByOutcome'),
      record: unstubbed('record'),
      listOpen: () => Promise.reject(new SyntaxError('journal is unreadable')),
    };
    const durable = durableStore({});
    const { log, warn } = recordingLog();
    const reconciler = new AiUsageReconciler(ledger, durable.repository, { log });

    await expect(reconciler.reconcile(SUBMITTED_MS + 60_000, 25)).resolves.toBe(0);
    expect(durable.findOutcomes).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      { errorClass: 'SyntaxError' },
      RECONCILIATION_FAILED,
    );
  });
});
