// @vitest-environment jsdom

import type { SavedVideoSummary } from '@studio/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  deleteSavedVideo: vi.fn(),
  listSavedVideos: vi.fn(),
  renameSavedVideo: vi.fn(),
}));

vi.mock('../../adapters/api-client/savedVideosApi', () => ({
  ...api,
  downloadSavedVideoUrl: (videoId: string) => `/api/videos/${videoId}/content?download=true`,
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
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads metadata and lazy thumbnails without mounting or requesting a video player', async () => {
    const item = video();
    api.listSavedVideos.mockResolvedValue({ videos: [item], nextCursor: null });
    const onUse = renderGallery();

    expect(await screen.findByRole('heading', { name: 'Morning take' })).toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
    expect(screen.getByRole('img', { name: 'Thumbnail for Morning take' })).toHaveAttribute(
      'src',
      `/api/videos/${item.id}/thumbnail`,
    );
    expect(screen.getByText(/0:12/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load in Studio' }));
    await waitFor(() => expect(onUse).toHaveBeenCalledWith(item, 'play'));
  });

  it('shows an actionable empty state', async () => {
    api.listSavedVideos.mockResolvedValue({ videos: [], nextCursor: null });
    renderGallery();

    expect(await screen.findByRole('heading', { name: 'No saved videos yet' })).toBeInTheDocument();
    expect(screen.getByText(/Save Video/u)).toBeInTheDocument();
  });

  it('renames and confirms deletion without loading media bytes', async () => {
    const original = video();
    const renamed = video({ title: 'Renamed take' });
    api.listSavedVideos.mockResolvedValue({ videos: [original], nextCursor: null });
    api.renameSavedVideo.mockResolvedValue(renamed);
    vi.spyOn(window, 'prompt').mockReturnValue('Renamed take');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderGallery();
    await screen.findByRole('heading', { name: 'Morning take' });

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(await screen.findByRole('heading', { name: 'Renamed take' })).toBeInTheDocument();
    expect(api.renameSavedVideo).toHaveBeenCalledWith(original.id, 'Renamed take');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteSavedVideo).toHaveBeenCalledWith(original.id));
    expect(screen.queryByRole('heading', { name: 'Renamed take' })).not.toBeInTheDocument();
  });
});
