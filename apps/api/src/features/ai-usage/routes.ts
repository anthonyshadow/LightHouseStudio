import {
  AI_USAGE_LEDGER_MAX_WINDOW_DAYS,
  AI_USAGE_LEDGER_PAGE_SIZE,
  aiUsageLedgerQuerySchema,
  aiUsageLedgerResponseSchema,
} from '@studio/contracts';
import { aiUsageDurationMs } from '@studio/domain';
import type { ApplicationRuntime } from '../../application/application-runtime.js';
import { AppError } from '../../http/app-error.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { decodePageCursor, encodePageCursor } from '../../http/page-cursor.js';
import type { AiUsageLedgerReader } from './ai-usage-ledger-repository.js';

const MAX_WINDOW_MS = AI_USAGE_LEDGER_MAX_WINDOW_DAYS * 24 * 60 * 60 * 1_000;

const USAGE_CURSOR = {
  timestampKey: 'submittedAt',
  idKey: 'jobId',
  invalidMessage: 'Use a valid AI usage page cursor.',
} as const;

/**
 * The window is what a cursor is relative to, so it is sealed into the token. A client that moves
 * `since` while paging gets one validation error instead of a page stitched from two windows.
 */
const cursorCriteria = (since: string): string => JSON.stringify({ since });

export const registerAiUsageRoutes = (
  app: ApplicationRuntime,
  ledger: AiUsageLedgerReader,
): void => {
  app.get('/api/account/ai-usage', async (request, reply) => {
    // Spend for one account, changing as submissions settle: never a cached answer, as /api/auth/me.
    reply.header('Cache-Control', 'no-store');
    const query = aiUsageLedgerQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError(400, 'validation_error', 'Ask for a valid AI usage window.');
    }
    // Parsed once, so two spellings of the same instant are one window, one cursor criteria and one
    // bound: the string is what the ledger and the token are keyed on, the instant is what the
    // ceiling is measured against.
    const sinceInstant = new Date(query.data.since);
    const since = sinceInstant.toISOString();
    if (Date.now() - sinceInstant.valueOf() > MAX_WINDOW_MS) {
      // The counts cover the whole window rather than the page; this ceiling is what bounds them.
      throw new AppError(
        400,
        'validation_error',
        `Ask for an AI usage window starting within the last ${AI_USAGE_LEDGER_MAX_WINDOW_DAYS} days.`,
      );
    }
    const cursor = decodePageCursor(query.data.cursor, cursorCriteria(since), USAGE_CURSOR);
    const ownerUserId = ownerUserIdForRequest(request);
    const [page, counts] = await Promise.all([
      ledger.listForOwner(ownerUserId, {
        since,
        ...(cursor === undefined ? {} : { cursor }),
        pageSize: AI_USAGE_LEDGER_PAGE_SIZE,
      }),
      ledger.countByOutcome(ownerUserId, since),
    ]);
    return aiUsageLedgerResponseSchema.parse({
      since,
      counts,
      // Field by field, so the owner stays the way a row was found rather than something echoed.
      entries: page.entries.map((entry) => ({
        jobId: entry.jobId,
        operation: entry.operation,
        provider: entry.provider,
        outcome: entry.outcome,
        submittedAt: entry.submittedAt,
        completedAt: entry.completedAt,
        durationMs: aiUsageDurationMs(entry),
      })),
      nextCursor:
        page.nextCursor === null ? null : encodePageCursor(page.nextCursor, cursorCriteria(since)),
    });
  });
};
