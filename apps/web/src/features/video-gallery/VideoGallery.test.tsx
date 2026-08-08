// @vitest-environment jsdom

import type { SavedVideoSummary } from '@studio/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  deleteSavedVideo: vi.fn(),
  listSavedVideos: vi.fn(),
  renameSavedVideo: vi.fn(),
}));

vi.mock('../../adapters/api-client/savedVideosApi', () => ({
  ...api,
  downloadSavedVideoUrl: (videoId: string) => `/api/videos/${videoId}/content?download=true`,
  savedVideoContentUrl: (videoId: string) => `/api/videos/${videoId}/content`,
  savedVideoThumbnailUrl: (videoId: string) => `/api/videos/${videoId}/thumbnail`,
}));

import { StudioDesignProvider } from '../../ui';
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
    createdAt: '2026-08-05T12:00:00.000Z',
  },
  sourceVideoId: null,
  versionCount: 1,
  thumbnailAvailable: true,
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: '2026-08-05T12:00:00.000Z',
  ...override,
});

const page = (videos: readonly SavedVideoSummary[]) => ({
  videos,
  nextCursor: null,
  total: videos.length,
  facets: { characterNames: ['Mara', 'Nova'], formats: ['landscape', 'portrait'] as const },
});

const renderGallery = (onUse = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <StudioDesignProvider>
      <VideoGallery onUse={onUse} />
    </StudioDesignProvider>,
  );
  return onUse;
};

describe('VideoGallery', () => {
  beforeEach(() => {
    api.deleteSavedVideo.mockReset().mockResolvedValue(undefined);
    api.renameSavedVideo.mockReset();
    api.listSavedVideos.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads metadata and lazy thumbnails without mounting or requesting a video player', async () => {
    const item = video();
    api.listSavedVideos.mockResolvedValue(page([item]));
    const onUse = renderGallery();

    expect(await screen.findByRole('heading', { name: 'Morning take' })).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Preview Morning take' }).querySelector('img'),
    ).toHaveAttribute('src', `/api/videos/${item.id}/thumbnail`);
    expect(screen.getByText('0:12')).toBeInTheDocument();
    expect(screen.getAllByText('Landscape').length).toBeGreaterThan(0);
    expect(screen.getByText('Mara')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load in Studio' }));
    await waitFor(() => expect(onUse).toHaveBeenCalledWith(item, 'play'));
  });

  it('opens a centered authenticated preview on thumbnail activation and restores focus on close', async () => {
    const item = video();
    api.listSavedVideos.mockResolvedValue(page([item]));
    renderGallery();

    const previewTrigger = await screen.findByRole('button', { name: 'Preview Morning take' });
    fireEvent.click(previewTrigger);

    const dialog = await screen.findByRole('dialog', { name: 'Morning take' });
    expect(within(dialog).getByLabelText('Preview of Morning take')).toHaveAttribute(
      'src',
      `/api/videos/${item.id}/content`,
    );
    expect(within(dialog).getByText('1280×720')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Preview of Morning take')).toBeNull());
    await waitFor(() => expect(previewTrigger).toHaveFocus());
  });

  it('shows an actionable empty state', async () => {
    api.listSavedVideos.mockResolvedValue({
      videos: [],
      nextCursor: null,
      total: 0,
      facets: { characterNames: [], formats: [] },
    });
    renderGallery();

    expect(await screen.findByRole('heading', { name: 'No saved videos yet' })).toBeInTheDocument();
    expect(screen.getByText(/Save Video/u)).toBeInTheDocument();
  });

  it('renames and confirms deletion without loading media bytes', async () => {
    const original = video();
    const renamed = video({ title: 'Renamed take' });
    api.listSavedVideos.mockResolvedValueOnce(page([original])).mockResolvedValue({
      videos: [],
      nextCursor: null,
      total: 0,
      facets: { characterNames: [], formats: [] },
    });
    api.renameSavedVideo.mockResolvedValue(renamed);
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed take');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    fireEvent.click(screen.getByLabelText('More actions for Morning take'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(await screen.findByRole('heading', { name: 'Renamed take' })).toBeInTheDocument();
    expect(api.renameSavedVideo).toHaveBeenCalledWith(original.id, 'Renamed take');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteSavedVideo).toHaveBeenCalledWith(original.id));
    expect(screen.queryByRole('heading', { name: 'Renamed take' })).not.toBeInTheDocument();
  });

  it('requests character and format filters with each supported sort order', async () => {
    const item = video({
      currentVersion: { ...video().currentVersion, characterVariantName: 'Evening' },
    });
    api.listSavedVideos.mockResolvedValue(page([item]));
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });
    expect(screen.getByText('Variant: Evening')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Character used' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mara' }));
    await waitFor(() =>
      expect(api.listSavedVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({ characterName: 'Mara', sort: 'latest' }),
      ),
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Video format' }));
    fireEvent.click(screen.getByRole('option', { name: 'Portrait' }));
    await waitFor(() =>
      expect(api.listSavedVideos).toHaveBeenLastCalledWith(
        expect.objectContaining({ characterName: 'Mara', format: 'portrait', sort: 'latest' }),
      ),
    );

    for (const label of ['Oldest', 'Shortest', 'Longest']) {
      fireEvent.click(screen.getByRole('combobox', { name: 'Sort by' }));
      fireEvent.click(screen.getByRole('option', { name: label }));
      await waitFor(() =>
        expect(api.listSavedVideos).toHaveBeenLastCalledWith(
          expect.objectContaining({ sort: label.toLowerCase() }),
        ),
      );
    }
  });

  it('keeps the character control operable when older videos have no attribution', async () => {
    api.listSavedVideos.mockResolvedValue({
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
    });
    renderGallery();

    await screen.findByRole('heading', { name: 'Morning take' });
    expect(screen.getByRole('combobox', { name: 'Character used' })).toBeEnabled();
    expect(screen.getByText('No saved videos have character attribution yet.')).toBeInTheDocument();
  });
});
