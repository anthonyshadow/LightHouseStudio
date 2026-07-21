// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingSource } from '../../features/recording/types';
import { useRecording } from './useRecording';

const NativeBlob = Blob;

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
  failArtifactBlob = false,
  failRecorderCall,
  failObjectUrl = false,
  failStreamConstruction = false,
  hangStopCall,
  mainChunkMime,
  supportedMime = true,
  throwOnStopCall,
  unexpectedStopOnStartCall,
}: {
  defaultRecorderMime?: string;
  errorOnStartCall?: number;
  failArtifactBlob?: boolean;
  failRecorderCall?: number;
  failObjectUrl?: boolean;
  failStreamConstruction?: boolean;
  hangStopCall?: number;
  mainChunkMime?: string;
  supportedMime?: boolean;
  throwOnStopCall?: number;
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
            data: new NativeBlob(['recorded-video'], { type: mainChunkMime ?? this.mimeType }),
          });
          this.emit('stop', { data: new NativeBlob() });
        });
      }
    }

    stop(): void {
      if (this.state === 'inactive') return;
      if (this.callIndex === throwOnStopCall) throw new Error('recorder stop failed');
      this.state = 'inactive';
      if (this.callIndex === hangStopCall) return;
      queueMicrotask(() => {
        this.emit('dataavailable', {
          data: new NativeBlob(['recorded-video'], {
            type: this.callIndex === 1 ? (mainChunkMime ?? this.mimeType) : this.mimeType,
          }),
        });
        this.emit('stop', { data: new NativeBlob() });
      });
    }

    private emit(type: string, event: { data: Blob }): void {
      this.listeners.get(type)?.forEach((listener) => listener(event));
    }
  }

  vi.stubGlobal('MediaStream', FakeMediaStream);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal(
    'Blob',
    failArtifactBlob
      ? class {
          constructor() {
            throw new Error('blob construction failed');
          }
        }
      : NativeBlob,
  );
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: failObjectUrl
      ? vi.fn(() => {
          throw new Error('object URL unavailable');
        })
      : vi.fn().mockReturnValue('blob:recording'),
    revokeObjectURL: vi.fn(),
  });
  return { recorderConstructor, streamConstructor };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useRecording recorder construction failures', () => {
  it('restores a persisted original and audio sidecar into recorded review', () => {
    installRecorderHarness();
    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:persisted-original');
    const video = new Blob(['persisted-video'], { type: 'video/webm' });
    const audio = new Blob(['persisted-audio'], { type: 'audio/webm' });
    const { result, unmount } = renderHook(() => useRecording());

    let restored: ReturnType<typeof result.current.restorePersistedOriginal> | null = null;
    act(() => {
      restored = result.current.restorePersistedOriginal({
        blob: video,
        artifactMetadata: {
          id: 'take-persisted',
          mimeType: 'video/webm',
          filename: 'saved-take.webm',
          sourceModeId: 'lucy-2.5',
          startedAt: '2026-07-19T12:30:00.000Z',
          durationMs: 4_250,
        },
        takeMetadata: {
          mode: 'lucy-2.5',
          startedAt: '2026-07-19T12:30:00.000Z',
          videoSource: 'transformed',
          audioSource: 'provider',
          width: 1_920,
          height: 1_080,
        },
        audioSidecar: { blob: audio, mimeType: 'audio/webm' },
      });
    });

    expect(URL.createObjectURL).toHaveBeenCalledWith(video);
    expect(restored).toBe(result.current.original);
    expect(result.current).toMatchObject({
      lifecycle: 'recorded',
      processed: null,
      presented: restored,
      elapsedSeconds: 4,
      downloaded: false,
    });
    expect(result.current.original).toMatchObject({
      id: 'take-persisted',
      media: video,
      objectUrl: 'blob:persisted-original',
      sizeBytes: video.size,
    });
    expect(result.current.sidecar).toEqual({
      state: 'ready',
      blob: audio,
      mimeType: 'audio/webm',
      error: null,
    });
    expect(result.current.metadata).toMatchObject({
      mode: 'lucy-2.5',
      width: 1_920,
      height: 1_080,
    });
    expect(Object.isFrozen(result.current.original)).toBe(true);
    expect(Object.isFrozen(result.current.metadata)).toBe(true);

    unmount();
  });

  it('revokes the prior original and processed URLs when a persisted original replaces them', () => {
    installRecorderHarness();
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:first-original')
      .mockReturnValueOnce('blob:processed')
      .mockReturnValueOnce('blob:second-original');
    const { result, unmount } = renderHook(() => useRecording());

    act(() => {
      result.current.restorePersistedOriginal({
        blob: new Blob(['first'], { type: 'video/webm' }),
        artifactMetadata: {
          id: 'first',
          mimeType: 'video/webm',
          filename: 'first.webm',
          sourceModeId: 'local',
          startedAt: '2026-07-19T12:30:00.000Z',
          durationMs: 1_000,
        },
      });
      result.current.completeProcessing(
        new Blob(['processed'], { type: 'video/webm' }),
        'video/webm',
        'voice',
      );
    });
    vi.mocked(URL.revokeObjectURL).mockClear();

    act(() => {
      result.current.restorePersistedOriginal({
        blob: new Blob(['second'], { type: 'video/webm' }),
        artifactMetadata: {
          id: 'second',
          mimeType: 'video/webm',
          filename: 'second.webm',
          sourceModeId: 'local',
          startedAt: '2026-07-19T12:31:00.000Z',
          durationMs: 2_000,
        },
      });
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-original');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:processed');
    expect(result.current.original?.objectUrl).toBe('blob:second-original');
    expect(result.current.processed).toBeNull();

    unmount();
  });

  it('revokes a restored original exactly when it is discarded or unmounted', () => {
    installRecorderHarness();
    vi.mocked(URL.createObjectURL)
      .mockReturnValueOnce('blob:discarded-original')
      .mockReturnValueOnce('blob:unmounted-original');
    const first = renderHook(() => useRecording());

    act(() => {
      first.result.current.restorePersistedOriginal({
        blob: new Blob(['discard'], { type: 'video/webm' }),
        artifactMetadata: {
          id: 'discard',
          mimeType: 'video/webm',
          filename: 'discard.webm',
          sourceModeId: 'local',
          startedAt: '2026-07-19T12:30:00.000Z',
          durationMs: 1_000,
        },
      });
      first.result.current.discard();
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:discarded-original');
    expect(first.result.current.lifecycle).toBe('idle');
    expect(first.result.current.original).toBeNull();
    first.unmount();

    vi.mocked(URL.revokeObjectURL).mockClear();
    const second = renderHook(() => useRecording());
    act(() => {
      second.result.current.restorePersistedOriginal({
        blob: new Blob(['unmount'], { type: 'video/webm' }),
        artifactMetadata: {
          id: 'unmount',
          mimeType: 'video/webm',
          filename: 'unmount.webm',
          sourceModeId: 'local',
          startedAt: '2026-07-19T12:30:00.000Z',
          durationMs: 1_000,
        },
      });
    });
    second.unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:unmounted-original');
  });

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
    expect(result.current.recordingError).toBe(
      'The browser recorder could not use this media source or format.',
    );
    expect(result.current.processingError).toBeNull();
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

    act(() => {
      vi.advanceTimersByTime(800);
    });

    await act(async () => {
      await result.current.start(createSource(), 'local');
    });

    act(() => {
      vi.advanceTimersByTime(800);
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
    expect(result.current.original?.durationMs).toBe(800);
    expect(result.current.sidecar).toMatchObject({
      state: 'error',
      error: 'Audio sidecar did not finish; the video take was preserved.',
    });

    unmount();
    vi.useRealTimers();
  });

  it.each([
    ['Blob construction', { failArtifactBlob: true }],
    ['object URL creation', { failObjectUrl: true }],
  ])('settles stop with a recording error when %s fails', async (_label, failure) => {
    installRecorderHarness(failure);
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(createSource(), 'local');
    });

    let artifact: unknown = 'unsettled';
    await act(async () => {
      artifact = await result.current.stop();
    });

    expect(artifact).toBeNull();
    expect(result.current.lifecycle).toBe('error');
    expect(result.current.recordingError).toMatch(/playable recording artifact/i);
    expect(result.current.processingError).toBeNull();
    expect(result.current.original).toBeNull();
    unmount();
  });

  it('settles stop when the main recorder throws while stopping', async () => {
    installRecorderHarness({ throwOnStopCall: 1 });
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(createSource(), 'local');
    });
    await expect(
      act(async () => {
        await result.current.stop();
      }),
    ).resolves.toBeUndefined();

    expect(result.current.lifecycle).toBe('error');
    expect(result.current.recordingError).toMatch(/could not be stopped safely/i);
    unmount();
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

  it('creates a replacement processed URL before revoking the currently playable variant', async () => {
    installRecorderHarness();
    const { result, unmount } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.start(createSource(), 'local');
      await result.current.stop();
    });

    vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:first-processed');
    act(() => {
      result.current.completeProcessing(new Blob(['first']), 'video/webm', 'warm');
    });
    const firstProcessed = result.current.processed;
    expect(firstProcessed?.objectUrl).toBe('blob:first-processed');

    vi.mocked(URL.revokeObjectURL).mockClear();
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      return 'blob:second-processed';
    });
    act(() => {
      result.current.completeProcessing(new Blob(['second']), 'video/webm', 'clear');
    });

    expect(result.current.processed?.objectUrl).toBe('blob:second-processed');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstProcessed?.objectUrl);

    vi.mocked(URL.revokeObjectURL).mockClear();
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
      throw new Error('URL creation failed');
    });
    expect(() =>
      result.current.completeProcessing(new Blob(['third']), 'video/webm', 'robot'),
    ).toThrow('URL creation failed');
    expect(result.current.processed?.objectUrl).toBe('blob:second-processed');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

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
