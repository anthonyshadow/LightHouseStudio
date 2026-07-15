import { canSwitchMode } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasLiveVideo, type MediaRequirements } from '../../adapters/browser-media/browserMedia';
import {
  toSafeMediaError,
  type ProviderAvailability,
  type SafeMediaError,
  type SessionLifecycle,
  type StudioSessionController,
  type StudioMode,
} from '../../features/media-session';
import { LOCAL_MEDIA_REQUIREMENTS } from './mediaRequirements';
import { useLiveTimer } from './useLiveTimer';
import { useModelSessionActions } from './useModelSessionActions';
import { useOwnedLocalMedia } from './useOwnedLocalMedia';
import { useSessionDraftState } from './useSessionDraftState';

export type StudioSessionOptions = {
  availability: ProviderAvailability;
  onPromptCommitted?: (mode: 'lucy-2.5' | 'lucy-vton-3', prompt: string) => void;
};

export const useStudioSession = ({
  availability,
  onPromptCommitted,
}: StudioSessionOptions): StudioSessionController => {
  const [lifecycle, setLifecycle] = useState<SessionLifecycle>('idle');
  const [error, setError] = useState<SafeMediaError | null>(null);
  const [applying, setApplying] = useState(false);
  const operationRef = useRef(0);
  const startAbortRef = useRef<AbortController | null>(null);
  const disconnectRealtimeRef = useRef<() => void>(() => undefined);
  const { seconds: liveSeconds, start: startLiveTimer, reset: resetLiveTimer } = useLiveTimer();
  const {
    draft,
    draftRef,
    applied,
    setApplied,
    pendingChanges,
    replaceWithEmptyDraft,
    revertDraft,
    updatePrompt,
    updateEnhancement,
    updateImage,
  } = useSessionDraftState();

  const handleMicrophoneEnded = useCallback(() => {
    setError({
      code: 'device-ended',
      message: 'Microphone access ended while the camera stayed live.',
      recovery: 'You can keep previewing, but reconnect media before recording with audio.',
    });
  }, []);

  const handleRequiredTrackEnded = useCallback(
    (kind: 'audio' | 'video') => {
      ++operationRef.current;
      startAbortRef.current?.abort();
      startAbortRef.current = null;
      setLifecycle('error');
      setApplying(false);
      resetLiveTimer();
      setError({
        code: 'device-ended',
        message: `${kind === 'video' ? 'Camera' : 'Microphone'} access ended unexpectedly.`,
        recovery: 'Reconnect the device and start again.',
      });
      disconnectRealtimeRef.current();
    },
    [resetLiveTimer],
  );

  const {
    stream: localStream,
    streamRef: localRef,
    ensure: ensureMedia,
    release: releaseLocalMedia,
  } = useOwnedLocalMedia({
    operationRef,
    onMicrophoneEnded: handleMicrophoneEnded,
    onRequiredTrackEnded: handleRequiredTrackEnded,
  });

  const { remoteStream, generationSeconds, disconnectRealtime, startModel, applyChanges } =
    useModelSessionActions({
      decartAvailable: availability.decart,
      operationRef,
      startAbortRef,
      draftRef,
      lifecycle,
      setLifecycle,
      setApplied,
      applying,
      setApplying,
      setError,
      ensureMedia,
      localRef,
      startLiveTimer,
      ...(onPromptCommitted ? { onPromptCommitted } : {}),
    });

  useEffect(() => {
    disconnectRealtimeRef.current = disconnectRealtime;
  }, [disconnectRealtime]);

  const beginMedia = useCallback(
    async (requirements: MediaRequirements): Promise<MediaStream | null> => {
      const operation = ++operationRef.current;
      setError(null);
      setLifecycle('requesting-media');
      try {
        const stream = await ensureMedia(requirements, operation);
        if (operationRef.current !== operation) return null;
        setLifecycle('ready');
        startLiveTimer();
        return stream;
      } catch (caught) {
        if (operationRef.current !== operation) return null;
        const safe = toSafeMediaError(caught, 'Camera and microphone could not be started.');
        if (safe.code !== 'canceled') {
          setError(safe);
          setLifecycle('error');
        }
        return null;
      }
    },
    [ensureMedia, startLiveTimer],
  );

  const startLocal = useCallback(async () => {
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    disconnectRealtime();
    setApplied(null);
    await beginMedia(LOCAL_MEDIA_REQUIREMENTS);
  }, [beginMedia, disconnectRealtime, setApplied]);

  const stopModel = useCallback(() => {
    ++operationRef.current;
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    disconnectRealtime();
    setApplied(null);
    setApplying(false);
    setLifecycle(hasLiveVideo(localRef.current) ? 'ready' : 'idle');
  }, [disconnectRealtime, localRef, setApplied]);

  const resetModel = useCallback(() => {
    const mode = draftRef.current.mode;
    ++operationRef.current;
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    disconnectRealtime();
    setApplied(null);
    setApplying(false);
    setError(null);
    replaceWithEmptyDraft(mode);
    setLifecycle(hasLiveVideo(localRef.current) ? 'ready' : 'idle');
  }, [disconnectRealtime, draftRef, localRef, replaceWithEmptyDraft, setApplied]);

  const stopCamera = useCallback(() => {
    ++operationRef.current;
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    disconnectRealtime();
    releaseLocalMedia();
    setApplied(null);
    setLifecycle('idle');
    resetLiveTimer();
    setError(null);
  }, [disconnectRealtime, releaseLocalMedia, resetLiveTimer, setApplied]);

  const selectMode = useCallback(
    (mode: StudioMode): boolean => {
      if (mode === draftRef.current.mode) return true;
      if (!canSwitchMode(lifecycle, false, hasLiveVideo(localRef.current))) return false;
      ++operationRef.current;
      startAbortRef.current?.abort();
      startAbortRef.current = null;
      disconnectRealtime();
      replaceWithEmptyDraft(mode);
      setApplied(null);
      setError(null);
      return true;
    },
    [disconnectRealtime, draftRef, lifecycle, localRef, replaceWithEmptyDraft, setApplied],
  );

  const clearError = useCallback(() => setError(null), []);

  useEffect(
    () => () => {
      ++operationRef.current;
      startAbortRef.current?.abort();
      startAbortRef.current = null;
    },
    [],
  );

  const transformedVideoUsable =
    (lifecycle === 'connected' || lifecycle === 'generating') && hasLiveVideo(remoteStream);
  const displayStream = transformedVideoUsable ? remoteStream : localStream;

  return useMemo(
    () => ({
      draft,
      applied,
      lifecycle,
      localStream,
      remoteStream,
      displayStream,
      transformedVideoUsable,
      pendingChanges,
      error,
      liveSeconds,
      generationSeconds,
      applying,
      startLocal,
      preflight: startLocal,
      startModel,
      applyChanges,
      revertDraft,
      stopModel,
      resetModel,
      stopCamera,
      selectMode,
      updatePrompt,
      updateEnhancement,
      updateImage,
      clearError,
    }),
    [
      draft,
      applied,
      lifecycle,
      localStream,
      remoteStream,
      displayStream,
      transformedVideoUsable,
      pendingChanges,
      error,
      liveSeconds,
      generationSeconds,
      applying,
      startLocal,
      startModel,
      applyChanges,
      revertDraft,
      stopModel,
      resetModel,
      stopCamera,
      selectMode,
      updatePrompt,
      updateEnhancement,
      updateImage,
      clearError,
    ],
  );
};
