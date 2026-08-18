import { canSwitchMode } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  hasLiveVideo,
  readCameraFacingState,
  withCaptureDevices,
  type MediaRequirements,
} from '../../adapters/browser-media/browserMedia';
import type {
  CameraFacingMode,
  CapturePreferences,
  PromptCommittedHandler,
} from '../../application/types';
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
import { useModelSessionActions } from './useModelSessionActions';
import { useOwnedLocalMedia } from './useOwnedLocalMedia';
import { useSessionDraftState } from './useSessionDraftState';

export type StudioSessionOptions = {
  availability: ProviderAvailability;
  /** Scopes persisted capture choices to the signed-in operator. */
  ownerUserId: string;
  onPromptCommitted?: PromptCommittedHandler;
};

export type StudioSessionWithCapturePreferences = StudioSessionController & {
  capturePreferences: CapturePreferencesController;
};

const canFallbackFromSelectedCamera = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('name' in error)) return false;
  return [
    'NotFoundError',
    'DevicesNotFoundError',
    'NotReadableError',
    'TrackStartError',
    'OverconstrainedError',
  ].includes(String(error.name));
};

const withPreferredFacingMode = (
  requirements: MediaRequirements,
  preferences: CapturePreferences,
  facingMode: CameraFacingMode | null,
): MediaRequirements => {
  const preferred = withCaptureDevices(requirements, preferences);
  if (!facingMode || preferences.videoDeviceId) return preferred;
  return { ...preferred, facingMode };
};

export const useStudioSession = ({
  availability,
  ownerUserId,
  onPromptCommitted,
}: StudioSessionOptions): StudioSessionWithCapturePreferences => {
  const [lifecycle, setLifecycle] = useState<SessionLifecycle>('idle');
  const [error, setError] = useState<SafeMediaError | null>(null);
  const [applying, setApplying] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [cameraControlError, setCameraControlError] = useState<string | null>(null);
  const operationRef = useRef(0);
  const cameraControlOperationRef = useRef(0);
  const preferredFacingModeRef = useRef<CameraFacingMode | null>(null);
  const startAbortRef = useRef<AbortController | null>(null);
  const disconnectRealtimeRef = useRef<() => void>(() => undefined);
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
  } = useSessionDraftState();

  const handleMicrophoneEnded = useCallback(() => {
    setError({
      code: 'device-ended',
      message: 'Microphone access ended while the camera stayed live.',
      recovery: 'You can keep previewing, but reconnect media before recording with audio.',
    });
  }, []);

  const handleRequiredTrackEnded = useCallback((kind: 'audio' | 'video') => {
    ++operationRef.current;
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    setLifecycle('error');
    setApplying(false);
    setError({
      code: 'device-ended',
      message: `${kind === 'video' ? 'Camera' : 'Microphone'} access ended unexpectedly.`,
      recovery: 'Reconnect the device and start again.',
    });
    disconnectRealtimeRef.current();
  }, []);

  const {
    stream: localStream,
    streamRef: localRef,
    ensure: ensureMedia,
    replace: replaceMedia,
    currentRequirements,
    microphoneEnabled,
    cameraEnabled,
    cameraZoom,
    toggleMicrophone,
    toggleCamera,
    setCameraZoom,
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
          ? localMediaRequirements(preferences.profile, preferences.aspectRatio)
          : (currentRequirements ?? LOCAL_MEDIA_REQUIREMENTS);
      const requirements = withPreferredFacingMode(
        baseRequirements,
        preferences,
        preferredFacingModeRef.current,
      );
      const operation = ++operationRef.current;
      setError(null);
      setLifecycle('requesting-media');
      try {
        await replaceMedia(requirements, operation);
        if (operationRef.current !== operation) {
          throw new DOMException('Superseded media request.', 'AbortError');
        }
        if (preferences.videoDeviceId) preferredFacingModeRef.current = null;
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
    ownerUserId,
    onApply: applyCapturePreferences,
  });
  const {
    cameraDevices,
    effectiveApplied: effectiveCapturePreferences,
    reportVideoDeviceUnavailable,
  } = capturePreferences;

  const activeCameraTrack = localStream?.getVideoTracks()[0];
  const cameraFacing =
    effectiveCapturePreferences.videoDeviceId === null
      ? readCameraFacingState(activeCameraTrack, cameraDevices)
      : null;

  const switchCamera = useCallback(async (): Promise<void> => {
    if (!cameraFacing || !currentRequirements || switchingCamera || applying) return;
    const controlOperation = ++cameraControlOperationRef.current;
    const mediaOperation = ++operationRef.current;
    const operationIsCurrent = () =>
      cameraControlOperationRef.current === controlOperation &&
      operationRef.current === mediaOperation;
    const requirements: MediaRequirements = { ...currentRequirements };
    delete requirements.deviceId;
    requirements.facingMode = cameraFacing.next;
    setSwitchingCamera(true);
    setCameraControlError(null);
    try {
      await replaceMedia(requirements, mediaOperation);
      if (operationIsCurrent()) preferredFacingModeRef.current = cameraFacing.next;
    } catch {
      if (operationIsCurrent()) {
        setCameraControlError(
          `The ${cameraFacing.next === 'environment' ? 'rear' : 'front'} camera could not be started. The current camera stayed live.`,
        );
      }
    } finally {
      if (cameraControlOperationRef.current === controlOperation) setSwitchingCamera(false);
    }
  }, [applying, cameraFacing, currentRequirements, replaceMedia, switchingCamera]);

  const updateCameraZoom = useCallback(
    async (value: number): Promise<void> => {
      const operation = ++cameraControlOperationRef.current;
      setCameraControlError(null);
      try {
        await setCameraZoom(value);
      } catch {
        if (cameraControlOperationRef.current === operation) {
          setCameraControlError('Camera zoom could not be changed on this device.');
        }
      }
    },
    [setCameraZoom],
  );

  const ensureMediaWithCameraFallback = useCallback(
    async (requirements: MediaRequirements, operation: number): Promise<MediaStream> => {
      try {
        return await ensureMedia(requirements, operation);
      } catch (caught) {
        if (!requirements.deviceId || !canFallbackFromSelectedCamera(caught)) throw caught;
        reportVideoDeviceUnavailable(requirements.deviceId);
        const fallbackRequirements = { ...requirements };
        delete fallbackRequirements.deviceId;
        return ensureMedia(fallbackRequirements, operation);
      }
    },
    [ensureMedia, reportVideoDeviceUnavailable],
  );

  const ensurePreferredMedia = useCallback(
    (requirements: MediaRequirements, operation: number) => {
      const preferred = withPreferredFacingMode(
        requirements,
        effectiveCapturePreferences,
        preferredFacingModeRef.current,
      );
      return ensureMediaWithCameraFallback(preferred, operation);
    },
    [effectiveCapturePreferences, ensureMediaWithCameraFallback],
  );

  const {
    remoteStream,
    sessionTiming: realtimeSessionTiming,
    disconnectRealtime,
    completeExpectedRealtime,
    startModel,
    applyChanges,
  } = useModelSessionActions({
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
    ...(onPromptCommitted ? { onPromptCommitted } : {}),
  });

  useEffect(() => {
    disconnectRealtimeRef.current = disconnectRealtime;
  }, [disconnectRealtime]);

  const beginMedia = useCallback(
    async (requirements: MediaRequirements): Promise<MediaStream | null> => {
      const operation = ++operationRef.current;
      ++cameraControlOperationRef.current;
      setSwitchingCamera(false);
      setCameraControlError(null);
      setError(null);
      setLifecycle('requesting-media');
      try {
        const stream = await ensureMediaWithCameraFallback(requirements, operation);
        if (operationRef.current !== operation) return null;
        setLifecycle('ready');
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
    [ensureMediaWithCameraFallback],
  );

  const startLocal = useCallback(async () => {
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    disconnectRealtime();
    setApplied(null);
    await beginMedia(
      withPreferredFacingMode(
        localMediaRequirements(
          effectiveCapturePreferences.profile,
          effectiveCapturePreferences.aspectRatio,
        ),
        effectiveCapturePreferences,
        preferredFacingModeRef.current,
      ),
    );
  }, [beginMedia, disconnectRealtime, effectiveCapturePreferences, setApplied]);

  const stopModel = useCallback(async () => {
    setLifecycle('stopping-ai');
    ++operationRef.current;
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    disconnectRealtime();
    setApplied(null);
    setApplying(false);
    await Promise.resolve();
    setLifecycle(hasLiveVideo(localRef.current) ? 'ready' : 'idle');
  }, [disconnectRealtime, localRef, setApplied]);

  const completeExpectedModelSession = useCallback(async () => {
    if (realtimeSessionTiming?.status !== 'limit-reached') return;
    completeExpectedRealtime();
    setApplied(null);
    setApplying(false);
    setError(null);
    await Promise.resolve();
    setLifecycle(hasLiveVideo(localRef.current) ? 'disconnected' : 'idle');
  }, [completeExpectedRealtime, localRef, realtimeSessionTiming?.status, setApplied]);

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

  const stopCamera = useCallback(async () => {
    setLifecycle('stopping-media');
    ++operationRef.current;
    ++cameraControlOperationRef.current;
    setSwitchingCamera(false);
    setCameraControlError(null);
    startAbortRef.current?.abort();
    startAbortRef.current = null;
    disconnectRealtime();
    releaseLocalMedia();
    setApplied(null);
    setApplying(false);
    setError(null);
    await Promise.resolve();
    setLifecycle('idle');
  }, [disconnectRealtime, releaseLocalMedia, setApplied]);

  const releaseForRecordedReview = useCallback(async (): Promise<void> => {
    await stopCamera();
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

  const canReplaceRecipeDraft = useCallback(
    (mode: StudioMode): boolean =>
      mode === draftRef.current.mode ||
      canSwitchMode(lifecycle, false, hasLiveVideo(localRef.current)),
    [draftRef, lifecycle, localRef],
  );

  const replaceRecipeDraft = useCallback(
    (replacement: RecipeDraftReplacement): boolean => {
      const currentMode = draftRef.current.mode;
      if (!canReplaceRecipeDraft(replacement.mode)) return false;
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
    [canReplaceRecipeDraft, disconnectRealtime, draftRef, replaceRecipeDraftState, setApplied],
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
      realtimeSessionTiming,
      pendingChanges,
      error,
      applying,
      microphoneEnabled,
      cameraEnabled,
      cameraControls: {
        facingMode: cameraFacing?.current ?? null,
        nextFacingMode: cameraFacing?.next ?? null,
        switching: switchingCamera,
        zoom: cameraZoom,
        error: cameraControlError,
        switchCamera,
        setZoom: updateCameraZoom,
      },
      capturePreferences,
      startLocal,
      preflight: startLocal,
      startModel,
      applyChanges,
      revertDraft,
      stopModel,
      completeExpectedModelSession,
      resetModel,
      stopCamera,
      releaseForRecordedReview,
      toggleMicrophone,
      toggleCamera,
      selectMode,
      canReplaceRecipeDraft,
      replaceRecipeDraft,
      updatePrompt,
      updateEnhancement,
      updateReferenceImage,
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
      realtimeSessionTiming,
      pendingChanges,
      error,
      applying,
      microphoneEnabled,
      cameraEnabled,
      cameraZoom,
      cameraControlError,
      cameraFacing,
      switchingCamera,
      switchCamera,
      updateCameraZoom,
      capturePreferences,
      startLocal,
      startModel,
      applyChanges,
      revertDraft,
      stopModel,
      completeExpectedModelSession,
      resetModel,
      stopCamera,
      releaseForRecordedReview,
      toggleMicrophone,
      toggleCamera,
      selectMode,
      canReplaceRecipeDraft,
      replaceRecipeDraft,
      updatePrompt,
      updateEnhancement,
      updateReferenceImage,
      clearError,
    ],
  );
};
