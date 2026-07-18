import { useCallback, useMemo, useRef, useState } from 'react';
import {
  enumerateMediaDevices,
  readCaptureStreamSettings,
  supportsLocal1080pProfile,
} from '../../adapters/browser-media/browserMedia';
import type { CapturePreferences } from '../../application/types';
import type {
  CaptureDeviceOption,
  CapturePreferencesController,
  LocalCaptureProfileId,
} from '../../features/recording';

export const DEFAULT_CAPTURE_PREFERENCES: CapturePreferences = {
  videoDeviceId: null,
  audioDeviceId: null,
  profile: '720p30',
};

export type UseCapturePreferencesOptions = {
  stream: MediaStream | null;
  onApply(preferences: CapturePreferences): Promise<void>;
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
    });
  }
  return options;
};

const samePreferences = (left: CapturePreferences, right: CapturePreferences): boolean =>
  left.videoDeviceId === right.videoDeviceId &&
  left.audioDeviceId === right.audioDeviceId &&
  left.profile === right.profile;

export const useCapturePreferences = ({
  stream,
  onApply,
}: UseCapturePreferencesOptions): CapturePreferencesController => {
  const [draft, setDraft] = useState<CapturePreferences>(DEFAULT_CAPTURE_PREFERENCES);
  const [applied, setApplied] = useState<CapturePreferences>(DEFAULT_CAPTURE_PREFERENCES);
  const [cameraDevices, setCameraDevices] = useState<CaptureDeviceOption[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<CaptureDeviceOption[]>([]);
  const [devicesState, setDevicesState] =
    useState<CapturePreferencesController['devicesState']>('idle');
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const supportedProfiles = useMemo<LocalCaptureProfileId[]>(
    () => (supportsLocal1080pProfile() ? ['720p30', '1080p30'] : ['720p30']),
    [],
  );

  const refreshDevices = useCallback(async (): Promise<void> => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const request = (async () => {
      setDevicesState('loading');
      setDeviceError(null);
      try {
        const devices = await enumerateMediaDevices();
        setCameraDevices(deviceOptions(devices, 'videoinput'));
        setMicrophoneDevices(deviceOptions(devices, 'audioinput'));
        setDevicesState('ready');
      } catch {
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

  const updateVideoDeviceId = useCallback((videoDeviceId: string | null) => {
    setApplyError(null);
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

  const apply = useCallback(async (): Promise<boolean> => {
    if (applying) return false;
    if (samePreferences(draft, applied)) return true;
    setApplying(true);
    setApplyError(null);
    try {
      await onApply(draft);
      setApplied(draft);
      return true;
    } catch {
      setApplyError('Capture settings could not be applied. The current preview is still active.');
      return false;
    } finally {
      setApplying(false);
    }
  }, [applied, applying, draft, onApply]);

  const discardPending = useCallback(() => {
    setApplyError(null);
    setDraft(applied);
  }, [applied]);

  return {
    draft,
    applied,
    cameraDevices,
    microphoneDevices,
    supportedProfiles,
    devicesState,
    deviceError,
    applyError,
    applying,
    hasPendingChanges: !samePreferences(draft, applied),
    actualSettings: readCaptureStreamSettings(stream),
    refreshDevices,
    updateVideoDeviceId,
    updateAudioDeviceId,
    updateProfile,
    apply,
    discardPending,
  };
};
