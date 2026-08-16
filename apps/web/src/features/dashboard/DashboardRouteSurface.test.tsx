// @vitest-environment jsdom

import type { CampaignContract, ProjectContract, SavedVideoSummary } from '@studio/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { DashboardRouteSurface } from './DashboardRouteSurface';

const now = '2026-08-11T16:00:00.000Z';
const project: ProjectContract = {
  id: '18b120ac-1578-46e3-8c3d-42307772f391',
  campaignId: null,
  title: 'Launch cut',
  status: 'draft',
  version: 1,
  currentRevisionId: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  currentRevisionNumber: 1,
  archivedAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};
const campaign: CampaignContract = {
  id: '20ce94fa-15d1-42c6-abd3-77ff61516b48',
  name: 'Summer launch',
  brief: 'Keep the launch focused.',
  status: 'active',
  version: 1,
  archivedAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
};
const video: SavedVideoSummary = {
  id: 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338',
  title: 'Launch master',
  status: 'ready',
  currentVersion: {
    id: 'b276694b-58c4-40d3-8fb6-315e32b66fd0',
    videoId: 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338',
    ordinal: 1,
    origin: 'recorded',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'launch-master.mp4',
    sizeBytes: 1_024,
    durationMs: 10_000,
    width: 1_280,
    height: 720,
    createdAt: now,
  },
  sourceVideoId: null,
  versionCount: 1,
  thumbnailAvailable: false,
  assignment: 'project-output',
  createdAt: now,
  updatedAt: now,
};

const callbacks = () => ({
  onCreateVideo: vi.fn(),
  onCreateProject: vi.fn(),
  onCreateCampaign: vi.fn(),
  onOpenAssets: vi.fn(),
  onOpenProjects: vi.fn(),
  onOpenCampaigns: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenCampaign: vi.fn(),
  onOpenVideos: vi.fn(),
});

const renderDashboard = (ownerUserId: string, actions = callbacks()) => {
  const view = render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <DashboardRouteSurface ownerUserId={ownerUserId} displayName="Demo Creator" {...actions} />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );
  return { ...view, actions };
};

describe('DashboardRouteSurface', () => {
  beforeEach(() => {
    mockApiServer.use(http.get('*/api/video-jobs', () => HttpResponse.json({ jobs: [] })));
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('orients an established account with bounded recent work and direct actions', async () => {
    mockApiServer.use(
      http.get('*/api/projects', () =>
        HttpResponse.json({ projects: [project], nextCursor: null }),
      ),
      http.get('*/api/campaigns', () =>
        HttpResponse.json({ campaigns: [campaign], nextCursor: null }),
      ),
      http.get('*/api/videos', () =>
        HttpResponse.json({
          videos: [video],
          nextCursor: null,
          total: 1,
          facets: { characterNames: [], formats: ['landscape'] },
        }),
      ),
    );
    const user = userEvent.setup();
    const { actions } = renderDashboard('2d7914b2-f912-4b96-b17d-54100a2ffea3');

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create video' }));
    expect(actions.onCreateVideo).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: 'Continue Launch cut' })).toBeVisible();
    expect(screen.getByText('Launch master')).toBeVisible();
    expect(screen.getByText('Summer launch')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Continue Launch cut' }));
    expect(actions.onOpenProject).toHaveBeenCalledWith(project.id);

    await user.click(screen.getByRole('button', { name: 'Videos' }));
    expect(screen.getByText('Launch master')).toBeVisible();
    expect(screen.queryByText('Summer launch')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'All Campaigns' }));
    expect(actions.onOpenCampaigns).toHaveBeenCalledOnce();
  });

  it('persists lightweight onboarding separately for each account', async () => {
    mockApiServer.use(
      http.get('*/api/projects', () => HttpResponse.json({ projects: [], nextCursor: null })),
      http.get('*/api/campaigns', () => HttpResponse.json({ campaigns: [], nextCursor: null })),
      http.get('*/api/videos', () =>
        HttpResponse.json({
          videos: [],
          nextCursor: null,
          total: 0,
          facets: { characterNames: [], formats: [] },
        }),
      ),
    );
    const user = userEvent.setup();
    const first = renderDashboard('2d7914b2-f912-4b96-b17d-54100a2ffea3');
    expect(screen.getByRole('heading', { name: 'Start with the outcome you need' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('heading', { name: 'Start with the outcome you need' })).toBeNull();
    first.unmount();

    const sameAccount = renderDashboard('2d7914b2-f912-4b96-b17d-54100a2ffea3');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Start with the outcome you need' })).toBeNull(),
    );
    sameAccount.unmount();

    renderDashboard('312490eb-3e08-4f89-9246-fb2e917063ce');
    expect(screen.getByRole('heading', { name: 'Start with the outcome you need' })).toBeVisible();
  });

  it('turns an empty recent-work filter into the appropriate next action', async () => {
    mockApiServer.use(
      http.get('*/api/projects', () => HttpResponse.json({ projects: [], nextCursor: null })),
      http.get('*/api/campaigns', () => HttpResponse.json({ campaigns: [], nextCursor: null })),
      http.get('*/api/videos', () =>
        HttpResponse.json({
          videos: [],
          nextCursor: null,
          total: 0,
          facets: { characterNames: [], formats: [] },
        }),
      ),
    );
    const user = userEvent.setup();
    const { actions } = renderDashboard('2d7914b2-f912-4b96-b17d-54100a2ffea3');

    await user.click(await screen.findByRole('button', { name: 'Campaigns' }));
    const emptyState = screen
      .getByText('No Campaigns yet. They are optional organizers for related Projects.')
      .closest('div');
    expect(emptyState).not.toBeNull();
    await user.click(within(emptyState!).getByRole('button', { name: 'New Campaign' }));
    expect(actions.onCreateCampaign).toHaveBeenCalledOnce();
  });

  it('shows active processing and requires an upstream-cost warning before releasing its slot', async () => {
    const jobId = '9f5664cf-1d2f-4248-b809-b2369ad42dd5';
    let active = true;
    let abandonBody: unknown = null;
    mockApiServer.use(
      http.get('*/api/video-jobs', () =>
        HttpResponse.json({
          jobs: active
            ? [
                {
                  jobId,
                  operation: 'virtual-try-on',
                  provider: 'decart',
                  status: 'queued',
                  createdAt: now,
                  updatedAt: now,
                  expiresAt: '2026-08-11T17:00:00.000Z',
                  providerCancellationSupported: false,
                },
              ]
            : [],
        }),
      ),
      http.post(`*/api/video-jobs/${jobId}/abandon`, async ({ request }) => {
        abandonBody = await request.json();
        active = false;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get('*/api/projects', () => HttpResponse.json({ projects: [], nextCursor: null })),
      http.get('*/api/campaigns', () => HttpResponse.json({ campaigns: [], nextCursor: null })),
      http.get('*/api/videos', () =>
        HttpResponse.json({
          videos: [],
          nextCursor: null,
          total: 0,
          facets: { characterNames: [], formats: [] },
        }),
      ),
    );
    const user = userEvent.setup();
    renderDashboard('2d7914b2-f912-4b96-b17d-54100a2ffea3');

    expect(await screen.findByRole('heading', { name: 'Processing Queue' })).toBeVisible();
    expect(await screen.findByText('Virtual Try-On')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove from queue' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/provider has no verified cancellation API/i)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Remove from queue' }));

    await waitFor(() => expect(abandonBody).toEqual({ acknowledgeProviderMayContinue: true }));
    expect(await screen.findByText('No queued or active video jobs.')).toBeVisible();
    expect(screen.getByText(/processing slot is available/i)).toBeVisible();
  });
});
