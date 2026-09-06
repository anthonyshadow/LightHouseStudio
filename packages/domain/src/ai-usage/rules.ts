/**
 * The AI usage ledger's policy: what a job status says about a submission, and who wins when two
 * writers reach the same row.
 *
 * Several writers can close one row — the path that observes the terminal status and the
 * reconciler that closes rows nobody was watching — and they race. `applyAiUsageTransition` is the
 * only owner of first-terminal-outcome-wins; stores apply it rather than re-deriving it in SQL or
 * in a journal merge, so one paid submission can never be counted twice or reopened.
 */

import type { ProjectProcessingJobStatus } from '../video-processing/types';
import { AI_USAGE_OUTCOMES } from './types';
import type { AiUsageEntry, AiUsageOutcome, AiUsageOutcomeCounts } from './types';

/**
 * The outcome a status settles, or null while the submission is still in flight.
 *
 * Exhaustive with no `default`, so a thirteenth status is a compile error here instead of a
 * submission whose row silently never closes.
 */
export const aiUsageOutcomeForJobStatus = (
  status: ProjectProcessingJobStatus,
): AiUsageOutcome | null => {
  switch (status) {
    // Success is the delivered result, not the provider's acceptance of the request.
    case 'ready':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'ambiguous':
      return 'ambiguous';
    case 'expired':
      return 'expired';
    case 'cancelled':
      return 'cancelled';
    case 'pending':
    case 'validating':
    case 'submitting':
    case 'accepted':
    case 'queued':
    case 'processing':
    case 'retrieving':
      return null;
  }
};

/**
 * The row to write, or null when the incoming write must be dropped.
 *
 * A settled row is never reopened, re-closed or re-timed: a later writer is by definition looking
 * at the same single paid submission, and the first terminal answer is the one that was observed
 * closest to it. An incoming row that is itself still open says nothing a stored row does not
 * already say, so it writes nothing either.
 *
 * Identity, `submittedAt`, `operation` and `provider` come from the stored row. The opener saw the
 * submission; a closer may be a reconciler working from a durable trace, and must not be able to
 * rewrite what was submitted.
 */
export const applyAiUsageTransition = (
  existing: AiUsageEntry | null,
  incoming: AiUsageEntry,
): AiUsageEntry | null => {
  if (existing === null) return incoming;
  if (existing.outcome !== null) return null;
  if (incoming.outcome === null) return null;
  return { ...existing, outcome: incoming.outcome, completedAt: incoming.completedAt };
};

/**
 * How long a settled submission took, or null while it is still running.
 *
 * Clamped at zero because the two instants need not come from one clock — a row opened by this
 * process can be closed from a time a provider reported — and a negative duration is a clock
 * artefact, not a measurement worth showing anyone.
 */
export const aiUsageDurationMs = (
  entry: Pick<AiUsageEntry, 'submittedAt' | 'completedAt'>,
): number | null => {
  if (entry.completedAt === null) return null;
  const submittedMs = new Date(entry.submittedAt).valueOf();
  const completedMs = new Date(entry.completedAt).valueOf();
  // An unreadable timestamp is an unknown duration; NaN must never reach a total or a display.
  if (!Number.isFinite(submittedMs) || !Number.isFinite(completedMs)) return null;
  return Math.max(0, completedMs - submittedMs);
};

/** Every outcome at zero: the seed both stores start a window's counts from. */
export const emptyAiUsageOutcomeCounts = (): Record<'running' | AiUsageOutcome, number> => ({
  running: 0,
  succeeded: 0,
  failed: 0,
  ambiguous: 0,
  expired: 0,
  cancelled: 0,
});

/**
 * How many submissions a window holds.
 *
 * Every row is one submission, whatever became of it, so the total is the sum of all six counts.
 * It lives here rather than in the surface that shows it, because "what counts as a submission" is
 * the ledger's own statement and a screen adding six fields by hand would quietly stop matching it.
 */
export const aiUsageSubmittedTotal = (counts: AiUsageOutcomeCounts): number =>
  counts.running + AI_USAGE_OUTCOMES.reduce((total, outcome) => total + counts[outcome], 0);
