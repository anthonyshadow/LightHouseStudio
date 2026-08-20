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
  onOpenVideo: vi.fn(),
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
        HttpResponse.json({
          projects: [project],
          nextCursor: null,
          total: { count: 1, exceedsCeiling: false },
        }),
      ),
      http.get('*/api/campaigns', () =>
        HttpResponse.json({
          campaigns: [campaign],
          nextCursor: null,
          total: { count: 1, exceedsCeiling: false },
        }),
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

    const heading = screen.getByRole('heading', { name: 'Dashboard' });
    expect(heading).toBeVisible();
    expect(heading).toHaveTextContent('Dashboard');
    expect(screen.getByText('Welcome back, Demo Creator')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Start New' })).not.toBeInTheDocument();
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

  it('shows recent work, and says what has no preview instead of showing a broken one', async () => {
    const projectPreview = {
      projectId: project.id,
      savedVideoId: 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338',
      videoVersionId: 'b276694b-58c4-40d3-8fb6-315e32b66fd0',
    };
    const apiReads: string[] = [];
    mockApiServer.use(
      http.get('*/api/projects', ({ request }) => {
        apiReads.push(new URL(request.url).pathname);
        return HttpResponse.json({
          projects: [project],
          previews: [projectPreview],
          nextCursor: null,
          total: { count: 1, exceedsCeiling: false },
        });
      }),
      http.get('*/api/campaigns', ({ request }) => {
        apiReads.push(new URL(request.url).pathname);
        return HttpResponse.json({
          campaigns: [campaign],
          nextCursor: null,
          total: { count: 1, exceedsCeiling: false },
        });
      }),
      http.get('*/api/videos', ({ request }) => {
        apiReads.push(new URL(request.url).pathname);
        return HttpResponse.json({
          videos: [{ ...video, thumbnailAvailable: true }],
          nextCursor: null,
          total: 1,
          facets: { characterNames: [], formats: ['landscape'] },
        });
      }),
    );
    renderDashboard('2d7914b2-f912-4b96-b17d-54100a2ffea3');

    const posters = await waitFor(() => {
      const images = document.querySelectorAll<HTMLImageElement>('[data-recent-poster] img');
      expect(images).toHaveLength(2);
      return [...images];
    });
    // The Project's own list response named the Version; the Video's said a poster exists.
    expect(posters.map((image) => image.getAttribute('src'))).toEqual([
      `/api/videos/${projectPreview.savedVideoId}/thumbnail?v=${projectPreview.videoVersionId}`,
      `/api/videos/${video.id}/thumbnail?v=${video.currentVersion.id}`,
    ]);
    expect(posters.every((image) => image.getAttribute('loading') === 'lazy')).toBe(true);
    // A Campaign organizes work rather than producing it, so it says so instead of waiting.
    expect(screen.getByText('Campaign', { selector: 'small' })).toBeVisible();
    // Three list reads for three lists — the rows added none of their own.
    expect(apiReads.filter((path) => path !== '/api/video-jobs')).toHaveLength(3);
  });

  it('opens the exact Saved Video a Recent Work row names, not the whole library', async () => {
    mockApiServer.use(
      http.get('*/api/projects', () =>
        HttpResponse.json({
          projects: [],
          nextCursor: null,
          total: { count: 0, exceedsCeiling: false },
        }),
      ),
      http.get('*/api/campaigns', () =>
        HttpResponse.json({
          campaigns: [],
          nextCursor: null,
          total: { count: 0, exceedsCeiling: false },
        }),
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

    await user.click(await screen.findByRole('button', { name: /Launch master/u }));

    expect(actions.onOpenVideo).toHaveBeenCalledWith(video.id);
    expect(actions.onOpenVideos).not.toHaveBeenCalled();
  });

  it('persists lightweight onboarding separately for each account', async () => {
    mockApiServer.use(
      http.get('*/api/projects', () =>
        HttpResponse.json({
          projects: [],
          nextCursor: null,
          total: { count: 0, exceedsCeiling: false },
        }),
      ),
      http.get('*/api/campaigns', () =>
        HttpResponse.json({
          campaigns: [],
          nextCursor: null,
          total: { count: 0, exceedsCeiling: false },
        }),
      ),
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
      http.get('*/api/projects', () =>
        HttpResponse.json({
          projects: [],
          nextCursor: null,
          total: { count: 0, exceedsCeiling: false },
        }),
      ),
      http.get('*/api/campaigns', () =>
        HttpResponse.json({
          campaigns: [],
          nextCursor: null,
          total: { count: 0, exceedsCeiling: false },
        }),
      ),
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
      http.get('*/api/projects', () =>
        HttpResponse.json({
          projects: [],
          nextCursor: null,
          total: { count: 0, exceedsCeiling: false },
        }),
      ),
      http.get('*/api/campaigns', () =>
        HttpResponse.json({
          campaigns: [],
          nextCursor: null,
          total: { count: 0, exceedsCeiling: false },
        }),
      ),
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
