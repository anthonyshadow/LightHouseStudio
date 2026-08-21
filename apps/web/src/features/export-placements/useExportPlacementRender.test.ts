// @vitest-environment jsdom

import { projectExportSpecificationForAspect } from '@studio/domain';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderVideoEditInput } from '../video-editor/renderVideoEdit';
import { useExportPlacementRender } from './useExportPlacementRender';

const renderVideoEdit = vi.fn<(input: RenderVideoEditInput) => Promise<unknown>>();
const videoEditRenderingSupported = vi.fn(() => true);
const videoEditPreviewSupported = vi.fn(() => true);

vi.mock('../video-editor/renderVideoEdit', () => ({
  renderVideoEdit: (input: RenderVideoEditInput) => renderVideoEdit(input),
  videoEditRenderingSupported: () => videoEditRenderingSupported(),
}));
vi.mock('../video-editor/videoEditShader', () => ({
  videoEditPreviewSupported: () => videoEditPreviewSupported(),
}));

const landscape = { width: 1_920, height: 1_080, durationMs: 12_000 } as const;

const input = (specification = projectExportSpecificationForAspect('9:16')!) => ({
  media: new Blob(['source'], { type: 'video/mp4' }),
  specification,
  source: landscape,
  hasAudio: true,
  filename: 'launch-cut.mp4',
});

beforeEach(() => {
  renderVideoEdit.mockReset();
  videoEditRenderingSupported.mockReturnValue(true);
  videoEditPreviewSupported.mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe('useExportPlacementRender', () => {
  it('renders a placement as a centred crop scaled to its exact destination size', async () => {
    const blob = new Blob(['reframed'], { type: 'video/mp4' });
    renderVideoEdit.mockResolvedValue({ blob, mimeType: 'video/mp4' });
    const { result } = renderHook(() => useExportPlacementRender());

    const rendered = await act(() => result.current.render(input()));

    expect(rendered).toEqual({ blob, filename: 'launch-cut-9x16.mp4' });
    const request = renderVideoEdit.mock.calls[0]![0];
    expect(request.spec.crop.preset).toBe('9:16');
    expect(request.targetResolution).toEqual({ width: 1_080, height: 1_920 });
    expect(request.includeAudio).toBe(true);
    expect(request.requireAudio).toBe(true);
    expect(request.sourceWidth).toBe(1_920);
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(result.current.progress).toBe(1);
  });

  it('drops the audio track, and never requires one, when the placement excludes it', async () => {
    renderVideoEdit.mockResolvedValue({
      blob: new Blob(['reframed'], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
    });
    const { result } = renderHook(() => useExportPlacementRender());

    await act(() =>
      result.current.render(input(projectExportSpecificationForAspect('1:1', false)!)),
    );

    const request = renderVideoEdit.mock.calls[0]![0];
    expect(request.includeAudio).toBe(false);
    expect(request.requireAudio).toBe(false);
  });

  it('never renders for the original shape', async () => {
    const { result } = renderHook(() => useExportPlacementRender());

    const rendered = await act(() =>
      result.current.render({
        ...input(),
        specification: {
          container: 'video/mp4',
          aspect: 'source',
          resolution: null,
          includeAudio: true,
        },
      }),
    );

    expect(rendered).toBeNull();
    expect(renderVideoEdit).not.toHaveBeenCalled();
  });

  it('surfaces the domain rule’s own message for a combination that cannot be produced', async () => {
    const { result } = renderHook(() => useExportPlacementRender());

    const rendered = await act(() =>
      result.current.render({
        ...input(),
        specification: {
          container: 'video/mp4',
          aspect: '9:16',
          resolution: { width: 1_920, height: 1_080 },
          includeAudio: true,
        },
      }),
    );

    expect(rendered).toBeNull();
    expect(renderVideoEdit).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error).toMatch(/1920×1080 is not a 9:16 shape/u);
  });

  it('reports an unsupported browser without starting a render', async () => {
    videoEditPreviewSupported.mockReturnValue(false);
    const { result } = renderHook(() => useExportPlacementRender());

    expect(result.current.supported).toBe(false);
    const rendered = await act(() => result.current.render(input()));

    expect(rendered).toBeNull();
    expect(renderVideoEdit).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toMatch(/keeps its original shape/u);
  });

  it('abandons a cancelled render and returns to idle without an error', async () => {
    let abort: AbortSignal | undefined;
    renderVideoEdit.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          abort = signal;
          signal.addEventListener('abort', () =>
            reject(new DOMException('Video rendering was canceled.', 'AbortError')),
          );
        }),
    );
    const { result } = renderHook(() => useExportPlacementRender());

    let pending: Promise<unknown> | undefined;
    act(() => {
      pending = result.current.render(input());
    });
    await waitFor(() => expect(result.current.phase).toBe('rendering'));
    act(() => result.current.cancel());

    expect(abort?.aborted).toBe(true);
    await expect(pending).resolves.toBeNull();
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
