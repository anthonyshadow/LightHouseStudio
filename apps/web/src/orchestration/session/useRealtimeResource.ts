import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  connectDecartRealtime,
  type RealtimeConnectionState,
  type RealtimeSession,
  type RealtimeSnapshot,
} from '../../adapters/decart-realtime/DecartRealtimeGateway';
import { hasLiveVideo } from '../../adapters/browser-media/browserMedia';
import type { ModelMode } from '../../features/media-session';

export type RealtimeDisconnectReason = 'provider-disconnected' | 'remote-ended';

export type RealtimeResourceOptions = {
  operationRef: RefObject<number>;
  onConnectionChange(state: RealtimeConnectionState): void;
  onDisconnected(reason: RealtimeDisconnectReason): void;
  onProviderError(): void;
};

export type RealtimeConnectInput = {
  operation: number;
  apiKey: string;
  model: ModelMode;
  localStream: MediaStream;
  initial: RealtimeSnapshot;
  signal: AbortSignal;
};

export type RealtimeResource = {
  remoteStream: MediaStream | null;
  generationSeconds: number;
  connect(input: RealtimeConnectInput): Promise<boolean>;
  apply(snapshot: RealtimeSnapshot): Promise<void>;
  disconnect(): void;
  hasSession(): boolean;
};

export const useRealtimeResource = ({
  operationRef,
  onConnectionChange,
  onDisconnected,
  onProviderError,
}: RealtimeResourceOptions): RealtimeResource => {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [generationSeconds, setGenerationSeconds] = useState(0);
  const remoteRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const videoEndListenersRef = useRef(new Map<MediaStreamTrack, EventListener>());

  const releaseRemoteTracks = useCallback(
    (stream: MediaStream | null, preservedTracks: ReadonlySet<MediaStreamTrack> = new Set()) => {
      stream?.getTracks().forEach((track) => {
        if (preservedTracks.has(track)) return;
        const endedListener = videoEndListenersRef.current.get(track);
        if (endedListener) {
          track.removeEventListener('ended', endedListener);
          videoEndListenersRef.current.delete(track);
        }
        track.stop();
      });
    },
    [],
  );

  const clearRemote = useCallback(() => {
    const current = remoteRef.current;
    remoteRef.current = null;
    setRemoteStream(null);
    releaseRemoteTracks(current);
  }, [releaseRemoteTracks]);

  const disconnect = useCallback(() => {
    const current = sessionRef.current;
    sessionRef.current = null;
    current?.disconnect();
    clearRemote();
    setGenerationSeconds(0);
  }, [clearRemote]);

  const connect = useCallback(
    async (input: RealtimeConnectInput): Promise<boolean> => {
      let providerDisconnected = false;
      const session = await connectDecartRealtime({
        apiKey: input.apiKey,
        model: input.model,
        localStream: input.localStream,
        initial: input.initial,
        signal: input.signal,
        onRemoteStream: (nextRemote) => {
          if (operationRef.current !== input.operation) {
            releaseRemoteTracks(nextRemote, new Set(remoteRef.current?.getTracks() ?? []));
            return;
          }

          const nextTracks = new Set(nextRemote.getTracks());
          releaseRemoteTracks(remoteRef.current, nextTracks);
          remoteRef.current = nextRemote;
          setRemoteStream(hasLiveVideo(nextRemote) ? nextRemote : null);
          nextRemote
            .getVideoTracks()
            .filter((track) => track.readyState === 'live')
            .forEach((videoTrack) => {
              if (videoEndListenersRef.current.has(videoTrack)) return;
              const onEnded = () => {
                videoEndListenersRef.current.delete(videoTrack);
                if (!remoteRef.current?.getVideoTracks().includes(videoTrack)) return;
                ++operationRef.current;
                disconnect();
                onDisconnected('remote-ended');
              };
              videoEndListenersRef.current.set(videoTrack, onEnded);
              videoTrack.addEventListener('ended', onEnded, { once: true });
            });
        },
        onConnectionChange: (next) => {
          if (operationRef.current !== input.operation) return;
          onConnectionChange(next);
          if (next !== 'disconnected') return;

          providerDisconnected = true;
          ++operationRef.current;
          disconnect();
          onDisconnected('provider-disconnected');
        },
        onGenerationTick: (seconds) => {
          if (operationRef.current === input.operation) setGenerationSeconds(seconds);
        },
        onError: () => {
          if (operationRef.current === input.operation) onProviderError();
        },
      });

      if (operationRef.current !== input.operation || providerDisconnected) {
        session.disconnect();
        clearRemote();
        return false;
      }
      sessionRef.current = session;
      return true;
    },
    [
      clearRemote,
      disconnect,
      onConnectionChange,
      onDisconnected,
      onProviderError,
      operationRef,
      releaseRemoteTracks,
    ],
  );

  const apply = useCallback(async (snapshot: RealtimeSnapshot): Promise<void> => {
    const current = sessionRef.current;
    if (!current) throw new Error('Realtime session is not connected.');
    await current.apply(snapshot);
  }, []);

  const hasSession = useCallback(() => sessionRef.current !== null, []);

  useEffect(
    () => () => {
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      clearRemote();
    },
    [clearRemote],
  );

  return { remoteStream, generationSeconds, connect, apply, disconnect, hasSession };
};
