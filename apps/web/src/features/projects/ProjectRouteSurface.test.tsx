// @vitest-environment jsdom

import type {
  CampaignContract,
  ProjectAssetsResponse,
  ProjectCurrentResponse,
  ProjectSourceResponse,
  ProjectWorkingMediaResponse,
  SavedVideoSummary,
} from '@studio/contracts';
import { createEmptyCreativeAssetStore, type CreativeAssetStore } from '@studio/domain';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, HttpResponse, http } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { ProjectRouteSurface, type ProjectRouteSurfaceProps } from './ProjectRouteSurface';
import type { ProjectSourceRuntime } from './useProjectSourceController';
import type { ProjectSessionPort } from './useProjectSession';

const activeId = '18b120ac-1578-46e3-8c3d-42307772f391';
const archivedId = '3b41f4fc-0881-4313-878d-d77a1b43f192';
const secondActiveId = '730c73ca-a6af-4509-83c0-b3c18c1ee81a';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const campaignId = '20ce94fa-15d1-42c6-abd3-77ff61516b48';
const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const savedVideoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const videoVersionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const workingRevisionId = 'f621e540-6ef7-49fc-a124-c4926015e93a';
const now = '2026-08-11T16:00:00.000Z';

const savedVideoSummary = (): SavedVideoSummary => ({
  id: savedVideoId,
  title: 'Library source',
  status: 'ready',
  currentVersion: {
    id: videoVersionId,
    videoId: savedVideoId,
    ordinal: 2,
    origin: 'uploaded',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'library-source.mp4',
    sizeBytes: 4,
    durationMs: 1_000,
    width: 640,
    height: 360,
    createdAt: now,
  },
  sourceVideoId: null,
  versionCount: 2,
  thumbnailAvailable: false,
  createdAt: now,
  updatedAt: now,
});

let projectAssetsResponse: ProjectAssetsResponse = {
  assets: [],
  videoSummaries: [],
  nextCursor: null,
};

const campaign = (): CampaignContract => ({
  id: campaignId,
  name: 'Summer launch',
  brief: null,
  status: 'active',
  version: 1,
  archivedAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
});

const currentProject = (
  id: string,
  overrides: Partial<ProjectCurrentResponse['project']> = {},
): ProjectCurrentResponse => ({
  project: {
    id,
    campaignId: null,
    title: id === activeId ? 'Launch cut' : 'Archived concept',
    status: id === archivedId ? 'archived' : 'draft',
    version: 1,
    currentRevisionId: revisionId,
    currentRevisionNumber: 1,
    archivedAt: id === archivedId ? now : null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  },
  revision: {
    id: revisionId,
    projectId: id,
    revisionNumber: 1,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId: null,
      workingMedia: null,
      presentedMedia: null,
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'none' },
      liveMode: null,
      creativeIntent: {
        promptId: null,
        promptLabel: null,
        recipeId: null,
        recipeLabel: null,
        userIntent: '',
        appliedPrompt: null,
        referenceAssetId: null,
        resourceRevision: null,
      },
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: 'source',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'create',
    createdAt: now,
  },
});

const acceptedProject = (): ProjectCurrentResponse => {
  const initial = currentProject(activeId, {
    status: 'ready',
    version: 2,
    currentRevisionId: secondActiveId,
    currentRevisionNumber: 2,
  });
  const media = { kind: 'asset' as const, assetId: sourceAssetId };
  return {
    project: initial.project,
    revision: {
      ...initial.revision,
      id: secondActiveId,
      revisionNumber: 2,
      parentRevisionId: revisionId,
      parentRevisionNumber: 1,
      snapshot: {
        ...initial.revision.snapshot,
        sourceAssetId,
        workingMedia: media,
        presentedMedia: media,
        workflowPhase: 'creative',
      },
    },
  };
};

const acceptedSourceResponse = (): ProjectSourceResponse => ({
  ...acceptedProject(),
  source: {
    kind: 'recorded',
    savedVideoId: null,
    videoVersionId: null,
    mimeType: 'video/mp4',
    filename: 'accepted-source.mp4',
    sizeBytes: 4,
    container: 'mp4',
    videoCodec: 'avc',
    audioCodec: null,
    durationMs: 1_000,
    width: 640,
    height: 360,
    hasAudio: false,
    acceptedAt: now,
    contentUrl: `/api/projects/${activeId}/source/content`,
  },
});

const renderProjects = (
  path = '/projects',
  props: ProjectRouteSurfaceProps = {},
  previousPath?: string,
  routeState?: unknown,
) => {
  mockApiServer.use(
    http.get('*/api/projects/:projectId/history', () =>
      HttpResponse.json({ revisions: [], nextCursor: null }),
    ),
    http.get('*/api/projects/:projectId/outputs', () =>
      HttpResponse.json({ outputs: [], nextCursor: null }),
    ),
    http.get('*/api/projects/:projectId/processing/history', () =>
      HttpResponse.json({ attempts: [], nextCursor: null }),
    ),
    http.get('*/api/projects/:projectId/assets', () => HttpResponse.json(projectAssetsResponse)),
  );
  const router = createMemoryRouter(
    [
      { path: '/projects/*', element: <ProjectRouteSurface {...props} /> },
      { path: '/campaigns/:campaignId', element: <div>Campaign return</div> },
      { path: '/dashboard', element: <div>Dashboard previous</div> },
      { path: '/studio/:videoId', element: <div>Studio direct</div> },
    ],
    {
      initialEntries: [
        ...(previousPath ? [previousPath] : []),
        routeState === undefined ? path : { pathname: path, state: routeState },
      ],
    },
  );
  const view = render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <RouterProvider router={router} />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );
  return { ...view, router };
};

const installProjectLists = (
  active: ProjectCurrentResponse['project'][] = [currentProject(activeId).project],
  archived: ProjectCurrentResponse['project'][] = [currentProject(archivedId).project],
) => {
  mockApiServer.use(
    http.get('*/api/projects', ({ request }) => {
      const lifecycle = new URL(request.url).searchParams.get('lifecycle');
      return HttpResponse.json({
        projects: lifecycle === 'archived' ? archived : active,
        nextCursor: null,
      });
    }),
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({ idx: 0 }, '');
  projectAssetsResponse = { assets: [], videoSummaries: [], nextCursor: null };
});

describe('Project route surface', () => {
  it('renders bounded active/archived summaries and opens server-owned empty detail', async () => {
    installProjectLists();
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(currentProject(activeId))),
    );
    const { router } = renderProjects();

    expect(await screen.findByRole('heading', { name: 'Active Projects' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Archived' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Archived concept' })).toBeVisible();
    expect(screen.queryByText('No original video yet')).not.toBeInTheDocument();
    expect(screen.getByText(/Keep focused video work together/u)).toBeVisible();
    expect(screen.getByRole('button', { name: 'New Project' })).toHaveAttribute(
      'data-project-create',
      'named',
    );
    expect(screen.queryByRole('button', { name: 'Quick project' })).not.toBeInTheDocument();

    const activeList = screen.getByRole('list', { name: 'Active Projects' });
    expect(
      within(activeList).getByText('Launch cut').closest('[data-project-ledger-row]'),
    ).not.toBeNull();
    await userEvent.click(within(activeList).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${activeId}`));
    expect(
      await screen.findByText('No original video yet • Choose one below to begin.'),
    ).toBeVisible();
    const progress = screen.getByRole('list', { name: 'Project workflow progress' });
    expect(within(progress).getByText('Original').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    const overviewSource = screen.getByRole('region', { name: 'Original video' });
    expect(
      within(overviewSource).getByRole('heading', { name: 'No original video yet' }),
    ).toBeVisible();
    expect(within(overviewSource).getByRole('button', { name: 'Upload' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Add original video' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/projects/${activeId}/workspace`),
    );
    expect(await screen.findByRole('heading', { name: 'No original video yet' })).toBeVisible();
    expect(screen.getByText('All changes saved').closest('[role="status"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
    expect(screen.queryByRole('video')).not.toBeInTheDocument();
  });

  it('presents the workspace lifecycle as four keyboard-operable guided tasks', async () => {
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(currentProject(activeId))),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}/workspace`);

    const tabs = await screen.findByRole('tablist', { name: 'Project tasks' });
    const sourceTab = within(tabs).getByRole('tab', { name: 'Original' });
    const createTab = within(tabs).getByRole('tab', { name: 'Create' });

    expect(within(tabs).getAllByRole('tab')).toHaveLength(4);
    expect(sourceTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Original' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Original video' })).toBeVisible();

    await user.click(createTab);
    expect(createTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Create' })).toBeVisible();
    expect(screen.queryByRole('tabpanel', { name: 'Original' })).not.toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(within(tabs).getByRole('tab', { name: 'Save' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('opens the workspace on the step the Project is up to and marks it in the masthead', async () => {
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(acceptedProject())),
    );
    renderProjects(`/projects/${activeId}/workspace`);

    const tabs = await screen.findByRole('tablist', { name: 'Project tasks' });
    // A source exists, so Source is behind the user and Create is the live task.
    expect(within(tabs).getByRole('tab', { name: 'Create' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const progress = screen.getByRole('list', { name: 'Project workflow progress' });
    expect(progress.closest('[data-project-workspace-masthead]')).not.toBeNull();
    expect(within(progress).getByText('Create').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(within(progress).getByText('Original').closest('li')).toHaveAttribute(
      'data-state',
      'done',
    );
  });

  it('deep-links a workspace task and pins it against the Project phase', async () => {
    const user = userEvent.setup();
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(acceptedProject())),
    );
    const { router } = renderProjects(`/projects/${activeId}/workspace?task=history`);

    const tabs = await screen.findByRole('tablist', { name: 'Project tasks' });
    expect(within(tabs).getByRole('tab', { name: 'History' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(within(tabs).getByRole('tab', { name: 'Save' }));

    expect(router.state.location.search).toBe('?task=save');
    // Replace, not push: the masthead Overview button must leave the workspace, not walk tasks.
    expect(router.state.location.pathname).toBe(`/projects/${activeId}/workspace`);
  });

  it('reads a completed Project as finished in the workflow progress', async () => {
    const completed = acceptedProject();
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () =>
        HttpResponse.json({
          ...completed,
          revision: {
            ...completed.revision,
            snapshot: { ...completed.revision.snapshot, workflowPhase: 'complete' },
          },
        }),
      ),
    );
    renderProjects(`/projects/${activeId}`);

    const progress = await screen.findByRole('list', { name: 'Project workflow progress' });
    expect(within(progress).getByText('History').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(within(progress).getByText('Save').closest('li')).toHaveAttribute('data-state', 'done');
  });

  it('reads a review-phase Project as waiting on Save', async () => {
    const reviewing = acceptedProject();
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () =>
        HttpResponse.json({
          ...reviewing,
          revision: {
            ...reviewing.revision,
            snapshot: { ...reviewing.revision.snapshot, workflowPhase: 'review' },
          },
        }),
      ),
    );
    renderProjects(`/projects/${activeId}`);

    const progress = await screen.findByRole('list', { name: 'Project workflow progress' });
    expect(within(progress).getByText('Save').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  it('shows the assigned Campaign name and returns safely to its detail route', async () => {
    const assigned = currentProject(activeId, { campaignId });
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(assigned)),
      http.get(`*/api/campaigns/${campaignId}`, async () => {
        await delay(75);
        return HttpResponse.json(campaign());
      }),
    );
    const { router } = renderProjects(`/projects/${activeId}`);
    const user = userEvent.setup();

    expect(await screen.findByText('Campaign: loading…')).toBeVisible();
    expect(await screen.findByText('Campaign: Summer launch')).toBeVisible();
    const campaignReturn = screen.getByRole('button', { name: '← Summer launch' });
    await user.click(campaignReturn);

    await waitFor(() => expect(router.state.location.pathname).toBe(`/campaigns/${campaignId}`));
    expect(screen.getByText('Campaign return')).toBeVisible();
  });

  it('keeps a generic Campaign return when assigned Campaign details are unavailable', async () => {
    const assigned = currentProject(activeId, { campaignId });
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(assigned)),
      http.get(`*/api/campaigns/${campaignId}`, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Campaign not found.' } },
          { status: 404 },
        ),
      ),
    );
    const { router } = renderProjects(`/projects/${activeId}`);
    const user = userEvent.setup();

    expect(await screen.findByText('Campaign unavailable')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '← Campaign' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/campaigns/${campaignId}`));
  });

  it('uses the actual prior route for Back instead of the Project hierarchy', async () => {
    const assigned = currentProject(activeId, { campaignId });
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(assigned)),
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(campaign())),
    );
    window.history.replaceState({ idx: 1 }, '');
    const { router } = renderProjects(`/projects/${activeId}`, {}, '/dashboard');

    await userEvent.click(await screen.findByRole('button', { name: '← Summer launch' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    expect(screen.getByText('Dashboard previous')).toBeVisible();
  });

  it('shows bounded Saved Video memberships, previews in place, and detaches only the association', async () => {
    const membershipId = '08707aa5-7b7f-4ce1-a48e-647370f6d3ab';
    const summary = { ...savedVideoSummary(), thumbnailAvailable: true };
    projectAssetsResponse = {
      assets: [
        {
          id: membershipId,
          projectId: activeId,
          kind: 'video',
          resourceId: savedVideoId,
          createdAt: now,
        },
      ],
      videoSummaries: [summary],
      nextCursor: null,
    };
    let detachCalls = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(currentProject(activeId))),
      http.get(`*/api/videos/${savedVideoId}`, () =>
        HttpResponse.json({ ...summary, versions: [summary.currentVersion] }),
      ),
      http.delete(`*/api/projects/${activeId}/assets/${membershipId}`, () => {
        detachCalls += 1;
        projectAssetsResponse = { assets: [], videoSummaries: [], nextCursor: null };
        return HttpResponse.json({ detached: true });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderProjects(`/projects/${activeId}`);

    expect(await screen.findByRole('heading', { name: 'Used in this Project' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Library source' })).toBeVisible();
    const thumbnail = screen.getByRole('img', { name: 'Thumbnail for Library source' });
    expect(thumbnail.querySelector('img')).toHaveAttribute(
      'src',
      `/api/videos/${savedVideoId}/thumbnail?v=${videoVersionId}`,
    );
    expect(screen.getByRole('button', { name: 'Use as the original video' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'Library source' });
    const previewBody = dialog.querySelector<HTMLElement>('[data-overlay-body-mode="contained"]');
    expect(previewBody).not.toBeNull();
    expect(previewBody).toHaveStyle({ overflow: 'hidden' });
    expect(within(dialog).getByRole('group', { name: 'Video controls' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Play video' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Use as the original video' })).toBeVisible();
    expect(within(dialog).getByRole('slider', { name: 'Video position' })).toBeVisible();
    expect(within(dialog).getByLabelText('Preview of Library source')).toHaveStyle({
      width: '100%',
      height: '100%',
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
    });
    expect(router.state.location.pathname).toBe(`/projects/${activeId}`);
    await user.click(screen.getByRole('button', { name: 'Back to Project' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /Saved Video preview|Library source/u }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Remove from Project' }));
    await waitFor(() => expect(detachCalls).toBe(1));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Library source' })).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Removing an item here never deletes it or this Project.s history/u),
    ).toBeVisible();
  });

  it("opens an attached Video's exact current Version as an empty Project source", async () => {
    const summary = savedVideoSummary();
    const reference = {
      kind: 'saved-video-version' as const,
      savedVideoId,
      videoVersionId,
    };
    const baseSource = acceptedSourceResponse();
    const reusedSource: ProjectSourceResponse = {
      ...baseSource,
      revision: {
        ...baseSource.revision,
        snapshot: {
          ...baseSource.revision.snapshot,
          workingMedia: reference,
          presentedMedia: reference,
        },
      },
      source: {
        ...baseSource.source,
        kind: 'saved-video-version',
        savedVideoId,
        videoVersionId,
        filename: summary.currentVersion.filename,
      },
    };
    let authority = currentProject(activeId);
    const present = vi.fn<ProjectSourceRuntime['present']>();
    projectAssetsResponse = {
      assets: [
        {
          id: '9f748424-285f-4453-b752-dd85dbb5903c',
          projectId: activeId,
          kind: 'video',
          resourceId: savedVideoId,
          createdAt: now,
        },
      ],
      videoSummaries: [summary],
      nextCursor: null,
    };
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(authority)),
      http.post(`*/api/projects/${activeId}/source/reuse`, async ({ request }) => {
        expect(await request.json()).toEqual({
          expectedVersion: 1,
          expectedRevisionNumber: 1,
          savedVideoId,
          videoVersionId,
        });
        authority = { project: reusedSource.project, revision: reusedSource.revision };
        return HttpResponse.json(reusedSource, { status: 201 });
      }),
      http.get(`*/api/projects/${activeId}/source`, () => HttpResponse.json(reusedSource)),
      http.get(`*/api/projects/${activeId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
    );
    const { router } = renderProjects(`/projects/${activeId}`, {
      sourceRuntime: { available: true, present, clear: vi.fn() },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Use as the original video' }));

    const confirmation = await screen.findByRole('dialog', {
      name: 'Make this the original video?',
    });
    expect(confirmation).toHaveTextContent('You can remove it later from the workspace');
    await userEvent.click(
      within(confirmation).getByRole('button', { name: 'Use as the original video' }),
    );

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/projects/${activeId}/workspace`),
    );
    await waitFor(() => expect(present).toHaveBeenCalledOnce());
    // The workspace now opens on the step the Project is up to, so reach back to Source to
    // confirm what landed.
    await userEvent.click(screen.getByRole('tab', { name: 'Original' }));
    expect(screen.getByRole('heading', { name: 'Original video ready' })).toBeVisible();
  });

  it("opens an attached Video's exact current Version as working media without replacing the source", async () => {
    const summary = savedVideoSummary();
    const initial = acceptedProject();
    const reference = {
      kind: 'saved-video-version' as const,
      savedVideoId,
      videoVersionId,
    };
    const adopted: ProjectWorkingMediaResponse = {
      project: {
        ...initial.project,
        version: 3,
        currentRevisionId: workingRevisionId,
        currentRevisionNumber: 3,
      },
      revision: {
        ...initial.revision,
        id: workingRevisionId,
        revisionNumber: 3,
        parentRevisionId: initial.revision.id,
        parentRevisionNumber: initial.revision.revisionNumber,
        snapshot: {
          ...initial.revision.snapshot,
          workingMedia: reference,
          presentedMedia: reference,
        },
      },
      isCurrent: true,
      media: {
        kind: 'saved-video-version',
        reference,
        assetId: sourceAssetId,
        savedVideoId,
        videoVersionId,
        mimeType: summary.currentVersion.mimeType,
        filename: summary.currentVersion.filename,
        sizeBytes: summary.currentVersion.sizeBytes,
        checksumSha256: 'a'.repeat(64),
        container: 'mp4',
        videoCodec: 'avc',
        audioCodec: null,
        durationMs: summary.currentVersion.durationMs,
        width: summary.currentVersion.width,
        height: summary.currentVersion.height,
        hasAudio: false,
        adoptedRevisionId: workingRevisionId,
        adoptedRevisionNumber: 3,
        adoptedAt: now,
        contentUrl: `/api/projects/${activeId}/working-media/${workingRevisionId}/content`,
      },
    };
    const sourceResponse: ProjectSourceResponse = {
      ...acceptedSourceResponse(),
      project: adopted.project,
      revision: adopted.revision,
    };
    let authority: ProjectCurrentResponse = initial;
    const present = vi.fn<ProjectSourceRuntime['present']>();
    projectAssetsResponse = {
      assets: [
        {
          id: '5de818cc-8d7a-48ae-9981-80101f3ced33',
          projectId: activeId,
          kind: 'video',
          resourceId: savedVideoId,
          createdAt: now,
        },
      ],
      videoSummaries: [summary],
      nextCursor: null,
    };
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(authority)),
      http.post(`*/api/projects/${activeId}/working-media/reuse`, async ({ request }) => {
        expect(await request.json()).toEqual({
          expectedVersion: 2,
          expectedRevisionNumber: 2,
          media: reference,
          localEdit: null,
        });
        authority = { project: adopted.project, revision: adopted.revision };
        return HttpResponse.json(adopted, { status: 201 });
      }),
      http.get(`*/api/projects/${activeId}/source`, () => HttpResponse.json(sourceResponse)),
      http.get(`*/api/projects/${activeId}/working-media`, () => HttpResponse.json(adopted)),
      http.get(`*/api/projects/${activeId}/working-media/${workingRevisionId}/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
    );
    const { router } = renderProjects(`/projects/${activeId}`, {
      sourceRuntime: { available: true, present, clear: vi.fn() },
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Use as the current cut' }));

    expect(
      screen.queryByRole('dialog', { name: 'Make this the original video?' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/projects/${activeId}/workspace`),
    );
    await waitFor(() => expect(present).toHaveBeenCalledOnce());
    // The workspace now opens on the step the Project is up to, so reach back to Source to
    // confirm what landed.
    await userEvent.click(screen.getByRole('tab', { name: 'Original' }));
    expect(screen.getByRole('heading', { name: 'Original video ready' })).toBeVisible();
  });

  it('shows retained images and type-specific visuals for attached creative Assets', async () => {
    const characterId = 'saved-character-visual';
    const outfitId = 'saved-outfit-visual';
    const voiceId = 'saved-voice-visual';
    const creativeStore: CreativeAssetStore = {
      ...createEmptyCreativeAssetStore(),
      savedCharacterPrompts: [
        {
          id: characterId,
          name: 'Styled character',
          prompt: 'A studio presenter',
          source: 'manual',
          promptIntent: null,
          builderDraft: null,
          guidedDesign: null,
          referenceImageStatus: 'persisted-reference',
          referenceImageAssetId: 'character-reference-image',
          uploadedReferenceImageAssetId: null,
          finalReferenceKind: 'generated',
          selectedWardrobeVariantId: null,
          defaultVoice: null,
          notes: '',
          tags: [],
          createdAt: now,
          updatedAt: now,
          lastUsedAt: null,
          useCount: 0,
        },
      ],
      savedPrompts: [
        {
          id: outfitId,
          title: 'Green jacket',
          prompt: 'A green studio jacket',
          modelModeId: 'lucy-vton-latest',
          source: 'manual',
          referenceImageAssetId: 'outfit-reference-image',
          vtonInputKind: 'saved-outfit',
          enhancePrompt: false,
          tags: [],
          createdAt: now,
          updatedAt: now,
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    };
    projectAssetsResponse = {
      assets: [
        {
          id: '32bbd758-3b08-40d1-8ab6-41a84700e5fc',
          projectId: activeId,
          kind: 'character',
          resourceId: characterId,
          createdAt: now,
        },
        {
          id: '64c960bc-671a-4b09-9de6-0da19e697647',
          projectId: activeId,
          kind: 'outfit',
          resourceId: outfitId,
          createdAt: now,
        },
        {
          id: '627e96e5-839d-49ba-9481-797cb28f17c4',
          projectId: activeId,
          kind: 'voice',
          resourceId: voiceId,
          createdAt: now,
        },
      ],
      videoSummaries: [],
      nextCursor: null,
    };
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(currentProject(activeId))),
    );
    renderProjects(`/projects/${activeId}`, { creativeStore });

    const characterVisual = await screen.findByRole('img', {
      name: 'Thumbnail for Styled character',
    });
    expect(characterVisual.querySelector('img')).toHaveAttribute(
      'src',
      '/api/reference-images/character-reference-image/content',
    );
    const outfitVisual = screen.getByRole('img', { name: 'Thumbnail for Green jacket' });
    expect(outfitVisual.querySelector('img')).toHaveAttribute(
      'src',
      '/api/reference-images/outfit-reference-image/content',
    );
    expect(screen.getByRole('img', { name: 'Voice visual for Saved Voice' })).toBeVisible();
  });

  it('creates an unnamed Project from the one dialog and replays its operation key', async () => {
    installProjectLists([], []);
    const created = currentProject(activeId, { title: 'Untitled Project' });
    const operationKeys: string[] = [];
    const bodies: unknown[] = [];
    let attempts = 0;
    mockApiServer.use(
      http.post('*/api/projects', async ({ request }) => {
        operationKeys.push(request.headers.get('idempotency-key') ?? '');
        bodies.push(await request.json());
        attempts += 1;
        return attempts === 1 ? HttpResponse.error() : HttpResponse.json(created, { status: 201 });
      }),
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(created)),
    );
    const { router } = renderProjects();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'New Project' }));
    const unnamed = await screen.findByRole('button', { name: 'Create without a name' });
    await user.click(unnamed);
    expect(await screen.findByText('Project not created')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create without a name' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${activeId}`));
    expect(bodies).toEqual([
      { title: 'Untitled Project', campaignId: null },
      { title: 'Untitled Project', campaignId: null },
    ]);
    expect(operationKeys).toHaveLength(2);
    expect(operationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(operationKeys[1]).toBe(operationKeys[0]);
    expect(await screen.findByRole('heading', { name: 'Untitled Project' })).toBeVisible();
  });

  it('does not re-open the create dialog when Back returns to the list that requested it', async () => {
    installProjectLists([], []);
    const created = currentProject(activeId, { title: 'Launch cut' });
    mockApiServer.use(
      http.post('*/api/projects', () => HttpResponse.json(created, { status: 201 })),
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(created)),
    );
    const { router } = renderProjects('/projects', {}, undefined, { createIntent: 'project' });
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'New Project' });
    await user.type(within(dialog).getByRole('textbox', { name: /Project name/u }), 'Launch cut');
    await user.click(within(dialog).getByRole('button', { name: 'Create Project' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${activeId}`));

    await router.navigate(-1);

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'));
    expect(router.state.location.state).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New Project' })).toBeNull());
  });

  it('loads the next bounded page only after an explicit pagination action', async () => {
    mockApiServer.use(
      http.get('*/api/projects', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('lifecycle') === 'archived') {
          return HttpResponse.json({ projects: [], nextCursor: null });
        }
        if (url.searchParams.get('cursor') === 'active-next') {
          return HttpResponse.json({
            projects: [currentProject(secondActiveId, { title: 'Second page' }).project],
            nextCursor: null,
          });
        }
        return HttpResponse.json({
          projects: [currentProject(activeId).project],
          nextCursor: 'active-next',
        });
      }),
    );
    const user = userEvent.setup();
    renderProjects();

    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Second page' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more active Projects' }));
    expect(await screen.findByRole('heading', { name: 'Second page' })).toBeVisible();
  });

  it('shows a safe list error and retries the failed lifecycle independently', async () => {
    let activeReads = 0;
    mockApiServer.use(
      http.get('*/api/projects', ({ request }) => {
        if (new URL(request.url).searchParams.get('lifecycle') === 'archived') {
          return HttpResponse.json({ projects: [], nextCursor: null });
        }
        activeReads += 1;
        return activeReads === 1
          ? HttpResponse.json(
              { error: { code: 'feature_unavailable', message: 'Projects are starting.' } },
              { status: 503 },
            )
          : HttpResponse.json({ projects: [currentProject(activeId).project], nextCursor: null });
      }),
    );
    const user = userEvent.setup();
    renderProjects();

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Projects are starting.');
    await user.click(within(error).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
  });

  it('archives and restores through confirmation, CAS, cache invalidation, and announcements', async () => {
    let active = [currentProject(activeId).project];
    let archived: ProjectCurrentResponse['project'][] = [];
    mockApiServer.use(
      http.get('*/api/projects', ({ request }) =>
        HttpResponse.json({
          projects:
            new URL(request.url).searchParams.get('lifecycle') === 'archived' ? archived : active,
          nextCursor: null,
        }),
      ),
      http.post(`*/api/projects/${activeId}/archive`, async ({ request }) => {
        expect(await request.json()).toEqual({ expectedVersion: 1 });
        const current = currentProject(activeId, {
          status: 'archived',
          version: 2,
          archivedAt: now,
        });
        active = [];
        archived = [current.project];
        return HttpResponse.json(current);
      }),
      http.post(`*/api/projects/${activeId}/restore`, async ({ request }) => {
        expect(await request.json()).toEqual({ expectedVersion: 2 });
        const current = currentProject(activeId, { status: 'draft', version: 3, archivedAt: null });
        active = [current.project];
        archived = [];
        return HttpResponse.json(current);
      }),
    );
    const user = userEvent.setup();
    renderProjects();

    const activeList = await screen.findByRole('list', { name: 'Active Projects' });
    await user.click(within(activeList).getByRole('button', { name: 'Archive' }));
    const archiveDialog = screen.getByRole('dialog', { name: 'Archive Project' });
    await user.click(within(archiveDialog).getByRole('button', { name: 'Archive Project' }));
    expect(await screen.findByText('Launch cut archived.')).toBeVisible();
    const archivedList = await screen.findByRole('list', { name: 'Archived Projects' });

    await user.click(within(archivedList).getByRole('button', { name: 'Restore' }));
    const restoreDialog = screen.getByRole('dialog', { name: 'Restore Project' });
    await user.click(within(restoreDialog).getByRole('button', { name: 'Restore Project' }));
    expect(await screen.findByText('Launch cut restored.')).toBeVisible();
    expect(await screen.findByRole('list', { name: 'Active Projects' })).toHaveTextContent(
      'Launch cut',
    );
  });

  it('deletes only the selected archived Project after explicit confirmation', async () => {
    let archived = [currentProject(archivedId).project];
    let requestBody: unknown;
    mockApiServer.use(
      http.get('*/api/projects', ({ request }) =>
        HttpResponse.json({
          projects:
            new URL(request.url).searchParams.get('lifecycle') === 'archived' ? archived : [],
          nextCursor: null,
        }),
      ),
      http.post(`*/api/projects/${archivedId}/tombstone`, async ({ request }) => {
        requestBody = await request.json();
        archived = [];
        return HttpResponse.json(
          currentProject(archivedId, {
            status: 'deleted',
            version: 2,
            deletedAt: now,
          }),
        );
      }),
    );
    const user = userEvent.setup();
    renderProjects();

    const archivedList = await screen.findByRole('list', { name: 'Archived Projects' });
    await user.click(within(archivedList).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Project' });
    expect(dialog).toHaveTextContent('It does not claim physical erasure');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm Delete Project' }));

    expect(requestBody).toEqual({ expectedVersion: 1, confirmation: 'permanent-delete' });
    expect(await screen.findByText('Archived concept deleted.')).toBeVisible();
    expect(await screen.findByText('No archived Projects')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Archived concept' })).not.toBeInTheDocument();
  });

  it('preserves a proposed rename across stale CAS and requires explicit reload/retry', async () => {
    const initial = currentProject(activeId);
    const latest = currentProject(activeId, { title: 'Server title', version: 2 });
    const renamed = currentProject(activeId, { title: 'Proposed title', version: 3 });
    let detailReads = 0;
    let renameWrites = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => {
        detailReads += 1;
        return HttpResponse.json(detailReads === 1 ? initial : latest);
      }),
      http.patch(`*/api/projects/${activeId}`, async ({ request }) => {
        renameWrites += 1;
        const body = (await request.json()) as { title: string; expectedVersion: number };
        if (renameWrites === 1) {
          return HttpResponse.json(
            {
              error: { code: 'conflict', message: 'The Project changed. Refresh it.' },
              conflict: {
                kind: 'project-version',
                projectId: activeId,
                expectedVersion: body.expectedVersion,
                actualVersion: 2,
              },
            },
            { status: 409 },
          );
        }
        expect(body).toEqual({ title: 'Proposed title', expectedVersion: 2 });
        return HttpResponse.json(renamed);
      }),
    );
    renderProjects(`/projects/${activeId}`);
    const user = userEvent.setup();

    const renameTrigger = await screen.findByRole('button', { name: 'Rename' });
    await user.click(renameTrigger);
    const dialog = screen.getByRole('dialog', { name: 'Rename Project' });
    const input = within(dialog).getByRole('textbox', { name: /Project name/u });
    await user.clear(input);
    await user.type(input, 'Proposed title');
    await user.click(within(dialog).getByRole('button', { name: 'Rename Project' }));

    expect(await within(dialog).findByText(/Your proposed name is still here/u)).toBeVisible();
    expect(input).toHaveValue('Proposed title');
    await user.click(within(dialog).getByRole('button', { name: 'Reload and retry rename' }));

    expect(await screen.findByRole('heading', { name: 'Proposed title' })).toBeVisible();
    await waitFor(() => expect(renameTrigger).toHaveFocus());
    expect(screen.getByText('Project renamed to Proposed title.')).toBeVisible();
    expect(renameWrites).toBe(2);
  });

  it('switches between Project groups and renames from the active list', async () => {
    const renamed = currentProject(activeId, { title: 'Launch master' });
    let listedProject = currentProject(activeId).project;
    const activeCampaignFilters: Array<string | null> = [];
    const archivedCampaignFilters: Array<string | null> = [];
    mockApiServer.use(
      http.get('*/api/projects', ({ request }) => {
        const url = new URL(request.url);
        const filter = url.searchParams.get('campaignId');
        // Captured before the lifecycle branch: reading it after was why N10 went unnoticed.
        if (url.searchParams.get('lifecycle') === 'archived') {
          archivedCampaignFilters.push(filter);
          return HttpResponse.json({ projects: [], nextCursor: null });
        }
        activeCampaignFilters.push(filter);
        return HttpResponse.json({
          projects: filter === 'none' ? [] : [listedProject],
          nextCursor: null,
        });
      }),
      http.patch(`*/api/projects/${activeId}`, async ({ request }) => {
        expect(await request.json()).toEqual({ title: 'Launch master', expectedVersion: 1 });
        listedProject = renamed.project;
        return HttpResponse.json(renamed);
      }),
    );
    const user = userEvent.setup();
    renderProjects();

    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'No Campaign' }));
    expect(await screen.findByRole('heading', { name: 'No Campaign' })).toBeVisible();
    expect(await screen.findByText('No active Projects yet')).toBeVisible();
    expect(activeCampaignFilters).toContain('none');

    // The filter owns the whole screen: the archived section must not keep listing every Campaign.
    expect(await screen.findByRole('heading', { name: 'Archived · No Campaign' })).toBeVisible();
    await waitFor(() => expect(archivedCampaignFilters).toContain('none'));
    expect(
      await screen.findByText(
        'Archived Projects with no Campaign appear here and can be restored.',
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'All Active' }));
    expect(await screen.findByRole('heading', { name: 'Archived' })).toBeVisible();
    const activeList = await screen.findByRole('list', { name: 'Active Projects' });
    await user.click(within(activeList).getByRole('button', { name: 'Rename' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename Project' });
    const input = within(dialog).getByRole('textbox', { name: /Project name/u });
    await user.clear(input);
    await user.type(input, 'Launch master{Enter}');

    expect(await screen.findByText('Project renamed to Launch master.')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Launch master' })).toBeVisible();
  });

  it('shows Project loading and retries a safe detail failure', async () => {
    let detailReads = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, async () => {
        detailReads += 1;
        if (detailReads === 1) {
          await delay(50);
          return HttpResponse.json(
            { error: { code: 'feature_unavailable', message: 'Projects are starting.' } },
            { status: 503 },
          );
        }
        return HttpResponse.json(currentProject(activeId));
      }),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}`);

    expect(screen.getByRole('status')).toHaveTextContent('Loading Project…');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Projects are starting.');
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
    expect(detailReads).toBe(2);
  });

  it('returns from an unavailable detail to the bounded Projects workspace', async () => {
    installProjectLists([], []);
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Project not found.' } },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderProjects(`/projects/${activeId}`);

    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Back to Projects' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'));
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  it('reopens an accepted immutable source without starting provider work', async () => {
    const durable = acceptedProject();
    const source = acceptedSourceResponse();
    const present = vi.fn<ProjectSourceRuntime['present']>();
    const clear = vi.fn<ProjectSourceRuntime['clear']>();
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(durable)),
      http.get(`*/api/projects/${activeId}/source`, async () => {
        await delay(50);
        return HttpResponse.json(source);
      }),
      http.get(`*/api/projects/${activeId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
    );
    renderProjects(`/projects/${activeId}/workspace?task=source`, {
      sourceRuntime: { available: true, present, clear },
    });

    expect(await screen.findByText(/Loading this Project.s original video/u)).toBeVisible();
    await waitFor(() => expect(present).toHaveBeenCalledOnce());
    expect(present.mock.calls[0]?.[0]).toBe(activeId);
    expect(present.mock.calls[0]?.[1].blob).toBeInstanceOf(File);
    const sourceHeading = screen.getByRole('heading', { name: 'Original video ready' });
    expect(sourceHeading.parentElement).toHaveTextContent(
      'accepted-source.mp4 · 640×360 · 1 seconds',
    );
  });

  it('removes an accepted source after confirmation and reopens the add-source controls', async () => {
    const durable = acceptedProject();
    const source = acceptedSourceResponse();
    const emptied = currentProject(activeId, {
      status: 'draft',
      version: 3,
      currentRevisionId: secondActiveId,
      currentRevisionNumber: 3,
    });
    const present = vi.fn<ProjectSourceRuntime['present']>();
    const clear = vi.fn<ProjectSourceRuntime['clear']>();
    let removeBody: unknown = null;
    let hasSource = true;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () =>
        HttpResponse.json(hasSource ? durable : emptied),
      ),
      http.get(`*/api/projects/${activeId}/source`, () =>
        hasSource
          ? HttpResponse.json(source)
          : HttpResponse.json(
              { error: { code: 'not_found', message: 'No source.' } },
              { status: 404 },
            ),
      ),
      http.get(`*/api/projects/${activeId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
      http.post(`*/api/projects/${activeId}/source/remove`, async ({ request }) => {
        removeBody = await request.json();
        hasSource = false;
        return HttpResponse.json(emptied);
      }),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}/workspace?task=source`, {
      sourceRuntime: { available: true, present, clear },
    });

    await waitFor(() => expect(present).toHaveBeenCalledOnce());
    expect(screen.getByRole('heading', { name: 'Original video ready' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Remove original video' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove original video' });
    expect(dialog).toHaveTextContent('The video itself is not deleted');
    expect(dialog).toHaveTextContent('accepted-source.mp4');

    await user.click(within(dialog).getByRole('button', { name: 'Remove original video' }));

    expect(removeBody).toEqual({ expectedVersion: 2, expectedRevisionNumber: 2 });
    expect(await screen.findByRole('heading', { name: 'No original video yet' })).toBeVisible();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Remove original video' }),
      ).not.toBeInTheDocument(),
    );
    // The three ways back to a source are live again, and Remove is gone with the source.
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Use Saved Video' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Remove original video' })).not.toBeInTheDocument();
    expect(clear).toHaveBeenCalledWith(activeId);
  });

  it('keeps the removal dialog open and explains a refused removal', async () => {
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(acceptedProject())),
      http.get(`*/api/projects/${activeId}/source`, () =>
        HttpResponse.json(acceptedSourceResponse()),
      ),
      http.get(`*/api/projects/${activeId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
      http.post(`*/api/projects/${activeId}/source/remove`, () =>
        HttpResponse.json(
          {
            error: { code: 'conflict', message: 'The Project has active work.' },
            conflict: { kind: 'active-jobs', projectId: activeId },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}/workspace?task=source`, {
      sourceRuntime: { available: true, present: vi.fn(), clear: vi.fn() },
    });

    await user.click(await screen.findByRole('button', { name: 'Remove original video' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove original video' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove original video' }));

    // The dialog is where the operator is looking, so the refusal has to land there.
    expect(await within(dialog).findByText('Original video not removed')).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Remove original video' })).toBeVisible();
    // Still retryable rather than dismissed with the source silently intact behind it.
    expect(within(dialog).getByRole('button', { name: 'Remove original video' })).toBeEnabled();
  });

  it('does not offer source removal on the overview or for an empty Project', async () => {
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(acceptedProject())),
      http.get(`*/api/projects/${activeId}/source`, () =>
        HttpResponse.json(acceptedSourceResponse()),
      ),
      http.get(`*/api/projects/${activeId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
    );
    renderProjects(`/projects/${activeId}`);

    // A source-bearing Project must not mount the Source task on the overview: doing so would
    // re-read the source bytes just to show a button.
    expect(await screen.findByText(/Original video ready/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove original video' })).not.toBeInTheDocument();
  });

  it('accepts one finalized recording while exposing bounded source activity', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'recording.mp4', {
      type: 'video/mp4',
    });
    const present = vi.fn<ProjectSourceRuntime['present']>();
    const clear = vi.fn<ProjectSourceRuntime['clear']>();
    const activities: Parameters<
      NonNullable<ProjectRouteSurfaceProps['onSourceActivityChange']>
    >[0][] = [];
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(currentProject(activeId))),
      http.post(`*/api/projects/${activeId}/source`, async ({ request }) => {
        expect(request.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/u);
        await delay(75);
        return HttpResponse.json(acceptedSourceResponse(), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}/workspace?task=source`, {
      sourceRuntime: { available: true, present, clear },
      recordingCandidate: { file, ready: true },
      onSourceActivityChange: (activity) => activities.push(activity),
    });

    await user.click(await screen.findByRole('button', { name: 'Use finalized recording' }));
    expect(await screen.findByText(/Uploading and checking your video/u)).toBeVisible();
    expect(screen.queryByText('All changes saved')).not.toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Original video ready' })).toBeVisible();
    expect(present).toHaveBeenCalledWith(activeId, expect.objectContaining({ blob: file }));
    expect(activities).toContainEqual(
      expect.objectContaining({ phase: 'preparing', busy: true, accepted: false }),
    );
    await waitFor(() =>
      expect(activities.at(-1)).toEqual(
        expect.objectContaining({ phase: 'saved', busy: false, accepted: true }),
      ),
    );
  });

  it('keeps an upload replaceable across conflict and safe failure states', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'upload.mp4', {
      type: 'video/mp4',
    });
    const present = vi.fn<ProjectSourceRuntime['present']>();
    const clear = vi.fn<ProjectSourceRuntime['clear']>();
    const operationKeys: string[] = [];
    let attempts = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(currentProject(activeId))),
      http.post(`*/api/projects/${activeId}/source`, ({ request }) => {
        operationKeys.push(request.headers.get('idempotency-key') ?? '');
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json(
              {
                error: { code: 'conflict', message: 'The Project source changed.' },
                conflict: {
                  kind: 'project-version',
                  projectId: activeId,
                  expectedVersion: 1,
                  actualVersion: 2,
                },
              },
              { status: 409 },
            )
          : HttpResponse.json(
              { error: { code: 'feature_unavailable', message: 'Source upload unavailable.' } },
              { status: 503 },
            );
      }),
      http.get(`*/api/projects/${activeId}/source`, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'No accepted source.' } },
          { status: 404 },
        ),
      ),
    );
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click');
    const view = renderProjects(`/projects/${activeId}/workspace`, {
      sourceRuntime: { available: true, present, clear },
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Upload' }));
    expect(inputClick).toHaveBeenCalledOnce();
    const input = view.container.querySelector('input[type="file"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    fireEvent.change(input!, { target: { files: [file] } });
    const conflict = await screen.findByRole('alert');
    expect(conflict).toHaveTextContent('The Project source changed.');

    fireEvent.change(input!, { target: { files: [file] } });
    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Source upload unavailable.');
    expect(screen.getByRole('heading', { name: 'No original video yet' })).toBeVisible();
    expect(operationKeys).toHaveLength(2);
    expect(operationKeys[1]).toBe(operationKeys[0]);
  });

  it('recovers and pages the Saved Video picker before reusing one exact Version', async () => {
    const selectedVideo = savedVideoSummary();
    const sourceReference = {
      kind: 'saved-video-version' as const,
      savedVideoId,
      videoVersionId,
    };
    const baseSource = acceptedSourceResponse();
    const reusedSource: ProjectSourceResponse = {
      ...baseSource,
      revision: {
        ...baseSource.revision,
        snapshot: {
          ...baseSource.revision.snapshot,
          workingMedia: sourceReference,
          presentedMedia: sourceReference,
        },
      },
      source: {
        ...baseSource.source,
        kind: 'saved-video-version',
        savedVideoId,
        videoVersionId,
        filename: 'library-source.mp4',
      },
    };
    const present = vi.fn<ProjectSourceRuntime['present']>();
    const clear = vi.fn<ProjectSourceRuntime['clear']>();
    let firstPageReads = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(currentProject(activeId))),
      http.get('*/api/videos', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor === 'saved-next') {
          return HttpResponse.json({
            videos: [],
            nextCursor: null,
            total: 1,
            facets: { characterNames: [], formats: ['landscape'] },
          });
        }
        firstPageReads += 1;
        return firstPageReads === 1
          ? HttpResponse.json(
              { error: { code: 'feature_unavailable', message: 'Saved Videos unavailable.' } },
              { status: 503 },
            )
          : HttpResponse.json({
              videos: [selectedVideo],
              nextCursor: 'saved-next',
              total: 1,
              facets: { characterNames: [], formats: ['landscape'] },
            });
      }),
      http.post(`*/api/projects/${activeId}/source/reuse`, async ({ request }) => {
        expect(await request.json()).toEqual({
          expectedVersion: 1,
          expectedRevisionNumber: 1,
          savedVideoId,
          videoVersionId,
        });
        return HttpResponse.json(reusedSource, { status: 201 });
      }),
      http.get(`*/api/projects/${activeId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}/workspace?task=source`, {
      sourceRuntime: { available: true, present, clear },
    });

    await user.click(await screen.findByRole('button', { name: 'Use Saved Video' }));
    let dialog = screen.getByRole('dialog', { name: 'Choose the original video' });
    const unavailable = await within(dialog).findByRole('alert');
    await user.click(within(unavailable).getByRole('button', { name: 'Retry' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Load more Saved Videos' }));
    await waitFor(() =>
      expect(
        within(dialog).queryByRole('button', { name: 'Load more Saved Videos' }),
      ).not.toBeInTheDocument(),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Close panel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Use Saved Video' }));
    dialog = screen.getByRole('dialog', { name: 'Choose the original video' });
    await user.click(within(dialog).getByRole('button', { name: /Library source/u }));

    await waitFor(() => expect(present).toHaveBeenCalledOnce());
    expect(present.mock.calls[0]?.[0]).toBe(activeId);
    expect(present.mock.calls[0]?.[1].blob).toBeInstanceOf(File);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      screen.getByRole('heading', { name: 'Original video ready' }).parentElement,
    ).toHaveTextContent('This Project works from a video already in your library');
  });

  it('moves a standalone Project after a recoverable Campaign assignment failure', async () => {
    const initial = currentProject(activeId);
    const moved = currentProject(activeId, { campaignId, version: 2 });
    let moves = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(initial)),
      http.get('*/api/campaigns', () =>
        HttpResponse.json({ campaigns: [campaign()], nextCursor: null }),
      ),
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(campaign())),
      http.post(`*/api/projects/${activeId}/campaign`, async ({ request }) => {
        expect(await request.json()).toEqual({ campaignId, expectedVersion: 1 });
        moves += 1;
        return moves === 1
          ? HttpResponse.json(
              { error: { code: 'feature_unavailable', message: 'Campaign move unavailable.' } },
              { status: 503 },
            )
          : HttpResponse.json(moved);
      }),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}`);

    await user.click(await screen.findByRole('button', { name: 'Move Project' }));
    const dialog = screen.getByRole('dialog', { name: 'Project Campaign' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Campaign' }));
    await user.click(screen.getByRole('option', { name: 'Summer launch' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm location' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Campaign move unavailable.',
    );

    await user.click(within(dialog).getByRole('button', { name: 'Confirm location' }));
    expect(await screen.findByText('Launch cut moved to Summer launch.')).toBeVisible();
    expect(await screen.findByText('Campaign: Summer launch')).toBeVisible();
    expect(moves).toBe(2);
  });

  it('preserves an archive command across stale detail authority and retries explicitly', async () => {
    const initial = currentProject(activeId);
    const latest = currentProject(activeId, { version: 2 });
    const archived = currentProject(activeId, {
      status: 'archived',
      version: 3,
      archivedAt: now,
    });
    let detailReads = 0;
    let archiveWrites = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => {
        detailReads += 1;
        return HttpResponse.json(detailReads === 1 ? initial : latest);
      }),
      http.post(`*/api/projects/${activeId}/archive`, async ({ request }) => {
        archiveWrites += 1;
        const body = (await request.json()) as { expectedVersion: number };
        if (archiveWrites === 1) {
          return HttpResponse.json(
            {
              error: { code: 'conflict', message: 'The Project changed. Refresh it.' },
              conflict: {
                kind: 'project-version',
                projectId: activeId,
                expectedVersion: body.expectedVersion,
                actualVersion: 2,
              },
            },
            { status: 409 },
          );
        }
        expect(body).toEqual({ expectedVersion: 2 });
        return HttpResponse.json(archived);
      }),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}`);

    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive Project' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive Project' }));
    expect(await within(dialog).findByText('The Project changed. Refresh it.')).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Reload and retry archive' }));

    expect(await screen.findByText('Launch cut archived.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restore' })).toBeVisible();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Launch cut' })).toHaveFocus());
    expect(archiveWrites).toBe(2);
  });

  it('shows a preserved session conflict and reapplies it only after explicit retry', async () => {
    const initial = currentProject(activeId);
    const latestRevisionId = secondActiveId;
    const savedRevisionId = archivedId;
    const latest: ProjectCurrentResponse = {
      project: {
        ...initial.project,
        version: 2,
        currentRevisionId: latestRevisionId,
        currentRevisionNumber: 2,
      },
      revision: {
        ...initial.revision,
        id: latestRevisionId,
        revisionNumber: 2,
        parentRevisionId: revisionId,
        parentRevisionNumber: 1,
        snapshot: { ...initial.revision.snapshot, workflowPhase: 'review' },
      },
    };
    const saved: ProjectCurrentResponse = {
      project: {
        ...latest.project,
        version: 3,
        currentRevisionId: savedRevisionId,
        currentRevisionNumber: 3,
      },
      revision: {
        ...latest.revision,
        id: savedRevisionId,
        revisionNumber: 3,
        parentRevisionId: latestRevisionId,
        parentRevisionNumber: 2,
        snapshot: { ...latest.revision.snapshot, workflowPhase: 'creative' },
      },
    };
    let detailReads = 0;
    let revisionWrites = 0;
    let sessionPort: ProjectSessionPort | null = null;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => {
        detailReads += 1;
        return HttpResponse.json(detailReads === 1 ? initial : latest);
      }),
      http.post(`*/api/projects/${activeId}/revisions`, async ({ request }) => {
        revisionWrites += 1;
        const body = (await request.json()) as {
          expectedVersion: number;
          expectedRevisionNumber: number;
          proposal: { workflowPhase: string };
        };
        expect(body.proposal.workflowPhase).toBe('creative');
        if (revisionWrites === 1) {
          return HttpResponse.json(
            {
              error: { code: 'conflict', message: 'Refresh the Project.' },
              conflict: {
                kind: 'revision',
                projectId: activeId,
                expectedRevisionNumber: body.expectedRevisionNumber,
                actualRevisionNumber: 2,
              },
            },
            { status: 409 },
          );
        }
        expect(body).toMatchObject({ expectedVersion: 2, expectedRevisionNumber: 2 });
        await delay(50);
        return HttpResponse.json(saved, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}/workspace`, {
      onSessionChange: (next) => {
        sessionPort = next;
      },
    });

    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
    await waitFor(() => expect(sessionPort).not.toBeNull());
    act(() => {
      sessionPort?.propose({ workflowPhase: 'creative' });
    });
    expect(screen.getByText(/changes are queued and save automatically/u)).toBeVisible();
    await act(async () => {
      expect(await sessionPort?.flush()).toBe(false);
    });

    const conflict = await screen.findByRole('alert');
    expect(conflict).toHaveTextContent(
      'This Project changed somewhere else. Your unsaved changes are still here.',
    );
    await user.click(within(conflict).getByRole('button', { name: 'Reapply changes' }));
    expect(
      await screen.findByText(/Saving your recent changes together as one change/u),
    ).toBeVisible();
    expect(await screen.findByText('All changes saved')).toBeVisible();
    expect(revisionWrites).toBe(2);
  });

  it('allows a preserved session save error to be discarded explicitly', async () => {
    const initial = currentProject(activeId);
    let sessionPort: ProjectSessionPort | null = null;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(initial)),
      http.post(`*/api/projects/${activeId}/revisions`, () =>
        HttpResponse.json(
          { error: { code: 'feature_unavailable', message: 'Project saving unavailable.' } },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderProjects(`/projects/${activeId}/workspace`, {
      onSessionChange: (next) => {
        sessionPort = next;
      },
    });

    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
    await waitFor(() => expect(sessionPort).not.toBeNull());
    act(() => {
      sessionPort?.propose({ workflowPhase: 'creative' });
    });
    await act(async () => {
      expect(await sessionPort?.flush()).toBe(false);
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Project saving unavailable.');
    await user.click(within(alert).getByRole('button', { name: 'Discard local changes' }));
    expect(await screen.findByText('All changes saved')).toBeVisible();
  });
});
