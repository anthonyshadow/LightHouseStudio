// @vitest-environment jsdom

import type { SavedVideoDetail } from '@studio/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { SavedVideoSuccessActions } from './SavedVideoSuccessActions';

afterEach(cleanup);

const videoId = 'a2b0dfe8-2b1f-4c07-a2a9-2d3d94d9f6a1';
const versionId = 'c5b9b3ab-6c2f-4c1c-92c4-6f2b0e19f0d2';
const now = '2026-08-16T10:00:00.000Z';

const savedVideo = (): SavedVideoDetail => ({
  id: videoId,
  title: 'Launch cut',
  status: 'ready',
  currentVersion: {
    id: versionId,
    videoId,
    ordinal: 2,
    origin: 'recorded',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'launch-cut.mp4',
    sizeBytes: 4,
    durationMs: 1_000,
    width: 1280,
    height: 720,
    createdAt: now,
  },
  versions: [],
  sourceVideoId: null,
  versionCount: 2,
  thumbnailAvailable: false,
  createdAt: now,
  updatedAt: now,
});

describe('SavedVideoSuccessActions', () => {
  it('downloads the exact retained Version and offers the two next steps', async () => {
    const user = userEvent.setup();
    const onOpenInAssets = vi.fn();
    const onCreateAnother = vi.fn();
    render(
      <StudioDesignProvider>
        <SavedVideoSuccessActions
          video={savedVideo()}
          onOpenInAssets={onOpenInAssets}
          onCreateAnother={onCreateAnother}
        />
      </StudioDesignProvider>,
    );

    const download = screen.getByRole('link', { name: 'Download Launch cut, Version 2' });
    expect(download).toHaveAttribute(
      'href',
      `/api/videos/${videoId}/versions/${versionId}/content?download=true`,
    );
    expect(download).toHaveAttribute('download', 'launch-cut.mp4');

    await user.click(screen.getByRole('button', { name: 'View in Assets' }));
    expect(onOpenInAssets).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Create another' }));
    expect(onCreateAnother).toHaveBeenCalledOnce();
  });

  it('omits Create another when the surface cannot start a new take', () => {
    render(
      <StudioDesignProvider>
        <SavedVideoSuccessActions video={savedVideo()} onOpenInAssets={vi.fn()} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('link', { name: /Download/u })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Create another' })).not.toBeInTheDocument();
  });
});
