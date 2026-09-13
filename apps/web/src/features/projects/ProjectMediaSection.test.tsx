// @vitest-environment jsdom

import type {
  ProjectCurrentResponse,
  ProjectSourceCollectionItem,
  ProjectSourceListResponse,
  ProjectSourceResponse,
  SavedVideoSummary,
} from '@studio/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { jsonScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { ProjectMediaSection } from './ProjectMediaSection';
import type { ProjectRecordingCandidate } from './ProjectSourceSection';
import type { ProjectSessionPort } from './useProjectSession';

const ids = {
  project: '18b120ac-1578-46e3-8c3d-42307772f391',
  revision: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  nextRevision: '4a31b6c7-8a54-4878-b240-182652a34d31',
  original: '79b94c02-d268-4201-a05b-1f3baa0caed1',
  extra: '0f0e2d69-bb32-4f0a-9d3c-2a4c5f9c81aa',
  video: 'c26b5280-1538-44cd-82db-a6b1356acf62',
  version: '2efcc6c3-e82c-419a-8807-c0026170fb75',
};
const now = '2026-09-13T12:00:00.000Z';

const current = (): ProjectCurrentResponse => ({
  project: {
    id: ids.project,
    campaignId: null,
    title: 'Launch cut',
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
      schemaVersion: 3,
      sourceAssetId: ids.original,
      workingMedia: { kind: 'asset', assetId: ids.original },
      presentedMedia: { kind: 'asset', assetId: ids.original },
      composition: null,
      transform: null,
      liveMode: null,
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: 'creative',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
});

const source = (
  assetId: string,
  overrides: Partial<ProjectSourceCollectionItem> = {},
): ProjectSourceCollectionItem => ({
  kind: 'uploaded',
  savedVideoId: null,
  videoVersionId: null,
  assetId,
  acceptedRevisionId: ids.revision,
  acceptedRevisionNumber: 2,
  mimeType: 'video/mp4',
  filename: `${assetId.slice(0, 4)}.mp4`,
  sizeBytes: 2_048,
  container: 'mp4',
  videoCodec: 'avc',
  audioCodec: null,
  durationMs: 12_000,
  width: 1_280,
  height: 720,
  hasAudio: false,
  acceptedAt: now,
  contentUrl: `/api/projects/${ids.project}/sources/${assetId}/content`,
  ...overrides,
});

const list = (sources: readonly ProjectSourceCollectionItem[]): ProjectSourceListResponse => {
  const authority = current();
  return { project: authority.project, revision: authority.revision, sources: [...sources] };
};

/** What the server answers once it has taken the media on: a bumped Project and revision. */
const accepted = (): ProjectSourceResponse => {
  const authority = current();
  return {
    project: {
      ...authority.project,
      version: 3,
      currentRevisionId: ids.nextRevision,
      currentRevisionNumber: 3,
    },
    revision: { ...authority.revision, id: ids.nextRevision, revisionNumber: 3 },
    source: {
      kind: 'uploaded',
      savedVideoId: null,
      videoVersionId: null,
      mimeType: 'video/mp4',
      filename: 'second.mp4',
      sizeBytes: 2_048,
      container: 'mp4',
      videoCodec: 'avc',
      audioCodec: null,
      durationMs: 12_000,
      width: 1_280,
      height: 720,
      hasAudio: false,
      acceptedAt: now,
      contentUrl: `/api/projects/${ids.project}/source/content`,
    },
  };
};

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
    variantSetId: null,
    createdAt: now,
  },
  sourceVideoId: null,
  versionCount: 2,
  thumbnailAvailable: false,
  revision: 1,
  assignment: 'unassigned',
  createdAt: now,
  updatedAt: now,
});

const createSession = (options: { readonly flush?: boolean } = {}): ProjectSessionPort => {
  const authority = current();
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

const installSources = (sources: readonly ProjectSourceCollectionItem[]) => {
  mockApiServer.use(
    http.get(`*/api/projects/${ids.project}/sources`, () => HttpResponse.json(list(sources))),
  );
};

const renderSection = (
  options: {
    readonly session?: ProjectSessionPort;
    readonly archived?: boolean;
    readonly recordingCandidate?: ProjectRecordingCandidate | null;
    readonly changeBlockedReason?: string;
    readonly onStartRecording?: () => null;
  } = {},
) => {
  const session = options.session ?? createSession();
  render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <ProjectMediaSection
          current={current()}
          session={session}
          archived={options.archived ?? false}
          recordingCandidate={options.recordingCandidate ?? null}
          {...(options.changeBlockedReason === undefined
            ? {}
            : { changeBlockedReason: options.changeBlockedReason })}
          {...(options.onStartRecording ? { onStartRecording: options.onStartRecording } : {})}
        />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );
  return { session };
};

describe('ProjectMediaSection', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists everything the Project holds, names the original, and offers Remove on nothing else', async () => {
    installSources([source(ids.original), source(ids.extra, { kind: 'recorded' })]);
    renderSection();

    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Original')).toBeVisible();
    expect(within(rows[1]!).getByText('Recorded')).toBeVisible();
    // 0:12 from `durationMs`, which is what the row has to say about every piece of media.
    expect(within(rows[0]!).getByText(/1280×720 · 0:12/u)).toBeVisible();
    expect(
      within(rows[0]!).queryByRole('button', { name: /^Remove .* from this Project$/u }),
    ).not.toBeInTheDocument();
    expect(
      within(rows[1]!).getByRole('button', { name: /^Remove .* from this Project$/u }),
    ).toBeEnabled();
  });

  it('previews one piece of media at a time from its own content route', async () => {
    installSources([source(ids.original), source(ids.extra)]);
    renderSection();
    const user = userEvent.setup();

    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[0]!).getByRole('button', { name: /^Preview /u }));
    const player = document.querySelector('video');
    expect(player?.getAttribute('src')).toBe(
      `/api/projects/${ids.project}/sources/${ids.original}/content`,
    );

    await user.click(within(rows[1]!).getByRole('button', { name: /^Preview /u }));
    expect(document.querySelectorAll('video')).toHaveLength(1);
    expect(document.querySelector('video')?.getAttribute('src')).toBe(
      `/api/projects/${ids.project}/sources/${ids.extra}/content`,
    );
  });

  it('adds a chosen Version against the session’s freshest authority and publishes what came back', async () => {
    installSources([source(ids.original)]);
    let body: unknown;
    mockApiServer.use(
      jsonScenario('GET', '/api/videos', {
        body: {
          videos: [savedVideo()],
          nextCursor: null,
          total: 1,
          facets: { characterNames: [], formats: ['landscape'] },
        },
      }),
      http.post(`*/api/projects/${ids.project}/sources/reuse`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(accepted(), { status: 201 });
      }),
    );
    const { session } = renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add from your videos' }));
    await user.click(await screen.findByRole('button', { name: /Retained master/u }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      expectedVersion: 2,
      expectedRevisionNumber: 2,
      savedVideoId: ids.video,
      videoVersionId: ids.version,
    });
    // The revision the server just appended is published back into the session, so the next
    // compare-and-set is made against it rather than against the one it replaced.
    await waitFor(() => expect(session.acceptCurrent).toHaveBeenCalled());
    const [published] = vi.mocked(session.acceptCurrent).mock.calls.at(-1)!;
    expect(published.project.version).toBe(3);
    expect(published.project.currentRevisionNumber).toBe(3);
    expect(await screen.findByText(/is now part of this Project/u)).toBeVisible();
  });

  it('puts what the Project already uses at the top of the picker, and only once', async () => {
    // PCD-5: the workspace pickers listed the whole library and ignored memberships, so the video
    // the operator had already organised into this Project was wherever "latest" happened to put
    // it. The list below still holds everything; this is an ordering, not a filter.
    installSources([source(ids.original)]);
    const attached = savedVideo();
    const other: SavedVideoSummary = {
      ...attached,
      id: '7b1f0a63-6d4c-4d2d-8f52-2c2a4b0b6d11',
      title: 'Unattached master',
    };
    mockApiServer.use(
      jsonScenario('GET', '/api/videos', {
        body: {
          videos: [other, attached],
          nextCursor: null,
          total: 2,
          facets: { characterNames: [], formats: ['landscape'] },
        },
      }),
      http.get(`*/api/projects/${ids.project}/assets`, () =>
        HttpResponse.json({
          assets: [
            {
              id: 'a1b2c3d4-1111-4222-8333-444455556666',
              projectId: ids.project,
              kind: 'video',
              resourceId: ids.video,
              createdAt: now,
            },
          ],
          videoSummaries: [attached],
          nextCursor: null,
        }),
      ),
    );
    renderSection();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add from your videos' }));

    const used = await screen.findByRole('list', { name: 'Videos used in this Project' });
    expect(within(used).getByRole('button', { name: /Retained master/u })).toBeVisible();
    const rest = screen.getByRole('list', { name: 'Videos available to add to this Project' });
    expect(within(rest).getByRole('button', { name: /Unattached master/u })).toBeVisible();
    expect(
      within(rest).queryByRole('button', { name: /Retained master/u }),
    ).not.toBeInTheDocument();
  });

  it('refuses to change media while the session holds work of its own', async () => {
    installSources([source(ids.original), source(ids.extra)]);
    const session = createSession({ flush: false });
    renderSection({ session });
    const user = userEvent.setup();

    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[1]!).getByRole('button', { name: /^Remove /u }));
    await user.click(await screen.findByRole('button', { name: 'Remove from Project' }));

    // Said in the dialog the operator is looking at and in the section behind it, the way the
    // original-video removal says its own refusal.
    expect(
      (await screen.findAllByText(/Save or discard your pending Project changes/u)).length,
    ).toBeGreaterThan(0);
  });

  it('treats an answer that went missing as the change it already made', async () => {
    const authority = list([source(ids.original), source(ids.extra)]);
    let removed = false;
    mockApiServer.use(
      http.get(`*/api/projects/${ids.project}/sources`, () =>
        HttpResponse.json(removed ? { ...authority, sources: [source(ids.original)] } : authority),
      ),
      // The removal lands and the answer does not: exactly the shape a dropped connection has.
      http.post(`*/api/projects/${ids.project}/sources/${ids.extra}/remove`, () => {
        removed = true;
        return HttpResponse.json({ error: { message: 'gone' } }, { status: 502 });
      }),
    );
    renderSection();
    const user = userEvent.setup();

    const rows = await screen.findAllByRole('listitem');
    await user.click(within(rows[1]!).getByRole('button', { name: /^Remove /u }));
    await user.click(await screen.findByRole('button', { name: 'Remove from Project' }));

    // Reported as done rather than failed, because the collection says it is done. Reporting the
    // failure would invite a retry, and a retry of an add is a second copy of the same video.
    expect(await screen.findByText(/is no longer part of this Project/u)).toBeVisible();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
  });

  it('offers a finalized take once, and names where a Record press goes', async () => {
    installSources([source(ids.original)]);
    const startRecording = vi.fn(() => null);
    const file = new File(['take'], 'take.webm', { type: 'video/webm', lastModified: 1 });
    const candidate: ProjectRecordingCandidate = {
      file,
      artifactId: 'take-artifact-1',
      ready: true,
    };
    let accepts = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${ids.project}/sources`, () => {
        accepts += 1;
        return HttpResponse.json(accepted(), { status: 201 });
      }),
    );
    renderSection({ recordingCandidate: candidate, onStartRecording: startRecording });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add this recording' }));
    await waitFor(() => expect(accepts).toBe(1));

    /*
     * Re-presenting a take leaves the recorder's lifecycle on `recorded`, so the candidate is still
     * here after it has been taken on. Offering it again would store the same recording twice, with
     * a different asset id, because a Project upload's asset is derived from its operation key.
     */
    expect(await screen.findByRole('button', { name: 'Record more' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Add this recording' })).not.toBeInTheDocument();
  });

  it('withholds every way in while the Project is archived or its media cannot change', async () => {
    installSources([source(ids.original), source(ids.extra)]);
    renderSection({ changeBlockedReason: 'Provider work is still running.' });

    expect(await screen.findByText('Provider work is still running.')).toBeVisible();
    for (const name of ['Add a video file', 'Add from your videos', 'Record more']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    const rows = await screen.findAllByRole('listitem');
    expect(within(rows[1]!).getByRole('button', { name: /^Remove /u })).toBeDisabled();
  });
});
