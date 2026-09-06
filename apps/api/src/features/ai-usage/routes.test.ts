import {
  AI_USAGE_LEDGER_MAX_WINDOW_DAYS,
  AI_USAGE_LEDGER_PAGE_SIZE,
  type AiUsageLedgerResponse,
  type ApiErrorResponse,
} from '@studio/contracts';
import {
  createPhaseOneEntitlements,
  type AiUsageEntry,
  type AiUsageOutcome,
  type AiUsageOutcomeCounts,
} from '@studio/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { ApplicationRuntime, type HttpRequest } from '../../application/application-runtime.js';
import { installErrorHandling } from '../../http/errors.js';
import type {
  AiUsageLedgerCursor,
  AiUsageLedgerPage,
  AiUsageLedgerReader,
} from './ai-usage-ledger-repository.js';
import { registerAiUsageRoutes } from './routes.js';

const SESSION_OWNER_ID = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const OTHER_OWNER_ID = '9b1f6d3c-0e42-4a55-9f7d-1c2b3a4d5e6f';
const DAY_MS = 24 * 60 * 60 * 1_000;

const installRouteTestAuth = (app: ApplicationRuntime) => {
  installErrorHandling(app);
  app.addHook('onRequest', async (request: HttpRequest) => {
    await Promise.resolve();
    request.auth = {
      user: {
        id: SESSION_OWNER_ID,
        login: 'demo@lightframe.local',
        username: 'demo',
        email: 'demo@lightframe.local',
        displayName: 'Demo Creator',
        avatarUrl: null,
        planId: 'free',
        role: 'user',
        status: 'active',
        createdAt: '2026-08-05T12:00:00.000Z',
        updatedAt: '2026-08-05T12:00:00.000Z',
        lastLoginAt: '2026-08-05T12:00:00.000Z',
      },
      entitlements: createPhaseOneEntitlements('free', '2026-08-05T12:00:00.000Z'),
      expiresAt: '2026-08-06T12:00:00.000Z',
    };
  });
};

interface RecordedListCall {
  readonly ownerUserId: string;
  readonly since: string;
  readonly cursor: AiUsageLedgerCursor | undefined;
  readonly pageSize: number;
}

/**
 * An in-memory ledger that answers exactly what the port promises: newest submission first, one
 * owner's rows only, and counts over the whole window rather than the page.
 */
class FakeLedgerReader implements AiUsageLedgerReader {
  readonly listCalls: RecordedListCall[] = [];
  readonly countCalls: { readonly ownerUserId: string; readonly since: string }[] = [];

  constructor(private readonly rows: readonly AiUsageEntry[]) {}

  #window(ownerUserId: string, since: string): readonly AiUsageEntry[] {
    return this.rows
      .filter((row) => row.ownerUserId === ownerUserId && row.submittedAt >= since)
      .toSorted((left, right) =>
        left.submittedAt === right.submittedAt
          ? right.jobId.localeCompare(left.jobId)
          : right.submittedAt.localeCompare(left.submittedAt),
      );
  }

  listForOwner(
    ownerUserId: string,
    options: {
      readonly since: string;
      readonly cursor?: AiUsageLedgerCursor | undefined;
      readonly pageSize: number;
    },
  ): Promise<AiUsageLedgerPage> {
    const { since, cursor, pageSize } = options;
    this.listCalls.push({ ownerUserId, since, cursor, pageSize });
    const window = this.#window(ownerUserId, since);
    const start =
      cursor === undefined
        ? 0
        : window.findIndex(
            (row) => row.submittedAt === cursor.submittedAt && row.jobId === cursor.jobId,
          ) + 1;
    const entries = window.slice(start, start + pageSize);
    const last = entries.at(-1);
    return Promise.resolve({
      entries,
      nextCursor:
        last === undefined || start + entries.length >= window.length
          ? null
          : { submittedAt: last.submittedAt, jobId: last.jobId },
    });
  }

  countByOutcome(ownerUserId: string, since: string): Promise<AiUsageOutcomeCounts> {
    this.countCalls.push({ ownerUserId, since });
    const counts: Record<'running' | AiUsageOutcome, number> = {
      running: 0,
      succeeded: 0,
      failed: 0,
      ambiguous: 0,
      expired: 0,
      cancelled: 0,
    };
    for (const row of this.#window(ownerUserId, since)) {
      counts[row.outcome ?? 'running'] += 1;
    }
    return Promise.resolve(counts);
  }
}

const entry = (overrides: Partial<AiUsageEntry> = {}): AiUsageEntry => ({
  ownerUserId: SESSION_OWNER_ID,
  jobId: crypto.randomUUID(),
  operation: 'character-swap',
  provider: 'decart',
  outcome: 'succeeded',
  submittedAt: '2026-08-20T09:00:00.000Z',
  completedAt: '2026-08-20T09:01:30.000Z',
  ...overrides,
});

const since = (daysAgo: number): string => new Date(Date.now() - daysAgo * DAY_MS).toISOString();

const usageUrl = (window: string, cursor?: string): string =>
  `/api/account/ai-usage?since=${encodeURIComponent(window)}${
    cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`
  }`;

describe('AI usage route boundary', () => {
  const apps: ApplicationRuntime[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const appFor = (ledger: FakeLedgerReader): ApplicationRuntime => {
    const app = new ApplicationRuntime();
    installRouteTestAuth(app);
    registerAiUsageRoutes(app, ledger);
    apps.push(app);
    return app;
  };

  it('answers the caller own window with derived durations and no-store', async () => {
    const settled = entry({ submittedAt: '2026-08-20T09:00:00.000Z' });
    const running = entry({
      submittedAt: '2026-08-21T09:00:00.000Z',
      outcome: null,
      completedAt: null,
      operation: 'virtual-try-on',
      provider: 'pruna',
    });
    const ledger = new FakeLedgerReader([settled, running]);
    const window = '2026-08-01T00:00:00.000Z';

    const response = await appFor(ledger).inject({ method: 'GET', url: usageUrl(window) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json<AiUsageLedgerResponse>();
    expect(body.since).toBe(window);
    expect(body.nextCursor).toBeNull();
    expect(body.entries).toEqual([
      {
        jobId: running.jobId,
        operation: 'virtual-try-on',
        provider: 'pruna',
        outcome: null,
        submittedAt: running.submittedAt,
        completedAt: null,
        durationMs: null,
      },
      {
        jobId: settled.jobId,
        operation: 'character-swap',
        provider: 'decart',
        outcome: 'succeeded',
        submittedAt: settled.submittedAt,
        completedAt: settled.completedAt,
        durationMs: 90_000,
      },
    ]);
    expect(ledger.listCalls).toEqual([
      {
        ownerUserId: SESSION_OWNER_ID,
        since: window,
        cursor: undefined,
        pageSize: AI_USAGE_LEDGER_PAGE_SIZE,
      },
    ]);
    expect(ledger.countCalls).toEqual([{ ownerUserId: SESSION_OWNER_ID, since: window }]);
  });

  it('leaves another account rows out of the answer rather than refusing the request', async () => {
    const ledger = new FakeLedgerReader([
      entry({ ownerUserId: OTHER_OWNER_ID }),
      entry({ ownerUserId: OTHER_OWNER_ID, outcome: 'failed' }),
    ]);

    const response = await appFor(ledger).inject({
      method: 'GET',
      url: usageUrl('2026-08-01T00:00:00.000Z'),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<AiUsageLedgerResponse>();
    expect(body.entries).toEqual([]);
    expect(body.counts).toEqual({
      running: 0,
      succeeded: 0,
      failed: 0,
      ambiguous: 0,
      expired: 0,
      cancelled: 0,
    });
    expect(ledger.listCalls[0]?.ownerUserId).toBe(SESSION_OWNER_ID);
  });

  it('counts every outcome in the window, not only the rows on the page', async () => {
    const outcomes: readonly (AiUsageOutcome | null)[] = [
      'succeeded',
      'succeeded',
      'failed',
      'ambiguous',
      'expired',
      'cancelled',
      null,
    ];
    const ledger = new FakeLedgerReader([
      ...outcomes.map((outcome, index) =>
        entry({
          outcome,
          submittedAt: new Date(
            Date.parse('2026-08-20T09:00:00.000Z') + index * 1_000,
          ).toISOString(),
          completedAt: outcome === null ? null : '2026-08-20T09:05:00.000Z',
        }),
      ),
      entry({ ownerUserId: OTHER_OWNER_ID }),
      // Outside the window: counted by neither the summary nor the page.
      entry({ submittedAt: '2026-07-01T09:00:00.000Z' }),
    ]);

    const response = await appFor(ledger).inject({
      method: 'GET',
      url: usageUrl('2026-08-01T00:00:00.000Z'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<AiUsageLedgerResponse>().counts).toEqual({
      running: 1,
      succeeded: 2,
      failed: 1,
      ambiguous: 1,
      expired: 1,
      cancelled: 1,
    });
  });

  it('pages the window through the cursor it handed back', async () => {
    const total = AI_USAGE_LEDGER_PAGE_SIZE + 10;
    const rows = Array.from({ length: total }, (_unused, index) =>
      entry({
        submittedAt: new Date(
          Date.parse('2026-08-10T00:00:00.000Z') + index * 60_000,
        ).toISOString(),
      }),
    );
    const ledger = new FakeLedgerReader(rows);
    const app = appFor(ledger);
    const window = '2026-08-01T00:00:00.000Z';

    const first = await app.inject({ method: 'GET', url: usageUrl(window) });
    expect(first.statusCode).toBe(200);
    const firstPage = first.json<AiUsageLedgerResponse>();
    expect(firstPage.entries).toHaveLength(AI_USAGE_LEDGER_PAGE_SIZE);
    expect(firstPage.nextCursor).not.toBeNull();

    const cursor = firstPage.nextCursor;
    if (cursor === null) throw new Error('The first page must hand back a cursor.');
    const second = await app.inject({ method: 'GET', url: usageUrl(window, cursor) });
    expect(second.statusCode).toBe(200);
    const secondPage = second.json<AiUsageLedgerResponse>();
    expect(secondPage.entries).toHaveLength(10);
    expect(secondPage.nextCursor).toBeNull();

    const seen = [...firstPage.entries, ...secondPage.entries].map((row) => row.jobId);
    expect(new Set(seen).size).toBe(total);
    expect(ledger.listCalls[1]?.cursor).toEqual({
      submittedAt: firstPage.entries.at(-1)?.submittedAt,
      jobId: firstPage.entries.at(-1)?.jobId,
    });
  });

  it('refuses a missing window, an oversized window, and an unreadable cursor without reading', async () => {
    const ledger = new FakeLedgerReader([entry()]);
    const app = appFor(ledger);

    for (const url of [
      '/api/account/ai-usage',
      usageUrl(since(AI_USAGE_LEDGER_MAX_WINDOW_DAYS + 1)),
      usageUrl('2026-08-01T00:00:00.000Z', 'not-a-cursor'),
    ]) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('validation_error');
    }

    expect(ledger.listCalls).toEqual([]);
    expect(ledger.countCalls).toEqual([]);
  });

  it('refuses a cursor minted for a different window', async () => {
    const rows = Array.from({ length: AI_USAGE_LEDGER_PAGE_SIZE + 1 }, (_unused, index) =>
      entry({
        submittedAt: new Date(
          Date.parse('2026-08-10T00:00:00.000Z') + index * 60_000,
        ).toISOString(),
      }),
    );
    const ledger = new FakeLedgerReader(rows);
    const app = appFor(ledger);

    const first = await app.inject({
      method: 'GET',
      url: usageUrl('2026-08-01T00:00:00.000Z'),
    });
    const cursor = first.json<AiUsageLedgerResponse>().nextCursor;
    if (cursor === null) throw new Error('The first page must hand back a cursor.');

    const moved = await app.inject({
      method: 'GET',
      url: usageUrl('2026-08-05T00:00:00.000Z', cursor),
    });

    expect(moved.statusCode).toBe(400);
    expect(moved.json<ApiErrorResponse>().error.code).toBe('validation_error');
    expect(ledger.listCalls).toHaveLength(1);
  });
});
