// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { RecordingArtifact } from '../recording/types';
import { MediaStage, type MediaStageProps, type StagePresentation } from './MediaStage';

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

const idlePresentation: StagePresentation = { kind: 'idle', mode: 'local' };

const defaultProps: MediaStageProps = {
  presentation: idlePresentation,
  mode: 'local',
  lifecycle: 'idle',
  liveSeconds: 0,
  generationSeconds: 0,
  recording: false,
  recordingSeconds: 0,
};

const artifact = (id: string, objectUrl = `blob:${id}`): RecordingArtifact => ({
  id,
  media: new Blob(['take'], { type: 'video/webm' }),
  objectUrl,
  mimeType: 'video/webm',
  filename: `${id}.webm`,
  sourceModeId: 'local',
  startedAt: '2026-07-18T14:00:00.000Z',
  durationMs: 8_000,
  sizeBytes: 4,
});

const stage = (props: Partial<MediaStageProps> = {}) => (
  <StudioDesignProvider>
    <MediaStage {...defaultProps} {...props} />
  </StudioDesignProvider>
);

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MediaStage', () => {
  it('keeps one video node through live, finalizing, playback, processing, and idle', () => {
    const localStream = new FakeStream([
      new FakeTrack('video', 'FaceTime HD', { width: 1280, height: 720, frameRate: 30 }),
      new FakeTrack('audio', 'Built-in Microphone'),
    ]) as unknown as MediaStream;
    const original = artifact('take-original');
    const processed = artifact('take-processed');

    const view = render(stage());
    const firstVideo = view.container.querySelector('video');
    const firstStage = screen.getByRole('figure', { name: 'Studio media stage' });

    expect(firstVideo).not.toBeNull();
    expect(firstVideo).toHaveAttribute('data-media-fit', 'contain');

    view.rerender(
      stage({
        presentation: {
          kind: 'live',
          stream: localStream,
          origin: 'local',
          mirrored: true,
        },
        lifecycle: 'ready',
        liveSeconds: 7,
      }),
    );

    expect(view.container.querySelector('video')).toBe(firstVideo);
    expect(screen.getByRole('figure', { name: 'Studio media stage' })).toBe(firstStage);
    expect(firstVideo).toHaveAttribute('data-mirrored', 'true');
    expect(firstVideo?.srcObject).toBe(localStream);
    expect(firstVideo?.muted).toBe(true);
    expect(firstVideo?.controls).toBe(false);
    expect(screen.getByText('1280 × 720 · 30 fps')).toBeInTheDocument();

    view.rerender(
      stage({
        presentation: { kind: 'finalizing', retainedStream: null, startedAt: 1_721_312_000_000 },
        lifecycle: 'ready',
      }),
    );

    expect(view.container.querySelector('video')).toBe(firstVideo);
    expect(firstVideo?.srcObject).toBe(localStream);
    expect(screen.getByText('Finalizing take…')).toBeInTheDocument();
    expect(firstStage).toHaveAttribute('aria-busy', 'true');

    view.rerender(
      stage({
        presentation: { kind: 'playback', artifact: original, controlsLocked: false },
        lifecycle: 'idle',
      }),
    );

    expect(view.container.querySelector('video')).toBe(firstVideo);
    expect(firstVideo?.srcObject).toBeNull();
    expect(firstVideo).toHaveAttribute('src', original.objectUrl);
    expect(firstVideo).toHaveAttribute('data-mirrored', 'false');
    expect(firstVideo?.muted).toBe(false);
    expect(firstVideo?.controls).toBe(true);
    expect(firstVideo).toHaveAccessibleName('Recorded take playback');

    if (firstVideo) firstVideo.currentTime = 4.25;
    view.rerender(
      stage({
        presentation: { kind: 'playback', artifact: processed, controlsLocked: false },
        lifecycle: 'idle',
      }),
    );
    fireEvent(firstVideo!, new Event('loadedmetadata'));

    expect(view.container.querySelector('video')).toBe(firstVideo);
    expect(firstVideo).toHaveAttribute('src', processed.objectUrl);
    expect(firstVideo?.currentTime).toBe(4.25);

    view.rerender(
      stage({
        presentation: { kind: 'playback', artifact: processed, controlsLocked: true },
        lifecycle: 'idle',
      }),
    );

    expect(firstVideo?.controls).toBe(false);
    expect(firstVideo).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Processing voice treatment…')).toBeInTheDocument();

    view.rerender(stage());
    expect(view.container.querySelector('video')).toBe(firstVideo);
    expect(screen.getByRole('figure', { name: 'Studio media stage' })).toBe(firstStage);
    expect(firstVideo?.srcObject).toBeNull();
    expect(firstVideo).not.toHaveAttribute('src');
    expect(screen.getByText('Your private creative stage.')).toBeInTheDocument();
  });

  it('reports an ended video track truthfully without removing the stable video node', () => {
    const track = new FakeTrack('video', 'Studio camera', {
      width: 640,
      height: 360,
      frameRate: 24,
    });
    const stream = new FakeStream([track]) as unknown as MediaStream;
    const view = render(
      stage({
        presentation: { kind: 'live', stream, origin: 'local', mirrored: true },
        lifecycle: 'ready',
      }),
    );
    const video = view.container.querySelector('video');

    expect(video).toHaveAttribute('aria-hidden', 'false');
    act(() => track.end());

    expect(video).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Video idle')).toBeInTheDocument();
    expect(view.container.querySelector('video')).toBe(video);
  });

  it('does not claim an audio-only stream has a retained final frame', () => {
    const stream = new FakeStream([
      new FakeTrack('audio', 'Desk microphone'),
    ]) as unknown as MediaStream;
    const view = render(
      stage({
        presentation: { kind: 'live', stream, origin: 'local', mirrored: false },
        lifecycle: 'ready',
      }),
    );

    view.rerender(
      stage({
        presentation: { kind: 'finalizing', retainedStream: stream, startedAt: 1 },
        lifecycle: 'ready',
      }),
    );

    expect(view.container.querySelector('video')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Video idle')).toBeInTheDocument();
    expect(screen.queryByText('Last live frame')).not.toBeInTheDocument();
    expect(screen.getByText('Finalizing take…')).toBeInTheDocument();
  });

  it('does not describe an ended retained video track as live while finalizing', () => {
    const track = new FakeTrack('video', 'Studio camera');
    const stream = new FakeStream([track]) as unknown as MediaStream;
    const view = render(
      stage({
        presentation: { kind: 'live', stream, origin: 'local', mirrored: false },
        lifecycle: 'ready',
      }),
    );

    act(() => track.end());
    view.rerender(
      stage({
        presentation: { kind: 'finalizing', retainedStream: null, startedAt: 1 },
        lifecycle: 'ready',
      }),
    );

    expect(view.container.querySelector('video')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('Last live frame')).not.toBeInTheDocument();
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
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const view = render(
      stage({
        presentation: { kind: 'idle', mode: 'lucy-2.5' },
        mode: 'lucy-2.5',
      }),
    );

    expect(screen.getByText('Your character, your story.')).toBeInTheDocument();
    expect(
      screen.getByText(/Camera and AI remain off until you explicitly start/),
    ).toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();

    view.rerender(
      stage({
        presentation: { kind: 'idle', mode: 'lucy-vton-3' },
        mode: 'lucy-vton-3',
      }),
    );
    expect(screen.getByText('Your private try-on stage.')).toBeInTheDocument();
    expect(screen.getByText(/provider session remain off until you start/)).toBeInTheDocument();
  });

  it('prioritizes at most two stage notices and wires their actions', () => {
    const retry = vi.fn();
    const dismiss = vi.fn();
    render(
      stage({
        notices: [
          { id: 'info', severity: 'info', title: 'Helpful note' },
          {
            id: 'camera',
            severity: 'error',
            title: 'Camera unavailable',
            action: { label: 'Retry', onAction: retry },
            onDismiss: dismiss,
          },
          { id: 'network', severity: 'warning', title: 'Connection interrupted' },
        ],
      }),
    );

    expect(screen.getByRole('alert', { name: /Camera unavailable/ })).toBeInTheDocument();
    expect(screen.getByText('Connection interrupted')).toBeInTheDocument();
    expect(screen.queryByText('Helpful note')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Camera unavailable' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it('surfaces playback errors without replacing the recorded video node', () => {
    const onPlaybackError = vi.fn();
    const view = render(
      stage({
        presentation: { kind: 'playback', artifact: artifact('broken'), controlsLocked: false },
        onPlaybackError,
      }),
    );
    const video = view.container.querySelector('video');

    fireEvent.error(video!);

    expect(screen.getByRole('alert')).toHaveTextContent('Playback unavailable');
    expect(onPlaybackError).toHaveBeenCalledWith(expect.stringContaining('could not be loaded'));
    expect(view.container.querySelector('video')).toBe(video);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledOnce();
    expect(screen.queryByText('Playback unavailable')).not.toBeInTheDocument();

    fireEvent.error(video!);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Playback unavailable' }));
    expect(screen.queryByText('Playback unavailable')).not.toBeInTheDocument();
  });
});
