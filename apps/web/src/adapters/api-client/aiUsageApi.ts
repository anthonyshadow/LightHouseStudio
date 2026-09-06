import { aiUsageLedgerResponseSchema, type AiUsageLedgerResponse } from '@studio/contracts';
import { invalidApiResponse, requestJson } from './apiClient';

const AI_USAGE_LEDGER_PATH = '/api/account/ai-usage';

const invalidResponse = invalidApiResponse(
  'The AI usage response was invalid.',
  'invalid-response',
);

/**
 * The start of the viewer's own calendar month, as an instant.
 *
 * The window is decided here and nowhere else: the contract makes `since` required and gives the
 * server no default of its own, so there is no second window policy to disagree with. It has to be
 * the *local* month because "this month" is a calendar fact the reader owns — a UTC month boundary
 * would put a submission in the wrong month for anyone east or west of Greenwich.
 */
export const currentAiUsageMonthStart = (now: Date = new Date()): string =>
  new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

export const getAiUsageLedger = (
  query: { readonly since: string; readonly cursor?: string | undefined },
  signal?: AbortSignal,
): Promise<AiUsageLedgerResponse> => {
  const search = new URLSearchParams({ since: query.since });
  if (query.cursor) search.set('cursor', query.cursor);
  return requestJson(
    `${AI_USAGE_LEDGER_PATH}?${search.toString()}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    },
    aiUsageLedgerResponseSchema,
    invalidResponse,
  );
};

/**
 * The one query identity for an account's AI usage window, and the paging shape that goes with it.
 *
 * The window is part of the key rather than a parameter of the fetch alone: a page is minted for
 * the criteria the cursor sealed, so pages of last month must never be appended to this month's
 * list when the clock rolls over while the panel is open.
 */
export const aiUsageLedgerQueryOptions = (ownerUserId: string, since: string) => ({
  queryKey: ['account', 'ai-usage', ownerUserId, since] as const,
  queryFn: ({
    pageParam,
    signal,
  }: {
    readonly pageParam: string | null;
    readonly signal?: AbortSignal;
  }) => getAiUsageLedger({ since, ...(pageParam === null ? {} : { cursor: pageParam }) }, signal),
  initialPageParam: null as string | null,
  getNextPageParam: (page: AiUsageLedgerResponse): string | null => page.nextCursor,
});
