import type {
  BrowserCapabilities,
  CameraFacingMode,
  CaptureDeviceOption,
  CapturePreferences,
  CaptureStreamSettings,
} from '../../application/types';

export type MediaRequirements = {
  width: number;
  height: number;
  frameRate: number;
  deviceId?: string;
  audioDeviceId?: string;
  facingMode?: CameraFacingMode;
};

export type CameraZoomState = {
  min: number;
  max: number;
  step: number;
  value: number;
};

export type CameraFacingState = {
  current: CameraFacingMode;
  next: CameraFacingMode;
};

export const withCaptureDevices = (
  requirements: MediaRequirements,
  preferences: CapturePreferences,
): MediaRequirements => ({
  width: requirements.width,
  height: requirements.height,
  frameRate: requirements.frameRate,
  ...(preferences.videoDeviceId ? { deviceId: preferences.videoDeviceId } : {}),
  ...(preferences.audioDeviceId ? { audioDeviceId: preferences.audioDeviceId } : {}),
});

export const supportsLocal1080pProfile = (): boolean => {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.();
  return Boolean(supported?.width && supported.height && supported.frameRate);
};

export const detectBrowserCapabilities = (): BrowserCapabilities => ({
  secureContext: window.isSecureContext,
  mediaDevices: typeof navigator.mediaDevices?.getUserMedia === 'function',
  mediaRecorder: 'MediaRecorder' in window,
  webAudio: 'AudioContext' in window || 'webkitAudioContext' in window,
  offlineAudio: 'OfflineAudioContext' in window || 'webkitOfflineAudioContext' in window,
});

export const hasLiveTrack = (tracks: MediaStreamTrack[]): boolean =>
  tracks.some((track) => track.readyState === 'live');

export const hasLiveVideo = (stream: MediaStream | null): stream is MediaStream =>
  Boolean(stream && hasLiveTrack(stream.getVideoTracks()));

export const hasLiveAudio = (stream: MediaStream | null): stream is MediaStream =>
  Boolean(stream && hasLiveTrack(stream.getAudioTracks()));

export const stopOwnedStream = (stream: MediaStream | null): void => {
  stream?.getTracks().forEach((track) => track.stop());
};

export const acquireLocalMedia = async (requirements: MediaRequirements): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('Media capture is unavailable.', 'NotSupportedError');
  }

  const video: MediaTrackConstraints = {
    width: { ideal: requirements.width },
    height: { ideal: requirements.height },
    frameRate: { ideal: requirements.frameRate },
  };
  if (requirements.facingMode) video.facingMode = { exact: requirements.facingMode };
  else if (requirements.deviceId) video.deviceId = { exact: requirements.deviceId };
  else video.facingMode = { ideal: 'user' };

  const audio: MediaTrackConstraints = {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
  };
  if (requirements.audioDeviceId) audio.deviceId = { exact: requirements.audioDeviceId };

  const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
  if (!hasLiveVideo(stream)) {
    stopOwnedStream(stream);
    throw new DOMException('No live video track was returned.', 'NotFoundError');
  }
  if (!hasLiveAudio(stream)) {
    stopOwnedStream(stream);
    throw new DOMException('No live audio track was returned.', 'NotFoundError');
  }
  return stream;
};

export const enumerateMediaDevices = async (): Promise<MediaDeviceInfo[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return navigator.mediaDevices.enumerateDevices();
};

type CapabilityMediaDeviceInfo = MediaDeviceInfo & {
  getCapabilities?: () => MediaTrackCapabilities;
};

const cameraFacingModes = (value: unknown): CameraFacingMode[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (mode): mode is CameraFacingMode => mode === 'user' || mode === 'environment',
  );
};

export const readCameraDeviceFacingModes = (
  device: MediaDeviceInfo,
): readonly CameraFacingMode[] => {
  try {
    return cameraFacingModes((device as CapabilityMediaDeviceInfo).getCapabilities?.().facingMode);
  } catch {
    return [];
  }
};

export const readCameraFacingState = (
  track: MediaStreamTrack | undefined,
  devices: readonly CaptureDeviceOption[],
): CameraFacingState | null => {
  if (!navigator.mediaDevices?.getSupportedConstraints?.().facingMode || !track?.getSettings) {
    return null;
  }
  try {
    const current = track.getSettings().facingMode;
    if (current !== 'user' && current !== 'environment') return null;
    const next: CameraFacingMode = current === 'user' ? 'environment' : 'user';
    const trackModes = cameraFacingModes(track.getCapabilities?.().facingMode);
    const availableModes = new Set([
      ...trackModes,
      ...devices.flatMap(({ facingModes }) => facingModes ?? []),
    ]);
    return availableModes.has(next) ? { current, next } : null;
  } catch {
    return null;
  }
};

export type CameraPermissionState = PermissionState | 'unknown';

export const readCameraPermissionState = async (): Promise<CameraPermissionState> => {
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({
      name: 'camera',
    });
    return status.state;
  } catch {
    return 'unknown';
  }
};

export const subscribeToMediaDeviceChanges = (listener: () => void): (() => void) => {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.addEventListener) return () => undefined;
  mediaDevices.addEventListener('devicechange', listener);
  return () => mediaDevices.removeEventListener('devicechange', listener);
};

type ZoomMediaTrackCapabilities = MediaTrackCapabilities & {
  zoom?: { min: number; max: number; step?: number };
};

type ZoomMediaTrackSettings = MediaTrackSettings & {
  zoom?: number;
};

export const readCameraZoomState = (
  track: MediaStreamTrack | undefined,
): CameraZoomState | null => {
  if (!track?.getCapabilities || !track.getSettings || !track.applyConstraints) return null;
  try {
    const range = (track.getCapabilities() as ZoomMediaTrackCapabilities).zoom;
    if (
      !range ||
      !Number.isFinite(range.min) ||
      !Number.isFinite(range.max) ||
      range.max <= range.min
    ) {
      return null;
    }
    const settings = track.getSettings() as ZoomMediaTrackSettings;
    const step =
      typeof range.step === 'number' && Number.isFinite(range.step) && range.step > 0
        ? range.step
        : (range.max - range.min) / 10;
    const current =
      typeof settings.zoom === 'number' && Number.isFinite(settings.zoom)
        ? settings.zoom
        : range.min;
    return {
      min: range.min,
      max: range.max,
      step,
      value: Math.min(range.max, Math.max(range.min, current)),
    };
  } catch {
    return null;
  }
};

export const applyCameraZoom = async (
  track: MediaStreamTrack,
  requestedValue: number,
): Promise<CameraZoomState> => {
  const zoom = readCameraZoomState(track);
  if (!zoom) {
    throw new DOMException('Camera zoom is unavailable.', 'NotSupportedError');
  }
  const value = Math.min(zoom.max, Math.max(zoom.min, requestedValue));
  await track.applyConstraints({
    advanced: [{ zoom: value } as unknown as MediaTrackConstraintSet],
  });
  return { ...zoom, value };
};

const finiteSetting = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const readCaptureStreamSettings = (stream: MediaStream | null): CaptureStreamSettings => {
  const videoTrack = stream?.getVideoTracks()[0];
  const audioTrack = stream?.getAudioTracks()[0];
  const videoSettings = videoTrack?.getSettings?.();
  const audioSettings = audioTrack?.getSettings?.();

  return {
    video: videoTrack
      ? {
          label: videoTrack.label || 'Active camera',
          deviceId: videoSettings?.deviceId || null,
          width: finiteSetting(videoSettings?.width),
          height: finiteSetting(videoSettings?.height),
          frameRate: finiteSetting(videoSettings?.frameRate),
        }
      : null,
    audio: audioTrack
      ? {
          label: audioTrack.label || 'Active microphone',
          deviceId: audioSettings?.deviceId || null,
        }
      : null,
  };
};
