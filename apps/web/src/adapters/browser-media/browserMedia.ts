import type { BrowserCapabilities } from '../../application/types';

export type MediaRequirements = {
  width: number;
  height: number;
  frameRate: number;
  deviceId?: string;
  audioDeviceId?: string;
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
    facingMode: { ideal: 'user' },
    width: { ideal: requirements.width },
    height: { ideal: requirements.height },
    frameRate: { ideal: requirements.frameRate },
  };
  if (requirements.deviceId) video.deviceId = { exact: requirements.deviceId };

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
