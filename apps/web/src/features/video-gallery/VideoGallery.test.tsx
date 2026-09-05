// @vitest-environment jsdom

import type { SavedVideoSummary } from '@studio/contracts';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SavedVideosApiModule from '../../adapters/api-client/savedVideosApi';

const api = vi.hoisted(() => ({
  deleteSavedVideo: vi.fn(),
  renameSavedVideo: vi.fn(),
  createSavedVideoThumbnail: vi.fn(),
  createSavedVideoThumbnailFromImage: vi.fn(),
}));

// jsdom has no WebGL or WebCodecs, so the re-framing capability is stated explicitly rather than
// inferred. The gallery itself touches neither module except through the placement render.
const editor = vi.hoisted(() => ({
  renderCapable: vi.fn(() => true),
  renderVideoEdit: vi.fn<() => Promise<{ blob: Blob; mimeType: 'video/mp4' }>>(),
}));

vi.mock('../video-editor/videoEditSupport', () => ({
  videoEditPreviewSupported: () => editor.renderCapable(),
  videoEditRenderingApisPresent: () => true,
  videoEditExportSupported: () => Promise.resolve(editor.renderCapable()),
  videoEditSupported: () => Promise.resolve(editor.renderCapable()),
}));
vi.mock('../video-editor/renderVideoEdit', () => ({
  renderVideoEdit: () => editor.renderVideoEdit(),
}));

vi.mock('../../adapters/api-client/savedVideosApi', async (importOriginal) => ({
  ...(await importOriginal<typeof SavedVideosApiModule>()),
  deleteSavedVideo: api.deleteSavedVideo,
  renameSavedVideo: api.renameSavedVideo,
}));
vi.mock('../saved-videos/thumbnailClient', () => ({
  createSavedVideoThumbnail: api.createSavedVideoThumbnail,
  createSavedVideoThumbnailFromImage: api.createSavedVideoThumbnailFromImage,
}));

import { StudioDesignProvider } from '../../ui';
import { ApiClientError } from '../../adapters/api-client/transport';
import { createRemoteStateQueryClient } from '../../application/remote-state/RemoteStateProvider';
import { HttpResponse, http } from 'msw';
import { captureRequests, galleryPaginationScenario, jsonScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';
import { VideoGallery } from './VideoGallery';

const video = (override: Partial<SavedVideoSummary> = {}): SavedVideoSummary => ({
  id: 'c26b5280-1538-44cd-82db-a6b1356acf62',
  title: 'Morning take',
  status: 'ready',
  currentVersion: {
    id: '2efcc6c3-e82c-419a-8807-c0026170fb75',
    videoId: 'c26b5280-1538-44cd-82db-a6b1356acf62',
    ordinal: 1,
    origin: 'recorded',
    characterName: 'Mara',
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'morning-take.mp4',
    sizeBytes: 1_024,
    durationMs: 12_000,
    width: 1_280,
    height: 720,
    exportSpecification: null,
    variantSetId: null,
    createdAt: '2026-08-05T12:00:00.000Z',
  },
  sourceVideoId: null,
  versionCount: 1,
  thumbnailAvailable: true,
  revision: 1,
  assignment: 'project-output',
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
  ...override,
});

const detail = (summary: SavedVideoSummary, versions = [summary.currentVersion]) => ({
  ...summary,
  versions,
});

const placement = (aspect: '1:1' | '9:16', width: number, height: number) => ({
  container: 'video/mp4' as const,
  aspect,
  resolution: { width, height },
  includeAudio: true,
});

/**
 * A video holding both kinds of Version: a Studio recording that belongs to no set, and the two
 * placements one Project save wrote together at consecutive ordinals.
 */
const savedTogetherVideo = () => {
  const variantSetId = '5b2d9e14-6c3a-4f81-9b27-3d5e7a0c1f92';
  const studio = video().currentVersion;
  const square = {
    ...studio,
    id: '3edb9c78-efb2-43a4-8074-acba56158245',
    ordinal: 2,
    origin: 'editor' as const,
    filename: 'morning-square.mp4',
    width: 1_080,
    height: 1_080,
    exportSpecification: placement('1:1', 1_080, 1_080),
    variantSetId,
    createdAt: '2026-08-06T12:00:00.000Z',
  };
  const phone = {
    ...square,
    id: '7c1f2b64-3f9a-4b2e-9d51-0a8c6e2f4b10',
    ordinal: 3,
    filename: 'morning-phone.mp4',
    width: 1_080,
    height: 1_920,
    exportSpecification: placement('9:16', 1_080, 1_920),
  };
  return {
    summary: video({ versionCount: 3, currentVersion: phone }),
    versions: [studio, square, phone],
    square,
  };
};

const page = (videos: readonly SavedVideoSummary[]) => ({
  videos,
  nextCursor: null,
  total: videos.length,
  facets: { characterNames: ['Mara', 'Nova'], formats: ['landscape', 'portrait'] as const },
});

const queryClients: QueryClient[] = [];

const mockGalleryPages = (pages: Readonly<Record<string, unknown>>): Request[] => {
  const { requests, observe } = captureRequests();
  mockApiServer.use(galleryPaginationScenario(pages, observe));
  return requests;
};

const renderGallery = (
  onUse = vi.fn().mockResolvedValue(undefined),
  focus?: Readonly<{ focusVideoId: string | null; onFocusVideoConsumed: () => void }>,
  removalDeletesStoredMedia?: boolean,
) => {
  const queryClient = createRemoteStateQueryClient();
  queryClients.push(queryClient);
  const tree = (
    <QueryClientProvider client={queryClient}>
      <StudioDesignProvider>
        <VideoGallery
          onUse={onUse}
          {...(focus ?? {})}
          {...(removalDeletesStoredMedia === undefined ? {} : { removalDeletesStoredMedia })}
        />
      </StudioDesignProvider>
    </QueryClientProvider>
  );
  // A focused id always arrives on a fresh mount — the Dashboard opens this overlay for the first
  // time — so those cases have to survive the effect replay React performs in development.
  render(focus ? <StrictMode>{tree}</StrictMode> : tree);
  return onUse;
};

describe('VideoGallery', () => {
  beforeEach(() => {
    api.deleteSavedVideo.mockReset().mockResolvedValue(undefined);
    api.renameSavedVideo.mockReset();
    api.createSavedVideoThumbnail
      .mockReset()
      .mockResolvedValue(new Blob(['poster'], { type: 'image/webp' }));
    api.createSavedVideoThumbnailFromImage
      .mockReset()
      .mockResolvedValue(new Blob(['poster'], { type: 'image/webp' }));
    editor.renderCapable.mockReturnValue(true);
    editor.renderVideoEdit.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    for (const queryClient of queryClients.splice(0)) queryClient.clear();
    vi.restoreAllMocks();
  });

  it('loads metadata and lazy thumbnails without mounting or requesting a video player', async () => {
    const item = video();
    mockGalleryPages({ '': page([item]) });
    const onUse = renderGallery();

    expect(await screen.findByRole('heading', { name: 'Morning take' })).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Preview Morning take' }).querySelector('img'),
    ).toHaveAttribute('src', `/api/videos/${item.id}/versions/${item.currentVersion.id}/thumbnail`);
    expect(screen.getByText('0:12')).toBeInTheDocument();
    expect(screen.getAllByText('Landscape').length).toBeGreaterThan(0);
    expect(screen.getByText('Studio recording')).toBeInTheDocument();
    expect(screen.queryByText('recorded')).not.toBeInTheDocument();
    expect(screen.getByText('Mara')).toBeInTheDocument();
    // Retrieval leads the card; everything else lives behind the overflow.
    expect(screen.getByRole('link', { name: 'Download Morning take' })).toHaveAttribute(
      'href',
      `/api/videos/${item.id}/versions/${item.currentVersion.id}/content?download=true`,
    );
    fireEvent.click(screen.getByLabelText('More actions for Morning take'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in Studio' }));
    await waitFor(() => expect(onUse).toHaveBeenCalledWith(item, 'play'));
  });

  it('reserves the gallery layout with poster skeletons while account data loads', () => {
    mockApiServer.use(http.get('*/api/videos', () => new Promise<never>(() => {})));
    renderGallery();

    expect(screen.getByRole('status')).toHaveTextContent('Loading saved videos');
    expect(document.querySelectorAll('[data-skeleton-poster]')).toHaveLength(6);
  });

  it('opens a centered authenticated preview on thumbnail activation and restores focus on close', async () => {
    const item = video();
    mockGalleryPages({ '': page([item]) });
    mockApiServer.use(jsonScenario('GET', `/api/videos/${item.id}`, { body: detail(item) }));
    renderGallery();

    const previewTrigger = await screen.findByRole('button', { name: 'Preview Morning take' });
    fireEvent.click(previewTrigger);

    const dialog = await screen.findByRole('dialog', { name: 'Morning take' });
    expect(within(dialog).getByLabelText('Preview of Morning take, Version 1')).toHaveAttribute(
      'src',
      `/api/videos/${item.id}/versions/${item.currentVersion.id}/content`,
    );
    expect(within(dialog).getByText('1280×720')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByLabelText('Preview of Morning take, Version 1')).toBeNull(),
    );
    await waitFor(() => expect(previewTrigger).toHaveFocus());
  });

  it('recovers Version history and preview media errors while exposing both current-Version actions', async () => {
    const item = video();
    mockGalleryPages({ '': page([item]) });
    mockApiServer.use(
      jsonScenario('GET', `/api/videos/${item.id}`, [
        {
          status: 503,
          body: { error: { code: 'temporarily_unavailable', message: 'Try again.' } },
        },
        { body: detail(item) },
      ]),
    );
    const onUse = renderGallery();

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Morning take' }));
    const dialog = await screen.findByRole('dialog', { name: 'Morning take' });
    expect(await within(dialog).findByText(/Version history could not be loaded/u)).toBeVisible();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));

    const player = await within(dialog).findByLabelText('Preview of Morning take, Version 1');
    fireEvent.error(player);
    expect(
      within(dialog).getByText(/This saved video could not be previewed/u),
    ).toBeInTheDocument();
    fireEvent.loadedData(player);
    expect(
      within(dialog).queryByText(/This saved video could not be previewed/u),
    ).not.toBeInTheDocument();

    const overflow = within(dialog).getByLabelText('More actions for Morning take');
    fireEvent.click(overflow);
    fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Edit video' }));
    await waitFor(() => expect(onUse).toHaveBeenCalledWith(item, 'edit'));
    fireEvent.click(overflow);
    expect(within(dialog).getByRole('menuitem', { name: 'Export' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(within(dialog).getByRole('menuitem', { name: 'Open in Studio' }));
    await waitFor(() => expect(onUse).toHaveBeenCalledWith(item, 'play'));
  });

  it('exports a saved Version by re-framing it for a chosen placement', async () => {
    const item = video();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    mockGalleryPages({ '': page([item]) });
    mockApiServer.use(
      jsonScenario('GET', `/api/videos/${item.id}`, [{ body: detail(item) }]),
      http.get(
        `*/api/videos/${item.id}/versions/${item.currentVersion.id}/content`,
        () =>
          new HttpResponse(bytes, {
            headers: {
              'content-type': 'video/mp4',
              'content-length': String(bytes.byteLength),
            },
          }),
      ),
    );
    const reframed = new Blob(['reframed'], { type: 'video/mp4' });
    editor.renderVideoEdit.mockResolvedValue({ blob: reframed, mimeType: 'video/mp4' });
    // Only the two object-URL statics are swapped, so `new URL(...)` keeps working for the client.
    const urlStatics = URL as unknown as Record<string, unknown>;
    const restoreUrl = {
      createObjectURL: urlStatics.createObjectURL,
      revokeObjectURL: urlStatics.revokeObjectURL,
    };
    const createObjectURL = vi.fn(() => 'blob:placement');
    urlStatics.createObjectURL = createObjectURL;
    urlStatics.revokeObjectURL = vi.fn();
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderGallery();

    try {
      fireEvent.click(await screen.findByRole('button', { name: 'Preview Morning take' }));
      const preview = await screen.findByRole('dialog', { name: 'Morning take' });
      fireEvent.click(within(preview).getByLabelText('More actions for Morning take'));
      fireEvent.click(within(preview).getByRole('menuitem', { name: 'Export' }));

      const exportPanel = await screen.findByRole('dialog', { name: 'Export video' });
      // Until a placement is chosen the unchanged server-served download is what is offered.
      expect(
        within(exportPanel).getByRole('link', { name: 'Download Morning take, Version 1' }),
      ).toBeVisible();

      fireEvent.click(within(exportPanel).getByRole('button', { name: 'Phone, full screen' }));
      const download = await within(exportPanel).findByRole('button', {
        name: 'Download Morning take, Version 1, for Phone, full screen',
      });
      fireEvent.click(download);

      await waitFor(() => expect(editor.renderVideoEdit).toHaveBeenCalledOnce());
      await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(reframed));
      expect(anchorClick).toHaveBeenCalledOnce();
    } finally {
      Object.assign(urlStatics, restoreUrl);
      anchorClick.mockRestore();
    }
  });

  it('opens the export panel on the placement the Version was produced for', async () => {
    const item = video({
      currentVersion: {
        ...video().currentVersion,
        width: 1_080,
        height: 1_920,
        exportSpecification: {
          container: 'video/mp4',
          aspect: '9:16',
          resolution: { width: 1_080, height: 1_920 },
          includeAudio: true,
        },
        variantSetId: null,
      },
    });
    mockGalleryPages({ '': page([item]) });
    mockApiServer.use(jsonScenario('GET', `/api/videos/${item.id}`, [{ body: detail(item) }]));
    renderGallery();

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Morning take' }));
    const preview = await screen.findByRole('dialog', { name: 'Morning take' });
    fireEvent.click(within(preview).getByLabelText('More actions for Morning take'));
    fireEvent.click(within(preview).getByRole('menuitem', { name: 'Export' }));

    const exportPanel = await screen.findByRole('dialog', { name: 'Export video' });
    expect(within(exportPanel).getByRole('button', { name: 'Phone, full screen' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // These bytes already are that placement, so the offer stays the stored file rather than a
    // re-encode of it into the shape it is already in.
    expect(
      within(exportPanel).getByRole('link', { name: 'Download Morning take, Version 1' }),
    ).toHaveAttribute(
      'href',
      `/api/videos/${item.id}/versions/${item.currentVersion.id}/content?download=true`,
    );
    expect(within(exportPanel).getByText(/nothing is trimmed/u)).toBeVisible();

    // A different destination is the only thing that makes re-framing work worth doing.
    fireEvent.click(within(exportPanel).getByRole('button', { name: 'Square post' }));
    expect(
      await within(exportPanel).findByRole('button', {
        name: 'Download Morning take, Version 1, for Square post',
      }),
    ).toBeVisible();
  });

  it('groups the Versions one save wrote together and names every placement', async () => {
    const set = savedTogetherVideo();
    mockGalleryPages({ '': page([set.summary]) });
    mockApiServer.use(
      jsonScenario('GET', `/api/videos/${set.summary.id}`, {
        body: detail(set.summary, set.versions),
      }),
    );
    renderGallery();

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Morning take' }));
    const dialog = await screen.findByRole('dialog', { name: 'Morning take' });
    const group = await within(dialog).findByRole('group', { name: 'Saved together' });
    expect(within(group).getByRole('button', { name: 'Version 2 · Square post' })).toBeVisible();
    expect(
      within(group).getByRole('button', { name: 'Version 3 · Phone, full screen · Current' }),
    ).toBeVisible();
    // The Studio recording was not part of that save, so it stays outside the group entirely.
    expect(within(group).queryByRole('button', { name: 'Version 1 · Keep as it is' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Version 1 · Keep as it is' })).toBeVisible();

    fireEvent.click(within(group).getByRole('button', { name: 'Version 2 · Square post' }));
    expect(within(dialog).getByText('Saved together with the current Version')).toBeVisible();
    expect(within(dialog).queryByText('Older Version')).toBeNull();
    expect(within(dialog).getByText(/another placement of the same save/u)).toBeVisible();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Version 1 · Keep as it is' }));
    expect(within(dialog).getByText('Older Version')).toBeVisible();
    expect(within(dialog).queryByText('Saved together with the current Version')).toBeNull();

    // The gating that decides what may be taken back into the Studio is unchanged: current only.
    fireEvent.click(within(dialog).getByLabelText('More actions for Morning take'));
    expect(within(dialog).queryByRole('menuitem', { name: 'Open in Studio' })).toBeNull();
    expect(within(dialog).getByRole('menuitem', { name: 'Export' })).toBeVisible();
  });

  it('offers the stored file of a Version saved together instead of re-framing that placement', async () => {
    const set = savedTogetherVideo();
    mockGalleryPages({ '': page([set.summary]) });
    mockApiServer.use(
      jsonScenario('GET', `/api/videos/${set.summary.id}`, {
        body: detail(set.summary, set.versions),
      }),
    );
    renderGallery();

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Morning take' }));
    const preview = await screen.findByRole('dialog', { name: 'Morning take' });
    fireEvent.click(within(preview).getByLabelText('More actions for Morning take'));
    fireEvent.click(within(preview).getByRole('menuitem', { name: 'Export' }));
    const exportPanel = await screen.findByRole('dialog', { name: 'Export video' });

    fireEvent.click(within(exportPanel).getByRole('button', { name: 'Square post' }));
    const stored = await within(exportPanel).findByRole('link', {
      name: 'Download Morning take, Version 2',
    });
    expect(stored).toHaveAttribute(
      'href',
      `/api/videos/${set.summary.id}/versions/${set.square.id}/content?download=true`,
    );
    expect(within(exportPanel).getByText(/was saved together with this one/u)).toBeVisible();
    expect(editor.renderVideoEdit).not.toHaveBeenCalled();

    // A placement that save did not produce is still re-framed here, from this Version's bytes.
    fireEvent.click(within(exportPanel).getByRole('button', { name: 'Tall feed post' }));
    expect(
      await within(exportPanel).findByRole('button', {
        name: 'Download Morning take, Version 3, for Tall feed post',
      }),
    ).toBeVisible();
    expect(within(exportPanel).queryByText(/was saved together with this one/u)).toBeNull();
  });

  it('re-frames a Version that belongs to no set, on a video that holds one', async () => {
    const set = savedTogetherVideo();
    mockGalleryPages({ '': page([set.summary]) });
    mockApiServer.use(
      jsonScenario('GET', `/api/videos/${set.summary.id}`, {
        body: detail(set.summary, set.versions),
      }),
    );
    renderGallery();

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Morning take' }));
    const preview = await screen.findByRole('dialog', { name: 'Morning take' });
    fireEvent.click(
      await within(preview).findByRole('button', { name: 'Version 1 · Keep as it is' }),
    );
    fireEvent.click(within(preview).getByLabelText('More actions for Morning take'));
    fireEvent.click(within(preview).getByRole('menuitem', { name: 'Export' }));
    const exportPanel = await screen.findByRole('dialog', { name: 'Export video' });

    fireEvent.click(within(exportPanel).getByRole('button', { name: 'Square post' }));

    // Set 1's square file is a different cut. This Version belongs to no set, so it is re-framed
    // here rather than answered with someone else's bytes.
    expect(
      await within(exportPanel).findByRole('button', {
        name: 'Download Morning take, Version 1, for Square post',
      }),
    ).toBeVisible();
    expect(
      within(exportPanel).queryByRole('link', { name: 'Download Morning take, Version 2' }),
    ).toBeNull();
    expect(within(exportPanel).queryByText(/saved together/iu)).toBeNull();
  });

  it('selects, previews, and downloads an exact older Version without using or changing current', async () => {
    const current = video({
      versionCount: 2,
      currentVersion: {
        ...video().currentVersion,
        id: '3edb9c78-efb2-43a4-8074-acba56158245',
        ordinal: 2,
        sourceVersionId: video().currentVersion.id,
        filename: 'morning-v2.mp4',
        createdAt: '2026-08-06T12:00:00.000Z',
      },
    });
    const older = video().currentVersion;
    mockGalleryPages({ '': page([current]) });
    mockApiServer.use(
      jsonScenario('GET', `/api/videos/${current.id}`, {
        body: detail(current, [older, current.currentVersion]),
      }),
    );
    const onUse = renderGallery();

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Morning take' }));
    const dialog = await screen.findByRole('dialog', { name: 'Morning take' });
    // Every Version names the placement its bytes were produced for; one stored in the shape it
    // already had says so rather than leaving the question open.
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Version 1 · Keep as it is' }),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Version 2 · Keep as it is · Current' }),
    ).toBeVisible();
    expect(within(dialog).queryByRole('group', { name: 'Saved together' })).toBeNull();

    expect(within(dialog).getByLabelText('Preview of Morning take, Version 1')).toHaveAttribute(
      'src',
      `/api/videos/${current.id}/versions/${older.id}/content`,
    );
    expect(within(dialog).getByText('Older Version')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      `/api/videos/${current.id}/versions/${older.id}/content?download=true`,
    );
    fireEvent.click(within(dialog).getByLabelText('More actions for Morning take'));
    expect(within(dialog).queryByRole('menuitem', { name: 'Open in Studio' })).toBeNull();
    expect(within(dialog).getByRole('menuitem', { name: 'Export' })).toBeVisible();
    expect(onUse).not.toHaveBeenCalled();
  });

  it('marks a record with no producing Project without explaining the model', async () => {
    mockGalleryPages({ '': page([video({ assignment: 'unassigned' })]) });
    renderGallery();

    expect(await screen.findAllByText('No Project')).toHaveLength(1);
    expect(screen.queryByText(/no trustworthy producing Project/u)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an actionable empty state', async () => {
    mockGalleryPages({
      '': {
        videos: [],
        nextCursor: null,
        total: 0,
        facets: { characterNames: [], formats: [] },
      },
    });
    renderGallery();

    expect(
      await screen.findByRole('heading', { name: 'No videos in Assets yet' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Videos you save to Assets will appear here.')).toBeInTheDocument();
    expect(
      screen.getByText(/keeps its preview, download and version history together/u),
    ).toBeInTheDocument();
  });

  it('aggregates cursor pages through Query', async () => {
    const first = video();
    const second = video({
      id: '347eb6ea-5ad4-4994-967e-c75d5106f548',
      title: 'Evening take',
      currentVersion: {
        ...video().currentVersion,
        id: '3edb9c78-efb2-43a4-8074-acba56158245',
        videoId: '347eb6ea-5ad4-4994-967e-c75d5106f548',
      },
    });
    const requests = mockGalleryPages({
      '': { ...page([first]), nextCursor: 'page-two', total: 2 },
      'page-two': { ...page([second]), total: 2 },
    });
    renderGallery();

    await screen.findByRole('heading', { name: 'Morning take' });
    fireEvent.click(screen.getByRole('button', { name: 'Load more videos' }));

    expect(await screen.findByRole('heading', { name: 'Evening take' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Morning take' })).toBeInTheDocument();
    expect(new URL(requests.at(-1)!.url).searchParams.get('cursor')).toBe('page-two');
  });

  it('retries a failed library request', async () => {
    const item = video();
    mockApiServer.use(
      jsonScenario('GET', '/api/videos', [
        {
          status: 503,
          body: { error: { code: 'temporarily_unavailable', message: 'Library unavailable.' } },
        },
        { body: page([item]) },
      ]),
    );
    renderGallery();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The request could not be completed.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Morning take' })).toBeInTheDocument();
  });

  it('falls back from a broken thumbnail and reports a non-Error Studio load failure', async () => {
    const item = video();
    mockGalleryPages({ '': page([item]) });
    const onUse = vi.fn().mockRejectedValue('offline');
    renderGallery(onUse);
    await screen.findByRole('heading', { name: 'Morning take' });

    const thumbnail = screen
      .getByRole('button', { name: 'Preview Morning take' })
      .querySelector('img');
    expect(thumbnail).not.toBeNull();
    fireEvent.error(thumbnail!);
    expect(screen.getByLabelText('Preview could not load')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('More actions for Morning take'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit video' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The video could not be loaded.');
    expect(onUse).toHaveBeenCalledWith(item, 'edit');
  });

  it('offers a deliberate no-preview state and generates a poster without a page reload', async () => {
    const item = video({ thumbnailAvailable: false });
    const pages: Record<string, unknown> = { '': page([item]) };
    const { requests, observe } = captureRequests();
    mockApiServer.use(galleryPaginationScenario(pages, observe));
    const uploads: Request[] = [];
    mockApiServer.use(
      http.get(`*/api/videos/${item.id}/versions/${item.currentVersion.id}/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
      http.put(
        `*/api/videos/${item.id}/versions/${item.currentVersion.id}/thumbnail`,
        ({ request }) => {
          uploads.push(request.clone());
          return HttpResponse.json(detail({ ...item, thumbnailAvailable: true }));
        },
      ),
    );
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    // No preview yet reads as a state, not as a broken image, and the listing stays one request.
    expect(screen.getByText('No preview yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Preview Morning take' }).querySelector('img'),
    ).toBeNull();
    expect(requests).toHaveLength(1);

    pages[''] = page([{ ...item, thumbnailAvailable: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generate preview' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate preview' }));

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]!.headers.get('content-type')).toBe('image/webp');
    // The Version's content URL, not its bytes: one frame must not cost a whole-file download.
    expect(api.createSavedVideoThumbnail).toHaveBeenCalledExactlyOnceWith(
      { kind: 'url', url: `/api/videos/${item.id}/versions/${item.currentVersion.id}/content` },
      expect.anything(),
      'auto',
    );
    expect(await screen.findByText('Preview generated for “Morning take”.')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Preview Morning take' }).querySelector('img'),
      ).toHaveAttribute(
        'src',
        `/api/videos/${item.id}/versions/${item.currentVersion.id}/thumbnail`,
      ),
    );
  });

  it('uses an uploaded image as the poster without reading the video bytes', async () => {
    const item = video({ thumbnailAvailable: false });
    mockGalleryPages({ '': page([item]) });
    const contentReads: Request[] = [];
    const uploads: Request[] = [];
    mockApiServer.use(
      http.get(
        `*/api/videos/${item.id}/versions/${item.currentVersion.id}/content`,
        ({ request }) => {
          contentReads.push(request);
          return HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
            headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
          });
        },
      ),
      http.put(
        `*/api/videos/${item.id}/versions/${item.currentVersion.id}/thumbnail`,
        ({ request }) => {
          uploads.push(request);
          return HttpResponse.json(detail({ ...item, thumbnailAvailable: true }));
        },
      ),
    );
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generate preview' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Upload image' }));
    const image = new File(['poster'], 'poster.png', { type: 'image/png' });
    fireEvent.change(within(dialog).getByLabelText('Preview image (optional)'), {
      target: { files: [image] },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use this image' }));

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(api.createSavedVideoThumbnailFromImage).toHaveBeenCalledWith(image, expect.anything());
    expect(api.createSavedVideoThumbnail).not.toHaveBeenCalled();
    expect(contentReads).toHaveLength(0);
  });

  it('keeps a failed repair actionable and leaves the record without a preview', async () => {
    const item = video({ thumbnailAvailable: false });
    mockGalleryPages({ '': page([item]) });
    // An unreadable Version fails the decode itself, which is where the ranged read happens now.
    api.createSavedVideoThumbnail.mockRejectedValue(new Error('The video cannot be decoded.'));
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'Generate preview' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate preview' }));

    const failure = await within(dialog).findByRole('alert');
    expect(failure).toHaveTextContent(
      'The preview could not be generated from this video. Try again, or upload an image instead.',
    );
    expect(within(failure).getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.getByText('No preview yet')).toBeInTheDocument();
  });

  it('renames and confirms deletion in focus-managed dialogs without loading media bytes', async () => {
    // A revision no fixture defaults to, so the assertion below can only pass if the dialog
    // really sent the row's own token rather than a hardcoded 1.
    const original = video({ revision: 4 });
    const renamed = video({ title: 'Renamed take', revision: 5 });
    mockApiServer.use(
      jsonScenario('GET', '/api/videos', [
        { body: page([original]) },
        {
          body: {
            videos: [],
            nextCursor: null,
            total: 0,
            facets: { characterNames: [], formats: [] },
          },
        },
      ]),
    );
    api.renameSavedVideo.mockResolvedValue(renamed);
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    fireEvent.click(screen.getByLabelText('More actions for Morning take'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const renameDialog = screen.getByRole('dialog', { name: 'Rename saved video' });
    const renameInput = within(renameDialog).getByRole('textbox', { name: /Video title/u });
    expect(renameInput).toHaveFocus();
    fireEvent.submit(renameInput.closest('form')!);
    expect(api.renameSavedVideo).not.toHaveBeenCalled();
    fireEvent.change(renameInput, {
      target: { value: 'Renamed take' },
    });
    fireEvent.submit(renameInput.closest('form')!);
    expect(await screen.findByRole('heading', { name: 'Renamed take' })).toBeInTheDocument();
    expect(api.renameSavedVideo).toHaveBeenCalledWith(original.id, 'Renamed take', 4);
    fireEvent.click(screen.getByLabelText('More actions for Renamed take'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Assets' }));
    const removeDialog = screen.getByRole('dialog', { name: 'Remove video from Assets' });
    expect(within(removeDialog).getByRole('button', { name: 'Keep video' })).toHaveFocus();
    expect(removeDialog).toHaveTextContent(
      'Its versions stay available from the history of any Project that kept them',
    );
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove from Assets' }));
    await waitFor(() => expect(api.deleteSavedVideo).toHaveBeenCalledWith(original.id));
    expect(screen.queryByRole('heading', { name: 'Renamed take' })).not.toBeInTheDocument();
  });

  it.each([
    {
      name: 'says the file is deleted where the deployment deletes it',
      removalDeletesStoredMedia: true,
      present: 'Removes this video from Assets and deletes its stored file.',
      absent: 'Its file is not erased.',
    },
    {
      name: 'says the file is kept where the deployment keeps it',
      removalDeletesStoredMedia: false,
      present: 'Its file is not erased.',
      absent: 'deletes its stored file',
    },
  ])('$name', async ({ removalDeletesStoredMedia, present, absent }) => {
    mockGalleryPages({ '': page([video()]) });
    renderGallery(undefined, undefined, removalDeletesStoredMedia);
    await screen.findByRole('heading', { name: 'Morning take' });

    fireEvent.click(screen.getByLabelText('More actions for Morning take'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Assets' }));

    const removeDialog = screen.getByRole('dialog', { name: 'Remove video from Assets' });
    expect(removeDialog).toHaveTextContent(present);
    expect(removeDialog).not.toHaveTextContent(absent);
  });

  it('claims nothing about the stored file until the capability has been read', async () => {
    mockGalleryPages({ '': page([video()]) });
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    fireEvent.click(screen.getByLabelText('More actions for Morning take'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Assets' }));

    const removeDialog = screen.getByRole('dialog', { name: 'Remove video from Assets' });
    expect(removeDialog).toHaveTextContent('Removes this video from Assets.');
    expect(removeDialog).not.toHaveTextContent('not erased');
    expect(removeDialog).not.toHaveTextContent('deleted');
    // The claim it can still make: history keeps what it kept, whatever the storage does.
    expect(removeDialog).toHaveTextContent(
      'Its versions stay available from the history of any Project that kept them',
    );
  });

  it('keeps failed rename and removal actions open with accessible retry errors', async () => {
    const item = video();
    mockGalleryPages({ '': page([item]) });
    api.renameSavedVideo.mockRejectedValueOnce(new Error('Rename is temporarily unavailable.'));
    api.deleteSavedVideo.mockRejectedValueOnce(new Error('Removal is temporarily unavailable.'));
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    fireEvent.click(screen.getByLabelText('More actions for Morning take'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const renameDialog = screen.getByRole('dialog', { name: 'Rename saved video' });
    fireEvent.change(within(renameDialog).getByRole('textbox', { name: /Video title/u }), {
      target: { value: 'Retry title' },
    });
    fireEvent.click(within(renameDialog).getByRole('button', { name: 'Rename video' }));
    expect(await within(renameDialog).findByRole('alert')).toHaveTextContent(
      'Rename is temporarily unavailable.',
    );
    fireEvent.click(within(renameDialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Rename saved video' })).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('More actions for Morning take')).toHaveFocus();

    fireEvent.click(screen.getByLabelText('More actions for Morning take'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Assets' }));
    const removeDialog = screen.getByRole('dialog', { name: 'Remove video from Assets' });
    fireEvent.click(within(removeDialog).getByRole('button', { name: 'Remove from Assets' }));
    expect(await within(removeDialog).findByRole('alert')).toHaveTextContent(
      'Removal is temporarily unavailable.',
    );
    expect(removeDialog).toBeVisible();
  });

  it('recovers from a rename conflict by retrying against the video as it now is', async () => {
    const original = video({ revision: 2 });
    // What the server holds by the time the dialog submits: renamed elsewhere, token moved on.
    const moved = video({ title: 'Moved on', revision: 6 });
    mockGalleryPages({ '': page([original]) });
    const detailCapture = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        `/api/videos/${original.id}`,
        [{ body: detail(moved) }],
        detailCapture.observe,
      ),
    );
    api.renameSavedVideo
      .mockRejectedValueOnce(
        new ApiClientError('The saved video changed before it could be renamed.', 409, 'conflict'),
      )
      .mockResolvedValueOnce(video({ title: 'Final name', revision: 7 }));
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    fireEvent.click(screen.getByLabelText('More actions for Morning take'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const renameDialog = screen.getByRole('dialog', { name: 'Rename saved video' });
    fireEvent.change(within(renameDialog).getByRole('textbox', { name: /Video title/u }), {
      target: { value: 'Final name' },
    });
    fireEvent.submit(
      within(renameDialog)
        .getByRole('textbox', { name: /Video title/u })
        .closest('form')!,
    );
    expect(await within(renameDialog).findByRole('alert')).toHaveTextContent(
      'The saved video changed before it could be renamed.',
    );
    // The losing token was replaced by the winner's: the row behind the dialog (inert while the
    // dialog holds focus, hence `hidden`) shows what the video became, and the operator's typed
    // title survived in the field.
    await waitFor(() => expect(detailCapture.requests).toHaveLength(1));
    expect(
      await screen.findByRole('heading', { name: 'Moved on', hidden: true }),
    ).toBeInTheDocument();
    expect(within(renameDialog).getByRole('textbox', { name: /Video title/u })).toHaveValue(
      'Final name',
    );

    fireEvent.submit(
      within(renameDialog)
        .getByRole('textbox', { name: /Video title/u })
        .closest('form')!,
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Rename saved video' })).not.toBeInTheDocument(),
    );
    // The retry carried the refetched revision — not the stale 2 it opened with.
    expect(api.renameSavedVideo).toHaveBeenLastCalledWith(original.id, 'Final name', 6);
  });

  it('requests character and format filters with each supported sort order', async () => {
    const item = video({
      currentVersion: { ...video().currentVersion, characterVariantName: 'Evening' },
    });
    const requests = mockGalleryPages({ '': page([item]) });
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });
    expect(screen.getByText('Variant: Evening')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const filters = await screen.findByRole('dialog', { name: 'Filters' });

    fireEvent.click(within(filters).getByRole('combobox', { name: 'Character used' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mara' }));
    await waitFor(() =>
      expect(Object.fromEntries(new URL(requests.at(-1)!.url).searchParams)).toMatchObject({
        characterName: 'Mara',
        sort: 'latest',
      }),
    );

    fireEvent.click(within(filters).getByRole('combobox', { name: 'Video format' }));
    fireEvent.click(screen.getByRole('option', { name: 'Portrait' }));
    await waitFor(() =>
      expect(Object.fromEntries(new URL(requests.at(-1)!.url).searchParams)).toMatchObject({
        characterName: 'Mara',
        format: 'portrait',
        sort: 'latest',
      }),
    );

    for (const label of ['Oldest', 'Shortest', 'Longest']) {
      fireEvent.click(within(filters).getByRole('combobox', { name: 'Sort by' }));
      fireEvent.click(screen.getByRole('option', { name: label }));
      await waitFor(() =>
        expect(new URL(requests.at(-1)!.url).searchParams.get('sort')).toBe(label.toLowerCase()),
      );
    }

    fireEvent.click(within(filters).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      const parameters = new URL(requests.at(-1)!.url).searchParams;
      expect(parameters.has('characterName')).toBe(false);
      expect(parameters.has('format')).toBe(false);
    });
  });

  it('clears title search from the inline trailing action and returns focus to the input', async () => {
    mockGalleryPages({ '': page([video()]) });
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    const search = screen.getByRole('searchbox', { name: 'Search videos by title' });
    fireEvent.change(search, { target: { value: 'Morning' } });
    const clear = screen.getByRole('button', { name: 'Clear search' });
    expect(clear).toBeVisible();

    fireEvent.click(clear);
    await waitFor(() => expect(search).toHaveValue(''));
    await waitFor(() => expect(search).toHaveFocus());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument(),
    );
  });

  it('keeps mobile filters in a focused sheet with one compact action row', async () => {
    mockGalleryPages({ '': page([video()]) });
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    const trigger = screen.getByRole('button', { name: 'Filters' });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByRole('combobox', { name: 'Character used' })).toBeVisible();
    const actions = dialog.querySelector<HTMLElement>('[data-filter-sheet-actions]');
    expect(actions).not.toBeNull();
    expect(within(actions!).getByRole('button', { name: 'Clear filters' })).toBeVisible();
    expect(within(actions!).getByRole('button', { name: 'Show 1 video' })).toBeVisible();

    fireEvent.click(within(actions!).getByRole('button', { name: 'Show 1 video' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps the character control operable when older videos have no attribution', async () => {
    mockGalleryPages({
      '': {
        videos: [
          video({
            currentVersion: {
              ...video().currentVersion,
              characterName: null,
              characterVariantName: null,
            },
          }),
        ],
        nextCursor: null,
        total: 1,
        facets: { characterNames: [], formats: ['landscape'] },
      },
    });
    renderGallery();

    await screen.findByRole('heading', { name: 'Morning take' });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const filters = await screen.findByRole('dialog', { name: 'Filters' });
    expect(within(filters).getByRole('combobox', { name: 'Character used' })).toBeEnabled();
    expect(
      within(filters).getByText('No saved videos have character attribution yet.'),
    ).toBeInTheDocument();
  });

  it('opens a requested Version preview for a video no loaded page contains', async () => {
    const listed = video();
    const requested = video({
      id: '9f2b8b0e-3f0c-4a7d-9a1e-0b6b2c5d4e31',
      title: 'Evening take',
      currentVersion: {
        ...video().currentVersion,
        id: 'd41f9a3b-9c1e-4f2a-8d55-2b7e6c9a0f14',
        videoId: '9f2b8b0e-3f0c-4a7d-9a1e-0b6b2c5d4e31',
        filename: 'evening-take.mp4',
      },
    });
    mockGalleryPages({ '': page([listed]) });
    mockApiServer.use(
      jsonScenario('GET', `/api/videos/${requested.id}`, { body: detail(requested) }),
    );
    const onFocusVideoConsumed = vi.fn();
    renderGallery(undefined, { focusVideoId: requested.id, onFocusVideoConsumed });

    const dialog = await screen.findByRole('dialog', { name: 'Evening take' });
    expect(within(dialog).getByLabelText('Preview of Evening take, Version 1')).toBeInTheDocument();
    expect(onFocusVideoConsumed).toHaveBeenCalledOnce();
  });

  it('explains a requested video that is no longer in Assets instead of opening an empty preview', async () => {
    mockGalleryPages({ '': page([video()]) });
    const missingId = '9f2b8b0e-3f0c-4a7d-9a1e-0b6b2c5d4e31';
    mockApiServer.use(
      jsonScenario('GET', `/api/videos/${missingId}`, {
        body: { error: { code: 'not_found', message: 'Saved video not found.' } },
        status: 404,
      }),
    );
    const onFocusVideoConsumed = vi.fn();
    renderGallery(undefined, { focusVideoId: missingId, onFocusVideoConsumed });

    expect(await screen.findByText('That video is no longer in Assets.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onFocusVideoConsumed).toHaveBeenCalledOnce();
  });
});
