// @vitest-environment jsdom

import type {
  ProjectCurrentResponse,
  ProjectWorkingMediaResponse,
  SavedVideoSummary,
} from '@studio/contracts';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ProjectsApi from './projectsApi';

const api = vi.hoisted(() => ({
  getProjectWorkingMedia: vi.fn(),
  reuseProjectWorkingMedia: vi.fn(),
}));

vi.mock('./projectsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectsApi>()),
  ...api,
}));

import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { jsonScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import {
  ProjectWorkingMediaSection,
  type ProjectWorkingMediaActivity,
} from './ProjectWorkingMediaSection';
import { ProjectApiConflictError } from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';

const ids = {
  project: '18b120ac-1578-46e3-8c3d-42307772f391',
  sourceAsset: '79b94c02-d268-4201-a05b-1f3baa0caed1',
  revision: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  adoptedRevision: '4a31b6c7-8a54-4878-b240-182652a34d31',
  video: 'c26b5280-1538-44cd-82db-a6b1356acf62',
  version: '2efcc6c3-e82c-419a-8807-c0026170fb75',
};
const now = '2026-08-14T12:00:00.000Z';

const current = (sourceAssetId: string | null = ids.sourceAsset): ProjectCurrentResponse => ({
  project: {
    id: ids.project,
    campaignId: null,
    title: 'Working media Project',
    status: 'ready',
    version: 2,
    currentRevisionId: ids.revision,
    currentRevisionNumber: 2,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: ids.revision,
    projectId: ids.project,
    revisionNumber: 2,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId,
      workingMedia: sourceAssetId === null ? null : { kind: 'asset', assetId: sourceAssetId },
      presentedMedia: sourceAssetId === null ? null : { kind: 'asset', assetId: sourceAssetId },
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
      workflowPhase: sourceAssetId === null ? 'source' : 'review',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
});

const savedVideo = (): SavedVideoSummary => ({
  id: ids.video,
  title: 'Retained master',
  status: 'ready',
  currentVersion: {
    id: ids.version,
    videoId: ids.video,
    ordinal: 2,
    origin: 'editor',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'retained-master.mp4',
    sizeBytes: 1_024,
    durationMs: 10_000,
    width: 1_280,
    height: 720,
    exportSpecification: null,
    createdAt: now,
  },
  sourceVideoId: null,
  versionCount: 2,
  thumbnailAvailable: false,
  assignment: 'unassigned',
  createdAt: now,
  updatedAt: now,
});

const adoptedResponse = (
  overrides: Partial<ProjectWorkingMediaResponse> = {},
): ProjectWorkingMediaResponse => {
  const authority = current();
  return {
    project: {
      ...authority.project,
      version: 3,
      currentRevisionId: ids.adoptedRevision,
      currentRevisionNumber: 3,
    },
    revision: {
      ...authority.revision,
      id: ids.adoptedRevision,
      revisionNumber: 3,
      parentRevisionId: ids.revision,
      parentRevisionNumber: 2,
      snapshot: {
        ...authority.revision.snapshot,
        workingMedia: {
          kind: 'saved-video-version',
          savedVideoId: ids.video,
          videoVersionId: ids.version,
        },
        presentedMedia: {
          kind: 'saved-video-version',
          savedVideoId: ids.video,
          videoVersionId: ids.version,
        },
      },
    },
    isCurrent: true,
    media: {
      kind: 'saved-video-version',
      reference: {
        kind: 'saved-video-version',
        savedVideoId: ids.video,
        videoVersionId: ids.version,
      },
      assetId: ids.sourceAsset,
      savedVideoId: ids.video,
      videoVersionId: ids.version,
      mimeType: 'video/mp4',
      filename: 'retained-master.mp4',
      sizeBytes: 1_024,
      checksumSha256: 'a'.repeat(64),
      container: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      durationMs: 10_000,
      width: 1_280,
      height: 720,
      hasAudio: true,
      adoptedRevisionId: ids.adoptedRevision,
      adoptedRevisionNumber: 3,
      adoptedAt: now,
      contentUrl: `/api/projects/${ids.project}/working-media/${ids.adoptedRevision}/content`,
    },
    ...overrides,
  };
};

const createSession = (
  options: {
    readonly flush?: boolean;
    readonly current?: ProjectCurrentResponse | null;
  } = {},
): ProjectSessionPort => {
  const authority = options.current === undefined ? current() : options.current;
  return {
    projectId: ids.project,
    phase: 'saved',
    current: authority,
    proposal: null,
    hasLocalProposal: false,
    message: null,
    propose: vi.fn(() => true),
    flush: vi.fn(() => Promise.resolve(options.flush ?? true)),
    retry: vi.fn(() => Promise.resolve(true)),
    discard: vi.fn(() => true),
    getCurrent: vi.fn(() => authority),
    acceptCurrent: vi.fn(),
  };
};

const installVideoList = () => {
  const video = savedVideo();
  mockApiServer.use(
    jsonScenario('GET', '/api/videos', {
      body: {
        videos: [video],
        nextCursor: null,
        total: 1,
        facets: { characterNames: [], formats: ['landscape'] },
      },
    }),
  );
  return video;
};

const renderSection = (
  session: ProjectSessionPort,
  options: {
    readonly sourceAssetId?: string | null;
    readonly archived?: boolean;
    readonly onActivityChange?: (activity: ProjectWorkingMediaActivity) => void;
  } = {},
) =>
  render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <ProjectWorkingMediaSection
          current={current(
            options.sourceAssetId === undefined ? ids.sourceAsset : options.sourceAssetId,
          )}
          session={session}
          archived={options.archived ?? false}
          {...(options.onActivityChange ? { onActivityChange: options.onActivityChange } : {})}
        />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );

const selectSavedVideo = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Use a saved video as the current cut' }));
  const choice = await screen.findByRole('button', { name: /Retained master/u });
  await user.click(choice);
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Use a saved video' })).not.toBeInTheDocument(),
  );
};

beforeEach(() => {
  api.getProjectWorkingMedia.mockReset();
  api.reuseProjectWorkingMedia.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProjectWorkingMediaSection', () => {
  it('stays absent before a source exists and reports an idle activity lifecycle', () => {
    const onActivityChange = vi.fn();
    const view = renderSection(createSession(), { sourceAssetId: null, onActivityChange });

    expect(screen.queryByRole('heading', { name: 'Current cut' })).not.toBeInTheDocument();
    expect(onActivityChange).toHaveBeenCalledWith({ projectId: ids.project, busy: false });
    view.unmount();
    expect(onActivityChange).toHaveBeenLastCalledWith({ projectId: ids.project, busy: false });
  });

  it('disables working-media replacement for an archived Project', () => {
    renderSection(createSession(), { archived: true });

    expect(screen.getByRole('heading', { name: 'Current cut' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Use a saved video as the current cut' }),
    ).toBeDisabled();
  });

  it('adopts one exact retained Version and announces durable non-copy semantics', async () => {
    installVideoList();
    const session = createSession();
    const response = adoptedResponse();
    let resolveAdoption: (value: ProjectWorkingMediaResponse) => void = () => undefined;
    api.reuseProjectWorkingMedia.mockReturnValue(
      new Promise<ProjectWorkingMediaResponse>((resolve) => {
        resolveAdoption = resolve;
      }),
    );
    const onActivityChange = vi.fn();
    renderSection(session, { onActivityChange });

    await selectSavedVideo();

    expect(api.reuseProjectWorkingMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: ids.project,
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        media: {
          kind: 'saved-video-version',
          savedVideoId: ids.video,
          videoVersionId: ids.version,
        },
        localEdit: null,
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saving current cut');
    expect(onActivityChange).toHaveBeenCalledWith({ projectId: ids.project, busy: true });

    act(() => resolveAdoption(response));
    // `waitFor` runs outside React's act environment, so an effect is not guaranteed to have
    // flushed once an earlier signal resolves. Wait on the idle activity report, which is the last
    // link in the chain — `acceptCurrent`, then the saved commit, then the effect that reports it.
    await waitFor(() =>
      expect(onActivityChange).toHaveBeenLastCalledWith({ projectId: ids.project, busy: false }),
    );
    expect(session.acceptCurrent).toHaveBeenCalledWith({
      project: response.project,
      revision: response.revision,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Current cut ready');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your original video and every saved version are exactly as they were.',
    );
  });

  it('preserves a conflicting local proposal before making any adoption request', async () => {
    installVideoList();
    const session = createSession({ flush: false });
    renderSection(session);

    await selectSavedVideo();

    expect(api.reuseProjectWorkingMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Save or discard your pending Project changes',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Conflict');
  });

  it('reconciles response loss only when the same retained Version is already current', async () => {
    installVideoList();
    const session = createSession();
    const response = adoptedResponse();
    api.reuseProjectWorkingMedia.mockRejectedValue(new TypeError('response lost'));
    api.getProjectWorkingMedia.mockResolvedValue(response);
    renderSection(session);

    await selectSavedVideo();

    expect(api.getProjectWorkingMedia).toHaveBeenCalledWith(ids.project);
    expect(session.acceptCurrent).toHaveBeenCalledWith({
      project: response.project,
      revision: response.revision,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Current cut ready');
  });

  it('does not treat unrelated reconciliation state as proof of adoption', async () => {
    installVideoList();
    const session = createSession();
    api.reuseProjectWorkingMedia.mockRejectedValue(new TypeError('response lost'));
    api.getProjectWorkingMedia.mockResolvedValue(
      adoptedResponse({
        media: {
          ...adoptedResponse().media,
          reference: {
            kind: 'saved-video-version',
            savedVideoId: 'd36b5280-1538-44cd-82db-a6b1356acf62',
            videoVersionId: ids.version,
          },
        },
      }),
    );
    renderSection(session);

    await selectSavedVideo();

    expect(session.acceptCurrent).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Current cut not changed');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be used safely');
  });

  it('distinguishes a stale Project conflict from a retained historical revision', async () => {
    installVideoList();
    const firstSession = createSession();
    api.reuseProjectWorkingMedia.mockRejectedValueOnce(
      new ProjectApiConflictError('Project changed', {
        kind: 'project-version',
        projectId: ids.project,
        expectedVersion: 2,
        actualVersion: 3,
      }),
    );
    const first = renderSection(firstSession);

    await selectSavedVideo();
    expect(screen.getByRole('alert')).toHaveTextContent('Project changed before this version');
    first.unmount();

    installVideoList();
    const secondSession = createSession();
    api.reuseProjectWorkingMedia.mockResolvedValueOnce(adoptedResponse({ isCurrent: false }));
    renderSection(secondSession);
    await selectSavedVideo();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'kept in this Project’s history, but newer work is current',
      ),
    );
    expect(secondSession.acceptCurrent).not.toHaveBeenCalled();
  });
});
