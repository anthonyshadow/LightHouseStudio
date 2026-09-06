// @vitest-environment jsdom

import type { AiUsageLedgerCounts, AiUsageLedgerEntry } from '@studio/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { AiUsageSection } from './AiUsageSection';

const OWNER_USER_ID = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const FOOTER =
  'Counts and outcomes for video transformations only. Lightframe does not record what the provider charged for them, and image and voice transformations are not listed.';

const NO_COUNTS: AiUsageLedgerCounts = {
  running: 0,
  succeeded: 0,
  failed: 0,
  ambiguous: 0,
  expired: 0,
  cancelled: 0,
};

const jobId = (suffix: string): string => `00000000-0000-4000-8000-00000000000${suffix}`;

const ledgerEntry = (
  suffix: string,
  overrides: Partial<AiUsageLedgerEntry> = {},
): AiUsageLedgerEntry => ({
  jobId: jobId(suffix),
  operation: 'character-swap',
  provider: 'decart',
  outcome: 'succeeded',
  submittedAt: '2026-09-02T09:00:00.000Z',
  completedAt: '2026-09-02T09:01:32.000Z',
  durationMs: 92_000,
  ...overrides,
});

const renderSection = () =>
  render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <AiUsageSection ownerUserId={OWNER_USER_ID} open />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );

const usageRows = () =>
  within(screen.getByRole('list', { name: 'AI transformations this month' })).getAllByRole(
    'listitem',
  );

describe('AiUsageSection', () => {
  afterEach(cleanup);

  it('announces that the month is being read while the request is in flight', async () => {
    mockApiServer.use(
      http.get('*/api/account/ai-usage', async () => {
        await delay('infinite');
        return new HttpResponse(null, { status: 504 });
      }),
    );

    renderSection();

    expect(await screen.findByRole('status')).toHaveTextContent('Checking your AI activity…');
    // The shapes standing in for rows are the section's alone to draw; nothing announces them.
    expect(screen.getByRole('list', { hidden: true })).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(FOOTER)).toBeVisible();
  });

  it('states the failure and reloads the month from Try again', async () => {
    let attempt = 0;
    mockApiServer.use(
      http.get('*/api/account/ai-usage', () => {
        attempt += 1;
        if (attempt === 1) return HttpResponse.error();
        return HttpResponse.json({
          since: '2026-09-01T00:00:00.000Z',
          counts: { ...NO_COUNTS, succeeded: 1 },
          entries: [ledgerEntry('1')],
          nextCursor: null,
        });
      }),
    );
    const userInput = userEvent.setup();

    renderSection();

    const notice = await screen.findByRole('alert');
    expect(notice).toHaveTextContent('Your AI activity is unavailable right now.');

    await userInput.click(within(notice).getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByText(
        'This month: 1 submitted. 1 succeeded, 0 failed, 0 acceptance unknown, 0 expired, 0 cancelled.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers Assets when the month holds no submissions', async () => {
    mockApiServer.use(
      http.get('*/api/account/ai-usage', () =>
        HttpResponse.json({
          since: '2026-09-01T00:00:00.000Z',
          counts: NO_COUNTS,
          entries: [],
          nextCursor: null,
        }),
      ),
    );

    renderSection();

    expect(await screen.findByText('No video transformations this month.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Assets' })).toHaveAttribute('href', '/assets');
    // An empty month has no summary to state, so the counts line stays off the screen entirely.
    expect(screen.queryByText(/^This month:/u)).not.toBeInTheDocument();
    expect(screen.getByText(FOOTER)).toBeVisible();
  });

  it('sums the month, names every outcome, and keeps the provider as trailing text', async () => {
    mockApiServer.use(
      http.get('*/api/account/ai-usage', () =>
        HttpResponse.json({
          since: '2026-09-01T00:00:00.000Z',
          counts: {
            running: 2,
            succeeded: 4,
            failed: 1,
            ambiguous: 1,
            expired: 1,
            cancelled: 0,
          },
          entries: [
            ledgerEntry('1'),
            ledgerEntry('2', { operation: 'virtual-try-on', outcome: 'failed' }),
            ledgerEntry('3', { outcome: 'ambiguous', provider: 'pruna' }),
            ledgerEntry('4', { outcome: 'expired' }),
            ledgerEntry('5', { outcome: 'cancelled' }),
            ledgerEntry('6', { outcome: null, completedAt: null, durationMs: null }),
          ],
          nextCursor: null,
        }),
      ),
    );

    renderSection();

    expect(
      await screen.findByText(
        'This month: 9 submitted. 4 succeeded, 1 failed, 1 acceptance unknown, 1 expired, 0 cancelled.',
      ),
    ).toBeVisible();

    const rows = usageRows();
    expect(rows).toHaveLength(6);
    expect(rows[0]).toHaveTextContent('Character Swap');
    expect(rows[0]).toHaveTextContent('Succeeded: the result was ready to download.');
    expect(rows[1]).toHaveTextContent('Virtual Try-On');
    expect(rows[1]).toHaveTextContent('Failed. A retry is a new submission.');
    expect(rows[2]).toHaveTextContent(
      'Acceptance unknown. The provider may have accepted it; reconcile before retrying, since a retry may duplicate cost.',
    );
    expect(rows[3]).toHaveTextContent('Expired before retrieval. Submit again explicitly.');
    expect(rows[4]).toHaveTextContent('Cancelled. The provider may still have charged.');

    // A settled row states how long it took, and says whose clock measured it.
    expect(rows[0]).toHaveTextContent('1:32');
    expect(screen.getAllByText('time to outcome as observed by Lightframe')).toHaveLength(5);

    // The provider is trailing text, never something to press.
    expect(rows[0]?.querySelector('small')).toHaveTextContent('decart');
    expect(rows[2]?.querySelector('small')).toHaveTextContent('pruna');
    expect(within(rows[0]!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(rows[0]!).queryByRole('link')).not.toBeInTheDocument();

    // The open row is the only place "running" is said: `counts.running` is a term of the sum
    // above and never a second number beside the panel's own running-jobs line.
    expect(screen.getAllByText('Running. See the Dashboard queue.')).toHaveLength(1);
    expect(rows[5]).not.toHaveTextContent('time to outcome');
    expect(within(rows[5]!).getByRole('link', { name: 'Open the Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );

    expect(screen.getByText(FOOTER)).toBeVisible();
  });

  it('appends the next page under the same window from Show earlier', async () => {
    const requested: string[] = [];
    mockApiServer.use(
      http.get('*/api/account/ai-usage', ({ request }) => {
        const url = new URL(request.url);
        requested.push(url.search);
        const counts = { ...NO_COUNTS, succeeded: 2 };
        return url.searchParams.get('cursor') === null
          ? HttpResponse.json({
              since: '2026-09-01T00:00:00.000Z',
              counts,
              entries: [ledgerEntry('1')],
              nextCursor: 'page-two',
            })
          : HttpResponse.json({
              since: '2026-09-01T00:00:00.000Z',
              counts,
              entries: [ledgerEntry('2', { operation: 'virtual-try-on' })],
              nextCursor: null,
            });
      }),
    );
    const userInput = userEvent.setup();

    renderSection();

    expect(await screen.findByRole('button', { name: 'Show earlier' })).toBeEnabled();
    expect(usageRows()).toHaveLength(1);

    await userInput.click(screen.getByRole('button', { name: 'Show earlier' }));

    await waitFor(() => expect(usageRows()).toHaveLength(2));
    expect(usageRows()[1]).toHaveTextContent('Virtual Try-On');
    expect(screen.queryByRole('button', { name: 'Show earlier' })).not.toBeInTheDocument();

    expect(requested).toHaveLength(2);
    const [firstSince, secondSince] = requested.map(
      (search) => new URLSearchParams(search).get('since') ?? '',
    );
    // The window is the reader's calendar month, and a later page must never re-mint it.
    expect(firstSince).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(secondSince).toBe(firstSince);
    expect(new URLSearchParams(requested[1] ?? '').get('cursor')).toBe('page-two');
  });

  it('asks for the start of the viewer’s own calendar month', async () => {
    const requested: string[] = [];
    mockApiServer.use(
      http.get('*/api/account/ai-usage', ({ request }) => {
        requested.push(new URL(request.url).search);
        return HttpResponse.json({
          since: '2026-09-01T00:00:00.000Z',
          counts: NO_COUNTS,
          entries: [],
          nextCursor: null,
        });
      }),
    );

    renderSection();

    await screen.findByText('No video transformations this month.');
    const since = new URLSearchParams(requested[0] ?? '').get('since') ?? '';
    const now = new Date();
    expect(since).toBe(new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
  });
});
