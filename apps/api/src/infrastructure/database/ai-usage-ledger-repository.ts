import {
  applyAiUsageTransition,
  type AiUsageEntry,
  type AiUsageOutcome,
  type AiUsageOutcomeCounts,
} from '@studio/domain';
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { nullableIsoTimestamp, toIsoTimestamp } from '../../application/timestamps.js';
import type {
  AiUsageLedgerCursor,
  AiUsageLedgerPage,
  AiUsageLedgerRepository,
} from '../../features/ai-usage/ai-usage-ledger-repository.js';
import type { LightframeDatabase } from './client.js';
import { aiUsageLedger } from './schema.js';

interface StoredLedgerRow {
  readonly ownerUserId: string;
  readonly jobId: string;
  readonly operation: string;
  readonly provider: string;
  readonly outcome: AiUsageOutcome | null;
  readonly submittedAt: string;
  readonly completedAt: string | null;
}

const selection = {
  ownerUserId: aiUsageLedger.ownerUserId,
  jobId: aiUsageLedger.jobId,
  operation: aiUsageLedger.operation,
  provider: aiUsageLedger.provider,
  outcome: aiUsageLedger.outcome,
  submittedAt: aiUsageLedger.submittedAt,
  completedAt: aiUsageLedger.completedAt,
};

const toEntry = (row: StoredLedgerRow): AiUsageEntry => ({
  ownerUserId: row.ownerUserId,
  jobId: row.jobId,
  operation: row.operation,
  provider: row.provider,
  outcome: row.outcome,
  submittedAt: toIsoTimestamp(row.submittedAt),
  completedAt: nullableIsoTimestamp(row.completedAt),
});

/** The relational AI usage ledger. Its file sibling is the authority in local and shadow modes. */
export class DrizzleAiUsageLedgerRepository implements AiUsageLedgerRepository {
  constructor(private readonly db: LightframeDatabase) {}

  /**
   * One transaction of three statements. The insert creates the row and loses harmlessly to whoever
   * created it first; the locking read serializes the writers that reached the same submission; the
   * update carries whatever `applyAiUsageTransition` decided. Nothing here re-states that rule in
   * SQL — no `coalesce`, no `where outcome is null` — so the domain stays its only owner.
   */
  async record(entry: AiUsageEntry): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(aiUsageLedger)
        .values({
          ownerUserId: entry.ownerUserId,
          jobId: entry.jobId,
          operation: entry.operation,
          provider: entry.provider,
          outcome: entry.outcome,
          submittedAt: entry.submittedAt,
          completedAt: entry.completedAt,
        })
        .onConflictDoNothing();
      const [row] = await tx
        .select(selection)
        .from(aiUsageLedger)
        .where(
          and(
            eq(aiUsageLedger.ownerUserId, entry.ownerUserId),
            eq(aiUsageLedger.jobId, entry.jobId),
          ),
        )
        .for('update')
        .limit(1);
      // The insert above guarantees a row, so an absent one means it was removed underneath us and
      // there is nothing this write should resurrect.
      if (row === undefined) return;
      const next = applyAiUsageTransition(toEntry(row), entry);
      // Given a stored row, the rule returns either nothing or a settled row, so a result here is
      // always a change worth writing.
      if (next === null) return;
      await tx
        .update(aiUsageLedger)
        .set({ outcome: next.outcome, completedAt: next.completedAt })
        .where(
          and(
            eq(aiUsageLedger.ownerUserId, entry.ownerUserId),
            eq(aiUsageLedger.jobId, entry.jobId),
          ),
        );
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
    const { cursor } = options;
    const rows = await this.db
      .select(selection)
      .from(aiUsageLedger)
      .where(
        and(
          eq(aiUsageLedger.ownerUserId, ownerUserId),
          gte(aiUsageLedger.submittedAt, options.since),
          // Compared as a row value rather than as `a < x or (a = x and b < y)`: written this way
          // the comparison is over the same column pair, in the same directions, as the owner
          // index, so paging stays an index scan however deep the reader goes.
          cursor === undefined
            ? undefined
            : sql`(${aiUsageLedger.submittedAt}, ${aiUsageLedger.jobId}) < (${cursor.submittedAt}::timestamptz, ${cursor.jobId}::uuid)`,
        ),
      )
      .orderBy(desc(aiUsageLedger.submittedAt), desc(aiUsageLedger.jobId))
      // One row past the page, purely to learn whether an older one exists.
      .limit(options.pageSize + 1);
    const page = rows.slice(0, options.pageSize);
    const last = page.at(-1);
    return {
      entries: page.map(toEntry),
      nextCursor:
        rows.length > options.pageSize && last !== undefined
          ? { submittedAt: toIsoTimestamp(last.submittedAt), jobId: last.jobId }
          : null,
    };
  }

  /**
   * One grouped count over the whole window, not over the page: the summary describes what the
   * account submitted, and the caller's window is what bounds the work.
   */
  async countByOutcome(ownerUserId: string, since: string): Promise<AiUsageOutcomeCounts> {
    const rows = await this.db
      .select({
        outcome: aiUsageLedger.outcome,
        total: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(aiUsageLedger)
      .where(and(eq(aiUsageLedger.ownerUserId, ownerUserId), gte(aiUsageLedger.submittedAt, since)))
      .groupBy(aiUsageLedger.outcome);
    const counts: Record<'running' | AiUsageOutcome, number> = {
      running: 0,
      succeeded: 0,
      failed: 0,
      ambiguous: 0,
      expired: 0,
      cancelled: 0,
    };
    for (const row of rows) {
      // The group with no outcome is exactly the submissions still in flight.
      counts[row.outcome ?? 'running'] = row.total;
    }
    return counts;
  }

  async listOpen(limit: number): Promise<readonly AiUsageEntry[]> {
    const rows = await this.db
      .select(selection)
      .from(aiUsageLedger)
      .where(isNull(aiUsageLedger.outcome))
      // Oldest submission first, the order the partial index already holds them in, so a bounded
      // pass works through the rows that have been open longest.
      .orderBy(asc(aiUsageLedger.submittedAt), asc(aiUsageLedger.jobId))
      .limit(limit);
    return rows.map(toEntry);
  }
}
