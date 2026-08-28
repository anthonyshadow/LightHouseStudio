// @vitest-environment jsdom

import type {
  ProjectCurrentResponse,
  ProjectOutputHistoryItem,
  ProjectProcessingAttempt,
  ProjectWorkingMediaResponse,
} from '@studio/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { jsonScenario } from '../../test/msw/handlers';
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
    exportSpecification: null,
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

const adoptedWorkingMedia = (isCurrent = true): ProjectWorkingMediaResponse => {
  const adoptedRevisionId = '66517242-ccf5-4fa5-bcee-5831039119c9';
  const mediaReference = {
    kind: 'saved-video-version' as const,
    savedVideoId,
    videoVersionId: versionId,
  };
  return {
    project: {
      ...current.project,
      version: 3,
      currentRevisionId: adoptedRevisionId,
      currentRevisionNumber: 3,
    },
    revision: {
      ...current.revision,
      id: adoptedRevisionId,
      revisionNumber: 3,
      parentRevisionId: revisionId,
      parentRevisionNumber: 2,
      snapshot: {
        ...snapshot,
        workingMedia: isCurrent ? mediaReference : { kind: 'asset', assetId: sourceAssetId },
        presentedMedia: isCurrent ? mediaReference : { kind: 'asset', assetId: sourceAssetId },
      },
    },
    isCurrent,
    media: {
      kind: 'saved-video-version',
      reference: mediaReference,
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
      adoptedRevisionId,
      adoptedRevisionNumber: 3,
      adoptedAt: now,
      contentUrl: `/api/projects/${projectId}/working-media/${adoptedRevisionId}/content`,
    },
  };
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
    const adopted = adoptedWorkingMedia();
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
    expect(await screen.findByText(/Saved at change 1; made current at change 2/u)).toBeVisible();
    expect(screen.getByText(/Removed from your videos/u)).toBeVisible();
    expect(screen.getByText(/Kept in this Project as an older result/u)).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Download Removed master, Version 1' }),
    ).toHaveAttribute(
      'href',
      `/api/projects/${projectId}/outputs/${versionId}/content?download=true`,
    );

    await user.click(screen.getByRole('button', { name: 'Preview Version 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Removed master · Version 1' });
    expect(within(dialog).getByLabelText('Preview of Removed master, Version 1')).toHaveAttribute(
      'src',
      `/api/projects/${projectId}/outputs/${versionId}/content`,
    );
    expect(
      within(dialog).getByRole('link', { name: 'Download Removed master, Version 1' }),
    ).toHaveAttribute(
      'href',
      `/api/projects/${projectId}/outputs/${versionId}/content?download=true`,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Close panel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Preview Version 1' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'Preview Version 1' }));
    const reopenedDialog = screen.getByRole('dialog', { name: 'Removed master · Version 1' });
    await user.click(within(reopenedDialog).getByRole('button', { name: 'Use in Project' }));
    await waitFor(() =>
      expect(accepted).toHaveBeenCalledWith({
        project: adopted.project,
        revision: adopted.revision,
      }),
    );
    expect(await screen.findByText(/the video.s current version were not changed/u)).toBeVisible();
  });

  it('retries each independent history feed and reaches its empty state', async () => {
    const unavailable = {
      status: 503,
      body: { error: { code: 'temporarily_unavailable', message: 'Try again.' } },
    } as const;
    mockApiServer.use(
      jsonScenario('GET', `/api/projects/${projectId}/outputs`, [
        unavailable,
        { body: { outputs: [], nextCursor: null } },
      ]),
      jsonScenario('GET', `/api/projects/${projectId}/processing/history`, [
        unavailable,
        { body: { attempts: [], nextCursor: null } },
      ]),
      jsonScenario('GET', `/api/projects/${projectId}/history`, [
        unavailable,
        { body: { revisions: [], nextCursor: null } },
      ]),
    );
    const session: ProjectSessionPort = {
      projectId,
      phase: 'saved',
      current,
      proposal: null,
      hasLocalProposal: false,
      message: null,
      getCurrent: () => current,
      flush: () => Promise.resolve(true),
      acceptCurrent: vi.fn(),
      propose: () => true,
      retry: () => Promise.resolve(true),
      discard: () => true,
    };
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <ProjectHistorySection current={current} session={session} archived={false} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );

    const retryButtons = await screen.findAllByRole('button', { name: 'Retry' });
    expect(retryButtons).toHaveLength(3);
    for (const button of retryButtons) fireEvent.click(button);

    expect(await screen.findByText('This Project has not saved any versions yet.')).toBeVisible();
    expect(screen.getByText('No processing attempts have been recorded.')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Project change history' })).toBeEmptyDOMElement();
  });

  it('pages each history feed without eagerly fetching retained media', async () => {
    mockApiServer.use(
      jsonScenario('GET', `/api/projects/${projectId}/outputs`, [
        { body: { outputs: [], nextCursor: 'outputs-page-2' } },
        { body: { outputs: [], nextCursor: null } },
      ]),
      jsonScenario('GET', `/api/projects/${projectId}/processing/history`, [
        { body: { attempts: [], nextCursor: 'processing-page-2' } },
        { body: { attempts: [], nextCursor: null } },
      ]),
      jsonScenario('GET', `/api/projects/${projectId}/history`, [
        { body: { revisions: [], nextCursor: 'revisions-page-2' } },
        { body: { revisions: [], nextCursor: null } },
      ]),
    );
    const session: ProjectSessionPort = {
      projectId,
      phase: 'saved',
      current,
      proposal: null,
      hasLocalProposal: false,
      message: null,
      getCurrent: () => current,
      flush: () => Promise.resolve(true),
      acceptCurrent: vi.fn(),
      propose: () => true,
      retry: () => Promise.resolve(true),
      discard: () => true,
    };
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <ProjectHistorySection current={current} session={session} archived={false} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );

    const versions = await screen.findByRole('button', { name: 'Load more Versions' });
    const attempts = screen.getByRole('button', { name: 'Load more processing attempts' });
    const changes = screen.getByRole('button', { name: 'Load more Project changes' });
    fireEvent.click(versions);
    fireEvent.click(attempts);
    fireEvent.click(changes);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more Versions' })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Load more processing attempts' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Load more Project changes' }),
      ).not.toBeInTheDocument();
    });
    expect(document.querySelector('video')).toBeNull();
  });

  it('preserves a pending Project proposal instead of adopting historical media', async () => {
    let reuseRequests = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${projectId}/outputs`, () =>
        HttpResponse.json({ outputs: [output], nextCursor: null }),
      ),
      http.get(`*/api/projects/${projectId}/history`, () =>
        HttpResponse.json({ revisions: [], nextCursor: null }),
      ),
      http.get(`*/api/projects/${projectId}/processing/history`, () =>
        HttpResponse.json({ attempts: [], nextCursor: null }),
      ),
      http.post(`*/api/projects/${projectId}/working-media/reuse`, () => {
        reuseRequests += 1;
        return HttpResponse.json({}, { status: 500 });
      }),
    );
    const flush = vi.fn().mockResolvedValue(false);
    const session: ProjectSessionPort = {
      projectId,
      phase: 'conflict',
      current,
      proposal: {
        workflowPhase: snapshot.workflowPhase,
        liveMode: snapshot.liveMode,
        selectedCharacter: snapshot.selectedCharacter,
        selectedOutfit: snapshot.selectedOutfit,
        selectedVoice: snapshot.selectedVoice,
        visualTreatment: snapshot.visualTreatment,
        creativeIntent: snapshot.creativeIntent,
        localEdit: snapshot.localEdit,
        exportSpecification: snapshot.exportSpecification,
      },
      hasLocalProposal: true,
      message: null,
      getCurrent: () => current,
      flush,
      acceptCurrent: vi.fn(),
      propose: () => true,
      retry: () => Promise.resolve(true),
      discard: () => true,
    };
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <ProjectHistorySection current={current} session={session} archived={false} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Use in Project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Save or discard your pending Project changes before changing the current cut.',
    );
    expect(flush).toHaveBeenCalledOnce();
    expect(reuseRequests).toBe(0);
  });

  it('reports a retained processing result that cannot be validated for reuse', async () => {
    mockApiServer.use(
      http.get(`*/api/projects/${projectId}/outputs`, () =>
        HttpResponse.json({ outputs: [], nextCursor: null }),
      ),
      http.get(`*/api/projects/${projectId}/history`, () =>
        HttpResponse.json({ revisions: [], nextCursor: null }),
      ),
      http.get(`*/api/projects/${projectId}/processing/history`, () =>
        HttpResponse.json({ attempts: [staleAttempt], nextCursor: null }),
      ),
      http.post(`*/api/projects/${projectId}/working-media/reuse`, () =>
        HttpResponse.json(
          { error: { code: 'temporarily_unavailable', message: 'Do not expose this.' } },
          { status: 503 },
        ),
      ),
    );
    const session: ProjectSessionPort = {
      projectId,
      phase: 'saved',
      current,
      proposal: null,
      hasLocalProposal: false,
      message: null,
      getCurrent: () => current,
      flush: () => Promise.resolve(true),
      acceptCurrent: vi.fn(),
      propose: () => true,
      retry: () => Promise.resolve(true),
      discard: () => true,
    };
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <ProjectHistorySection current={current} session={session} archived={false} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Use in Project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This older result could not be used in the Project.',
    );
  });

  it('rejects an adoption receipt when the Project advanced before it became current', async () => {
    const accepted = vi.fn();
    mockApiServer.use(
      http.get(`*/api/projects/${projectId}/outputs`, () =>
        HttpResponse.json({ outputs: [output], nextCursor: null }),
      ),
      http.get(`*/api/projects/${projectId}/history`, () =>
        HttpResponse.json({ revisions: [], nextCursor: null }),
      ),
      http.get(`*/api/projects/${projectId}/processing/history`, () =>
        HttpResponse.json({ attempts: [], nextCursor: null }),
      ),
      http.post(`*/api/projects/${projectId}/working-media/reuse`, () =>
        HttpResponse.json(adoptedWorkingMedia(false), { status: 201 }),
      ),
    );
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
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <ProjectHistorySection current={current} session={session} archived={false} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Use in Project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Project changed before this older result could be used.',
    );
    expect(accepted).not.toHaveBeenCalled();
  });

  it('does not adopt history when Project authority disappears after a successful flush', async () => {
    let reuseRequests = 0;
    const flush = vi.fn().mockResolvedValue(true);
    mockApiServer.use(
      http.get(`*/api/projects/${projectId}/outputs`, () =>
        HttpResponse.json({ outputs: [output], nextCursor: null }),
      ),
      http.get(`*/api/projects/${projectId}/history`, () =>
        HttpResponse.json({ revisions: [], nextCursor: null }),
      ),
      http.get(`*/api/projects/${projectId}/processing/history`, () =>
        HttpResponse.json({ attempts: [], nextCursor: null }),
      ),
      http.post(`*/api/projects/${projectId}/working-media/reuse`, () => {
        reuseRequests += 1;
        return HttpResponse.error();
      }),
    );
    const session: ProjectSessionPort = {
      projectId,
      phase: 'saved',
      current,
      proposal: null,
      hasLocalProposal: false,
      message: null,
      getCurrent: () => null,
      flush,
      acceptCurrent: vi.fn(),
      propose: () => true,
      retry: () => Promise.resolve(true),
      discard: () => true,
    };
    render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <ProjectHistorySection current={current} session={session} archived={false} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Use in Project' }));

    await waitFor(() => expect(flush).toHaveBeenCalledOnce());
    expect(reuseRequests).toBe(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
