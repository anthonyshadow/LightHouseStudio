/**
 * The vocabulary of the AI usage ledger: one row per paid submission, recording what ran for an
 * account and what became of it.
 *
 * A row opens immediately before the provider call and closes on the first terminal outcome, so a
 * null `outcome` is a fact — the submission is still running — rather than missing data.
 *
 * `operation` and `provider` are plain strings, not unions. A row is a historical record of spend
 * and has to stay readable after an operation kind is renamed or a provider is retired; a union
 * would turn yesterday's spend into an unparseable row.
 */

export const AI_USAGE_OUTCOMES = [
  'succeeded',
  'failed',
  'ambiguous',
  'expired',
  'cancelled',
] as const;

export type AiUsageOutcome = (typeof AI_USAGE_OUTCOMES)[number];

export interface AiUsageEntry {
  readonly ownerUserId: string;
  readonly jobId: string;
  readonly operation: string;
  readonly provider: string;
  /** Null while the submission is still running. */
  readonly outcome: AiUsageOutcome | null;
  /** ISO 8601. Written once, when the row opens. */
  readonly submittedAt: string;
  /** ISO 8601. Set together with `outcome`, never before it. */
  readonly completedAt: string | null;
}

/** `running` is the open rows; the other five are the terminal outcomes they settle into. */
export interface AiUsageOutcomeCounts {
  readonly running: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly ambiguous: number;
  readonly expired: number;
  readonly cancelled: number;
}
