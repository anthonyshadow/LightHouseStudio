// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingSource } from '../../features/recording/types';
import { useRecording } from './useRecording';

type RecorderListener = (event: { data: Blob }) => void;

type TrackOptions = {
  label?: string;
  settings?: MediaTrackSettings;
  capabilities?: MediaTrackCapabilities;
  getSettingsError?: boolean;
  getCapabilitiesError?: boolean;
};

const createTrack = (kind: 'video' | 'audio', options: TrackOptions = {}): MediaStreamTrack =>
  ({
    kind,
    label: options.label ?? '',
    readyState: 'live',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    stop: vi.fn(),
    getSettings: vi.fn(() => {
      if (options.getSettingsError) throw new Error('settings unavailable');
      return options.settings ?? {};
    }),
    getCapabilities: vi.fn(() => {
      if (options.getCapabilitiesError) throw new Error('capabilities unavailable');
      return options.capabilities ?? {};
    }),
  }) as unknown as MediaStreamTrack;

const createSource = ({
  video = {},
  audio = {},
  videoSource = 'local',
  audioSource = 'microphone',
}: {
  video?: TrackOptions;
  audio?: TrackOptions | null;
  videoSource?: RecordingSource['videoSource'];
  audioSource?: RecordingSource['audioSource'];
} = {}): RecordingSource => {
  const videoTrack = createTrack('video', video);
  const audioTrack = audio ? createTrack('audio', audio) : null;
  return {
    stream: {
      getTracks: () => (audioTrack ? [videoTrack, audioTrack] : [videoTrack]),
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => (audioTrack ? [audioTrack] : []),
    } as unknown as MediaStream,
    videoSource,
    audioSource,
  };
};

type RecorderHarness = {
  recorderConstructor: ReturnType<typeof vi.fn>;
  streamConstructor: ReturnType<typeof vi.fn>;
};

const installRecorderHarness = ({
  defaultRecorderMime = 'video/webm',
  errorOnStartCall,
  failRecorderCall,
  failStreamConstruction = false,
  hangStopCall,
  mainChunkMime,
  supportedMime = true,
  unexpectedStopOnStartCall,
}: {
  defaultRecorderMime?: string;
  errorOnStartCall?: number;
  failRecorderCall?: number;
  failStreamConstruction?: boolean;
  hangStopCall?: number;
  mainChunkMime?: string;
  supportedMime?: boolean;
  unexpectedStopOnStartCall?: number;
} = {}): RecorderHarness => {
  let recorderCalls = 0;
  const recorderConstructor = vi.fn();
  const streamConstructor = vi.fn();

  class FakeMediaStream {
    private readonly tracks: MediaStreamTrack[];

    constructor(tracks: MediaStreamTrack[] = []) {
      streamConstructor(tracks);
      if (failStreamConstruction) throw new Error('sidecar stream unsupported');
      this.tracks = tracks;
    }

    getTracks(): MediaStreamTrack[] {
      return this.tracks;
    }

    getVideoTracks(): MediaStreamTrack[] {
      return this.tracks.filter((track) => track.kind === 'video');
    }

    getAudioTracks(): MediaStreamTrack[] {
      return this.tracks.filter((track) => track.kind === 'audio');
    }
  }

  class FakeMediaRecorder {
    static isTypeSupported = vi.fn().mockReturnValue(supportedMime);

    readonly mimeType: string;
    state: RecordingState = 'inactive';
    private readonly listeners = new Map<string, Set<RecorderListener>>();
    private readonly callIndex: number;

    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
      recorderCalls += 1;
      this.callIndex = recorderCalls;
      recorderConstructor(_stream, options);
      if (recorderCalls === failRecorderCall) throw new Error('recorder construction failed');
      this.mimeType = options?.mimeType ?? defaultRecorderMime;
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      const callback =
        typeof listener === 'function'
          ? (listener as unknown as RecorderListener)
          : (event: { data: Blob }) => listener.handleEvent(event as unknown as Event);
      const listeners = this.listeners.get(type) ?? new Set<RecorderListener>();
      listeners.add(callback);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      if (typeof listener === 'function') {
        this.listeners.get(type)?.delete(listener as unknown as RecorderListener);
      }
    }

    start(): void {
      this.state = 'recording';
      if (this.callIndex === errorOnStartCall) {
        queueMicrotask(() => this.emit('error', { data: new Blob() }));
      }
      if (this.callIndex === unexpectedStopOnStartCall) {
        queueMicrotask(() => {
          this.state = 'inactive';
          this.emit('dataavailable', {
            data: new Blob(['recorded-video'], { type: mainChunkMime ?? this.mimeType }),
          });
          this.emit('stop', { data: new Blob() });
        });
      }
    }

    stop(): void {
      if (this.state === 'inactive') return;
      this.state = 'inactive';
      if (this.callIndex === hangStopCall) return;
      queueMicrotask(() => {
        this.emit('dataavailable', {
          data: new Blob(['recorded-video'], {
            type: this.callIndex === 1 ? (mainChunkMime ?? this.mimeType) : this.mimeType,
          }),
        });
        this.emit('stop', { data: new Blob() });
      });
    }

    private emit(type: string, event: { data: Blob }): void {
      this.listeners.get(type)?.forEach((listener) => listener(event));
    }
  }

  vi.stubGlobal('MediaStream', FakeMediaStream);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn().mockReturnValue('blob:recording'),
    revokeObjectURL: vi.fn(),
  });
  return { recorderConstructor, streamConstructor };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useRecording recorder construction failures', () => {
  it.each([
    ['sidecar MediaStream', { failStreamConstruction: true }],
    ['sidecar MediaRecorder', { failRecorderCall: 2 }],
  ])('records and finalizes video when %s construction fails', async (_label, failure) => {
    const harness = installRecorderHarness(failure);
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(createSource(), 'local');
    });

    expect(result.current.lifecycle).toBe('recording');

    let artifact = null;
    await act(async () => {
      artifact = await result.current.stop();
    });

    expect(artifact).toMatchObject({
      mimeType: expect.stringContaining('video/'),
      sourceModeId: 'local',
    });
    expect(result.current.lifecycle).toBe('recorded');
    expect(result.current.original?.media.size).toBeGreaterThan(0);
    expect(result.current.sidecar).toMatchObject({
      state: 'error',
      blob: null,
      error: 'Audio sidecar capture is unavailable for this source.',
    });
    expect(harness.recorderConstructor).toHaveBeenCalled();

    unmount();
  });

  it('fails safely when the main MediaRecorder cannot be constructed', async () => {
    const harness = installRecorderHarness({ failRecorderCall: 1 });
    const source = createSource();
    const videoTrack = source.stream.getVideoTracks()[0];
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(source, 'local');
    });

    expect(result.current.lifecycle).toBe('error');
    expect(result.current.processingError).toBe(
      'The browser recorder could not use this media source or format.',
    );
    expect(result.current.original).toBeNull();
    expect(result.current.sidecar.state).toBe('unavailable');
    expect(harness.recorderConstructor).toHaveBeenCalledTimes(1);
    expect(harness.streamConstructor).not.toHaveBeenCalled();
    expect(videoTrack?.addEventListener).not.toHaveBeenCalled();

    await expect(result.current.stop()).resolves.toBeNull();
    unmount();
  });

  it('allows a recorder construction error to be retried with the same healthy source', async () => {
    installRecorderHarness({ failRecorderCall: 1 });
    const source = createSource();
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(source, 'local');
    });
    expect(result.current.lifecycle).toBe('error');

    await act(async () => {
      await result.current.start(source, 'local');
    });
    expect(result.current.lifecycle).toBe('recording');
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.lifecycle).toBe('recorded');
    unmount();
  });

  it('refuses to replace a take while voice processing owns the immutable sources', async () => {
    const harness = installRecorderHarness();
    const { result, unmount } = renderHook(() => useRecording());

    act(() => result.current.beginProcessing());
    expect(result.current.processingState).toBe('processing');

    await act(async () => {
      await result.current.start(createSource(), 'local');
    });

    expect(harness.recorderConstructor).not.toHaveBeenCalled();
    expect(result.current.lifecycle).toBe('idle');
    expect(result.current.processingState).toBe('processing');
    unmount();
  });

  it('finalizes after the React StrictMode setup and cleanup probe', async () => {
    installRecorderHarness();
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const { result, unmount } = renderHook(() => useRecording(), { wrapper });

    await act(async () => {
      await result.current.start(createSource(), 'local');
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.lifecycle).toBe('recorded');
    expect(result.current.original?.media.size).toBeGreaterThan(0);
    unmount();
  });

  it('preserves a valid video when the optional audio sidecar never finishes', async () => {
    vi.useFakeTimers();
    installRecorderHarness({ hangStopCall: 2 });
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(createSource(), 'local');
    });

    let stopping!: Promise<unknown>;
    act(() => {
      stopping = result.current.stop();
    });
    await act(async () => {
      vi.runAllTicks();
      await Promise.resolve();
      vi.advanceTimersByTime(1_500);
    });
    await stopping;

    expect(result.current.lifecycle).toBe('recorded');
    expect(result.current.original?.media.size).toBeGreaterThan(0);
    expect(result.current.sidecar).toMatchObject({
      state: 'error',
      error: 'Audio sidecar did not finish; the video take was preserved.',
    });

    unmount();
    vi.useRealTimers();
  });

  it('uses the emitted MP4 chunk type when a default recorder reports no MIME type', async () => {
    installRecorderHarness({
      defaultRecorderMime: '',
      mainChunkMime: 'video/mp4',
      supportedMime: false,
    });
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(createSource(), 'local');
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.original).toMatchObject({
      mimeType: 'video/mp4',
      filename: expect.stringMatching(/\.mp4$/),
    });
    expect(result.current.original?.media.type).toBe('video/mp4');
    unmount();
  });

  it('captures immutable start-time metadata, retains it for voice variants, and clears it on replacement or discard', async () => {
    installRecorderHarness();
    const settings: MediaTrackSettings = { width: 1_920, height: 1_080, frameRate: 29.97 };
    const source = createSource({
      video: { label: 'FaceTime HD Camera', settings },
      audio: { label: 'Studio Microphone' },
    });
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(source, 'local');
    });
    settings.width = 640;
    settings.height = 480;
    await act(async () => {
      await result.current.stop();
    });

    const originalMetadata = result.current.metadata;
    expect(originalMetadata).toMatchObject({
      mode: 'local',
      startedAt: result.current.original?.startedAt,
      width: 1_920,
      height: 1_080,
      frameRate: 29.97,
      videoSource: 'local',
      audioSource: 'microphone',
      videoSourceLabel: 'FaceTime HD Camera',
      audioSourceLabel: 'Studio Microphone',
    });
    expect(Object.isFrozen(originalMetadata)).toBe(true);

    act(() => {
      result.current.completeProcessing(new Blob(['processed']), 'video/webm', 'warm-studio');
    });
    expect(result.current.metadata).toBe(originalMetadata);

    await act(async () => {
      await result.current.start(
        createSource({
          video: { settings: { width: 1_280, height: 720, frameRate: 30 } },
          audio: null,
          videoSource: 'transformed',
          audioSource: 'none',
        }),
        'lucy-2.5',
      );
    });
    expect(result.current.metadata).toBeNull();
    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.metadata).toMatchObject({
      mode: 'lucy-2.5',
      width: 1_280,
      height: 720,
      frameRate: 30,
      videoSource: 'transformed',
      audioSource: 'none',
    });

    act(() => result.current.discard());
    expect(result.current.metadata).toBeNull();
    expect(result.current.presented).toBeNull();
    unmount();
  });

  it('records safely when track settings and capabilities throw', async () => {
    installRecorderHarness();
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(
        createSource({
          video: { getSettingsError: true, getCapabilitiesError: true },
          audio: null,
          audioSource: 'none',
        }),
        'local',
      );
      await result.current.stop();
    });

    expect(result.current.lifecycle).toBe('recorded');
    expect(result.current.metadata).toEqual({
      mode: 'local',
      startedAt: result.current.original?.startedAt,
      videoSource: 'local',
      audioSource: 'none',
    });
    unmount();
  });

  it('requires a fresh download after restoring the immutable original', async () => {
    installRecorderHarness();
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(createSource(), 'local');
      await result.current.stop();
    });
    act(() => {
      result.current.completeProcessing(new Blob(['processed']), 'video/webm', 'robot');
      result.current.markDownloaded();
    });
    expect(result.current.downloaded).toBe(true);

    act(() => result.current.restoreOriginal());
    expect(result.current.processed).toBeNull();
    expect(result.current.downloaded).toBe(false);
    unmount();
  });

  it('reports an ended model source so its owner can release the paid session', async () => {
    installRecorderHarness();
    const onAutomaticStop = vi.fn();
    const source = createSource();
    const videoTrack = source.stream.getVideoTracks()[0];
    const { result, unmount } = renderHook(() => useRecording({ onAutomaticStop }));

    await act(async () => {
      await result.current.start(source, 'lucy-2.5');
    });

    const endedListener = (
      videoTrack?.addEventListener as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.find(([type]) => type === 'ended')?.[1] as EventListener | undefined;
    expect(endedListener).toBeTypeOf('function');

    await act(async () => {
      endedListener?.(new Event('ended'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onAutomaticStop).toHaveBeenCalledOnce();
    expect(onAutomaticStop).toHaveBeenCalledWith({
      mode: 'lucy-2.5',
      reason: 'source-ended',
    });
    expect(result.current.lifecycle).toBe('recorded');
    unmount();
  });

  it('finalizes safely when the selected recording audio track ends', async () => {
    installRecorderHarness();
    const onAutomaticStop = vi.fn();
    const source = createSource();
    const audioTrack = source.stream.getAudioTracks()[0];
    const { result, unmount } = renderHook(() => useRecording({ onAutomaticStop }));

    await act(async () => {
      await result.current.start(source, 'local');
    });

    const endedListener = (
      audioTrack?.addEventListener as unknown as ReturnType<typeof vi.fn>
    ).mock.calls.find(([type]) => type === 'ended')?.[1] as EventListener | undefined;
    expect(endedListener).toBeTypeOf('function');

    await act(async () => {
      endedListener?.(new Event('ended'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.lifecycle).toBe('recorded');
    expect(onAutomaticStop).toHaveBeenCalledWith({ mode: 'local', reason: 'source-ended' });
    unmount();
  });

  it('reports a recorder error once before finalizing any usable chunks', async () => {
    installRecorderHarness({ errorOnStartCall: 1 });
    const onAutomaticStop = vi.fn();
    const { result, unmount } = renderHook(() => useRecording({ onAutomaticStop }));

    await act(async () => {
      await result.current.start(createSource(), 'lucy-vton-3');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onAutomaticStop).toHaveBeenCalledOnce();
    expect(onAutomaticStop).toHaveBeenCalledWith({
      mode: 'lucy-vton-3',
      reason: 'recorder-error',
    });
    unmount();
  });

  it('reports and cleans up when the main recorder stops without a stop request', async () => {
    installRecorderHarness({ unexpectedStopOnStartCall: 1 });
    const onAutomaticStop = vi.fn();
    const { result, unmount } = renderHook(() => useRecording({ onAutomaticStop }));

    await act(async () => {
      await result.current.start(createSource(), 'lucy-2.5');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onAutomaticStop).toHaveBeenCalledOnce();
    expect(onAutomaticStop).toHaveBeenCalledWith({
      mode: 'lucy-2.5',
      reason: 'recorder-stopped',
    });
    expect(result.current.lifecycle).toBe('recorded');
    unmount();
  });
});
