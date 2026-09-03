// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVideoEditSpec, type SubtitleCue, type VideoEditSpec } from '@studio/domain';
import { StudioDesignProvider } from '../../ui';
import { VideoEditStagePreview } from './VideoEditStagePreview';

const shader = vi.hoisted(() => {
  const renderer = {
    render: vi.fn<(source: TexImageSource, spec: VideoEditSpec) => void>(),
    setOverlay: vi.fn<(overlay: TexImageSource | null) => void>(),
    dispose: vi.fn<() => void>(),
  };
  return { renderer, createVideoEditFrameRenderer: vi.fn(() => renderer) };
});

vi.mock('./videoEditShader', () => ({
  createVideoEditFrameRenderer: shader.createVideoEditFrameRenderer,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  shader.createVideoEditFrameRenderer.mockClear();
  shader.renderer.render.mockClear();
  shader.renderer.setOverlay.mockClear();
  shader.renderer.dispose.mockClear();
});

/** jsdom has no 2D canvas; this one records the lines each rasterization drew, per clear. */
const scriptedOverlayContext = () => {
  const drawn: string[][] = [];
  const context = {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    clearRect: () => {
      drawn.push([]);
    },
    measureText: (text: string) => ({ width: text.length * 10 }),
    beginPath: () => undefined,
    roundRect: () => undefined,
    fill: () => undefined,
    fillText: (text: string) => {
      drawn.at(-1)!.push(text);
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return drawn;
};

const PreviewHarness = ({
  showingBefore = false,
  splitComparison = false,
  activeTool = 'crop',
  onApplySpec = vi.fn(),
  onCropStart,
  onCropChange,
  onCropCommit,
  onPlayheadChange = vi.fn(),
  initialCrop = {
    preset: 'freeform' as const,
    rectangle: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  },
  subtitles,
}: {
  showingBefore?: boolean;
  splitComparison?: boolean;
  activeTool?: 'crop' | 'rotate';
  onApplySpec?: (spec: VideoEditSpec) => void;
  onCropStart: () => void;
  onCropChange: (spec: VideoEditSpec) => void;
  onCropCommit: () => void;
  onPlayheadChange?: (playheadMs: number) => void;
  initialCrop?: VideoEditSpec['crop'];
  /** A fresh array on every render forces the paused-video redraw the preview offers. */
  subtitles?: readonly SubtitleCue[];
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [spec, setSpec] = useState<VideoEditSpec>({
    ...createDefaultVideoEditSpec(10_000),
    crop: initialCrop,
  });
  const effectiveSpec = useMemo(
    () => (subtitles ? { ...spec, subtitles } : spec),
    [spec, subtitles],
  );
  return (
    <StudioDesignProvider>
      <video ref={videoRef} data-testid="source-video">
        <track kind="captions" />
      </video>
      <VideoEditStagePreview
        videoRef={videoRef}
        contract={{
          spec: effectiveSpec,
          sourceWidth: 1_280,
          sourceHeight: 720,
          activeTool,
          showingBefore,
          splitComparison,
          playheadMs: 0,
          onPlayheadChange,
          onApplySpec,
          onCropStart,
          onCropChange: (nextSpec) => {
            onCropChange(nextSpec);
            setSpec(nextSpec);
          },
          onCropCommit,
        }}
      />
    </StudioDesignProvider>
  );
};

describe('VideoEditStagePreview', () => {
  it('keeps one renderer while crop state changes without changing geometry', () => {
    render(<PreviewHarness onCropStart={vi.fn()} onCropChange={vi.fn()} onCropCommit={vi.fn()} />);
    expect(shader.createVideoEditFrameRenderer).toHaveBeenCalledOnce();

    const handle = screen.getByRole('button', { name: 'Resize crop from top left' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyUp(handle, { key: 'ArrowRight' });

    expect(shader.createVideoEditFrameRenderer).toHaveBeenCalledOnce();
  });

  it('drags the whole crop selection and keeps a fixed-ratio preset positioned', () => {
    const onCropStart = vi.fn<() => void>();
    const onCropChange = vi.fn<(spec: VideoEditSpec) => void>();
    const onCropCommit = vi.fn<() => void>();
    const view = render(
      <PreviewHarness
        initialCrop={{
          preset: '1:1',
          rectangle: { x: 0.2, y: 0, width: 0.5625, height: 1 },
        }}
        onCropStart={onCropStart}
        onCropChange={onCropChange}
        onCropCommit={onCropCommit}
      />,
    );
    const frame = view.container.querySelector<HTMLElement>('[data-video-edit-frame]')!;
    const selection = view.container.querySelector<HTMLElement>('[data-crop-selection]')!;
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 1_000,
      bottom: 500,
      left: 0,
      width: 1_000,
      height: 500,
      toJSON: () => ({}),
    });

    expect(getComputedStyle(selection).pointerEvents).toBe('auto');
    fireEvent.pointerDown(selection, { pointerId: 1, clientX: 300, clientY: 200 });
    fireEvent.pointerMove(selection, { pointerId: 1, clientX: 400, clientY: 200 });
    fireEvent.pointerUp(selection, { pointerId: 1 });

    const movedCrop = onCropChange.mock.calls.at(-1)?.[0].crop;
    expect(movedCrop?.preset).toBe('1:1');
    expect(movedCrop?.rectangle.x).toBeCloseTo(0.3);
    expect(movedCrop?.rectangle).toMatchObject({ y: 0, width: 0.5625, height: 1 });
    expect(onCropStart).toHaveBeenCalledOnce();
    expect(onCropCommit).toHaveBeenCalledOnce();
  });

  it('turns a preset crop into Freeform when a corner resizes it', () => {
    const onCropChange = vi.fn<(spec: VideoEditSpec) => void>();
    render(
      <PreviewHarness
        initialCrop={{
          preset: '1:1',
          rectangle: { x: 0.2, y: 0, width: 0.5625, height: 1 },
        }}
        onCropStart={vi.fn()}
        onCropChange={onCropChange}
        onCropCommit={vi.fn()}
      />,
    );

    const handle = screen.getByRole('button', { name: 'Resize crop from top left' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyUp(handle, { key: 'ArrowRight' });

    expect(onCropChange.mock.calls.at(-1)?.[0].crop.preset).toBe('freeform');
  });

  it('moves keyboard crop handles by 1%, uses Shift for 5%, and groups each gesture', () => {
    const onCropStart = vi.fn<() => void>();
    const onCropChange = vi.fn<(spec: VideoEditSpec) => void>();
    const onCropCommit = vi.fn<() => void>();
    render(
      <PreviewHarness
        onCropStart={onCropStart}
        onCropChange={onCropChange}
        onCropCommit={onCropCommit}
      />,
    );
    const handle = screen.getByRole('button', { name: 'Resize crop from top left' });

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyUp(handle, { key: 'ArrowRight' });
    expect(onCropChange.mock.calls.at(-1)?.[0].crop.rectangle).toEqual({
      x: 0.11,
      y: 0.1,
      width: 0.79,
      height: 0.8,
    });

    fireEvent.keyDown(handle, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyUp(handle, { key: 'ArrowDown', shiftKey: true });
    const shifted = onCropChange.mock.calls.at(-1)?.[0].crop.rectangle;
    expect(shifted?.x).toBeCloseTo(0.11);
    expect(shifted?.y).toBeCloseTo(0.15);
    expect(shifted?.width).toBeCloseTo(0.79);
    expect(shifted?.height).toBeCloseTo(0.75);

    const moveHandle = screen.getByRole('button', { name: 'Move crop selection' });
    fireEvent.keyDown(moveHandle, { key: 'ArrowLeft', shiftKey: true });
    fireEvent.keyUp(moveHandle, { key: 'ArrowLeft', shiftKey: true });
    const moved = onCropChange.mock.calls.at(-1)?.[0].crop.rectangle;
    expect(moved?.x).toBeCloseTo(0.06);
    expect(moved?.y).toBeCloseTo(0.15);
    expect(moved?.width).toBeCloseTo(0.79);
    expect(moved?.height).toBeCloseTo(0.75);
    expect(onCropStart).toHaveBeenCalledTimes(3);
    expect(onCropCommit).toHaveBeenCalledTimes(3);
  });

  it('bypasses the edit canvas for Before without replacing or seeking the source video', () => {
    const callbacks = {
      onCropStart: vi.fn(),
      onCropChange: vi.fn(),
      onCropCommit: vi.fn(),
    };
    const view = render(<PreviewHarness {...callbacks} />);
    const video = view.container.querySelector<HTMLVideoElement>('[data-testid="source-video"]')!;
    video.currentTime = 2.5;
    const identity = video;
    expect(view.container.querySelector('canvas')).not.toBeNull();

    view.rerender(<PreviewHarness {...callbacks} showingBefore />);
    const currentVideo = view.container.querySelector<HTMLVideoElement>(
      '[data-testid="source-video"]',
    );
    expect(currentVideo).toBe(identity);
    expect(currentVideo?.currentTime).toBe(2.5);
    expect(view.container.querySelector('canvas')).toBeNull();
  });

  it('provides on-frame rotation and a split comparison without replacing the source video', () => {
    const onApplySpec = vi.fn<(spec: VideoEditSpec) => void>();
    const callbacks = {
      onCropStart: vi.fn(),
      onCropChange: vi.fn(),
      onCropCommit: vi.fn(),
    };
    const view = render(
      <PreviewHarness
        {...callbacks}
        activeTool="rotate"
        splitComparison
        onApplySpec={onApplySpec}
      />,
    );
    const video = screen.getByTestId('source-video');

    expect(
      getComputedStyle(view.container.querySelector('[data-video-edit-frame]')!).clipPath,
    ).toBe('inset(0 50% 0 0)');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right 90 degrees' }));
    expect(onApplySpec).toHaveBeenCalledWith(expect.objectContaining({ rotation: 90 }));
    expect(screen.getByLabelText('On-frame rotation controls')).toBeVisible();
    expect(screen.getByTestId('source-video')).toBe(video);
  });

  it('composites the subtitles covering the playhead, re-rasterizing only when the set changes', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      HTMLMediaElement.HAVE_CURRENT_DATA,
    );
    const callbacks = { onCropStart: vi.fn(), onCropChange: vi.fn(), onCropCommit: vi.fn() };
    const cue = (id: string, text: string, startMs: number, endMs: number): SubtitleCue => ({
      id,
      text,
      startMs,
      endMs,
      placement: 'bottom',
    });
    const cues = [cue('a', 'Hello', 0, 2_000), cue('b', 'World', 1_500, 3_000)];
    const drawn = scriptedOverlayContext();

    const view = render(<PreviewHarness {...callbacks} activeTool="rotate" subtitles={cues} />);
    const video = screen.getByTestId<HTMLVideoElement>('source-video');
    // The first draw happens at mount, with the playhead at zero.
    expect(drawn).toEqual([['Hello']]);
    expect(shader.renderer.setOverlay).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement));
    expect(shader.renderer.render).toHaveBeenCalled();

    video.currentTime = 1.7;
    view.rerender(<PreviewHarness {...callbacks} activeTool="rotate" subtitles={[...cues]} />);
    // Both cues are on screen; the later one stacks above the earlier, so it is drawn first.
    expect(drawn).toEqual([['Hello'], ['World', 'Hello']]);

    // The same set on the next draw is not rasterized again.
    view.rerender(<PreviewHarness {...callbacks} activeTool="rotate" subtitles={[...cues]} />);
    expect(drawn).toEqual([['Hello'], ['World', 'Hello']]);

    video.currentTime = 3.5;
    view.rerender(<PreviewHarness {...callbacks} activeTool="rotate" subtitles={[...cues]} />);
    expect(drawn).toEqual([['Hello'], ['World', 'Hello']]);
    expect(shader.renderer.setOverlay).toHaveBeenLastCalledWith(null);
    // Every overlay upload reused the one canvas.
    const overlays = shader.renderer.setOverlay.mock.calls
      .map(([overlay]) => overlay)
      .filter((overlay) => overlay !== null);
    expect(new Set(overlays).size).toBe(1);
  });

  it('keeps playback looped within the trim bounds while the external timeline owns transport', () => {
    const onPlayheadChange = vi.fn<(playheadMs: number) => void>();
    render(
      <PreviewHarness
        onCropStart={vi.fn()}
        onCropChange={vi.fn()}
        onCropCommit={vi.fn()}
        onPlayheadChange={onPlayheadChange}
      />,
    );
    const video = screen.getByTestId<HTMLVideoElement>('source-video');
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    Object.defineProperties(video, {
      paused: { configurable: true, value: true },
      play: { configurable: true, value: play },
      pause: { configurable: true, value: pause },
    });
    video.currentTime = 1.2;
    fireEvent.timeUpdate(video);
    expect(onPlayheadChange).toHaveBeenCalledWith(1_200);

    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.currentTime = 10;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();
    expect(pause).not.toHaveBeenCalled();
  });
});
