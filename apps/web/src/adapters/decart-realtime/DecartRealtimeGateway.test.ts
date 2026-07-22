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

import { connectDecartRealtime, getDecartModelRequirements } from './DecartRealtimeGateway';

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
    await expect(getDecartModelRequirements('lucy-2.5')).resolves.toEqual({
      width: 1_280,
      height: 720,
      frameRate: 30,
    });
    expect(sdk.realtimeModel).toHaveBeenCalledWith('lucy-2.5');
  });

  it('sends each live Apply as a full replacement payload including image null', async () => {
    const localStream = {} as MediaStream;
    const callbacks = {
      onRemoteStream: vi.fn(),
      onConnectionChange: vi.fn(),
      onGenerationTick: vi.fn(),
      onError: vi.fn(),
    };
    const initialImage = new File(['portrait'], 'portrait.webp', { type: 'image/webp' });

    const session = await connectDecartRealtime({
      apiKey: 'browser-scoped-token',
      model: 'lucy-2.5',
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
      model: { id: 'lucy-2.5', width: 1_280, height: 720, fps: 30 },
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
      model: 'lucy-vton-3',
      localStream: {} as MediaStream,
      initial: { prompt: '', image: new File(['garment'], 'top.png'), enhance: false },
      onRemoteStream: vi.fn(),
      onConnectionChange: vi.fn(),
      onGenerationTick: vi.fn(),
      onError: vi.fn(),
    });

    session.disconnect();
    session.disconnect();

    expect(sdk.on).toHaveBeenCalledTimes(2);
    expect(sdk.off).toHaveBeenCalledTimes(2);
    expect(sdk.disconnect).toHaveBeenCalledOnce();
    await expect(session.apply({ prompt: 'late', image: null, enhance: false })).rejects.toThrow(
      'Realtime session is disconnected.',
    );
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
      model: 'lucy-2.5',
      localStream: { getTracks: () => [sourceTrack] } as unknown as MediaStream,
      initial: { prompt: 'Adult field host', image: null, enhance: false },
      signal: controller.signal,
      onRemoteStream: vi.fn(),
      onConnectionChange: vi.fn(),
      onGenerationTick: vi.fn(),
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
