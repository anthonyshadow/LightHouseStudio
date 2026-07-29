import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  applyCameraZoom,
  acquireLocalMedia,
  hasLiveAudio,
  hasLiveVideo,
  readCameraZoomState,
  stopOwnedStream,
  type CameraZoomState,
  type MediaRequirements,
} from '../../adapters/browser-media/browserMedia';

export type OwnedLocalMediaController = {
  stream: MediaStream | null;
  streamRef: RefObject<MediaStream | null>;
  currentRequirements: MediaRequirements | null;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  cameraZoom: CameraZoomState | null;
  ensure: (requirements: MediaRequirements, operation: number) => Promise<MediaStream>;
  replace: (requirements: MediaRequirements, operation: number) => Promise<MediaStream>;
  toggleMicrophone: () => void;
  toggleCamera: () => void;
  setCameraZoom: (value: number) => Promise<void>;
  release: () => void;
};

export type OwnedLocalMediaOptions = {
  operationRef: RefObject<number>;
  onMicrophoneEnded: () => void;
  onRequiredTrackEnded: (kind: 'audio' | 'video') => void;
};

const requestedDevicesMatch = (stream: MediaStream, requirements: MediaRequirements): boolean => {
  const videoDeviceId = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
  const facingMode = stream.getVideoTracks()[0]?.getSettings?.().facingMode;
  const audioDeviceId = stream.getAudioTracks()[0]?.getSettings?.().deviceId;
  return (
    (!requirements.deviceId || videoDeviceId === requirements.deviceId) &&
    (!requirements.facingMode || facingMode === requirements.facingMode) &&
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
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameraZoom, setCameraZoomState] = useState<CameraZoomState | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const microphoneEnabledRef = useRef(true);
  const cameraEnabledRef = useRef(true);
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
      nextStream.getAudioTracks().forEach((track) => {
        track.enabled = microphoneEnabledRef.current;
      });
      nextStream.getVideoTracks().forEach((track) => {
        track.enabled = cameraEnabledRef.current;
      });
      setCameraZoomState(readCameraZoomState(nextStream.getVideoTracks()[0]));
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

  const toggleMicrophone = useCallback(() => {
    const audioTracks = streamRef.current?.getAudioTracks() ?? [];
    if (audioTracks.length === 0) return;
    const enabled = !microphoneEnabledRef.current;
    microphoneEnabledRef.current = enabled;
    audioTracks.forEach((track) => {
      track.enabled = enabled;
    });
    setMicrophoneEnabled(enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const videoTracks = streamRef.current?.getVideoTracks() ?? [];
    if (videoTracks.length === 0) return;
    const enabled = !cameraEnabledRef.current;
    cameraEnabledRef.current = enabled;
    videoTracks.forEach((track) => {
      track.enabled = enabled;
    });
    setCameraEnabled(enabled);
  }, []);

  const setCameraZoom = useCallback(async (value: number): Promise<void> => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) throw new DOMException('Camera zoom is unavailable.', 'NotSupportedError');
    const next = await applyCameraZoom(track, value);
    if (streamRef.current?.getVideoTracks()[0] === track) setCameraZoomState(next);
  }, []);

  const release = useCallback(() => {
    const owned = streamRef.current;
    streamRef.current = null;
    microphoneEnabledRef.current = true;
    cameraEnabledRef.current = true;
    setStream(null);
    setCurrentRequirements(null);
    setMicrophoneEnabled(true);
    setCameraEnabled(true);
    setCameraZoomState(null);
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

  return {
    stream,
    streamRef,
    currentRequirements,
    microphoneEnabled,
    cameraEnabled,
    cameraZoom,
    ensure,
    replace,
    toggleMicrophone,
    toggleCamera,
    setCameraZoom,
    release,
  };
};
