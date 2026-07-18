// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  acquireLocalMedia,
  enumerateMediaDevices,
  readCaptureStreamSettings,
  supportsLocal1080pProfile,
  withCaptureDevices,
} from './browserMedia';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

const installMediaDevices = (value: Partial<MediaDevices>) => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value,
  });
};

afterEach(() => {
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

const liveTrack = (
  kind: 'video' | 'audio',
  label: string,
  settings: MediaTrackSettings,
): MediaStreamTrack =>
  ({
    kind,
    label,
    readyState: 'live',
    getSettings: () => settings,
    stop: vi.fn(),
  }) as unknown as MediaStreamTrack;

const streamFrom = (video: MediaStreamTrack, audio: MediaStreamTrack): MediaStream =>
  ({
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  }) as unknown as MediaStream;

describe('browser media capture settings', () => {
  it('lists devices without requesting camera or microphone permission', async () => {
    const getUserMedia = vi.fn();
    const devices = [{ kind: 'videoinput', deviceId: 'camera-1' }] as MediaDeviceInfo[];
    const enumerateDevices = vi.fn().mockResolvedValue(devices);
    installMediaDevices({ getUserMedia, enumerateDevices });

    await expect(enumerateMediaDevices()).resolves.toBe(devices);
    expect(enumerateDevices).toHaveBeenCalledOnce();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('applies selected devices and quality only during explicit acquisition', async () => {
    const video = liveTrack('video', 'Studio camera', { deviceId: 'camera-2' });
    const audio = liveTrack('audio', 'Desk microphone', { deviceId: 'microphone-2' });
    const stream = streamFrom(video, audio);
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    installMediaDevices({ getUserMedia });

    const requirements = withCaptureDevices(
      { width: 1_920, height: 1_080, frameRate: 30 },
      {
        videoDeviceId: 'camera-2',
        audioDeviceId: 'microphone-2',
        profile: '1080p30',
      },
    );
    await expect(acquireLocalMedia(requirements)).resolves.toBe(stream);

    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1_920 },
        height: { ideal: 1_080 },
        frameRate: { ideal: 30 },
        deviceId: { exact: 'camera-2' },
      },
      audio: {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        deviceId: { exact: 'microphone-2' },
      },
    });
  });

  it('feature-detects the optional profile and reports negotiated settings honestly', () => {
    installMediaDevices({
      getSupportedConstraints: () => ({ width: true, height: true, frameRate: true }),
    });
    const video = liveTrack('video', 'Studio camera', {
      deviceId: 'camera-1',
      width: 1_280,
      height: 720,
      frameRate: 29.97,
    });
    const audio = liveTrack('audio', 'Desk microphone', { deviceId: 'microphone-1' });

    expect(supportsLocal1080pProfile()).toBe(true);
    expect(readCaptureStreamSettings(streamFrom(video, audio))).toEqual({
      video: {
        label: 'Studio camera',
        deviceId: 'camera-1',
        width: 1_280,
        height: 720,
        frameRate: 29.97,
      },
      audio: { label: 'Desk microphone', deviceId: 'microphone-1' },
    });
  });
});
