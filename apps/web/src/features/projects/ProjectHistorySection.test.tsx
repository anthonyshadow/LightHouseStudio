// @vitest-environment jsdom

import type {
  ProjectCurrentResponse,
  ProjectOutputHistoryItem,
  ProjectProcessingAttempt,
  ProjectWorkingMediaResponse,
} from '@studio/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { ProjectHistorySection } from './ProjectHistorySection';
import type { ProjectSessionPort } from './useProjectSession';

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const savedVideoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const versionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const operationId = '4a31b6c7-8a54-4878-b240-182652a34d31';
const now = '2026-08-14T12:00:00.000Z';

const snapshot = {
  schemaVersion: 2 as const,
  sourceAssetId,
  workingMedia: { kind: 'asset' as const, assetId: sourceAssetId },
  presentedMedia: { kind: 'asset' as const, assetId: sourceAssetId },
  selectedCharacter: null,
  selectedOutfit: null,
  selectedVoice: null,
  visualTreatment: { kind: 'none' as const },
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
  workflowPhase: 'review' as const,
  createdAt: now,
  updatedAt: now,
};

const current: ProjectCurrentResponse = {
  project: {
    id: projectId,
    campaignId: null,
    title: 'History Project',
    status: 'ready',
    version: 2,
    currentRevisionId: revisionId,
    currentRevisionNumber: 2,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: revisionId,
    projectId,
    revisionNumber: 2,
    parentRevisionId: '80eb98cb-0dd4-4aac-8507-084789045d71',
    parentRevisionNumber: 1,
    snapshot,
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
};

const output: ProjectOutputHistoryItem = {
  kind: 'saved-video-version',
  output: {
    projectId,
    savedVideoId,
    videoVersionId: versionId,
    producingRevisionId: '80eb98cb-0dd4-4aac-8507-084789045d71',
    producingRevisionNumber: 1,
    createdAt: now,
  },
  savedVideo: {
    id: savedVideoId,
    title: 'Removed master',
    libraryStatus: 'removed',
    currentVersionId: '66517242-ccf5-4fa5-bcee-5831039119c9',
  },
  version: {
    id: versionId,
    videoId: savedVideoId,
    ordinal: 1,
    origin: 'editor',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'removed-master.mp4',
    sizeBytes: 1_024,
    durationMs: 10_000,
    width: 1_280,
    height: 720,
    createdAt: now,
  },
  referenceRevision: { revisionId, revisionNumber: 2, createdAt: now },
  isCurrentForProject: false,
  contentUrl: `/api/projects/${projectId}/outputs/${versionId}/content`,
};

const staleAttempt: ProjectProcessingAttempt = {
  operationId,
  projectId,
  capability: 'character-swap',
  attemptNumber: 1,
  retryOfOperationId: null,
  initiatingRevisionId: revisionId,
  initiatingRevisionNumber: 2,
  phase: 'complete',
  isCurrent: false,
  ambiguous: false,
  cancellation: 'unsupported',
  retryPolicy: 'not-allowed',
  blocksArchive: false,
  createdAt: now,
  updatedAt: now,
  acceptedAt: now,
  completedAt: now,
  expiresAt: '2026-08-15T12:00:00.000Z',
  nextPollAfterMs: null,
  result: {
    assetId: '4159225b-60f4-4f94-a3d5-08feee91a91d',
    retainedAt: now,
    historical: true,
    media: {
      mimeType: 'video/mp4',
      container: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      durationMs: 10_000,
      width: 1_280,
      height: 720,
      sizeBytes: 1_024,
      hasAudio: true,
    },
    contentUrl: `/api/projects/${projectId}/processing/${operationId}/result/content`,
  },
  error: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProjectHistorySection', () => {
  it('separates history categories and explicitly reuses an exact retained Version', async () => {
    const accepted = vi.fn();
    const session: ProjectSessionPort = {
      projectId,
      phase: 'saved',
      current,
      proposal: null,
      hasLocalProposal: false,
      message: null,
      getCurrent: () => current,
      flush: () => Promise.resolve(true),
      acceptCurrent: accepted,
      propose: () => true,
      retry: () => Promise.resolve(true),
      discard: () => true,
    };
    const adoptedSnapshot = {
      ...snapshot,
      workingMedia: {
        kind: 'saved-video-version' as const,
        savedVideoId,
        videoVersionId: versionId,
      },
      presentedMedia: {
        kind: 'saved-video-version' as const,
        savedVideoId,
        videoVersionId: versionId,
      },
    };
    const adopted: ProjectWorkingMediaResponse = {
      project: {
        ...current.project,
        version: 3,
        currentRevisionId: '66517242-ccf5-4fa5-bcee-5831039119c9',
        currentRevisionNumber: 3,
      },
      revision: {
        ...current.revision,
        id: '66517242-ccf5-4fa5-bcee-5831039119c9',
        revisionNumber: 3,
        parentRevisionId: revisionId,
        parentRevisionNumber: 2,
        snapshot: adoptedSnapshot,
      },
      isCurrent: true,
      media: {
        kind: 'saved-video-version',
        reference: { kind: 'saved-video-version', savedVideoId, videoVersionId: versionId },
        assetId: sourceAssetId,
        savedVideoId,
        videoVersionId: versionId,
        mimeType: 'video/mp4',
        filename: 'removed-master.mp4',
        sizeBytes: 1_024,
        checksumSha256: 'a'.repeat(64),
        container: 'mp4',
        videoCodec: 'avc',
        audioCodec: 'aac',
        durationMs: 10_000,
        width: 1_280,
        height: 720,
        hasAudio: true,
        adoptedRevisionId: '66517242-ccf5-4fa5-bcee-5831039119c9',
        adoptedRevisionNumber: 3,
        adoptedAt: now,
        contentUrl: `/api/projects/${projectId}/working-media/66517242-ccf5-4fa5-bcee-5831039119c9/content`,
      },
    };
    mockApiServer.use(
      http.get(`*/api/projects/${projectId}/outputs`, () =>
        HttpResponse.json({ outputs: [output], nextCursor: null }),
      ),
      http.get(`*/api/projects/${projectId}/history`, () =>
        HttpResponse.json({
          revisions: [
            {
              kind: 'project-change',
              revisionId,
              revisionNumber: 2,
              parentRevisionId: current.revision.parentRevisionId,
              parentRevisionNumber: 1,
              source: 'user-edit',
              authorKind: 'user',
              workflowPhase: 'review',
              outputReference: null,
              createdAt: now,
            },
          ],
          nextCursor: null,
        }),
      ),
      http.get(`*/api/projects/${projectId}/processing/history`, () =>
        HttpResponse.json({ attempts: [staleAttempt], nextCursor: null }),
      ),
      http.post(`*/api/projects/${projectId}/working-media/reuse`, async ({ request }) => {
        expect(await request.json()).toMatchObject({
          media: { kind: 'saved-video-version', savedVideoId, videoVersionId: versionId },
          localEdit: null,
        });
        return HttpResponse.json(adopted, { status: 201 });
      }),
    );
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <ProjectHistorySection current={current} session={session} archived={false} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Saved video Versions' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Processing attempts and results' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Project changes' })).toBeVisible();
    expect(
      await screen.findByText(/Produced by Project revision 1; made current by revision 2/u),
    ).toBeVisible();
    expect(screen.getByText(/Removed from Saved Videos/u)).toBeVisible();
    expect(screen.getByText(/valid stale result/u)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      `/api/projects/${projectId}/outputs/${versionId}/content?download=true`,
    );

    await user.click(screen.getByRole('button', { name: 'Preview Version 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Removed master · Version 1' });
    expect(within(dialog).getByLabelText('Preview Removed master, Version 1')).toHaveAttribute(
      'src',
      `/api/projects/${projectId}/outputs/${versionId}/content`,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Use in Project' }));
    await waitFor(() =>
      expect(accepted).toHaveBeenCalledWith({
        project: adopted.project,
        revision: adopted.revision,
      }),
    );
    expect(await screen.findByText(/Saved Video current pointer were not changed/u)).toBeVisible();
  });
});
