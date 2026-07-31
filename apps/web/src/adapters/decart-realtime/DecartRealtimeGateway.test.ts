// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  const set = vi.fn();
  const on = vi.fn();
  const off = vi.fn();
  const disconnect = vi.fn();
  const connect = vi.fn().mockResolvedValue({ set, on, off, disconnect });
  const realtimeModel = vi.fn((id: string) => ({ id, width: 1_280, height: 720, fps: 30 }));
  const createDecartClient = vi.fn(() => ({ realtime: { connect } }));
  const resolveFpsNumber = vi.fn(() => 30);
  const noopLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    set,
    on,
    off,
    disconnect,
    connect,
    realtimeModel,
    createDecartClient,
    resolveFpsNumber,
    noopLogger,
  };
});

vi.mock('@decartai/sdk', () => ({
  createDecartClient: sdk.createDecartClient,
  models: { realtime: sdk.realtimeModel },
  resolveFpsNumber: sdk.resolveFpsNumber,
  noopLogger: sdk.noopLogger,
}));

import {
  connectDecartRealtime,
  getDecartModelRequirements,
  toSafeDecartRealtimeError,
} from './DecartRealtimeGateway';

beforeEach(() => {
  vi.clearAllMocks();
  sdk.connect.mockResolvedValue({
    set: sdk.set,
    on: sdk.on,
    off: sdk.off,
    disconnect: sdk.disconnect,
  });
});

describe('Decart realtime gateway', () => {
  it('resolves the requested Lucy 2.5 model constraints lazily', async () => {
    await expect(getDecartModelRequirements('lucy-latest')).resolves.toEqual({
      width: 1_280,
      height: 720,
      frameRate: 30,
    });
    expect(sdk.realtimeModel).toHaveBeenCalledWith('lucy-latest');
  });

  it('sends each live Apply as a full replacement payload including image null', async () => {
    const localStream = {} as MediaStream;
    const callbacks = {
      onRemoteStream: vi.fn(),
      onConnectionChange: vi.fn(),
      onGenerationTick: vi.fn(),
      onGenerationEnded: vi.fn(),
      onError: vi.fn(),
    };
    const initialImage = new File(['portrait'], 'portrait.webp', { type: 'image/webp' });

    const session = await connectDecartRealtime({
      apiKey: 'browser-scoped-token',
      model: 'lucy-latest',
      localStream,
      initial: { prompt: 'An adult field host', image: initialImage, enhance: true },
      ...callbacks,
    });

    expect(sdk.createDecartClient).toHaveBeenCalledWith({
      apiKey: 'browser-scoped-token',
      telemetry: false,
      logger: sdk.noopLogger,
    });
    expect(sdk.connect).toHaveBeenCalledWith(localStream, {
      model: { id: 'lucy-latest', width: 1_280, height: 720, fps: 30 },
      mirror: 'auto',
      initialState: {
        prompt: { text: 'An adult field host', enhance: true },
        image: initialImage,
      },
      onRemoteStream: callbacks.onRemoteStream,
      onConnectionChange: callbacks.onConnectionChange,
    });

    await session.apply({ prompt: 'Keep the expression calm', image: null, enhance: false });

    expect(sdk.set).toHaveBeenCalledOnce();
    expect(sdk.set).toHaveBeenCalledWith({
      prompt: 'Keep the expression calm',
      image: null,
      enhance: false,
    });
    const appliedPayload = (sdk.set.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(Object.keys(appliedPayload).sort()).toEqual(['enhance', 'image', 'prompt']);
  });

  it('detaches listeners and disconnects exactly once', async () => {
    const session = await connectDecartRealtime({
      apiKey: 'browser-scoped-token',
      model: 'lucy-vton-latest',
      localStream: {} as MediaStream,
      initial: { prompt: '', image: new File(['garment'], 'top.png'), enhance: false },
      onRemoteStream: vi.fn(),
      onConnectionChange: vi.fn(),
      onGenerationTick: vi.fn(),
      onGenerationEnded: vi.fn(),
      onError: vi.fn(),
    });

    session.disconnect();
    session.disconnect();

    expect(sdk.on).toHaveBeenCalledTimes(3);
    expect(sdk.off).toHaveBeenCalledTimes(3);
    expect(sdk.disconnect).toHaveBeenCalledOnce();
    await expect(session.apply({ prompt: 'late', image: null, enhance: false })).rejects.toThrow(
      'Realtime session is disconnected.',
    );
  });

  it('forwards allowlisted lifecycle seconds without exposing the provider end reason', async () => {
    const onGenerationTick = vi.fn();
    const onGenerationEnded = vi.fn();
    const session = await connectDecartRealtime({
      apiKey: 'browser-scoped-token',
      model: 'lucy-latest',
      localStream: {} as MediaStream,
      initial: { prompt: 'Adult field host', image: null, enhance: false },
      onRemoteStream: vi.fn(),
      onConnectionChange: vi.fn(),
      onGenerationTick,
      onGenerationEnded,
      onError: vi.fn(),
    });
    const listenerFor = (event: string) =>
      sdk.on.mock.calls.find(([registeredEvent]) => registeredEvent === event)?.[1] as
        ((value: unknown) => void) | undefined;

    listenerFor('generationTick')?.({ seconds: 42, providerDetail: 'private tick detail' });
    listenerFor('generationEnded')?.({
      seconds: 299,
      reason: 'raw provider reason must remain private',
    });

    expect(onGenerationTick).toHaveBeenCalledWith({ elapsedSeconds: 42 });
    expect(onGenerationEnded).toHaveBeenCalledWith({ elapsedSeconds: 299 });
    expect(JSON.stringify(onGenerationEnded.mock.calls)).not.toContain('raw provider reason');
    session.disconnect();
  });

  it.each([
    ['INVALID_API_KEY', 'provider-authentication'],
    ['MODEL_NOT_FOUND', 'model-unavailable'],
    ['WEBRTC_TIMEOUT_ERROR', 'network-failure'],
    ['WEBRTC_ICE_ERROR', 'network-failure'],
    ['WEBRTC_WEBSOCKET_ERROR', 'network-failure'],
    ['WEBRTC_SERVER_ERROR', 'provider-unavailable'],
    ['WEBRTC_SIGNALING_ERROR', 'provider-unavailable'],
  ] as const)('maps installed SDK code %s to app-owned code %s', (providerCode, safeCode) => {
    const safe = toSafeDecartRealtimeError({
      code: providerCode,
      message: 'private provider message',
      data: { url: 'wss://private.example/session' },
      cause: new Error('api-key=secret'),
    });

    expect(safe.code).toBe(safeCode);
    expect(JSON.stringify(safe)).not.toContain('private provider message');
    expect(JSON.stringify(safe)).not.toContain('private.example');
    expect(JSON.stringify(safe)).not.toContain('secret');
  });

  it('uses the generic fallback for unknown provider shapes', () => {
    const safe = toSafeDecartRealtimeError({
      code: 'FUTURE_PRIVATE_CODE',
      message: 'private provider detail',
    });

    expect(safe).toMatchObject({
      code: 'unknown',
      message: 'Realtime transformation encountered a provider error.',
      retryable: true,
    });
    expect(JSON.stringify(safe)).not.toContain('FUTURE_PRIVATE_CODE');
    expect(JSON.stringify(safe)).not.toContain('private provider detail');
  });

  it('normalizes error events before they leave the adapter', async () => {
    const onError = vi.fn();
    const session = await connectDecartRealtime({
      apiKey: 'browser-scoped-token',
      model: 'lucy-latest',
      localStream: {} as MediaStream,
      initial: { prompt: 'Adult field host', image: null, enhance: false },
      onRemoteStream: vi.fn(),
      onConnectionChange: vi.fn(),
      onGenerationTick: vi.fn(),
      onGenerationEnded: vi.fn(),
      onError,
    });
    const listener = sdk.on.mock.calls.find(([event]) => event === 'error')?.[1] as
      ((value: unknown) => void) | undefined;

    listener?.({
      code: 'WEBRTC_ICE_ERROR',
      message: 'ICE failed against private-provider-url',
    });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'network-failure', retryable: true }),
    );
    expect(JSON.stringify(onError.mock.calls)).not.toContain('private-provider-url');
    session.disconnect();
  });

  it('normalizes Apply failures while retaining the prior session and listener owner', async () => {
    sdk.set.mockRejectedValueOnce({
      code: 'WEBRTC_SERVER_ERROR',
      message: 'private provider failure',
    });
    const session = await connectDecartRealtime({
      apiKey: 'browser-scoped-token',
      model: 'lucy-latest',
      localStream: {} as MediaStream,
      initial: { prompt: 'Adult field host', image: null, enhance: false },
      onRemoteStream: vi.fn(),
      onConnectionChange: vi.fn(),
      onGenerationTick: vi.fn(),
      onGenerationEnded: vi.fn(),
      onError: vi.fn(),
    });

    await expect(
      session.apply({ prompt: 'Keep the expression calm', image: null, enhance: false }),
    ).rejects.toMatchObject({
      safeError: {
        code: 'provider-unavailable',
        message: 'The realtime provider could not complete the session.',
      },
    });
    expect(sdk.disconnect).not.toHaveBeenCalled();
    expect(sdk.off).not.toHaveBeenCalled();

    session.disconnect();
    expect(sdk.disconnect).toHaveBeenCalledOnce();
    expect(sdk.off).toHaveBeenCalledTimes(3);
  });

  it('stops only its cloned provider input and disconnects a client that resolves after abort', async () => {
    let resolveConnection!: (value: {
      set: typeof sdk.set;
      on: typeof sdk.on;
      off: typeof sdk.off;
      disconnect: typeof sdk.disconnect;
    }) => void;
    sdk.connect.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConnection = resolve;
      }),
    );
    const sourceStop = vi.fn();
    const cloneStop = vi.fn();
    const sourceTrack = {
      clone: vi.fn(() => ({ stop: cloneStop }) as unknown as MediaStreamTrack),
      stop: sourceStop,
    } as unknown as MediaStreamTrack;
    class FakeMediaStream {
      constructor(private readonly tracks: MediaStreamTrack[]) {}
      getTracks() {
        return this.tracks;
      }
    }
    vi.stubGlobal('MediaStream', FakeMediaStream);
    const controller = new AbortController();
    const pending = connectDecartRealtime({
      apiKey: 'browser-scoped-token',
      model: 'lucy-latest',
      localStream: { getTracks: () => [sourceTrack] } as unknown as MediaStream,
      initial: { prompt: 'Adult field host', image: null, enhance: false },
      signal: controller.signal,
      onRemoteStream: vi.fn(),
      onConnectionChange: vi.fn(),
      onGenerationTick: vi.fn(),
      onGenerationEnded: vi.fn(),
      onError: vi.fn(),
    });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(sdk.connect).toHaveBeenCalledOnce());

    controller.abort();
    await rejection;
    resolveConnection({
      set: sdk.set,
      on: sdk.on,
      off: sdk.off,
      disconnect: sdk.disconnect,
    });
    await vi.waitFor(() => expect(sdk.disconnect).toHaveBeenCalledOnce());

    expect(cloneStop).toHaveBeenCalledOnce();
    expect(sourceStop).not.toHaveBeenCalled();
  });
});
