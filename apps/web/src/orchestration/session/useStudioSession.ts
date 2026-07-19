import { canSwitchMode } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  hasLiveVideo,
  withCaptureDevices,
  type MediaRequirements,
} from '../../adapters/browser-media/browserMedia';
import type { CapturePreferences } from '../../application/types';
import {
  toSafeMediaError,
  type ProviderAvailability,
  type SafeMediaError,
  type SessionLifecycle,
  type StudioSessionController,
  type StudioMode,
  type RecipeDraftReplacement,
} from '../../features/media-session';
import type { CapturePreferencesController } from '../../features/recording';
import { LOCAL_MEDIA_REQUIREMENTS, localMediaRequirements } from './mediaRequirements';
import { useCapturePreferences } from './useCapturePreferences';
import { useLiveTimer } from './useLiveTimer';
import { useModelSessionActions } from './useModelSessionActions';
import { useOwnedLocalMedia } from './useOwnedLocalMedia';
import { useSessionDraftState } from './useSessionDraftState';

export type StudioSessionOptions = {
  availability: ProviderAvailability;
  onPromptCommitted?: (
    mode: 'lucy-2.5' | 'lucy-vton-3',
    prompt: string,
    referenceImageAssetId: string | null,
  ) => void;
};

export type StudioSessionWithCapturePreferences = StudioSessionController & {
  capturePreferences: CapturePreferencesController;
};

export const useStudioSession = ({
  availability,
  onPromptCommitted,
}: StudioSessionOptions): StudioSessionWithCapturePreferences => {
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
    selectDraft,
    replaceRecipeDraft: replaceRecipeDraftState,
    replaceWithEmptyDraft,
    revertDraft,
    updatePrompt,
    updateEnhancement,
    updateReferenceImage,
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
    replace: replaceMedia,
    currentRequirements,
    release: releaseLocalMedia,
  } = useOwnedLocalMedia({
    operationRef,
    onMicrophoneEnded: handleMicrophoneEnded,
    onRequiredTrackEnded: handleRequiredTrackEnded,
  });

  const applyCapturePreferences = useCallback(
    async (preferences: CapturePreferences): Promise<void> => {
      if (!hasLiveVideo(localRef.current)) return;
      if (
        applying ||
        [
          'requesting-media',
          'requesting-token',
          'connecting',
          'connected',
          'generating',
          'reconnecting',
        ].includes(lifecycle)
      ) {
        throw new DOMException(
          'Capture settings cannot change during an active media operation.',
          'InvalidStateError',
        );
      }

      const baseRequirements =
        draftRef.current.mode === 'local'
          ? localMediaRequirements(preferences.profile)
          : (currentRequirements ?? LOCAL_MEDIA_REQUIREMENTS);
      const requirements = withCaptureDevices(baseRequirements, preferences);
      const operation = ++operationRef.current;
      setError(null);
      setLifecycle('requesting-media');
      try {
        await replaceMedia(requirements, operation);
        if (operationRef.current !== operation) {
          throw new DOMException('Superseded media request.', 'AbortError');
        }
        setLifecycle('ready');
      } catch (caught) {
        if (operationRef.current === operation) {
          setLifecycle(hasLiveVideo(localRef.current) ? 'ready' : 'error');
          setError(toSafeMediaError(caught, 'Capture settings could not be applied.'));
        }
        throw caught;
      }
    },
    [applying, currentRequirements, draftRef, lifecycle, localRef, replaceMedia],
  );

  const capturePreferences = useCapturePreferences({
    stream: localStream,
    onApply: applyCapturePreferences,
  });

  const ensurePreferredMedia = useCallback(
    (requirements: MediaRequirements, operation: number) =>
      ensureMedia(withCaptureDevices(requirements, capturePreferences.applied), operation),
    [capturePreferences.applied, ensureMedia],
  );

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
      ensureMedia: ensurePreferredMedia,
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
    await beginMedia(
      withCaptureDevices(
        localMediaRequirements(capturePreferences.applied.profile),
        capturePreferences.applied,
      ),
    );
  }, [beginMedia, capturePreferences.applied, disconnectRealtime, setApplied]);

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
    setApplying(false);
    setLifecycle('idle');
    resetLiveTimer();
    setError(null);
  }, [disconnectRealtime, releaseLocalMedia, resetLiveTimer, setApplied]);

  const releaseForRecordedReview = useCallback((): Promise<void> => {
    stopCamera();
    return Promise.resolve();
  }, [stopCamera]);

  const selectMode = useCallback(
    (mode: StudioMode): boolean => {
      if (mode === draftRef.current.mode) return true;
      if (!canSwitchMode(lifecycle, false, hasLiveVideo(localRef.current))) return false;
      ++operationRef.current;
      startAbortRef.current?.abort();
      startAbortRef.current = null;
      disconnectRealtime();
      selectDraft(mode);
      setApplied(null);
      setError(null);
      return true;
    },
    [disconnectRealtime, draftRef, lifecycle, localRef, selectDraft, setApplied],
  );

  const replaceRecipeDraft = useCallback(
    (replacement: RecipeDraftReplacement): boolean => {
      const currentMode = draftRef.current.mode;
      if (
        replacement.mode !== currentMode &&
        !canSwitchMode(lifecycle, false, hasLiveVideo(localRef.current))
      ) {
        return false;
      }
      if (replacement.mode !== currentMode) {
        ++operationRef.current;
        startAbortRef.current?.abort();
        startAbortRef.current = null;
        disconnectRealtime();
        setApplied(null);
        setError(null);
      }
      replaceRecipeDraftState(replacement);
      return true;
    },
    [disconnectRealtime, draftRef, lifecycle, localRef, replaceRecipeDraftState, setApplied],
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
      capturePreferences,
      startLocal,
      preflight: startLocal,
      startModel,
      applyChanges,
      revertDraft,
      stopModel,
      resetModel,
      stopCamera,
      releaseForRecordedReview,
      selectMode,
      replaceRecipeDraft,
      updatePrompt,
      updateEnhancement,
      updateReferenceImage,
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
      capturePreferences,
      startLocal,
      startModel,
      applyChanges,
      revertDraft,
      stopModel,
      resetModel,
      stopCamera,
      releaseForRecordedReview,
      selectMode,
      replaceRecipeDraft,
      updatePrompt,
      updateEnhancement,
      updateReferenceImage,
      updateImage,
      clearError,
    ],
  );
};
