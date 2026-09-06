import type { AiUsageEntry, AiUsageOutcomeCounts } from '@studio/domain';

/**
 * Where a page of the ledger stopped, as the pair the newest-first order is defined on. Both halves
 * are needed: two submissions can share an instant, and only the job id separates them.
 */
export interface AiUsageLedgerCursor {
  readonly submittedAt: string;
  readonly jobId: string;
}

export interface AiUsageLedgerPage {
  readonly entries: readonly AiUsageEntry[];
  /** Null when the window holds nothing older than this page. */
  readonly nextCursor: AiUsageLedgerCursor | null;
}

/**
 * The read half of the ledger, and the only half a request handler is given.
 *
 * Every method takes the owner as its first argument, so a caller holding this type can only ever
 * read one account's spend. That is the point of the split: the route receives this narrower type,
 * and reaching the cross-owner sweep below would mean widening its own parameter — a change visible
 * in review rather than a missing filter hidden inside a query.
 */
export interface AiUsageLedgerReader {
  listForOwner(
    ownerUserId: string,
    options: {
      readonly since: string;
      readonly cursor?: AiUsageLedgerCursor | undefined;
      readonly pageSize: number;
    },
  ): Promise<AiUsageLedgerPage>;
  /** Counts every row in the window, not just the page, so a summary matches what was submitted. */
  countByOutcome(ownerUserId: string, since: string): Promise<AiUsageOutcomeCounts>;
}

/**
 * The full ledger, given only to the two components that write it: the video job service, which
 * opens a row before a paid submission and closes it on the outcome, and the reconciler, which
 * closes rows nobody was watching.
 *
 * `listOpen` is the one read here that crosses owners. It exists for the reconciler, which sweeps
 * every account's unfinished submissions and therefore cannot be owner-scoped; keeping it off
 * {@link AiUsageLedgerReader} is what stops it from reaching a request handler.
 */
export interface AiUsageLedgerRepository extends AiUsageLedgerReader {
  /**
   * Writes one submission's row, applying `applyAiUsageTransition`. Racing writers converge because
   * the rule, not the store, decides which write wins.
   */
  record(entry: AiUsageEntry): Promise<void>;
  /** At most `limit` rows that have not settled yet, oldest submission first. */
  listOpen(limit: number): Promise<readonly AiUsageEntry[]>;
}
