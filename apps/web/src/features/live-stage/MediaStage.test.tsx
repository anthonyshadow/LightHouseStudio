// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { MediaStage, type MediaStageProps } from './MediaStage';

class FakeTrack extends EventTarget {
  public readyState: MediaStreamTrackState = 'live';

  constructor(
    public readonly kind: 'video' | 'audio',
    public readonly label: string,
    private readonly settings: MediaTrackSettings = {},
  ) {
    super();
  }

  getSettings(): MediaTrackSettings {
    return this.settings;
  }

  end(): void {
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }
}

class FakeStream extends EventTarget {
  constructor(private readonly tracks: FakeTrack[]) {
    super();
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks] as unknown as MediaStreamTrack[];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'video') as unknown as MediaStreamTrack[];
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio') as unknown as MediaStreamTrack[];
  }
}

const defaultProps: MediaStageProps = {
  stream: null,
  mode: 'local',
  lifecycle: 'idle',
  transformed: false,
  liveSeconds: 0,
  generationSeconds: 0,
  recording: false,
  recordingSeconds: 0,
};

const stage = (props: Partial<MediaStageProps> = {}) => (
  <StudioDesignProvider>
    <MediaStage {...defaultProps} {...props} />
  </StudioDesignProvider>
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MediaStage', () => {
  it('keeps one video element mounted while streams and presentation modes change', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const localStream = new FakeStream([
      new FakeTrack('video', 'FaceTime HD', { width: 1280, height: 720, frameRate: 30 }),
      new FakeTrack('audio', 'Built-in Microphone'),
    ]) as unknown as MediaStream;
    const transformedStream = new FakeStream([
      new FakeTrack('video', 'Decart output', { width: 1920, height: 1080, frameRate: 29.97 }),
      new FakeTrack('audio', 'Provider audio'),
    ]) as unknown as MediaStream;

    const view = render(stage({ stream: localStream, lifecycle: 'ready', liveSeconds: 7 }));
    const firstVideo = view.container.querySelector('video');

    expect(firstVideo).not.toBeNull();
    expect(firstVideo).toHaveAttribute('data-media-fit', 'contain');
    expect(firstVideo).toHaveAttribute('data-mirrored', 'true');
    expect(firstVideo?.srcObject).toBe(localStream);
    expect(screen.getByText('1280 × 720 · 30 fps')).toBeInTheDocument();
    expect(screen.getByTitle('1280 × 720 · 30 fps — FaceTime HD')).toBeInTheDocument();
    expect(screen.getByText('Local Camera')).toBeInTheDocument();

    view.rerender(
      stage({
        stream: transformedStream,
        mode: 'lucy-2.5',
        lifecycle: 'generating',
        transformed: true,
        liveSeconds: 8,
        generationSeconds: 3,
      }),
    );

    const secondVideo = view.container.querySelector('video');
    expect(secondVideo).toBe(firstVideo);
    expect(secondVideo).toHaveAttribute('data-mirrored', 'false');
    expect(secondVideo?.srcObject).toBe(transformedStream);
    expect(screen.getByText('1920 × 1080 · 29.97 fps')).toBeInTheDocument();
    expect(screen.getByText('Character · AI output')).toBeInTheDocument();

    view.rerender(stage());
    expect(view.container.querySelector('video')).toBe(firstVideo);
    expect(firstVideo?.srcObject).toBeNull();
    expect(screen.getByText('Your private creative stage.')).toBeInTheDocument();
  });

  it('reports an ended video track truthfully without removing the stable video node', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const track = new FakeTrack('video', 'Studio camera', {
      width: 640,
      height: 360,
      frameRate: 24,
    });
    const stream = new FakeStream([track]) as unknown as MediaStream;
    const view = render(stage({ stream, lifecycle: 'ready' }));
    const video = view.container.querySelector('video');

    expect(video).toHaveAttribute('aria-hidden', 'false');
    act(() => track.end());

    expect(video).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Video idle')).toBeInTheDocument();
    expect(view.container.querySelector('video')).toBe(video);
  });

  it('exposes elapsed recording time as a queryable timer without live-region chatter', () => {
    render(
      stage({
        lifecycle: 'ready',
        recording: true,
        recordingSeconds: 65,
      }),
    );

    expect(screen.getByRole('timer', { name: 'Recording elapsed time 1:05' })).toHaveAttribute(
      'aria-live',
      'off',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Local preview');
  });

  it('uses concise, mode-specific private guidance without starting any media work', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const view = render(stage({ mode: 'lucy-2.5' }));

    expect(screen.getByText('Your character, your story.')).toBeInTheDocument();
    expect(
      screen.getByText(/Camera and AI remain off until you explicitly start/),
    ).toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();

    view.rerender(stage({ mode: 'lucy-vton-3' }));
    expect(screen.getByText('Your private try-on stage.')).toBeInTheDocument();
    expect(screen.getByText(/provider session remain off until you start/)).toBeInTheDocument();
  });
});
