import { createSafeError, type SafeError } from '@studio/domain';
import type { ModelMode } from '../../application/types';

export type RealtimeSnapshot = {
  prompt: string;
  image: File | null;
  enhance: boolean;
};

export type RealtimeConnectionState =
  'connecting' | 'connected' | 'generating' | 'disconnected' | 'reconnecting';

export type RealtimeSession = {
  apply: (snapshot: RealtimeSnapshot) => Promise<void>;
  disconnect: () => void;
};

export type RealtimeGenerationEvent = Readonly<{ elapsedSeconds: number }>;

export type ConnectRealtimeOptions = {
  apiKey: string;
  model: ModelMode;
  localStream: MediaStream;
  initial: RealtimeSnapshot;
  signal?: AbortSignal;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionChange: (state: RealtimeConnectionState) => void;
  onGenerationTick: (event: RealtimeGenerationEvent) => void;
  onGenerationEnded: (event: RealtimeGenerationEvent) => void;
  onError: (error: SafeError) => void;
};

export type ModelRequirements = { width: number; height: number; frameRate: number };

type DecartSdkErrorShape = Readonly<{ code: string }>;

const isDecartSdkErrorShape = (error: unknown): error is DecartSdkErrorShape =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof (error as { code?: unknown }).code === 'string';

const decartErrorByCode: Readonly<Record<string, SafeError>> = {
  INVALID_API_KEY: createSafeError(
    'provider-authentication',
    'The realtime credential was rejected.',
    {
      retryable: true,
      recovery: 'Stop AI, then start it again to request a fresh credential.',
    },
  ),
  MODEL_NOT_FOUND: createSafeError('model-unavailable', 'This realtime model is unavailable.', {
    retryable: false,
    recovery: 'Continue locally and verify the pinned Decart model before retrying.',
  }),
  WEBRTC_ICE_ERROR: createSafeError(
    'network-failure',
    'The realtime media connection could not be established.',
    {
      retryable: true,
      recovery: 'Keep the local preview, check the network, then start AI again.',
    },
  ),
  WEBRTC_TIMEOUT_ERROR: createSafeError('network-failure', 'The realtime connection timed out.', {
    retryable: true,
    recovery: 'Keep the local preview, check the network, then start AI again.',
  }),
  WEBRTC_WEBSOCKET_ERROR: createSafeError(
    'network-failure',
    'The realtime signaling connection could not be established.',
    {
      retryable: true,
      recovery: 'Keep the local preview, check the network, then start AI again.',
    },
  ),
  WEBRTC_SERVER_ERROR: createSafeError(
    'provider-unavailable',
    'The realtime provider could not complete the session.',
    {
      retryable: true,
      recovery: 'Keep the local preview and try starting AI again shortly.',
    },
  ),
  WEBRTC_SIGNALING_ERROR: createSafeError(
    'provider-unavailable',
    'The realtime provider could not complete signaling.',
    {
      retryable: true,
      recovery: 'Keep the local preview and try starting AI again shortly.',
    },
  ),
};

const genericDecartError = (): SafeError =>
  createSafeError('unknown', 'Realtime transformation encountered a provider error.', {
    retryable: true,
    recovery: 'Keep the local preview, then retry or reset the AI session.',
  });

export const toSafeDecartRealtimeError = (error: unknown): SafeError => {
  if (error instanceof DecartRealtimeGatewayError) return error.safeError;
  if (error instanceof DOMException) {
    if (error.name === 'AbortError') {
      return createSafeError('aborted', 'The realtime connection was cancelled.', {
        retryable: true,
      });
    }
    if (error.name === 'TimeoutError') {
      return createSafeError('network-failure', 'The realtime connection timed out.', {
        retryable: true,
        recovery: 'Keep the local preview, check the network, then start AI again.',
      });
    }
  }
  if (!isDecartSdkErrorShape(error)) return genericDecartError();
  return decartErrorByCode[error.code] ?? genericDecartError();
};

export class DecartRealtimeGatewayError extends Error {
  readonly safeError: SafeError;

  constructor(error: unknown) {
    const safeError = toSafeDecartRealtimeError(error);
    super(safeError.message);
    this.name = 'DecartRealtimeGatewayError';
    this.safeError = safeError;
  }
}

type DevelopmentRealtimeDriver = {
  getModelRequirements?: (model: ModelMode) => Promise<ModelRequirements>;
  connect?: (options: ConnectRealtimeOptions) => Promise<RealtimeSession>;
};

const developmentRealtimeDriver = (): DevelopmentRealtimeDriver | null => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  return (
    (
      window as typeof window & {
        __lightframeDevelopmentRealtimeDriver?: DevelopmentRealtimeDriver;
      }
    ).__lightframeDevelopmentRealtimeDriver ?? null
  );
};

export const getDecartModelRequirements = async (model: ModelMode): Promise<ModelRequirements> => {
  const developmentDriver = developmentRealtimeDriver();
  if (developmentDriver?.getModelRequirements) {
    return developmentDriver.getModelRequirements(model);
  }
  try {
    const { models, resolveFpsNumber } = await import('@decartai/sdk');
    const definition = models.realtime(model);
    return {
      width: definition.width,
      height: definition.height,
      frameRate: resolveFpsNumber(definition.fps),
    };
  } catch (error) {
    throw new DecartRealtimeGatewayError(error);
  }
};

export const connectDecartRealtime = async (
  options: ConnectRealtimeOptions,
): Promise<RealtimeSession> => {
  const developmentDriver = developmentRealtimeDriver();
  if (developmentDriver?.connect) return developmentDriver.connect(options);
  const { createDecartClient, models, noopLogger } = await import('@decartai/sdk');
  options.signal?.throwIfAborted();
  const client = createDecartClient({
    apiKey: options.apiKey,
    telemetry: false,
    logger: noopLogger,
  });
  const definition = models.realtime(options.model);
  const sourceTracks =
    typeof options.localStream.getTracks === 'function' ? options.localStream.getTracks() : [];
  const ownsProviderInput =
    sourceTracks.length > 0 && sourceTracks.every((track) => typeof track.clone === 'function');
  const clonedTracks: MediaStreamTrack[] = [];
  const stopProviderInput = () => {
    if (ownsProviderInput) clonedTracks.forEach((track) => track.stop());
  };
  let providerInput = options.localStream;
  if (ownsProviderInput) {
    try {
      sourceTracks.forEach((track) => clonedTracks.push(track.clone()));
      providerInput = new MediaStream(clonedTracks);
    } catch (error) {
      stopProviderInput();
      throw error;
    }
  }
  const prompt = options.initial.prompt
    ? { text: options.initial.prompt, enhance: options.initial.enhance }
    : undefined;

  let connection: ReturnType<typeof client.realtime.connect>;
  try {
    connection = client.realtime.connect(providerInput, {
      model: definition,
      mirror: 'auto',
      initialState: {
        ...(prompt ? { prompt } : {}),
        ...(options.initial.image ? { image: options.initial.image } : {}),
      },
      onRemoteStream: options.onRemoteStream,
      onConnectionChange: options.onConnectionChange,
    });
  } catch (error) {
    stopProviderInput();
    throw new DecartRealtimeGatewayError(error);
  }
  let timeout: number | undefined;
  let abortConnection: (() => void) | undefined;

  const canceled = new Promise<never>((_resolve, reject) => {
    abortConnection = () =>
      reject(new DOMException('Realtime connection was canceled.', 'AbortError'));
    options.signal?.addEventListener('abort', abortConnection, { once: true });
    if (options.signal?.aborted) abortConnection();
    timeout = window.setTimeout(
      () => reject(new DOMException('Realtime connection timed out.', 'TimeoutError')),
      30_000,
    );
  });

  let realtime: Awaited<typeof connection>;
  try {
    realtime = await Promise.race([connection, canceled]);
  } catch (error) {
    stopProviderInput();
    void connection.then(
      (lateRealtime) => lateRealtime.disconnect(),
      () => undefined,
    );
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new DecartRealtimeGatewayError(error);
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
    if (abortConnection) options.signal?.removeEventListener('abort', abortConnection);
  }

  const errorListener = (error: unknown) => options.onError(toSafeDecartRealtimeError(error));
  const generationTickListener = (event: { seconds: number }) =>
    options.onGenerationTick({ elapsedSeconds: event.seconds });
  const generationEndedListener = (event: { seconds: number }) =>
    options.onGenerationEnded({ elapsedSeconds: event.seconds });
  realtime.on('error', errorListener);
  realtime.on('generationTick', generationTickListener);
  realtime.on('generationEnded', generationEndedListener);

  let disconnected = false;
  return {
    async apply(snapshot) {
      if (disconnected) throw new Error('Realtime session is disconnected.');
      try {
        await realtime.set({
          prompt: snapshot.prompt,
          enhance: snapshot.enhance,
          image: snapshot.image,
        });
      } catch (error) {
        throw new DecartRealtimeGatewayError(error);
      }
    },
    disconnect() {
      if (disconnected) return;
      disconnected = true;
      realtime.off('error', errorListener);
      realtime.off('generationTick', generationTickListener);
      realtime.off('generationEnded', generationEndedListener);
      realtime.disconnect();
      stopProviderInput();
    },
  };
};
