// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyCameraZoom,
  acquireLocalMedia,
  enumerateMediaDevices,
  readCameraDeviceFacingModes,
  readCameraFacingState,
  readCameraZoomState,
  readCameraPermissionState,
  readCaptureStreamSettings,
  subscribeToMediaDeviceChanges,
  supportsLocal1080pProfile,
  withCaptureDevices,
} from './browserMedia';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const originalPermissions = Object.getOwnPropertyDescriptor(navigator, 'permissions');

const installMediaDevices = (value: Partial<MediaDevices>) => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value,
  });
};

afterEach(() => {
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
  if (originalPermissions) Object.defineProperty(navigator, 'permissions', originalPermissions);
  else Reflect.deleteProperty(navigator, 'permissions');
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

  it('reads camera permission without prompting and owns device-change listener cleanup', async () => {
    const query = vi.fn().mockResolvedValue({ state: 'denied' });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query },
    });
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    installMediaDevices({ addEventListener, removeEventListener });
    const listener = vi.fn();

    await expect(readCameraPermissionState()).resolves.toBe('denied');
    const unsubscribe = subscribeToMediaDeviceChanges(listener);
    expect(query).toHaveBeenCalledWith({ name: 'camera' });
    expect(addEventListener).toHaveBeenCalledWith('devicechange', listener);

    unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith('devicechange', listener);
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

  it('uses the front-facing preference only when no exact camera was selected', async () => {
    const video = liveTrack('video', 'Front camera', { deviceId: 'camera-1' });
    const audio = liveTrack('audio', 'Microphone', { deviceId: 'microphone-1' });
    const getUserMedia = vi
      .fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockResolvedValue(streamFrom(video, audio));
    installMediaDevices({ getUserMedia });

    await acquireLocalMedia({ width: 1_280, height: 720, frameRate: 30 });

    expect(getUserMedia.mock.calls[0]?.[0]?.video).toMatchObject({
      facingMode: { ideal: 'user' },
    });
  });

  it('uses an exact facing mode without pinning a camera device', async () => {
    const video = liveTrack('video', 'Rear camera', { facingMode: 'environment' });
    const audio = liveTrack('audio', 'Microphone', { deviceId: 'microphone-1' });
    const getUserMedia = vi
      .fn<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>()
      .mockResolvedValue(streamFrom(video, audio));
    installMediaDevices({ getUserMedia });

    await acquireLocalMedia({
      width: 1_280,
      height: 720,
      frameRate: 30,
      facingMode: 'environment',
    });

    expect(getUserMedia.mock.calls[0]?.[0]?.video).toMatchObject({
      facingMode: { exact: 'environment' },
    });
    expect(getUserMedia.mock.calls[0]?.[0]?.video).not.toHaveProperty('deviceId');
  });

  it('shows facing-mode switching only when an opposite camera capability is exposed', () => {
    installMediaDevices({
      getSupportedConstraints: () => ({ facingMode: true }),
    });
    const frontDevice = {
      kind: 'videoinput',
      deviceId: 'front-camera',
      label: 'Front Camera',
      groupId: 'phone',
      getCapabilities: () => ({ facingMode: ['user'] }),
      toJSON: () => ({}),
    } as unknown as MediaDeviceInfo;
    const rearDevice = {
      kind: 'videoinput',
      deviceId: 'rear-camera',
      label: 'Rear Camera',
      groupId: 'phone',
      getCapabilities: () => ({ facingMode: ['environment'] }),
      toJSON: () => ({}),
    } as unknown as MediaDeviceInfo;
    const frontTrack = {
      getCapabilities: () => ({ facingMode: ['user'] }),
      getSettings: () => ({ facingMode: 'user' }),
    } as unknown as MediaStreamTrack;
    const desktopTrack = {
      getCapabilities: () => ({}),
      getSettings: () => ({}),
    } as unknown as MediaStreamTrack;
    const devices = [
      {
        deviceId: frontDevice.deviceId,
        label: frontDevice.label,
        facingModes: readCameraDeviceFacingModes(frontDevice),
      },
      {
        deviceId: rearDevice.deviceId,
        label: rearDevice.label,
        facingModes: readCameraDeviceFacingModes(rearDevice),
      },
    ];

    expect(readCameraFacingState(frontTrack, devices)).toEqual({
      current: 'user',
      next: 'environment',
    });
    expect(readCameraFacingState(desktopTrack, devices)).toBeNull();
    expect(readCameraFacingState(frontTrack, [devices[0]!])).toBeNull();
  });

  it('feature-detects and applies camera zoom without assuming browser support', async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = {
      getCapabilities: () => ({ zoom: { min: 1, max: 4, step: 0.5 } }),
      getSettings: () => ({ zoom: 2 }),
      applyConstraints,
    } as unknown as MediaStreamTrack;

    expect(readCameraZoomState(track)).toEqual({ min: 1, max: 4, step: 0.5, value: 2 });
    await expect(applyCameraZoom(track, 9)).resolves.toEqual({
      min: 1,
      max: 4,
      step: 0.5,
      value: 4,
    });
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 4 }] });
    expect(readCameraZoomState(undefined)).toBeNull();
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
