// @vitest-environment jsdom

import type {
  ProjectCurrentResponse,
  ProjectSourceCollectionItem,
  ProjectSourceListResponse,
  ProjectSourceResponse,
  SavedVideoSummary,
} from '@studio/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { useRef } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { AddVideoToProjectDialog } from './AddVideoToProjectDialog';

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const videoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const versionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const now = '2026-08-11T16:00:00.000Z';

const emptyProject: ProjectCurrentResponse = {
  project: {
    id: projectId,
    campaignId: null,
    title: 'Launch cut',
    status: 'draft',
    version: 1,
    currentRevisionId: revisionId,
    currentRevisionNumber: 1,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: revisionId,
    projectId,
    revisionNumber: 1,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot: {
      schemaVersion: 3,
      sourceAssetId: null,
      workingMedia: null,
      presentedMedia: null,
      composition: null,
      transform: null,
      liveMode: null,
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
};

const video: SavedVideoSummary = {
  id: videoId,
  title: 'Launch master',
  status: 'ready',
  currentVersion: {
    id: versionId,
    videoId,
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
    exportSpecification: null,
    variantSetId: null,
    createdAt: now,
  },
  sourceVideoId: null,
  versionCount: 1,
  thumbnailAvailable: false,
  revision: 1,
  assignment: 'project-output',
  createdAt: now,
  updatedAt: now,
};

const accepted: ProjectSourceResponse = {
  project: {
    ...emptyProject.project,
    status: 'ready',
    version: 2,
    currentRevisionNumber: 2,
  },
  revision: {
    ...emptyProject.revision,
    revisionNumber: 2,
    snapshot: {
      ...emptyProject.revision.snapshot,
      sourceAssetId: assetId,
      workingMedia: {
        kind: 'saved-video-version',
        savedVideoId: videoId,
        videoVersionId: versionId,
      },
      presentedMedia: {
        kind: 'saved-video-version',
        savedVideoId: videoId,
        videoVersionId: versionId,
      },
      workflowPhase: 'creative',
    },
  },
  source: {
    kind: 'saved-video-version',
    savedVideoId: videoId,
    videoVersionId: versionId,
    mimeType: 'video/mp4',
    filename: 'launch-master.mp4',
    sizeBytes: 1_024,
    container: 'mp4',
    videoCodec: 'avc',
    audioCodec: null,
    durationMs: 10_000,
    width: 1_280,
    height: 720,
    hasAudio: false,
    acceptedAt: now,
    contentUrl: `/api/projects/${projectId}/source/content`,
  },
};

/** What `GET /sources` answers for a Project holding `sources`, as the contract requires. */
const sourceList = (
  current: ProjectCurrentResponse,
  sources: readonly ProjectSourceCollectionItem[] = [],
): ProjectSourceListResponse => ({
  project: current.project,
  revision: current.revision,
  sources: [...sources],
});

/** A Project whose original is already in place, which is what the old refusal turned away. */
const occupiedProject: ProjectCurrentResponse = {
  project: accepted.project,
  revision: accepted.revision,
};

const heldSource = (
  held: string,
  lineage: Pick<ProjectSourceCollectionItem, 'kind' | 'savedVideoId' | 'videoVersionId'>,
): ProjectSourceCollectionItem => ({
  ...lineage,
  assetId: held,
  acceptedRevisionId: revisionId,
  acceptedRevisionNumber: 2,
  mimeType: 'video/mp4',
  filename: 'launch-master.mp4',
  sizeBytes: 1_024,
  container: 'mp4',
  videoCodec: 'avc',
  audioCodec: null,
  durationMs: 10_000,
  width: 1_280,
  height: 720,
  hasAudio: false,
  acceptedAt: now,
  contentUrl: `/api/projects/${projectId}/sources/${held}/content`,
});

/** The Project's original, which is a different video from the one the dialog is offering. */
const originalSource = heldSource(assetId, {
  kind: 'uploaded',
  savedVideoId: null,
  videoVersionId: null,
});

const borrowedSource = heldSource('0f0e2d69-bb32-4f0a-9d3c-2a4c5f9c81aa', {
  kind: 'saved-video-version',
  savedVideoId: videoId,
  videoVersionId: versionId,
});

const DialogHarness = () => {
  const returnFocusRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={returnFocusRef} type="button">
        Return
      </button>
      <AddVideoToProjectDialog video={video} returnFocusRef={returnFocusRef} onClose={vi.fn()} />
    </>
  );
};

describe('AddVideoToProjectDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderDialog = (held: ProjectSourceListResponse) => {
    const calls: { body?: unknown } = {};
    mockApiServer.use(
      http.get('*/api/projects', () =>
        HttpResponse.json({
          projects: [held.project],
          nextCursor: null,
          total: { count: 1, exceedsCeiling: false },
        }),
      ),
      http.get(`*/api/projects/${projectId}/sources`, () => HttpResponse.json(held)),
      http.post(`*/api/projects/${projectId}/sources/reuse`, async ({ request }) => {
        calls.body = await request.json();
        return HttpResponse.json(accepted, { status: 201 });
      }),
    );
    const router = createMemoryRouter(
      [
        { path: '/assets/videos', element: <DialogHarness /> },
        { path: '/projects/:projectId/workspace', element: <div>Project workspace</div> },
      ],
      { initialEntries: ['/assets/videos'] },
    );
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <RouterProvider router={router} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );
    return { router, calls };
  };

  it('references the current Version in an empty Project and opens its workspace', async () => {
    const { router, calls } = renderDialog(sourceList(emptyProject));
    const user = userEvent.setup();

    expect(await screen.findByText(/This is not an attachment/u)).toBeVisible();
    expect(screen.getByText(/The Asset stays reusable everywhere/u)).toBeVisible();
    await user.click(await screen.findByRole('button', { name: /Launch cut/u }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/projects/${projectId}/workspace`),
    );
    expect(calls.body).toEqual({
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      savedVideoId: videoId,
      videoVersionId: versionId,
    });
    expect(screen.getByText('Project workspace')).toBeVisible();
  });

  it('adds to a Project that already has an original instead of refusing it', async () => {
    // The refusal this replaces told the operator to "choose an empty Project instead", which was
    // the browser speaking for a server rule that no longer exists.
    const { router, calls } = renderDialog(sourceList(occupiedProject, [originalSource]));
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Launch cut/u }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/projects/${projectId}/workspace`),
    );
    expect(calls.body).toEqual({
      expectedVersion: 2,
      expectedRevisionNumber: 2,
      savedVideoId: videoId,
      videoVersionId: versionId,
    });
  });

  it('finishes without a second acceptance when the Project already holds that exact Version', async () => {
    const { router, calls } = renderDialog(
      sourceList(occupiedProject, [originalSource, borrowedSource]),
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /Launch cut/u }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/projects/${projectId}/workspace`),
    );
    expect(calls.body).toBeUndefined();
  });
});
