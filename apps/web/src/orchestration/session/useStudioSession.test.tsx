// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConnectRealtimeOptions,
  RealtimeSession,
} from '../../adapters/decart-realtime/DecartRealtimeGateway';
import type { ModelMode } from '../../features/media-session';

const adapters = vi.hoisted(() => ({
  acquireLocalMedia: vi.fn(),
  applyCameraZoom: vi.fn(),
  enumerateMediaDevices: vi.fn(),
  readCameraFacingState: vi.fn(),
  readCameraZoomState: vi.fn(),
  requestRealtimeToken: vi.fn(),
  getDecartModelRequirements: vi.fn(),
  connectDecartRealtime: vi.fn(),
}));

vi.mock('../../adapters/api-client/apiClient', () => {
  class ApiClientError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(message: string, status: number, code = 'api-error') {
      super(message);
      this.name = 'ApiClientError';
      this.status = status;
      this.code = code;
    }
  }

  return {
    ApiClientError,
    requestRealtimeToken: adapters.requestRealtimeToken,
  };
});

vi.mock('../../adapters/browser-media/browserMedia', () => ({
  acquireLocalMedia: adapters.acquireLocalMedia,
  applyCameraZoom: adapters.applyCameraZoom,
  enumerateMediaDevices: adapters.enumerateMediaDevices,
  readCameraFacingState: adapters.readCameraFacingState,
  readCameraZoomState: adapters.readCameraZoomState,
  readCameraPermissionState: vi.fn().mockResolvedValue('unknown'),
  subscribeToMediaDeviceChanges: vi.fn(() => () => undefined),
  supportsLocal1080pProfile: () => true,
  readCaptureStreamSettings: () => ({ video: null, audio: null }),
  withCaptureDevices: (
    requirements: { width: number; height: number; frameRate: number },
    preferences: { videoDeviceId: string | null; audioDeviceId: string | null },
  ) => ({
    ...requirements,
    ...(preferences.videoDeviceId ? { deviceId: preferences.videoDeviceId } : {}),
    ...(preferences.audioDeviceId ? { audioDeviceId: preferences.audioDeviceId } : {}),
  }),
  hasLiveVideo: (stream: MediaStream | null) =>
    Boolean(stream?.getVideoTracks().some((item) => item.readyState === 'live')),
  hasLiveAudio: (stream: MediaStream | null) =>
    Boolean(stream?.getAudioTracks().some((item) => item.readyState === 'live')),
  stopOwnedStream: (stream: MediaStream | null) => {
    stream?.getTracks().forEach((item) => item.stop());
  },
}));

vi.mock('../../adapters/decart-realtime/DecartRealtimeGateway', () => ({
  DecartRealtimeGatewayError: class DecartRealtimeGatewayError extends Error {},
  getDecartModelRequirements: adapters.getDecartModelRequirements,
  connectDecartRealtime: adapters.connectDecartRealtime,
}));

import { useStudioSession } from './useStudioSession';
import { ApiClientError } from '../../adapters/api-client/apiClient';

type Listener = () => void;
type ControllableTrack = MediaStreamTrack & { endUnexpectedly(): void };
type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
};

const fakeTrack = (
  kind: 'video' | 'audio',
  deviceId?: string,
  facingMode?: 'user' | 'environment',
): ControllableTrack => {
  const listeners = new Map<string, Listener>();
  let readyState: MediaStreamTrackState = 'live';
  return {
    kind,
    get readyState() {
      return readyState;
    },
    getCapabilities: () => ({}),
    getSettings: () => ({
      ...(deviceId ? { deviceId } : {}),
      ...(facingMode ? { facingMode } : {}),
    }),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((event: string, listener: Listener) => listeners.set(event, listener)),
    removeEventListener: vi.fn((event: string, listener: Listener) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    }),
    stop: vi.fn(),
    endUnexpectedly() {
      readyState = 'ended';
      listeners.get('ended')?.();
    },
  } as unknown as ControllableTrack;
};

const fakeStream = (
  { video = true, audio = true }: { video?: boolean; audio?: boolean } = {},
  videoDeviceId?: string,
  facingMode?: 'user' | 'environment',
): MediaStream => {
  const videoTrack = video ? fakeTrack('video', videoDeviceId, facingMode) : null;
  const audioTrack = audio ? fakeTrack('audio') : null;
  const tracks = [videoTrack, audioTrack].filter(
    (track): track is ControllableTrack => track !== null,
  );
  return {
    getTracks: () => tracks,
    getVideoTracks: () => (videoTrack ? [videoTrack] : []),
    getAudioTracks: () => (audioTrack ? [audioTrack] : []),
  } as unknown as MediaStream;
};

const fakeStreamFromTracks = (tracks: ControllableTrack[]): MediaStream =>
  ({
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((track) => track.kind === 'video'),
    getAudioTracks: () => tracks.filter((track) => track.kind === 'audio'),
  }) as unknown as MediaStream;

const fakeRealtimeSession = (apply = vi.fn().mockResolvedValue(undefined)): RealtimeSession => ({
  apply,
  disconnect: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  adapters.acquireLocalMedia.mockResolvedValue(fakeStream());
  adapters.applyCameraZoom.mockResolvedValue({ min: 1, max: 4, step: 0.5, value: 2 });
  adapters.enumerateMediaDevices.mockResolvedValue([]);
  adapters.readCameraFacingState.mockReturnValue(null);
  adapters.readCameraZoomState.mockReturnValue(null);
  adapters.getDecartModelRequirements.mockResolvedValue({
    width: 1_280,
    height: 720,
    frameRate: 30,
  });
  adapters.requestRealtimeToken.mockImplementation((_model: ModelMode) =>
    Promise.resolve({
      apiKey: 'ephemeral-browser-token',
      expiresAt: '2026-07-14T12:05:00.000Z',
      maxSessionDurationSeconds: 300,
    }),
  );
  adapters.connectDecartRealtime.mockResolvedValue(fakeRealtimeSession());
});

afterEach(() => {
  // Capture choices persist now, so a case that applies one must not seed the next.
  window.localStorage.clear();
  vi.useRealTimers();
});

describe('useStudioSession explicit-start boundaries', () => {
  it('keeps preferences session-only until Apply and uses them on explicit local start', async () => {
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.capturePreferences.updateVideoDeviceId('camera-2');
      result.current.capturePreferences.updateAudioDeviceId('microphone-2');
      result.current.capturePreferences.updateProfile('1080p30');
      result.current.capturePreferences.updateAspectRatio('9:16');
    });
    await act(async () => {
      await result.current.capturePreferences.apply();
    });
    expect(adapters.acquireLocalMedia).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.startLocal();
    });
    expect(adapters.acquireLocalMedia).toHaveBeenCalledWith({
      width: 1_080,
      height: 1_920,
      frameRate: 30,
      deviceId: 'camera-2',
      audioDeviceId: 'microphone-2',
    });
    unmount();
  });

  it('falls back once to the default camera when a preferred camera disappeared', async () => {
    const fallbackStream = fakeStream();
    adapters.acquireLocalMedia
      .mockRejectedValueOnce(new DOMException('Selected camera disappeared.', 'NotFoundError'))
      .mockResolvedValueOnce(fallbackStream);
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => result.current.capturePreferences.updateVideoDeviceId('phone-camera'));
    await act(async () => {
      await result.current.capturePreferences.apply();
    });
    await act(async () => {
      await result.current.startLocal();
    });

    expect(adapters.acquireLocalMedia).toHaveBeenNthCalledWith(1, {
      width: 1_280,
      height: 720,
      frameRate: 30,
      deviceId: 'phone-camera',
    });
    expect(adapters.acquireLocalMedia).toHaveBeenNthCalledWith(2, {
      width: 1_280,
      height: 720,
      frameRate: 30,
    });
    expect(result.current.localStream).toBe(fallbackStream);
    expect(result.current.lifecycle).toBe('ready');
    expect(result.current.capturePreferences.applied.videoDeviceId).toBe('phone-camera');
    expect(result.current.capturePreferences.effectiveApplied.videoDeviceId).toBeNull();
    expect(result.current.capturePreferences.videoFallbackNotice).toMatch(/default camera/i);
    unmount();
  });

  it('keeps the current preview live until a selected-device replacement succeeds', async () => {
    const first = fakeStream();
    const replacement = fakeStream();
    const pendingReplacement = deferred<MediaStream>();
    adapters.acquireLocalMedia
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(() => pendingReplacement.promise);
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    await act(async () => {
      await result.current.startLocal();
    });
    act(() => result.current.capturePreferences.updateVideoDeviceId('camera-2'));

    let applyPromise!: Promise<boolean>;
    act(() => {
      applyPromise = result.current.capturePreferences.apply();
    });
    await waitFor(() => expect(adapters.acquireLocalMedia).toHaveBeenCalledTimes(2));
    expect(result.current.localStream).toBe(first);
    expect(first.getTracks().every((track) => vi.mocked(track.stop).mock.calls.length === 0)).toBe(
      true,
    );

    await act(async () => {
      pendingReplacement.resolve(replacement);
      await applyPromise;
    });
    expect(result.current.localStream).toBe(replacement);
    expect(first.getTracks().every((track) => vi.mocked(track.stop).mock.calls.length === 1)).toBe(
      true,
    );
    expect(result.current.capturePreferences.applied.videoDeviceId).toBe('camera-2');
    unmount();
  });

  it('switches phone camera facing mode through atomic replacement', async () => {
    const front = fakeStream({}, 'front-camera', 'user');
    const back = fakeStream({}, 'back-camera', 'environment');
    const restartedBack = fakeStream({}, 'back-camera', 'environment');
    adapters.acquireLocalMedia
      .mockResolvedValueOnce(front)
      .mockResolvedValueOnce(back)
      .mockResolvedValueOnce(restartedBack);
    adapters.readCameraFacingState.mockImplementation((track: MediaStreamTrack | undefined) => {
      const current = track?.getSettings().facingMode;
      return current === 'user'
        ? { current: 'user', next: 'environment' }
        : current === 'environment'
          ? { current: 'environment', next: 'user' }
          : null;
    });
    adapters.enumerateMediaDevices.mockResolvedValue([
      {
        kind: 'videoinput',
        deviceId: 'front-camera',
        label: 'Front Camera',
        groupId: 'phone',
        toJSON: () => ({}),
      },
      {
        kind: 'videoinput',
        deviceId: 'back-camera',
        label: 'Back Camera',
        groupId: 'phone',
        toJSON: () => ({}),
      },
    ]);
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    await act(async () => {
      await result.current.startLocal();
    });
    await waitFor(() => expect(result.current.cameraControls?.nextFacingMode).toBe('environment'));

    await act(async () => {
      await result.current.cameraControls?.switchCamera();
    });

    expect(adapters.acquireLocalMedia).toHaveBeenLastCalledWith({
      width: 1_280,
      height: 720,
      frameRate: 30,
      facingMode: 'environment',
    });
    expect(result.current.localStream).toBe(back);
    expect(front.getTracks().every((track) => vi.mocked(track.stop).mock.calls.length === 1)).toBe(
      true,
    );

    await act(async () => {
      await result.current.stopCamera();
      await result.current.startLocal();
    });
    expect(adapters.acquireLocalMedia).toHaveBeenLastCalledWith({
      width: 1_280,
      height: 720,
      frameRate: 30,
      facingMode: 'environment',
    });
    expect(result.current.localStream).toBe(restartedBack);
    unmount();
  });

  it('preserves the current preview and committed settings when replacement fails', async () => {
    const first = fakeStream();
    adapters.acquireLocalMedia
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new DOMException('Camera is busy.', 'NotReadableError'));
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    await act(async () => {
      await result.current.startLocal();
    });
    act(() => result.current.capturePreferences.updateVideoDeviceId('camera-2'));
    let applied = true;
    await act(async () => {
      applied = await result.current.capturePreferences.apply();
    });

    expect(applied).toBe(false);
    expect(result.current.localStream).toBe(first);
    expect(result.current.lifecycle).toBe('ready');
    expect(result.current.capturePreferences.applied.videoDeviceId).toBeNull();
    expect(result.current.capturePreferences.draft.videoDeviceId).toBe('camera-2');
    expect(result.current.capturePreferences.applyError).toMatch(
      /current preview is still active/i,
    );
    expect(first.getTracks().every((track) => vi.mocked(track.stop).mock.calls.length === 0)).toBe(
      true,
    );
    unmount();
  });

  it('does no camera, token, model-resolution, or connection work while preparing a draft', async () => {
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: true, elevenLabsModel: 'eleven-v3' },
      }),
    );

    act(() => {
      expect(result.current.selectMode('lucy-latest')).toBe(true);
    });
    act(() => {
      result.current.updatePrompt('  An adult documentary photographer  ');
      result.current.updateEnhancement(true);
    });

    await waitFor(() => expect(result.current.draft.prompt).toContain('documentary photographer'));
    expect(adapters.acquireLocalMedia).not.toHaveBeenCalled();
    expect(adapters.requestRealtimeToken).not.toHaveBeenCalled();
    expect(adapters.getDecartModelRequirements).not.toHaveBeenCalled();
    expect(adapters.connectDecartRealtime).not.toHaveBeenCalled();
    unmount();
  });

  it('keeps independent text drafts while switching between inactive model modes', () => {
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
    });
    act(() => {
      result.current.updatePrompt('A documentary host in a midnight studio');
      result.current.updateEnhancement(true);
    });
    act(() => {
      result.current.selectMode('lucy-vton-latest');
    });
    act(() => {
      result.current.updatePrompt('A structured amber field jacket');
    });
    expect(result.current.draft).toMatchObject({
      mode: 'lucy-vton-latest',
      prompt: 'A structured amber field jacket',
      enhance: false,
    });

    act(() => {
      result.current.selectMode('lucy-latest');
    });
    expect(result.current.draft).toMatchObject({
      mode: 'lucy-latest',
      prompt: 'A documentary host in a midnight studio',
      enhance: true,
    });
    unmount();
  });

  it('keeps local mode off the Decart/token path after explicit local start', async () => {
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    expect(adapters.acquireLocalMedia).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.startLocal();
    });

    expect(adapters.acquireLocalMedia).toHaveBeenCalledWith({
      width: 1_280,
      height: 720,
      frameRate: 30,
    });
    expect(result.current.lifecycle).toBe('ready');
    expect(adapters.requestRealtimeToken).not.toHaveBeenCalled();
    expect(adapters.getDecartModelRequirements).not.toHaveBeenCalled();
    expect(adapters.connectDecartRealtime).not.toHaveBeenCalled();
    unmount();
  });

  it('rejects an empty model draft before media access or provider work', async () => {
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-vton-latest');
    });
    await act(async () => {
      await result.current.startModel();
    });

    expect(result.current.lifecycle).toBe('error');
    expect(result.current.error).toMatchObject({ code: 'model-input-required' });
    expect(adapters.acquireLocalMedia).not.toHaveBeenCalled();
    expect(adapters.requestRealtimeToken).not.toHaveBeenCalled();
    expect(adapters.getDecartModelRequirements).not.toHaveBeenCalled();
    expect(adapters.connectDecartRealtime).not.toHaveBeenCalled();
    unmount();
  });

  it('switches a prepared AI mode without releasing a ready local preview', async () => {
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    await act(async () => {
      await result.current.startLocal();
    });
    expect(result.current.lifecycle).toBe('ready');

    act(() => {
      expect(result.current.selectMode('lucy-latest')).toBe(true);
    });
    expect(result.current.draft.mode).toBe('lucy-latest');
    expect(result.current.localStream).not.toBeNull();
    expect(adapters.acquireLocalMedia).toHaveBeenCalledOnce();
    await act(async () => {
      await result.current.stopCamera();
    });
    unmount();
  });

  it('starts AI with the already-live camera and microphone without reacquiring them', async () => {
    const local = fakeStream();
    adapters.acquireLocalMedia.mockResolvedValue(local);
    let options: ConnectRealtimeOptions | undefined;
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      return Promise.resolve(fakeRealtimeSession());
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    await act(async () => {
      await result.current.startLocal();
    });
    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('An adult stop-motion astronomer');
    });
    await act(async () => {
      await result.current.startModel();
    });

    expect(adapters.acquireLocalMedia).toHaveBeenCalledOnce();
    expect(local.getVideoTracks()[0]?.applyConstraints).toHaveBeenCalledWith({
      width: { ideal: 1_280 },
      height: { ideal: 720 },
      aspectRatio: { exact: 16 / 9 },
      frameRate: { ideal: 30 },
    });
    expect(options?.localStream).toBe(local);
    expect(adapters.requestRealtimeToken).toHaveBeenCalledWith(
      'lucy-latest',
      expect.any(AbortSignal),
    );
    unmount();
  });

  it('surfaces an app-owned Decart recovery class without exposing provider detail', async () => {
    const local = fakeStream();
    adapters.acquireLocalMedia.mockResolvedValue(local);
    let options: ConnectRealtimeOptions | undefined;
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      return Promise.resolve(fakeRealtimeSession());
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );
    await act(async () => {
      await result.current.startLocal();
    });
    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('An adult stop-motion astronomer');
    });
    await act(async () => {
      await result.current.startModel();
    });

    act(() => {
      options?.onError({
        code: 'network-failure',
        message: 'The realtime media connection could not be established.',
        retryable: true,
        recovery: 'Keep the local preview, check the network, then start AI again.',
      });
    });

    expect(result.current.lifecycle).toBe('connected');
    expect(result.current.localStream).toBe(local);
    expect(result.current.error).toEqual({
      code: 'network-failure',
      message: 'The realtime media connection could not be established.',
      recovery: 'Keep the local preview, check the network, then start AI again.',
    });
    expect(JSON.stringify(result.current.error)).not.toContain('provider detail');
    unmount();
  });

  it('keeps local preview live and explains an expired Decart server credential', async () => {
    const local = fakeStream();
    adapters.acquireLocalMedia.mockResolvedValue(local);
    adapters.requestRealtimeToken.mockRejectedValue(
      new ApiClientError(
        'Decart rejected the configured server credential.',
        502,
        'provider_authentication',
      ),
    );
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    await act(async () => {
      await result.current.startLocal();
    });
    act(() => {
      result.current.selectMode('lucy-vton-latest');
      result.current.updatePrompt('A tailored navy dinner jacket');
    });
    await act(async () => {
      await result.current.startModel();
    });

    expect(result.current.lifecycle).toBe('ready');
    expect(result.current.localStream).toBe(local);
    expect(result.current.error).toEqual({
      code: 'provider_authentication',
      message: 'Decart rejected the configured server credential.',
      recovery: 'Replace DECART_API_KEY on the API server, restart it, then start AI again.',
    });
    expect(adapters.connectDecartRealtime).not.toHaveBeenCalled();
    unmount();
  });

  it('toggles microphone and camera tracks without acquiring or ending the session', async () => {
    const owned = fakeStream();
    adapters.acquireLocalMedia.mockResolvedValueOnce(owned);
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    await act(async () => {
      await result.current.startLocal();
    });
    act(() => {
      result.current.toggleMicrophone();
      result.current.toggleCamera();
    });

    expect(result.current.microphoneEnabled).toBe(false);
    expect(result.current.cameraEnabled).toBe(false);
    expect(owned.getAudioTracks()[0]?.enabled).toBe(false);
    expect(owned.getVideoTracks()[0]?.enabled).toBe(false);
    expect(adapters.acquireLocalMedia).toHaveBeenCalledOnce();
    expect(result.current.localStream).toBe(owned);

    unmount();
  });

  it('exposes the same safe-replacement preflight used by character Save', async () => {
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    expect(result.current.canReplaceRecipeDraft('lucy-latest')).toBe(true);
    await act(async () => {
      await result.current.startLocal();
    });
    expect(result.current.canReplaceRecipeDraft('lucy-latest')).toBe(true);

    await act(async () => {
      await result.current.stopCamera();
    });
    expect(result.current.canReplaceRecipeDraft('lucy-latest')).toBe(true);
    unmount();
  });

  it('reacquires media instead of reusing a stream whose microphone ended', async () => {
    const first = fakeStream();
    const replacement = fakeStream();
    adapters.acquireLocalMedia.mockResolvedValueOnce(first).mockResolvedValueOnce(replacement);
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    await act(async () => {
      await result.current.startLocal();
    });
    act(() => {
      (first.getAudioTracks()[0] as ControllableTrack).endUnexpectedly();
    });
    expect(result.current.error?.code).toBe('device-ended');
    expect(result.current.localStream).toBe(first);

    await act(async () => {
      await result.current.startLocal();
    });
    expect(adapters.acquireLocalMedia).toHaveBeenCalledTimes(2);
    expect(result.current.localStream).toBe(replacement);
    unmount();
  });

  it('releases local media when the local video ends unexpectedly', async () => {
    const local = fakeStream();
    adapters.acquireLocalMedia.mockResolvedValue(local);
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    await act(async () => {
      await result.current.startLocal();
    });
    act(() => {
      (local.getVideoTracks()[0] as ControllableTrack).endUnexpectedly();
    });

    expect(result.current.localStream).toBeNull();
    expect(result.current.lifecycle).toBe('error');
    unmount();
  });
});

describe('useStudioSession model lifecycle contract', () => {
  it('preserves the authoritative budget, warns, and completes expected expiry as local fallback', async () => {
    const local = fakeStream();
    const remote = fakeStream();
    const realtimeSession = fakeRealtimeSession();
    let options: ConnectRealtimeOptions | undefined;
    adapters.acquireLocalMedia.mockResolvedValue(local);
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      nextOptions.onConnectionChange('connected');
      nextOptions.onRemoteStream(remote);
      nextOptions.onConnectionChange('generating');
      return Promise.resolve(realtimeSession);
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('An adult documentary presenter');
    });
    await act(async () => {
      await result.current.startModel();
    });

    expect(result.current.realtimeSessionTiming).toEqual({
      status: 'active',
      maximumSeconds: 300,
      elapsedSeconds: 0,
      remainingSeconds: 300,
      warning: false,
    });

    act(() => options?.onConnectionChange('reconnecting'));
    act(() => options?.onGenerationTick({ elapsedSeconds: 270 }));
    expect(result.current.realtimeSessionTiming).toMatchObject({
      status: 'active',
      elapsedSeconds: 270,
      remainingSeconds: 30,
      warning: true,
    });

    act(() => options?.onConnectionChange('generating'));
    expect(result.current.realtimeSessionTiming?.elapsedSeconds).toBe(270);

    act(() => options?.onGenerationEnded({ elapsedSeconds: 299 }));
    expect(result.current.lifecycle).toBe('stopping-ai');
    expect(result.current.error).toBeNull();
    expect(result.current.realtimeSessionTiming?.status).toBe('limit-reached');
    expect(result.current.displayStream).toBe(local);

    await act(async () => {
      await result.current.completeExpectedModelSession();
    });

    expect(realtimeSession.disconnect).toHaveBeenCalledOnce();
    expect(result.current.lifecycle).toBe('disconnected');
    expect(result.current.error).toBeNull();
    expect(result.current.localStream).toBe(local);
    expect(result.current.applied).toBeNull();
    expect(result.current.draft.prompt).toBe('An adult documentary presenter');
    expect(result.current.realtimeSessionTiming).toMatchObject({
      status: 'completed',
      elapsedSeconds: 300,
      remainingSeconds: 0,
    });
    unmount();
  });

  it('treats an early generation end as an unexpected safe error', async () => {
    let options: ConnectRealtimeOptions | undefined;
    const realtimeSession = fakeRealtimeSession();
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      return Promise.resolve(realtimeSession);
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-vton-latest');
      result.current.updatePrompt('A tailored navy field jacket');
    });
    await act(async () => {
      await result.current.startModel();
    });
    act(() => options?.onGenerationEnded({ elapsedSeconds: 120 }));

    expect(realtimeSession.disconnect).toHaveBeenCalledOnce();
    expect(result.current.lifecycle).toBe('disconnected');
    expect(result.current.error).toEqual({
      code: 'generation-ended',
      message: 'The AI generation ended before the session maximum.',
      recovery: 'Your local preview and working settings are safe. Start AI again when ready.',
    });
    expect(result.current.realtimeSessionTiming).toBeNull();
    unmount();
  });

  it.each([
    {
      mode: 'lucy-latest' as const,
      prompt: '  An adult copper-haired space pilot  ',
      enhance: true,
      withImage: false,
    },
    {
      mode: 'lucy-vton-latest' as const,
      prompt: '  A cropped linen field jacket  ',
      enhance: false,
      withImage: true,
    },
  ])('starts $mode with its complete snapshot and gateway callbacks', async (scenario) => {
    const local = fakeStream();
    const remote = fakeStream({ audio: false });
    const image = scenario.withImage
      ? new File(['garment'], 'field-jacket.webp', { type: 'image/webp' })
      : null;
    const session = fakeRealtimeSession();
    const onPromptCommitted = vi.fn();
    let options: ConnectRealtimeOptions | undefined;
    adapters.acquireLocalMedia.mockResolvedValue(local);
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      nextOptions.onConnectionChange('connected');
      nextOptions.onRemoteStream(remote);
      nextOptions.onConnectionChange('generating');
      return Promise.resolve(session);
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
        onPromptCommitted,
      }),
    );

    act(() => {
      expect(result.current.selectMode(scenario.mode)).toBe(true);
      result.current.updatePrompt(scenario.prompt);
      result.current.updateEnhancement(scenario.enhance);
      result.current.updateReferenceImage(
        image ? { kind: 'ephemeral', file: image, previewUrl: `blob:${image.name}` } : null,
      );
    });
    await act(async () => {
      await result.current.startModel();
    });

    expect(adapters.getDecartModelRequirements).toHaveBeenCalledWith(scenario.mode);
    expect(adapters.requestRealtimeToken).toHaveBeenCalledWith(
      scenario.mode,
      expect.any(AbortSignal),
    );
    expect(options).toMatchObject({
      apiKey: 'ephemeral-browser-token',
      model: scenario.mode,
      localStream: local,
      initial: {
        prompt: scenario.prompt.trim(),
        image,
        enhance: scenario.enhance,
      },
    });
    expect(result.current.applied?.prompt).toBe(scenario.prompt.trim());
    expect(result.current.applied?.referenceImage?.file ?? null).toBe(image);
    expect(result.current.applied?.enhance).toBe(scenario.enhance);
    expect(result.current.pendingChanges).toBe(false);
    expect(result.current.lifecycle).toBe('generating');
    expect(result.current.transformedVideoUsable).toBe(true);
    expect(result.current.displayStream).toBe(remote);
    expect(onPromptCommitted).toHaveBeenCalledOnce();
    expect(onPromptCommitted).toHaveBeenCalledWith(scenario.mode, scenario.prompt.trim(), null);

    unmount();
  });

  it('keeps local fallback until provider output has live video and restores it if video ends', async () => {
    const local = fakeStream();
    const remoteAudio = fakeTrack('audio');
    const remoteVideo = fakeTrack('video');
    const audioOnlyRemote = fakeStreamFromTracks([remoteAudio]);
    const usableRemote = fakeStreamFromTracks([remoteAudio, remoteVideo]);
    const session = fakeRealtimeSession();
    let options: ConnectRealtimeOptions | undefined;
    adapters.acquireLocalMedia.mockResolvedValue(local);
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      return Promise.resolve(session);
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('A watercolor explorer');
    });
    await act(async () => {
      await result.current.startModel();
    });

    expect(result.current.transformedVideoUsable).toBe(false);
    expect(result.current.displayStream).toBe(local);

    act(() => {
      options?.onRemoteStream(audioOnlyRemote);
    });
    expect(remoteAudio.stop).not.toHaveBeenCalled();
    expect(result.current.remoteStream).toBeNull();
    expect(result.current.displayStream).toBe(local);

    act(() => {
      options?.onRemoteStream(usableRemote);
    });
    expect(result.current.transformedVideoUsable).toBe(true);
    expect(result.current.displayStream).toBe(usableRemote);
    expect(remoteAudio.stop).not.toHaveBeenCalled();
    expect(remoteVideo.stop).not.toHaveBeenCalled();

    act(() => {
      (usableRemote.getVideoTracks()[0] as ControllableTrack).endUnexpectedly();
    });
    expect(session.disconnect).toHaveBeenCalledOnce();
    expect(result.current.remoteStream).toBeNull();
    expect(result.current.transformedVideoUsable).toBe(false);
    expect(result.current.displayStream).toBe(local);
    expect(result.current.applied).toBeNull();
    expect(result.current.lifecycle).toBe('disconnected');
    expect(result.current.error?.code).toBe('remote-ended');

    unmount();
  });

  it('preserves shared video when provider audio arrives later and releases true replacements', async () => {
    const firstVideo = fakeTrack('video');
    const lateAudio = fakeTrack('audio');
    const replacementVideo = fakeTrack('video');
    const replacementAudio = fakeTrack('audio');
    const videoOnly = fakeStreamFromTracks([firstVideo]);
    const accumulated = fakeStreamFromTracks([firstVideo, lateAudio]);
    const replacement = fakeStreamFromTracks([replacementVideo, replacementAudio]);
    let options: ConnectRealtimeOptions | undefined;
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      return Promise.resolve(fakeRealtimeSession());
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('An adult field correspondent');
    });
    await act(async () => {
      await result.current.startModel();
    });

    act(() => options?.onRemoteStream(videoOnly));
    expect(result.current.remoteStream).toBe(videoOnly);
    act(() => options?.onRemoteStream(accumulated));
    expect(result.current.remoteStream).toBe(accumulated);
    expect(firstVideo.stop).not.toHaveBeenCalled();
    expect(lateAudio.stop).not.toHaveBeenCalled();

    act(() => options?.onRemoteStream(replacement));
    expect(result.current.remoteStream).toBe(replacement);
    expect(firstVideo.stop).toHaveBeenCalledOnce();
    expect(lateAudio.stop).toHaveBeenCalledOnce();
    expect(replacementVideo.stop).not.toHaveBeenCalled();
    expect(replacementAudio.stop).not.toHaveBeenCalled();

    unmount();
    expect(replacementVideo.stop).toHaveBeenCalledOnce();
    expect(replacementAudio.stop).toHaveBeenCalledOnce();
  });

  it('offers actionable local recovery when the provider disconnects without ending a track', async () => {
    let options: ConnectRealtimeOptions | undefined;
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      return Promise.resolve(fakeRealtimeSession());
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('An adult paper-cutout cartographer');
    });
    await act(async () => {
      await result.current.startModel();
    });
    act(() => options?.onConnectionChange('disconnected'));

    expect(result.current.displayStream).toBe(result.current.localStream);
    expect(result.current.lifecycle).toBe('disconnected');
    expect(result.current.error?.code).toBe('provider-disconnected');
    expect(result.current.error?.recovery).toMatch(/reconnect AI|continue locally/i);
    unmount();
  });

  it('prevents an in-flight Apply from restoring stale state after provider disconnect', async () => {
    const pendingApply = deferred<void>();
    const apply = vi.fn(() => pendingApply.promise);
    let options: ConnectRealtimeOptions | undefined;
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      return Promise.resolve(fakeRealtimeSession(apply));
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('Initial adult presenter');
    });
    await act(async () => {
      await result.current.startModel();
    });
    act(() => result.current.updatePrompt('Pending replacement presenter'));
    let applyPromise!: Promise<void>;
    act(() => {
      applyPromise = result.current.applyChanges();
    });
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());

    act(() => options?.onConnectionChange('disconnected'));
    await act(async () => {
      pendingApply.resolve();
      await applyPromise;
    });

    expect(result.current.applied).toBeNull();
    expect(result.current.applying).toBe(false);
    expect(result.current.lifecycle).toBe('disconnected');
    unmount();
  });

  it('applies prompt, image null, and enhancement atomically without committing failed edits', async () => {
    const originalImage = new File(['portrait'], 'portrait.png', { type: 'image/png' });
    const apply = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider rejected update'))
      .mockResolvedValueOnce(undefined);
    const session = fakeRealtimeSession(apply);
    const onPromptCommitted = vi.fn();
    adapters.connectDecartRealtime.mockResolvedValue(session);
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
        onPromptCommitted,
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('Original live character');
      result.current.updateReferenceImage({
        kind: 'ephemeral',
        file: originalImage,
        previewUrl: 'blob:portrait.png',
      });
      result.current.updateEnhancement(true);
    });
    await act(async () => {
      await result.current.startModel();
    });
    expect(onPromptCommitted).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.updatePrompt('  Revised live character  ');
      result.current.updateReferenceImage(null);
      result.current.updateEnhancement(false);
    });
    expect(apply).not.toHaveBeenCalled();
    expect(result.current.pendingChanges).toBe(true);
    expect(result.current.applied?.referenceImage?.file).toBe(originalImage);

    await act(async () => {
      await result.current.applyChanges();
    });
    expect(apply).toHaveBeenNthCalledWith(1, {
      prompt: 'Revised live character',
      image: null,
      enhance: false,
    });
    expect(result.current.error?.code).toBe('apply-failed');
    expect(result.current.applied?.prompt).toBe('Original live character');
    expect(result.current.applied?.referenceImage?.file).toBe(originalImage);
    expect(result.current.pendingChanges).toBe(true);
    expect(onPromptCommitted).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.applyChanges();
    });
    expect(apply).toHaveBeenNthCalledWith(2, {
      prompt: 'Revised live character',
      image: null,
      enhance: false,
    });
    expect(result.current.error).toBeNull();
    expect(result.current.applied).toMatchObject({
      prompt: 'Revised live character',
      referenceImage: null,
      referenceIdentity: null,
      enhance: false,
    });
    expect(result.current.pendingChanges).toBe(false);
    expect(onPromptCommitted).toHaveBeenCalledTimes(2);
    expect(onPromptCommitted).toHaveBeenLastCalledWith(
      'lucy-latest',
      'Revised live character',
      null,
    );

    unmount();
  });

  it('records a recent prompt only after a failed Start is retried successfully', async () => {
    const onPromptCommitted = vi.fn();
    adapters.connectDecartRealtime.mockRejectedValueOnce(new Error('connection failed'));
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
        onPromptCommitted,
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('A stop-motion botanist');
    });
    await act(async () => {
      await result.current.startModel();
    });
    expect(result.current.applied).toBeNull();
    expect(result.current.lifecycle).toBe('ready');
    expect(onPromptCommitted).not.toHaveBeenCalled();

    const session = fakeRealtimeSession();
    adapters.connectDecartRealtime.mockResolvedValueOnce(session);
    await act(async () => {
      await result.current.startModel();
    });
    expect(result.current.applied?.prompt).toBe('A stop-motion botanist');
    expect(result.current.lifecycle).toBe('connected');
    expect(onPromptCommitted).toHaveBeenCalledOnce();
    expect(onPromptCommitted).toHaveBeenCalledWith('lucy-latest', 'A stop-motion botanist', null);

    unmount();
  });

  it('commits an image-only persisted character only after Start succeeds', async () => {
    const onPromptCommitted = vi.fn();
    const session = fakeRealtimeSession();
    adapters.connectDecartRealtime.mockResolvedValueOnce(session);
    const reference = {
      kind: 'persisted' as const,
      assetId: '8f45ea24-c274-41a5-a988-aa0602115191',
      file: new File(['image'], 'uploaded-character.png', { type: 'image/png' }),
      contentUrl: '/api/reference-images/8f45ea24-c274-41a5-a988-aa0602115191/content',
    };
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
        onPromptCommitted,
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('');
      result.current.updateReferenceImage(reference);
      result.current.updateEnhancement(false);
    });
    expect(onPromptCommitted).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.startModel();
    });

    expect(result.current.applied).toMatchObject({
      prompt: '',
      referenceImage: reference,
      enhance: false,
    });
    expect(onPromptCommitted).toHaveBeenCalledOnce();
    expect(onPromptCommitted).toHaveBeenCalledWith('lucy-latest', '', reference.assetId);

    unmount();
  });

  it('releases local and provider resources for recorded review without clearing the draft', async () => {
    const local = fakeStream();
    const remote = fakeStream();
    const realtimeSession = fakeRealtimeSession();
    adapters.acquireLocalMedia.mockResolvedValue(local);
    adapters.connectDecartRealtime.mockImplementation((options: ConnectRealtimeOptions) => {
      options.onConnectionChange('connected');
      options.onRemoteStream(remote);
      options.onConnectionChange('generating');
      return Promise.resolve(realtimeSession);
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('An adult studio presenter in amber light');
      result.current.updateEnhancement(true);
    });
    await act(async () => {
      await result.current.startModel();
    });
    expect(result.current.displayStream).toBe(remote);

    await act(async () => {
      await result.current.releaseForRecordedReview();
    });

    expect(realtimeSession.disconnect).toHaveBeenCalledOnce();
    expect(remote.getTracks().every((track) => vi.mocked(track.stop).mock.calls.length === 1)).toBe(
      true,
    );
    expect(local.getTracks().every((track) => vi.mocked(track.stop).mock.calls.length === 1)).toBe(
      true,
    );
    expect(result.current.localStream).toBeNull();
    expect(result.current.remoteStream).toBeNull();
    expect(result.current.displayStream).toBeNull();
    expect(result.current.lifecycle).toBe('idle');
    expect(result.current.applied).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.draft).toMatchObject({
      mode: 'lucy-latest',
      prompt: 'An adult studio presenter in amber light',
      enhance: true,
    });

    unmount();
  });

  it.each([
    ['Reset', 'resetModel' as const],
    ['Stop', 'stopModel' as const],
  ])('%s invalidates and disposes a connection that resolves late', async (_label, action) => {
    const pendingConnection = deferred<RealtimeSession>();
    const lateSession = fakeRealtimeSession();
    const lateRemote = fakeStream();
    let options: ConnectRealtimeOptions | undefined;
    adapters.connectDecartRealtime.mockImplementation((nextOptions: ConnectRealtimeOptions) => {
      options = nextOptions;
      return pendingConnection.promise;
    });
    const { result, unmount } = renderHook(() =>
      useStudioSession({
        ownerUserId: 'test-owner',
        availability: { decart: true, elevenLabs: false, elevenLabsModel: null },
      }),
    );

    act(() => {
      result.current.selectMode('lucy-latest');
      result.current.updatePrompt('A claymation astronomer');
    });
    let startPromise!: Promise<void>;
    act(() => {
      startPromise = result.current.startModel();
    });
    await waitFor(() => expect(adapters.connectDecartRealtime).toHaveBeenCalledOnce());
    expect(result.current.lifecycle).toBe('connecting');

    act(() => {
      void result.current[action]();
      options?.onRemoteStream(lateRemote);
      options?.onConnectionChange('connected');
    });
    expect(options?.signal?.aborted).toBe(true);
    expect(
      lateRemote.getTracks().every((track) => vi.mocked(track.stop).mock.calls.length === 1),
    ).toBe(true);

    await act(async () => {
      pendingConnection.resolve(lateSession);
      await startPromise;
    });

    expect(lateSession.disconnect).toHaveBeenCalledOnce();
    expect(result.current.remoteStream).toBeNull();
    expect(result.current.applied).toBeNull();
    expect(result.current.lifecycle).toBe('ready');
    if (action === 'resetModel') {
      expect(result.current.draft).toMatchObject({
        mode: 'lucy-latest',
        prompt: '',
        referenceImage: null,
        enhance: false,
      });
      expect(result.current.pendingChanges).toBe(false);
    } else {
      expect(result.current.draft.prompt).toBe('A claymation astronomer');
    }

    unmount();
  });
});
