import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  enumerateMediaDevices,
  readCameraDeviceFacingModes,
  readCameraPermissionState,
  readCaptureStreamSettings,
  subscribeToMediaDeviceChanges,
  supportsLocal1080pProfile,
} from '../../adapters/browser-media/browserMedia';
import type { CapturePreferences, LocalCaptureAspectRatio } from '../../application/types';
import type {
  CaptureDeviceOption,
  CapturePreferencesController,
  LocalCaptureProfileId,
} from '../../features/recording';

export const DEFAULT_CAPTURE_PREFERENCES: CapturePreferences = {
  videoDeviceId: null,
  audioDeviceId: null,
  profile: '720p30',
  aspectRatio: '16:9',
};

const DESKTOP_CAPTURE_FORMAT_QUERY = '(min-width: 64rem)';

export const defaultLocalCaptureAspectRatio = (): LocalCaptureAspectRatio => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return '16:9';
  return window.matchMedia(DESKTOP_CAPTURE_FORMAT_QUERY).matches ? '16:9' : '9:16';
};

const initialCapturePreferences = (): CapturePreferences => ({
  ...DEFAULT_CAPTURE_PREFERENCES,
  aspectRatio: defaultLocalCaptureAspectRatio(),
});

export type UseCapturePreferencesOptions = {
  stream: MediaStream | null;
  onApply: (preferences: CapturePreferences) => Promise<void>;
};

const deviceOptions = (
  devices: MediaDeviceInfo[],
  kind: 'videoinput' | 'audioinput',
): CaptureDeviceOption[] => {
  const fallback = kind === 'videoinput' ? 'Camera' : 'Microphone';
  const seen = new Set<string>();
  const options: CaptureDeviceOption[] = [];
  for (const device of devices) {
    if (device.kind !== kind || !device.deviceId || seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    options.push({
      deviceId: device.deviceId,
      label: device.label.trim() || `${fallback} ${options.length + 1}`,
      ...(kind === 'videoinput' ? { facingModes: readCameraDeviceFacingModes(device) } : {}),
    });
  }
  return options;
};

const samePreferences = (left: CapturePreferences, right: CapturePreferences): boolean =>
  left.videoDeviceId === right.videoDeviceId &&
  left.audioDeviceId === right.audioDeviceId &&
  left.profile === right.profile &&
  left.aspectRatio === right.aspectRatio;

const selectedDeviceUnavailable = (
  devicesState: CapturePreferencesController['devicesState'],
  devices: readonly CaptureDeviceOption[],
  selectedDeviceId: string | null,
): boolean =>
  devicesState === 'ready' &&
  Boolean(selectedDeviceId) &&
  !devices.some(({ deviceId }) => deviceId === selectedDeviceId);

export const useCapturePreferences = ({
  stream,
  onApply,
}: UseCapturePreferencesOptions): CapturePreferencesController => {
  const [initialPreferences] = useState(initialCapturePreferences);
  const [draft, setDraft] = useState<CapturePreferences>(initialPreferences);
  const [applied, setApplied] = useState<CapturePreferences>(initialPreferences);
  const [cameraDevices, setCameraDevices] = useState<CaptureDeviceOption[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<CaptureDeviceOption[]>([]);
  const [devicesState, setDevicesState] =
    useState<CapturePreferencesController['devicesState']>('idle');
  const [cameraPermissionState, setCameraPermissionState] =
    useState<CapturePreferencesController['cameraPermissionState']>('unknown');
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [runtimeUnavailableVideoId, setRuntimeUnavailableVideoId] = useState<string | null>(null);
  const [dismissedVideoFallbackId, setDismissedVideoFallbackId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const applyInFlightRef = useRef<Promise<boolean> | null>(null);
  const applyOperationRef = useRef(0);
  const mountedRef = useRef(true);
  const supportedProfiles = useMemo<LocalCaptureProfileId[]>(
    () => (supportsLocal1080pProfile() ? ['720p30', '1080p30'] : ['720p30']),
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      applyOperationRef.current += 1;
      applyInFlightRef.current = null;
    };
  }, []);

  const refreshDevices = useCallback(async (): Promise<void> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const request = (async () => {
      setDevicesState('loading');
      setDeviceError(null);
      try {
        const [devices, permissionState] = await Promise.all([
          enumerateMediaDevices(),
          readCameraPermissionState(),
        ]);
        if (!mountedRef.current) return;
        setCameraDevices(deviceOptions(devices, 'videoinput'));
        setMicrophoneDevices(deviceOptions(devices, 'audioinput'));
        setCameraPermissionState(permissionState);
        setRuntimeUnavailableVideoId(null);
        setDismissedVideoFallbackId(null);
        setDevicesState('ready');
      } catch {
        if (!mountedRef.current) return;
        setDevicesState('error');
        setDeviceError(
          'Camera and microphone choices could not be listed. Default devices remain available.',
        );
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = request;
    return request;
  }, []);

  useEffect(
    () =>
      subscribeToMediaDeviceChanges(() => {
        void refreshDevices();
      }),
    [refreshDevices],
  );

  useEffect(() => {
    if (stream?.getVideoTracks().some((track) => track.readyState === 'live')) {
      void refreshDevices().then(refreshDevices);
    }
  }, [refreshDevices, stream]);

  const updateVideoDeviceId = useCallback((videoDeviceId: string | null) => {
    setApplyError(null);
    setRuntimeUnavailableVideoId((current) => (current === videoDeviceId ? current : null));
    setDraft((current) => ({ ...current, videoDeviceId }));
  }, []);

  const updateAudioDeviceId = useCallback((audioDeviceId: string | null) => {
    setApplyError(null);
    setDraft((current) => ({ ...current, audioDeviceId }));
  }, []);

  const updateProfile = useCallback(
    (profile: LocalCaptureProfileId) => {
      if (!supportedProfiles.includes(profile)) return;
      setApplyError(null);
      setDraft((current) => ({ ...current, profile }));
    },
    [supportedProfiles],
  );

  const updateAspectRatio = useCallback((aspectRatio: LocalCaptureAspectRatio) => {
    if (aspectRatio !== '16:9' && aspectRatio !== '9:16') return;
    setApplyError(null);
    setDraft((current) => ({ ...current, aspectRatio }));
  }, []);

  const apply = useCallback((): Promise<boolean> => {
    if (applyInFlightRef.current) return applyInFlightRef.current;
    if (samePreferences(draft, applied)) return Promise.resolve(true);

    const operation = ++applyOperationRef.current;
    const preferences = draft;
    setApplying(true);
    setApplyError(null);
    const request = (async () => {
      try {
        const videoUnavailable = selectedDeviceUnavailable(
          devicesState,
          cameraDevices,
          preferences.videoDeviceId,
        );
        const audioUnavailable = selectedDeviceUnavailable(
          devicesState,
          microphoneDevices,
          preferences.audioDeviceId,
        );
        await onApply({
          ...preferences,
          videoDeviceId: videoUnavailable ? null : preferences.videoDeviceId,
          audioDeviceId: audioUnavailable ? null : preferences.audioDeviceId,
        });
        if (mountedRef.current && applyOperationRef.current === operation) {
          setApplied(preferences);
        }
        return true;
      } catch {
        if (mountedRef.current && applyOperationRef.current === operation) {
          setApplyError(
            'Capture settings could not be applied. The current preview is still active.',
          );
        }
        return false;
      } finally {
        if (applyOperationRef.current === operation) {
          applyInFlightRef.current = null;
          if (mountedRef.current) setApplying(false);
        }
      }
    })();
    applyInFlightRef.current = request;
    return request;
  }, [applied, cameraDevices, devicesState, draft, microphoneDevices, onApply]);

  const discardPending = useCallback(
    (preserveApplyError = false) => {
      if (!preserveApplyError) setApplyError(null);
      setDraft(applied);
    },
    [applied],
  );

  const appliedVideoUnavailable =
    Boolean(applied.videoDeviceId) &&
    (runtimeUnavailableVideoId === applied.videoDeviceId ||
      selectedDeviceUnavailable(devicesState, cameraDevices, applied.videoDeviceId));
  const appliedAudioUnavailable = selectedDeviceUnavailable(
    devicesState,
    microphoneDevices,
    applied.audioDeviceId,
  );
  const effectiveApplied = useMemo<CapturePreferences>(
    () => ({
      ...applied,
      videoDeviceId: appliedVideoUnavailable ? null : applied.videoDeviceId,
      audioDeviceId: appliedAudioUnavailable ? null : applied.audioDeviceId,
    }),
    [applied, appliedAudioUnavailable, appliedVideoUnavailable],
  );
  const videoFallbackNotice =
    appliedVideoUnavailable &&
    applied.videoDeviceId &&
    dismissedVideoFallbackId !== applied.videoDeviceId
      ? 'The previously selected camera is unavailable. The default camera will be used until it reconnects.'
      : null;

  const dismissVideoFallbackNotice = useCallback(() => {
    setDismissedVideoFallbackId(applied.videoDeviceId);
  }, [applied.videoDeviceId]);
  const reportVideoDeviceUnavailable = useCallback((deviceId: string) => {
    setRuntimeUnavailableVideoId(deviceId);
  }, []);

  return {
    draft,
    applied,
    effectiveApplied,
    cameraDevices,
    microphoneDevices,
    supportedProfiles,
    devicesState,
    cameraPermissionState,
    deviceError,
    videoFallbackNotice,
    applyError,
    applying,
    hasPendingChanges: !samePreferences(draft, applied),
    actualSettings: readCaptureStreamSettings(stream),
    refreshDevices,
    updateVideoDeviceId,
    updateAudioDeviceId,
    updateProfile,
    updateAspectRatio,
    reportVideoDeviceUnavailable,
    dismissVideoFallbackNotice,
    apply,
    discardPending,
  };
};
