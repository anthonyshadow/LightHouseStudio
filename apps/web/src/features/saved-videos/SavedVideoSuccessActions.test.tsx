// @vitest-environment jsdom

import type { SavedVideoDetail } from '@studio/contracts';
import { projectExportSpecificationForAspect } from '@studio/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { SavedVideoSuccessActions } from './SavedVideoSuccessActions';

// jsdom has no WebGL, so the render capability is stated explicitly rather than inferred.
const renderCapable = vi.fn(() => true);
const renderVideoEdit =
  vi.fn<
    (input: {
      targetResolution: unknown;
      spec: { crop: { preset: string } };
      sourceWidth: number;
    }) => Promise<{ blob: Blob; mimeType: 'video/mp4' }>
  >();
const readSavedVideoContent = vi.fn<() => Promise<Blob>>();
vi.mock('../video-editor/videoEditSupport', () => ({
  videoEditPreviewSupported: () => renderCapable(),
  videoEditRenderingApisPresent: () => true,
  videoEditExportSupported: () => Promise.resolve(renderCapable()),
  videoEditSupported: () => Promise.resolve(renderCapable()),
}));
vi.mock('../video-editor/renderVideoEdit', () => ({
  renderVideoEdit: (input: Parameters<typeof renderVideoEdit>[0]) => renderVideoEdit(input),
}));
vi.mock('../../adapters/api-client/savedVideosApi', () => ({
  downloadSavedVideoUrl: (videoId: string, versionId?: string) =>
    `/api/videos/${videoId}/versions/${versionId}/content?download=true`,
  readSavedVideoContent: () => readSavedVideoContent(),
}));

beforeEach(() => {
  renderCapable.mockReturnValue(true);
  renderVideoEdit.mockReset();
  readSavedVideoContent.mockReset();
});

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
    exportSpecification: null,
    createdAt: now,
  },
  versions: [],
  sourceVideoId: null,
  versionCount: 2,
  thumbnailAvailable: false,
  revision: 1,
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

describe('SavedVideoSuccessActions placement download', () => {
  const placement = projectExportSpecificationForAspect('9:16');

  it('re-frames the retained bytes and hands over a file named for the placement', async () => {
    const user = userEvent.setup();
    const reframed = new Blob(['reframed'], { type: 'video/mp4' });
    readSavedVideoContent.mockResolvedValue(new Blob(['source'], { type: 'video/mp4' }));
    renderVideoEdit.mockResolvedValue({ blob: reframed, mimeType: 'video/mp4' });
    const createObjectURL = vi.fn(() => 'blob:placement');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(
      <StudioDesignProvider>
        <SavedVideoSuccessActions
          video={savedVideo()}
          exportSpecification={placement}
          onOpenInAssets={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    await user.click(
      await screen.findByRole('button', { name: /Download Launch cut, Version 2, for/u }),
    );

    await waitFor(() => expect(renderVideoEdit).toHaveBeenCalledOnce());
    const request = renderVideoEdit.mock.calls[0]![0];
    expect(request.targetResolution).toEqual({ width: 1_080, height: 1_920 });
    expect(request.spec.crop.preset).toBe('9:16');
    expect(request.sourceWidth).toBe(1280);
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(reframed));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:placement');

    // The original shape stays one click away, since the Project keeps it either way.
    expect(
      screen.getByRole('link', { name: 'Download Launch cut, Version 2, in its original shape' }),
    ).toBeVisible();
    vi.unstubAllGlobals();
    click.mockRestore();
  });

  it('falls back to the unchanged server download when the browser cannot re-frame', async () => {
    renderCapable.mockReturnValue(false);
    render(
      <StudioDesignProvider>
        <SavedVideoSuccessActions
          video={savedVideo()}
          exportSpecification={placement}
          onOpenInAssets={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    // The probe answers in an effect, so the notice arrives a tick after the first paint.
    expect(await screen.findByText('Local editor unavailable')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Download Launch cut, Version 2' })).toHaveAttribute(
      'download',
      'launch-cut.mp4',
    );
    expect(screen.queryByRole('button', { name: /for phone/u })).not.toBeInTheDocument();
  });
});
