import { z } from 'zod';
import { opaquePageTokenSchema } from './common';
import { videoTransformOperationIdSchema } from './video-jobs';

/**
 * Mirrors `AI_USAGE_OUTCOMES` in the domain, which owns the rule that turns a job status into an
 * outcome. Contracts depend on zod alone and cannot import the domain, so the list is copied out by
 * hand; the three-way parity test keeps the domain list, these options and the stored enum equal.
 */
export const aiUsageOutcomeSchema = z.enum([
  'succeeded',
  'failed',
  'ambiguous',
  'expired',
  'cancelled',
]);

export const aiUsageLedgerEntrySchema = z
  .object({
    jobId: z.uuid(),
    operation: videoTransformOperationIdSchema,
    /**
     * Which provider the submission went to, as a bounded string rather than an enum: the ledger
     * stores whatever ran the job, and one row naming a provider this build no longer offers must
     * not fail the whole page of usage.
     */
    provider: z.string().trim().min(1).max(80),
    /** Null while the submission is still running; a settled outcome once it is terminal. */
    outcome: aiUsageOutcomeSchema.nullable(),
    submittedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    /** Null until the row is closed, since a running submission has no duration to report yet. */
    durationMs: z.number().int().nonnegative().nullable(),
  })
  .strict();

/** How many ledger entries one usage response may carry. */
export const AI_USAGE_LEDGER_PAGE_SIZE = 50;

/**
 * The furthest back a usage window may start. Counts cover the entire window rather than the page,
 * so this ceiling is what keeps one request's work finite. It lives on the contract so the handler
 * enforces the bound without owning a policy of its own.
 */
export const AI_USAGE_LEDGER_MAX_WINDOW_DAYS = 366;

export const aiUsageLedgerQuerySchema = z
  .object({
    /**
     * Required, with no server default: the window belongs to the caller — the panel asks for its
     * own calendar month — so no handler ends up deciding a second window policy on the side.
     */
    since: z.iso.datetime(),
    cursor: opaquePageTokenSchema.optional(),
  })
  .strict();

/** How the window's submissions settled. `running` counts the rows with no outcome yet. */
export const aiUsageLedgerCountsSchema = z
  .object({
    running: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
  })
  .strict();

export const aiUsageLedgerResponseSchema = z
  .object({
    /** Echoed so a reader can tell which window the counts describe without re-deriving it. */
    since: z.iso.datetime(),
    counts: aiUsageLedgerCountsSchema,
    entries: z.array(aiUsageLedgerEntrySchema).max(AI_USAGE_LEDGER_PAGE_SIZE),
    nextCursor: opaquePageTokenSchema.nullable(),
  })
  .strict();

export type AiUsageOutcome = z.infer<typeof aiUsageOutcomeSchema>;
export type AiUsageLedgerEntry = z.infer<typeof aiUsageLedgerEntrySchema>;
export type AiUsageLedgerQuery = z.infer<typeof aiUsageLedgerQuerySchema>;
export type AiUsageLedgerCounts = z.infer<typeof aiUsageLedgerCountsSchema>;
export type AiUsageLedgerResponse = z.infer<typeof aiUsageLedgerResponseSchema>;
