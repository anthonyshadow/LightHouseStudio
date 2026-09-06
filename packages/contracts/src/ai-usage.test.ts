import { describe, expect, it } from 'vitest';
import {
  AI_USAGE_LEDGER_PAGE_SIZE,
  aiUsageLedgerEntrySchema,
  aiUsageLedgerQuerySchema,
  aiUsageLedgerResponseSchema,
} from './ai-usage';

const since = '2026-09-01T00:00:00.000Z';

const entry = {
  jobId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  operation: 'character-swap' as const,
  provider: 'decart',
  outcome: 'succeeded' as const,
  submittedAt: '2026-09-02T12:00:00.000Z',
  completedAt: '2026-09-02T12:01:30.000Z',
  durationMs: 90_000,
};

const response = {
  since,
  counts: { running: 1, succeeded: 4, failed: 2, ambiguous: 1, expired: 0, cancelled: 3 },
  entries: [entry],
  nextCursor: null,
};

describe('AI usage ledger contracts', () => {
  it('carries a settled submission and the window it was counted in', () => {
    expect(aiUsageLedgerEntrySchema.parse(entry)).toEqual(entry);
    expect(aiUsageLedgerResponseSchema.parse(response)).toEqual(response);
    expect(
      aiUsageLedgerResponseSchema.safeParse({
        ...response,
        entries: [{ ...entry, outcome: null, completedAt: null, durationMs: null }],
        nextCursor: 'opaque-page-token',
      }).success,
    ).toBe(true);
  });

  it('makes the caller state the window rather than inheriting a server default', () => {
    expect(aiUsageLedgerQuerySchema.parse({ since })).toEqual({ since });
    expect(aiUsageLedgerQuerySchema.safeParse({}).success).toBe(false);
    expect(aiUsageLedgerQuerySchema.safeParse({ since, ownerUserId: 'someone-else' }).success).toBe(
      false,
    );
  });

  it('serves a provider the wire has no enum for, so one stored row cannot fail the page', () => {
    expect(
      aiUsageLedgerEntrySchema.parse({ ...entry, provider: 'retired-provider' }),
    ).toMatchObject({ provider: 'retired-provider' });
    expect(aiUsageLedgerEntrySchema.safeParse({ ...entry, provider: '' }).success).toBe(false);
    expect(aiUsageLedgerEntrySchema.safeParse({ ...entry, provider: 'x'.repeat(81) }).success).toBe(
      false,
    );
  });

  it('refuses a page larger than the ledger promises and any undeclared field', () => {
    expect(
      aiUsageLedgerResponseSchema.safeParse({
        ...response,
        entries: Array.from({ length: AI_USAGE_LEDGER_PAGE_SIZE + 1 }, () => entry),
      }).success,
    ).toBe(false);
    expect(
      aiUsageLedgerResponseSchema.safeParse({ ...response, providerResponse: { raw: true } })
        .success,
    ).toBe(false);
    expect(
      aiUsageLedgerEntrySchema.safeParse({ ...entry, providerJobId: 'upstream' }).success,
    ).toBe(false);
  });
});
