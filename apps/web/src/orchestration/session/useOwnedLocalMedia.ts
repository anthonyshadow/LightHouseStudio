import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  acquireLocalMedia,
  hasLiveAudio,
  hasLiveVideo,
  stopOwnedStream,
  type MediaRequirements,
} from '../../adapters/browser-media/browserMedia';

export type OwnedLocalMediaController = {
  stream: MediaStream | null;
  streamRef: RefObject<MediaStream | null>;
  currentRequirements: MediaRequirements | null;
  ensure(requirements: MediaRequirements, operation: number): Promise<MediaStream>;
  replace(requirements: MediaRequirements, operation: number): Promise<MediaStream>;
  release(): void;
};

export type OwnedLocalMediaOptions = {
  operationRef: RefObject<number>;
  onMicrophoneEnded(): void;
  onRequiredTrackEnded(kind: 'audio' | 'video'): void;
};

const requestedDevicesMatch = (stream: MediaStream, requirements: MediaRequirements): boolean => {
  const videoDeviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
  const audioDeviceId = stream.getAudioTracks()[0]?.getSettings?.().deviceId;
  return (
    (!requirements.deviceId || videoDeviceId === requirements.deviceId) &&
    (!requirements.audioDeviceId || audioDeviceId === requirements.audioDeviceId)
  );
};

export const useOwnedLocalMedia = ({
  operationRef,
  onMicrophoneEnded,
  onRequiredTrackEnded,
}: OwnedLocalMediaOptions): OwnedLocalMediaController => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentRequirements, setCurrentRequirements] = useState<MediaRequirements | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const listenersRef = useRef(
    new Map<MediaStream, Array<{ track: MediaStreamTrack; listener: () => void }>>(),
  );
  const microphoneEndedRef = useRef(onMicrophoneEnded);
  const requiredTrackEndedRef = useRef(onRequiredTrackEnded);

  useEffect(() => {
    microphoneEndedRef.current = onMicrophoneEnded;
    requiredTrackEndedRef.current = onRequiredTrackEnded;
  }, [onMicrophoneEnded, onRequiredTrackEnded]);

  const unobserve = useCallback((ownedStream: MediaStream) => {
    listenersRef.current.get(ownedStream)?.forEach(({ track, listener }) => {
      track.removeEventListener('ended', listener);
    });
    listenersRef.current.delete(ownedStream);
  }, []);

  const observe = useCallback(
    (ownedStream: MediaStream) => {
      const listeners = ownedStream.getTracks().map((track) => {
        const listener = () => {
          if (streamRef.current !== ownedStream) return;
          if (track.kind === 'audio' && hasLiveVideo(ownedStream)) {
            microphoneEndedRef.current();
            return;
          }

          unobserve(ownedStream);
          streamRef.current = null;
          setStream(null);
          setCurrentRequirements(null);
          stopOwnedStream(ownedStream);
          requiredTrackEndedRef.current(track.kind === 'video' ? 'video' : 'audio');
        };
        track.addEventListener('ended', listener, { once: true });
        return { track, listener };
      });
      listenersRef.current.set(ownedStream, listeners);
    },
    [unobserve],
  );

  const commitReplacement = useCallback(
    (nextStream: MediaStream, requirements: MediaRequirements) => {
      const previous = streamRef.current;
      streamRef.current = nextStream;
      setStream(nextStream);
      setCurrentRequirements(requirements);
      observe(nextStream);
      if (previous && previous !== nextStream) {
        unobserve(previous);
        stopOwnedStream(previous);
      }
    },
    [observe, unobserve],
  );

  const acquireReplacement = useCallback(
    async (requirements: MediaRequirements, operation: number): Promise<MediaStream> => {
      const acquired = await acquireLocalMedia(requirements);
      if (operationRef.current !== operation) {
        stopOwnedStream(acquired);
        throw new DOMException('Superseded media request.', 'AbortError');
      }
      commitReplacement(acquired, requirements);
      return acquired;
    },
    [commitReplacement, operationRef],
  );

  const ensure = useCallback(
    async (requirements: MediaRequirements, operation: number): Promise<MediaStream> => {
      const existing = streamRef.current;
      if (
        hasLiveVideo(existing) &&
        hasLiveAudio(existing) &&
        requestedDevicesMatch(existing, requirements)
      ) {
        const track = existing.getVideoTracks()[0];
        try {
          await track?.applyConstraints({
            width: { ideal: requirements.width },
            height: { ideal: requirements.height },
            frameRate: { ideal: requirements.frameRate },
          });
          if (operationRef.current !== operation || streamRef.current !== existing) {
            throw new DOMException('Superseded media request.', 'AbortError');
          }
          setCurrentRequirements(requirements);
          return existing;
        } catch (caught) {
          if (operationRef.current !== operation || streamRef.current !== existing) throw caught;
          // Keep the valid stream alive until a complete replacement has been acquired.
        }
      }

      return acquireReplacement(requirements, operation);
    },
    [acquireReplacement, operationRef],
  );

  const replace = useCallback(
    (requirements: MediaRequirements, operation: number) =>
      acquireReplacement(requirements, operation),
    [acquireReplacement],
  );

  const release = useCallback(() => {
    const owned = streamRef.current;
    streamRef.current = null;
    setStream(null);
    setCurrentRequirements(null);
    if (owned) unobserve(owned);
    stopOwnedStream(owned);
  }, [unobserve]);

  useEffect(
    () => () => {
      const owned = streamRef.current;
      streamRef.current = null;
      if (owned) unobserve(owned);
      stopOwnedStream(owned);
    },
    [unobserve],
  );

  return { stream, streamRef, currentRequirements, ensure, replace, release };
};
