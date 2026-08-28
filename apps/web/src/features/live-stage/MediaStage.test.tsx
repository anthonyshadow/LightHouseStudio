// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { RecordingArtifact } from '../recording/types';
import {
  MediaStage,
  STAGE_CONTROLS_IDLE_TIMEOUT_MS,
  type MediaStageProps,
  type StageControlVisibility,
  type StagePresentation,
} from './MediaStage';

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

const controlProbe = ({ visible }: StageControlVisibility) => (
  <section
    aria-label="Test stage controls"
    aria-hidden={visible ? undefined : true}
    data-control-visibility={visible ? 'visible' : 'hidden'}
    inert={!visible}
  >
    <button type="button">Recovered action</button>
  </section>
);

beforeEach(() => {
  vi.useRealTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document, 'fullscreenElement');
  Reflect.deleteProperty(document, 'exitFullscreen');
  Reflect.deleteProperty(Element.prototype, 'requestFullscreen');
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
    expect(firstStage).toHaveAttribute('data-stage-aspect-ratio', '16:9');

    view.rerender(
      stage({
        presentation: {
          kind: 'live',
          stream: localStream,
          origin: 'local',
          mirrored: true,
        },
        lifecycle: 'ready',
      }),
    );

    expect(view.container.querySelector('video')).toBe(firstVideo);
    expect(screen.getByRole('figure', { name: 'Studio media stage' })).toBe(firstStage);
    expect(firstVideo).toHaveAttribute('data-mirrored', 'true');
    expect(firstVideo?.srcObject).toBe(localStream);
    expect(firstVideo?.muted).toBe(true);
    expect(firstVideo?.controls).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('Local preview');

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
        presentation: {
          kind: 'playback',
          artifact: processed,
          controlsLocked: true,
          processingOperation: {
            kind: 'voice-conversion',
            title: 'Applying Northstar Narrator…',
            detail: 'Converting the immutable original audio for the selected result.',
          },
        },
        lifecycle: 'idle',
      }),
    );

    expect(firstVideo?.controls).toBe(false);
    expect(firstVideo).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Applying Northstar Narrator…')).toBeInTheDocument();
    expect(
      screen.getByText('Converting the immutable original audio for the selected result.'),
    ).toBeInTheDocument();

    view.rerender(stage());
    expect(view.container.querySelector('video')).toBe(firstVideo);
    expect(screen.getByRole('figure', { name: 'Studio media stage' })).toBe(firstStage);
    expect(firstVideo?.srcObject).toBeNull();
    expect(firstVideo).not.toHaveAttribute('src');
    expect(screen.getByText('Your private creative stage.')).toBeInTheDocument();
  });

  it('switches the persistent stage frame to portrait without replacing its video node', () => {
    const view = render(stage());
    const video = view.container.querySelector('video');

    view.rerender(stage({ aspectRatio: '9:16' }));

    expect(view.container.querySelector('video')).toBe(video);
    expect(screen.getByRole('figure', { name: 'Studio media stage' })).toHaveAttribute(
      'data-stage-aspect-ratio',
      '9:16',
    );
  });

  it('keeps supplied stage controls mounted below and outside the video frame', () => {
    render(
      stage({
        presentation: {
          kind: 'playback',
          artifact: artifact('take-with-controls'),
          controlsLocked: false,
        },
        controls: <button type="button">Review action</button>,
      }),
    );

    const mediaStage = screen.getByRole('figure', { name: 'Studio media stage' });
    const stageFrame = mediaStage.querySelector('[data-stage-frame]');
    const controlsRegion = mediaStage.querySelector('[data-stage-controls-region]');
    const reviewAction = screen.getByRole('button', { name: 'Review action' });

    expect(stageFrame).not.toBeNull();
    expect(controlsRegion).toContainElement(reviewAction);
    expect(stageFrame).not.toContainElement(reviewAction);
  });

  it('uses the supplied stage workspace as the fullscreen boundary', () => {
    Object.defineProperty(document, 'fullscreenEnabled', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      writable: true,
      value: null,
    });
    const requestFullscreen = vi.fn(function (this: Element) {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        writable: true,
        value: this,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    const exitFullscreen = vi.fn(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        writable: true,
        value: null,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    });
    Object.defineProperty(Element.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    });

    const FullscreenHarness = () => {
      const fullscreenTargetRef = useRef<HTMLDivElement>(null);
      return (
        <StudioDesignProvider>
          <div ref={fullscreenTargetRef} data-testid="fullscreen-workspace">
            <MediaStage {...defaultProps} fullscreenTargetRef={fullscreenTargetRef} />
          </div>
        </StudioDesignProvider>
      );
    };

    render(<FullscreenHarness />);
    const fullscreenButton = screen.getByRole('button', { name: 'View stage fullscreen' });
    const fullscreenWorkspace = screen.getByTestId('fullscreen-workspace');

    fireEvent.click(fullscreenButton);

    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(requestFullscreen.mock.instances[0]).toBe(fullscreenWorkspace);
    expect(screen.getByRole('button', { name: 'Exit stage fullscreen' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Exit stage fullscreen' }));
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'View stage fullscreen' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('owns the idle timeout and restores controls from pointer, touch, focus, and keyboard activity', () => {
    vi.useFakeTimers();
    const localStream = new FakeStream([
      new FakeTrack('video', 'Studio camera'),
    ]) as unknown as MediaStream;
    const view = render(
      stage({
        presentation: {
          kind: 'live',
          stream: localStream,
          origin: 'local',
          mirrored: true,
        },
        lifecycle: 'ready',
        controls: controlProbe,
      }),
    );
    const mediaStage = screen.getByRole('figure', { name: 'Studio media stage' });
    const controls = view.container.querySelector('[aria-label="Test stage controls"]');

    expect(controls).toHaveAttribute('data-control-visibility', 'visible');

    act(() => {
      vi.advanceTimersByTime(STAGE_CONTROLS_IDLE_TIMEOUT_MS - 1);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');

    fireEvent.pointerMove(mediaStage);
    act(() => {
      vi.advanceTimersByTime(STAGE_CONTROLS_IDLE_TIMEOUT_MS - 1);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'hidden');
    expect(controls).toHaveAttribute('aria-hidden', 'true');
    expect(controls).toHaveAttribute('inert');

    fireEvent.pointerDown(mediaStage, { pointerType: 'touch' });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    act(() => {
      vi.advanceTimersByTime(STAGE_CONTROLS_IDLE_TIMEOUT_MS);
    });

    fireEvent.touchStart(mediaStage);
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    act(() => {
      vi.advanceTimersByTime(STAGE_CONTROLS_IDLE_TIMEOUT_MS);
    });

    fireEvent.focusIn(mediaStage);
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    act(() => {
      vi.advanceTimersByTime(STAGE_CONTROLS_IDLE_TIMEOUT_MS);
    });

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    expect(controls).not.toHaveAttribute('aria-hidden');
    expect(controls).not.toHaveAttribute('inert');
  });

  it('keeps one activity-listener set, cleans it up, and never schedules hiding while recording', () => {
    vi.useFakeTimers();
    const addEventListener = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const removeEventListener = vi.spyOn(EventTarget.prototype, 'removeEventListener');
    const windowAddEventListener = vi.spyOn(window, 'addEventListener');
    const windowRemoveEventListener = vi.spyOn(window, 'removeEventListener');
    const localStream = new FakeStream([
      new FakeTrack('video', 'Studio camera'),
    ]) as unknown as MediaStream;
    const props: Partial<MediaStageProps> = {
      presentation: {
        kind: 'live',
        stream: localStream,
        origin: 'local',
        mirrored: true,
      },
      lifecycle: 'ready',
      recording: true,
      controls: controlProbe,
    };
    const view = render(stage(props));
    const mediaStage = screen.getByRole('figure', { name: 'Studio media stage' });
    const controls = view.container.querySelector('[aria-label="Test stage controls"]');

    act(() => {
      vi.advanceTimersByTime(STAGE_CONTROLS_IDLE_TIMEOUT_MS * 2);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');

    view.rerender(stage({ ...props, recording: false }));
    const stageListenerCalls = addEventListener.mock.calls
      .map((call, index) => ({ call, target: addEventListener.mock.instances[index] }))
      .filter(({ target }) => target === mediaStage)
      .map(({ call }) => call[0])
      .filter((type) =>
        ['pointermove', 'pointerdown', 'touchstart', 'focusin'].includes(String(type)),
      );
    expect(stageListenerCalls).toEqual(['pointermove', 'pointerdown', 'touchstart', 'focusin']);
    const windowKeydownCalls = windowAddEventListener.mock.calls.filter(
      (call) => call[0] === 'keydown',
    );
    expect(windowKeydownCalls).toHaveLength(1);

    view.rerender(stage({ ...props, recording: false }));
    const repeatedStageListenerCalls = addEventListener.mock.calls
      .map((call, index) => ({ call, target: addEventListener.mock.instances[index] }))
      .filter(({ target }) => target === mediaStage)
      .map(({ call }) => call[0])
      .filter((type) =>
        ['pointermove', 'pointerdown', 'touchstart', 'focusin'].includes(String(type)),
      );
    expect(repeatedStageListenerCalls).toEqual(stageListenerCalls);
    expect(windowAddEventListener.mock.calls.filter((call) => call[0] === 'keydown')).toHaveLength(
      1,
    );

    view.unmount();
    const removedStageListeners = removeEventListener.mock.calls
      .map((call, index) => ({ call, target: removeEventListener.mock.instances[index] }))
      .filter(({ target }) => target === mediaStage)
      .map(({ call }) => call[0])
      .filter((type) =>
        ['pointermove', 'pointerdown', 'touchstart', 'focusin'].includes(String(type)),
      );
    expect(removedStageListeners).toEqual(stageListenerCalls);
    expect(
      windowRemoveEventListener.mock.calls.filter((call) => call[0] === 'keydown'),
    ).toHaveLength(1);
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
    expect(
      screen.getByText('Camera unavailable', { selector: '[data-stage-status-long]' }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText('Finalizing take', { selector: '[data-stage-status-long]' }),
    ).toBeInTheDocument();
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

    expect(
      screen.getByRole('timer', {
        name: 'Recording elapsed time 1:05, maximum 5:00, 3:55 remaining',
      }),
    ).toHaveAttribute('aria-live', 'off');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('marks the recording timer as warning state at the independent pre-limit threshold', () => {
    render(
      stage({
        lifecycle: 'ready',
        recording: true,
        recordingSeconds: 270,
      }),
    );

    expect(
      screen.getByRole('timer', {
        name: 'Recording elapsed time 4:30, maximum 5:00, 0:30 remaining',
      }),
    ).toHaveAttribute('data-recording-duration-status', 'warning');
  });

  it('shows the independent AI maximum and remaining time while recording', () => {
    render(
      stage({
        lifecycle: 'generating',
        recording: true,
        recordingSeconds: 65,
        realtimeSessionTiming: {
          status: 'active',
          maximumSeconds: 300,
          elapsedSeconds: 270,
          remainingSeconds: 30,
          warning: true,
        },
      }),
    );

    expect(
      screen.getByRole('timer', {
        name: 'Recording elapsed time 1:05, maximum 5:00, 3:55 remaining',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('timer', {
        name: 'AI session maximum 5:00, elapsed 4:30, 0:30 remaining',
      }),
    ).toHaveTextContent('AI 4:30 / 5:00 · 0:30 left');
  });

  it('uses concise, mode-specific private guidance without starting any media work', () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    const view = render(
      stage({
        presentation: { kind: 'idle', mode: 'lucy-latest' },
        mode: 'lucy-latest',
      }),
    );

    expect(screen.getByText('Your character, your story.')).toBeInTheDocument();
    expect(
      screen.getByText(/Camera and AI remain off until you explicitly start/),
    ).toBeInTheDocument();
    expect(play).not.toHaveBeenCalled();

    view.rerender(
      stage({
        presentation: { kind: 'idle', mode: 'lucy-vton-latest' },
        mode: 'lucy-vton-latest',
      }),
    );
    expect(screen.getByText('Your private try-on stage.')).toBeInTheDocument();
    expect(screen.getByText(/provider session remain off until you start/)).toBeInTheDocument();
  });

  it('describes where capture is stored from the deployment, not from the creative mode', () => {
    const view = render(stage({ mediaPersistence: 'browser-only' }));

    expect(
      screen.getByText(
        'Camera and microphone remain off until you select Start camera. Nothing leaves this browser in Local mode.',
      ),
    ).toBeInTheDocument();

    view.rerender(stage({ mediaPersistence: 'account' }));
    expect(
      screen.getByText(
        'Camera and microphone remain off until you select Start camera. Work you save is stored in your account.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing leaves this browser/)).not.toBeInTheDocument();
  });

  it('claims no local guarantee while the capability read is unresolved', () => {
    render(stage());

    expect(screen.getByText('Your private creative stage.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Camera and microphone remain off until you select Start camera. Work you save is stored in your account.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing leaves this browser/)).not.toBeInTheDocument();
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
