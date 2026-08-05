// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVideoEditSpec, type VideoEditSpec } from '@studio/domain';
import { StudioDesignProvider } from '../../ui';
import { VideoEditStagePreview } from './VideoEditStagePreview';

vi.mock('./videoEditShader', () => ({
  createVideoEditFrameRenderer: () => ({ render: vi.fn(), dispose: vi.fn() }),
}));

afterEach(cleanup);

const PreviewHarness = ({
  showingBefore = false,
  onCropStart,
  onCropChange,
  onCropCommit,
  onPlayheadChange = vi.fn(),
}: {
  showingBefore?: boolean;
  onCropStart: () => void;
  onCropChange: (spec: VideoEditSpec) => void;
  onCropCommit: () => void;
  onPlayheadChange?: (playheadMs: number) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [spec, setSpec] = useState<VideoEditSpec>({
    ...createDefaultVideoEditSpec(10_000),
    crop: {
      preset: 'freeform',
      rectangle: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    },
  });
  return (
    <StudioDesignProvider>
      <video ref={videoRef} data-testid="source-video">
        <track kind="captions" />
      </video>
      <VideoEditStagePreview
        videoRef={videoRef}
        contract={{
          spec,
          sourceWidth: 1_280,
          sourceHeight: 720,
          activeTool: 'crop',
          showingBefore,
          playheadMs: 0,
          onPlayheadChange,
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

  it('scrubs, loops within trim bounds, and uses the custom playback control', () => {
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
    video.currentTime = 12;

    fireEvent.click(screen.getByRole('button', { name: 'Play edited preview' }));
    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByRole('slider', { name: 'Edited preview playhead' }), {
      target: { value: '1200' },
    });
    expect(video.currentTime).toBe(1.2);
    expect(onPlayheadChange).toHaveBeenCalledWith(1_200);

    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    video.currentTime = 10;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(2);

    fireEvent.play(video);
    fireEvent.click(screen.getByRole('button', { name: 'Pause edited preview' }));
    expect(pause).toHaveBeenCalledOnce();
  });
});
