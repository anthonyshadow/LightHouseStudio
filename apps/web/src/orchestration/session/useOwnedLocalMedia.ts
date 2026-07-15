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
  ensure(requirements: MediaRequirements, operation: number): Promise<MediaStream>;
  release(): void;
};

export type OwnedLocalMediaOptions = {
  operationRef: RefObject<number>;
  onMicrophoneEnded(): void;
  onRequiredTrackEnded(kind: 'audio' | 'video'): void;
};

export const useOwnedLocalMedia = ({
  operationRef,
  onMicrophoneEnded,
  onRequiredTrackEnded,
}: OwnedLocalMediaOptions): OwnedLocalMediaController => {
  const [stream, setStream] = useState<MediaStream | null>(null);
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

  const replace = useCallback(
    (nextStream: MediaStream) => {
      const previous = streamRef.current;
      streamRef.current = nextStream;
      setStream(nextStream);
      observe(nextStream);
      if (previous && previous !== nextStream) {
        unobserve(previous);
        stopOwnedStream(previous);
      }
    },
    [observe, unobserve],
  );

  const ensure = useCallback(
    async (requirements: MediaRequirements, operation: number): Promise<MediaStream> => {
      const existing = streamRef.current;
      if (hasLiveVideo(existing) && hasLiveAudio(existing)) {
        const track = existing.getVideoTracks()[0];
        try {
          await track?.applyConstraints({
            width: { ideal: requirements.width },
            height: { ideal: requirements.height },
            frameRate: { ideal: requirements.frameRate },
          });
          return existing;
        } catch {
          if (streamRef.current === existing) {
            streamRef.current = null;
            setStream(null);
          }
          unobserve(existing);
          stopOwnedStream(existing);
        }
      }

      const acquired = await acquireLocalMedia(requirements);
      if (operationRef.current !== operation) {
        stopOwnedStream(acquired);
        throw new DOMException('Superseded media request.', 'AbortError');
      }
      replace(acquired);
      return acquired;
    },
    [operationRef, replace, unobserve],
  );

  const release = useCallback(() => {
    const owned = streamRef.current;
    streamRef.current = null;
    setStream(null);
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

  return { stream, streamRef, ensure, release };
};
