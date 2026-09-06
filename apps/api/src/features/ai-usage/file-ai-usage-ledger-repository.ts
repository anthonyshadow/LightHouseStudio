import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  AI_USAGE_OUTCOMES,
  applyAiUsageTransition,
  type AiUsageEntry,
  type AiUsageOutcome,
  type AiUsageOutcomeCounts,
} from '@studio/domain';
import { persistedTimestampSchema } from '../../application/timestamps.js';
import type {
  AiUsageLedgerCursor,
  AiUsageLedgerPage,
  AiUsageLedgerRepository,
} from './ai-usage-ledger-repository.js';

/**
 * `operation` and `provider` are bounded strings rather than the unions the wire uses. A journal is
 * a record of what was already spent: a row naming an operation kind this build has renamed, or a
 * provider it has retired, must still parse, or one historical row would make the whole account's
 * spend unreadable.
 */
const journalEntrySchema = z
  .object({
    jobId: z.uuid(),
    operation: z.string().trim().min(1).max(80),
    provider: z.string().trim().min(1).max(80),
    outcome: z.enum(AI_USAGE_OUTCOMES).nullable(),
    submittedAt: persistedTimestampSchema,
    completedAt: persistedTimestampSchema.nullable(),
  })
  .strict();

/** The owner is the file name, so it is deliberately not repeated inside every row. */
const journalSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(journalEntrySchema),
  })
  .strict();

type LedgerKey = Pick<AiUsageEntry, 'submittedAt' | 'jobId'>;

/**
 * The page order, `(submittedAt, jobId)` both descending — the same pair and the same directions as
 * the relational owner index, so a cursor means the same thing in either store.
 *
 * Instants are compared as numbers rather than as text because a caller's `since` need not be
 * spelled the way a stored row is; job ids are compared as text, which for canonical UUIDs is the
 * order Postgres puts them in.
 */
const compareNewestFirst = (a: LedgerKey, b: LedgerKey): number => {
  const byInstant = Date.parse(b.submittedAt) - Date.parse(a.submittedAt);
  if (byInstant !== 0) return byInstant;
  if (a.jobId === b.jobId) return 0;
  return a.jobId > b.jobId ? -1 : 1;
};

const errorClassOf = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : 'Error';

/**
 * The local-mode AI usage ledger: one JSON journal per owner beside the processing-job traces.
 *
 * Writes are serialized by a private per-owner chain rather than the shared owner lock the Project
 * and saved-video journals take. A ledger row is opened in the middle of work that may already hold
 * that lock, and a ledger write is never part of a Project's transaction — it must not be able to
 * nest inside one.
 */
export class FileAiUsageLedgerRepository implements AiUsageLedgerRepository {
  readonly #root: string;
  readonly #writes = new Map<string, Promise<void>>();

  readonly #shadow: Pick<AiUsageLedgerRepository, 'record'> | undefined;

  constructor(
    dataDirectory: string,
    options: { readonly shadow?: Pick<AiUsageLedgerRepository, 'record'> } = {},
  ) {
    this.#root = path.resolve(dataDirectory, 'metadata', 'v1', 'ai-usage');
    this.#shadow = options.shadow;
  }

  #file(ownerUserId: string): string {
    return path.join(this.#root, `${z.uuid().parse(ownerUserId)}.json`);
  }

  /** An absent journal is an empty ledger; anything else — a bad schema included — is a fault. */
  async #read(ownerUserId: string): Promise<readonly AiUsageEntry[]> {
    try {
      const journal = journalSchema.parse(
        JSON.parse(await readFile(this.#file(ownerUserId), 'utf8')) as unknown,
      );
      return journal.entries.map((entry) => ({ ownerUserId, ...entry }));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async #write(ownerUserId: string, entries: readonly AiUsageEntry[]): Promise<void> {
    const journal = journalSchema.parse({
      schemaVersion: 1,
      entries: entries.map((entry) => ({
        jobId: entry.jobId,
        operation: entry.operation,
        provider: entry.provider,
        outcome: entry.outcome,
        submittedAt: entry.submittedAt,
        completedAt: entry.completedAt,
      })),
    });
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    await chmod(this.#root, 0o700);
    const file = this.#file(ownerUserId);
    const temporary = `${file}.tmp-${randomUUID()}`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(journal)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async #serialize(ownerUserId: string, work: () => Promise<void>): Promise<void> {
    const prior = this.#writes.get(ownerUserId) ?? Promise.resolve();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prior.then(() => barrier);
    this.#writes.set(ownerUserId, chain);
    await prior;
    try {
      await work();
    } finally {
      release();
      if (this.#writes.get(ownerUserId) === chain) this.#writes.delete(ownerUserId);
    }
  }

  async record(entry: AiUsageEntry): Promise<void> {
    const ownerUserId = z.uuid().parse(entry.ownerUserId);
    // The read and the write are one step: two writers reaching the same row would otherwise each
    // decide against a journal the other has already replaced.
    await this.#serialize(ownerUserId, async () => {
      const stored = await this.#read(ownerUserId);
      const existing = stored.find((candidate) => candidate.jobId === entry.jobId) ?? null;
      const next = applyAiUsageTransition(existing, entry);
      if (next === null) return;
      await this.#write(
        ownerUserId,
        existing === null
          ? [...stored, next]
          : stored.map((candidate) => (candidate.jobId === next.jobId ? next : candidate)),
      );
    });
    /*
     * Shadow mode only: the journal above is the authority and this is a best-effort copy into the
     * database the deployment is rehearsing a move to, so that a cutover does not begin with an
     * empty ledger. It is warn-only for the same reason the trace mirror is — a rehearsal store
     * must never be able to fail a submission — and it mirrors `record` alone, because the rule
     * that decides what a row becomes has one owner and both stores already apply it.
     */
    await this.#shadow?.record(entry).catch(() => {
      console.warn('[ai-usage] Shadow AI usage row could not be mirrored.', {
        jobId: entry.jobId,
      });
    });
  }

  async listForOwner(
    ownerUserId: string,
    options: {
      readonly since: string;
      readonly cursor?: AiUsageLedgerCursor | undefined;
      readonly pageSize: number;
    },
  ): Promise<AiUsageLedgerPage> {
    const sinceMs = Date.parse(options.since);
    const { cursor } = options;
    const ordered = (await this.#read(ownerUserId))
      .filter(
        (entry) =>
          Date.parse(entry.submittedAt) >= sinceMs &&
          // Everything the cursor's own position already handed out is behind it in this order.
          (cursor === undefined || compareNewestFirst(cursor, entry) < 0),
      )
      .sort(compareNewestFirst);
    const entries = ordered.slice(0, options.pageSize);
    const last = entries.at(-1);
    return {
      entries,
      nextCursor:
        ordered.length > options.pageSize && last !== undefined
          ? { submittedAt: last.submittedAt, jobId: last.jobId }
          : null,
    };
  }

  async countByOutcome(ownerUserId: string, since: string): Promise<AiUsageOutcomeCounts> {
    const sinceMs = Date.parse(since);
    const counts: Record<'running' | AiUsageOutcome, number> = {
      running: 0,
      succeeded: 0,
      failed: 0,
      ambiguous: 0,
      expired: 0,
      cancelled: 0,
    };
    for (const entry of await this.#read(ownerUserId)) {
      if (Date.parse(entry.submittedAt) < sinceMs) continue;
      counts[entry.outcome ?? 'running'] += 1;
    }
    return counts;
  }

  async listOpen(limit: number): Promise<readonly AiUsageEntry[]> {
    let files: readonly string[];
    try {
      files = await readdir(this.#root);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    const unsettled: AiUsageEntry[] = [];
    for (const file of files) {
      if (!/^[0-9a-f-]{36}\.json$/iu.test(file)) continue;
      const ownerUserId = file.slice(0, -5);
      try {
        for (const entry of await this.#read(ownerUserId)) {
          if (entry.outcome === null) unsettled.push(entry);
        }
      } catch (error) {
        // The reconciler sweeps every account. One unreadable journal is one account's problem, and
        // must not leave every other account's unfinished submissions unclosed.
        console.warn('[ai-usage] Usage journal could not be read.', {
          ownerUserId,
          errorClass: errorClassOf(error),
        });
      }
    }
    // Oldest submission first: a bounded pass then spends its budget on the rows that have been
    // open longest, instead of starving them behind whatever was submitted most recently.
    return unsettled.sort((a, b) => compareNewestFirst(b, a)).slice(0, limit);
  }
}
