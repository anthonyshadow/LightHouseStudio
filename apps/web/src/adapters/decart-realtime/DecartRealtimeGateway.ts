import type { ModelMode } from '../../application/types';

export type RealtimeSnapshot = {
  prompt: string;
  image: File | null;
  enhance: boolean;
};

export type RealtimeConnectionState =
  'connecting' | 'connected' | 'generating' | 'disconnected' | 'reconnecting';

export type RealtimeSession = {
  apply(snapshot: RealtimeSnapshot): Promise<void>;
  disconnect(): void;
};

export type ConnectRealtimeOptions = {
  apiKey: string;
  model: ModelMode;
  localStream: MediaStream;
  initial: RealtimeSnapshot;
  signal?: AbortSignal;
  onRemoteStream(stream: MediaStream): void;
  onConnectionChange(state: RealtimeConnectionState): void;
  onGenerationTick(seconds: number): void;
  onError(error: unknown): void;
};

export type ModelRequirements = { width: number; height: number; frameRate: number };

type DevelopmentRealtimeDriver = {
  getModelRequirements?(model: ModelMode): Promise<ModelRequirements>;
  connect?(options: ConnectRealtimeOptions): Promise<RealtimeSession>;
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
  const { models, resolveFpsNumber } = await import('@decartai/sdk');
  const definition = models.realtime(model);
  return {
    width: definition.width,
    height: definition.height,
    frameRate: resolveFpsNumber(definition.fps),
  };
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
    throw error;
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
    throw error;
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
    if (abortConnection) options.signal?.removeEventListener('abort', abortConnection);
  }

  const tickListener = ({ seconds }: { seconds: number }) => options.onGenerationTick(seconds);
  const errorListener = (error: unknown) => options.onError(error);
  realtime.on('generationTick', tickListener);
  realtime.on('error', errorListener);

  let disconnected = false;
  return {
    async apply(snapshot) {
      if (disconnected) throw new Error('Realtime session is disconnected.');
      await realtime.set({
        prompt: snapshot.prompt,
        enhance: snapshot.enhance,
        image: snapshot.image,
      });
    },
    disconnect() {
      if (disconnected) return;
      disconnected = true;
      realtime.off('generationTick', tickListener);
      realtime.off('error', errorListener);
      realtime.disconnect();
      stopProviderInput();
    },
  };
};
