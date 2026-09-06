import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { videoJobRecordedNameSchema } from '@studio/contracts';
import { z } from 'zod';
import {
  AI_USAGE_OUTCOMES,
  applyAiUsageTransition,
  emptyAiUsageOutcomeCounts,
  type AiUsageEntry,
  type AiUsageOutcomeCounts,
} from '@studio/domain';
import { KeyedLock } from '../../application/keyed-lock.js';
import { persistedTimestampSchema } from '../../application/timestamps.js';
import { errorClassOf } from '../../http/errors.js';
import type {
  AiUsageLedgerCursor,
  AiUsageLedgerPage,
  AiUsageLedgerRepository,
} from './ai-usage-ledger-repository.js';

const ownerIdSchema = z.uuid();

/**
 * `operation` and `provider` are recorded names, not the unions the wire uses to choose one. A
 * journal is a record of what was already spent: a row naming an operation kind this build has
 * renamed, or a provider it has retired, must still parse, or one historical row would make the
 * whole account's spend unreadable. The bound is the contract's, so the stored shape and the wire
 * shape cannot drift apart on what a recorded name may be.
 */
const journalEntrySchema = z
  .object({
    jobId: z.uuid(),
    operation: videoJobRecordedNameSchema,
    provider: videoJobRecordedNameSchema,
    outcome: z.enum(AI_USAGE_OUTCOMES).nullable(),
    submittedAt: persistedTimestampSchema,
    completedAt: persistedTimestampSchema.nullable(),
  })
  .strict();

type JournalRow = z.infer<typeof journalEntrySchema>;

/** The owner is the file name, so it is deliberately not repeated inside every row. */
const journalSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(journalEntrySchema),
  })
  .strict();

/** A ledger row as the journal spells it: everything but the owner, which the file name carries. */
const toJournalRow = (entry: AiUsageEntry): JournalRow => ({
  jobId: entry.jobId,
  operation: entry.operation,
  provider: entry.provider,
  outcome: entry.outcome,
  submittedAt: entry.submittedAt,
  completedAt: entry.completedAt,
});

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

/**
 * The write lock, keyed by the journal's own resolved path rather than held per instance.
 *
 * A journal is a file, and a read-modify-write of it is only serial if every writer in the process
 * queues on the same key. Two repositories over one data directory is not hypothetical — a test
 * builds a second one to prove a restart, and a mode that mirrors builds one beside another — and
 * with a per-instance lock the later rename simply erases the row the other had just written. The
 * loss is silent, and a row that was never written is invisible to the reconciler that exists to
 * catch open rows. It is deliberately its own instance rather than the shared owner lock the
 * Project and saved-video journals take: a ledger write happens in the middle of work that may
 * already hold that lock, and a private module-level instance nests inside nothing.
 */
const journalWrites = new KeyedLock();

/**
 * How many rows each journal holds open, keyed by that same resolved path.
 *
 * `listOpen` sweeps every account once a minute and almost always finds nothing; without this it
 * would read and validate every account's entire spend history to learn that. A path with no
 * recorded count is still read, so the first sweep after a boot sees all of disk.
 *
 * Only a writer records a count, and only the sweep's own read does so under the same key: an
 * unlocked reader can have opened the file before a write and finish parsing after it, and a stale
 * zero written from there would skip a journal that does hold an open row, permanently and
 * silently. Believing a count taken under the key still means believing nothing outside this
 * process edits these files, which is the assumption the store already runs on.
 */
const openRowCounts = new Map<string, number>();

const isOpen = (row: { readonly outcome: unknown }): boolean => row.outcome === null;

const openRowsIn = (rows: readonly JournalRow[]): number => rows.filter(isOpen).length;

/**
 * The local-mode AI usage ledger: one JSON journal per owner beside the processing-job traces.
 *
 * Alone among the owner-keyed file stores, the file is named for the owner id itself rather than a
 * hash of it, as the Project and saved-video journals are: `listOpen` reaches every account by
 * reading the directory, and the name is the only place the owner of an unfinished row can come
 * from once a journal has been found that way.
 */
export class FileAiUsageLedgerRepository implements AiUsageLedgerRepository {
  readonly #root: string;

  readonly #shadow: Pick<AiUsageLedgerRepository, 'record'> | undefined;

  constructor(
    dataDirectory: string,
    options: { readonly shadow?: Pick<AiUsageLedgerRepository, 'record'> } = {},
  ) {
    this.#root = path.resolve(dataDirectory, 'metadata', 'v1', 'ai-usage');
    this.#shadow = options.shadow;
  }

  #file(ownerUserId: string): string {
    return path.join(this.#root, `${ownerIdSchema.parse(ownerUserId)}.json`);
  }

  /** An absent journal is an empty ledger; anything else — a bad schema included — is a fault. */
  async #read(ownerUserId: string): Promise<readonly AiUsageEntry[]> {
    const file = this.#file(ownerUserId);
    try {
      const journal = journalSchema.parse(JSON.parse(await readFile(file, 'utf8')) as unknown);
      return journal.entries.map((entry) => ({ ownerUserId, ...entry }));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
  }

  /**
   * The rows go to disk as they stand. Every one of them either came back from `#read`, which
   * validated it, or is the single row `record` validated as it entered — so parsing the array
   * again here would spend an account's whole history to check what is already known good.
   */
  async #write(ownerUserId: string, entries: readonly AiUsageEntry[]): Promise<void> {
    const journal = { schemaVersion: 1, entries: entries.map(toJournalRow) };
    // Re-asserted per write, as every sibling file store does: two syscalls against a directory that
    // already exists are cheaper than a memo that would stop a removed root ever being remade, and
    // that keeps the mode true rather than merely true once.
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
    openRowCounts.set(file, openRowsIn(journal.entries));
  }

  /** Keyed by the journal's own path, so every writer over one file queues behind the same key. */
  #serialize<Result>(ownerUserId: string, work: () => Promise<Result>): Promise<Result> {
    return journalWrites.run(this.#file(ownerUserId), work);
  }

  async record(entry: AiUsageEntry): Promise<void> {
    const { ownerUserId } = entry;
    // The only row a write can add anything unchecked to the journal through, so it is checked
    // here, once, where it enters — rather than again for every row already on disk.
    const incoming: AiUsageEntry = {
      ownerUserId,
      ...journalEntrySchema.parse(toJournalRow(entry)),
    };
    // The read and the write are one step: two writers reaching the same row would otherwise each
    // decide against a journal the other has already replaced.
    const written = await this.#serialize(ownerUserId, async () => {
      const stored = await this.#read(ownerUserId);
      const existing = stored.find((candidate) => candidate.jobId === incoming.jobId) ?? null;
      const next = applyAiUsageTransition(existing, incoming);
      if (next === null) return null;
      await this.#write(
        ownerUserId,
        existing === null
          ? [...stored, next]
          : stored.map((candidate) => (candidate.jobId === next.jobId ? next : candidate)),
      );
      return next;
    });
    /*
     * Shadow mode only: the journal above is the authority and this is a best-effort copy into the
     * database the deployment is rehearsing a move to, so that a cutover does not begin with an
     * empty ledger. It is warn-only for the same reason the trace mirror is — a rehearsal store
     * must never be able to fail a submission — and it mirrors `record` alone, because the rule
     * that decides what a row becomes has one owner and both stores already apply it.
     */
    const shadow = this.#shadow;
    // The row the journal accepted, not the one the caller offered: it is the trimmed, normalized
    // one, and a mirror meant to make a cutover truthful must hold what the authority holds. A write
    // the rule dropped is mirrored as nothing at all, because there is nothing to copy.
    if (shadow !== undefined && written !== null) {
      // Called through `Promise.resolve().then` rather than awaited directly: a mirror whose
      // `record` threw before returning a promise would otherwise escape the guard and fail a write
      // the journal has already accepted, which is the one thing a rehearsal store must never do.
      await Promise.resolve()
        .then(() => shadow.record(written))
        .catch(() => {
          console.warn('[ai-usage] Shadow AI usage row could not be mirrored.', {
            jobId: written.jobId,
          });
        });
    }
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
    const counts = emptyAiUsageOutcomeCounts();
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
      // Nothing open means nothing for this sweep, and a count already taken answers that without
      // reading the account's history back. A journal never read is not skipped: it has no count.
      const journalPath = path.join(this.#root, file);
      if (openRowCounts.get(journalPath) === 0) continue;
      const ownerUserId = file.slice(0, -5);
      try {
        // Under the journal's own key, so the count this read records cannot be overtaken by a
        // write that has already finished. A sweep is the one reader that both counts and skips.
        await this.#serialize(ownerUserId, async () => {
          const open = (await this.#read(ownerUserId)).filter(isOpen);
          openRowCounts.set(journalPath, open.length);
          unsettled.push(...open);
        });
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
