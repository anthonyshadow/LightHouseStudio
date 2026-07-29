// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCapturePreferences } from './useCapturePreferences';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

const device = (
  kind: MediaDeviceKind,
  deviceId: string,
  label: string,
  facingModes: readonly string[] = [],
): MediaDeviceInfo =>
  ({
    kind,
    deviceId,
    label,
    groupId: '',
    getCapabilities: () => ({ facingMode: facingModes }),
    toJSON: () => ({}),
  }) as unknown as MediaDeviceInfo;

const streamWithLiveVideo = {
  getVideoTracks: () => [{ readyState: 'live' }],
  getAudioTracks: () => [],
} as unknown as MediaStream;

afterEach(() => {
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('useCapturePreferences', () => {
  it('refreshes on device changes without selecting a newly discovered phone', async () => {
    let devices = [device('videoinput', 'camera-1', 'Built-in Camera')];
    let deviceChangeListener: EventListener | null = null;
    const enumerateDevices = vi.fn(() => Promise.resolve(devices));
    const removeEventListener = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices,
        getSupportedConstraints: () => ({}),
        addEventListener: vi.fn((_event: string, listener: EventListener) => {
          deviceChangeListener = listener;
        }),
        removeEventListener,
      },
    });
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useCapturePreferences({ stream: null, onApply }));

    await act(async () => {
      await result.current.refreshDevices();
    });
    act(() => result.current.updateVideoDeviceId('camera-1'));
    await act(async () => {
      await result.current.apply();
    });

    devices = [
      device('videoinput', 'camera-1', 'Built-in Camera'),
      device('videoinput', 'phone-1', 'Creator’s iPhone Camera'),
    ];
    act(() => {
      deviceChangeListener?.(new Event('devicechange'));
    });

    await waitFor(() =>
      expect(result.current.cameraDevices).toEqual([
        { deviceId: 'camera-1', label: 'Built-in Camera', facingModes: [] },
        { deviceId: 'phone-1', label: 'Creator’s iPhone Camera', facingModes: [] },
      ]),
    );
    expect(result.current.applied.videoDeviceId).toBe('camera-1');
    expect(result.current.draft.videoDeviceId).toBe('camera-1');

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
  });

  it('retains an unavailable camera preference while resolving startup to the default', async () => {
    let devices = [
      device('videoinput', 'camera-1', 'Built-in Camera'),
      device('videoinput', 'phone-1', 'Continuity Camera'),
    ];
    let deviceChangeListener: EventListener | null = null;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn(() => Promise.resolve(devices)),
        getSupportedConstraints: () => ({}),
        addEventListener: vi.fn((_event: string, listener: EventListener) => {
          deviceChangeListener = listener;
        }),
        removeEventListener: vi.fn(),
      },
    });
    const { result } = renderHook(() =>
      useCapturePreferences({ stream: null, onApply: vi.fn().mockResolvedValue(undefined) }),
    );

    await act(async () => {
      await result.current.refreshDevices();
    });
    act(() => result.current.updateVideoDeviceId('phone-1'));
    await act(async () => {
      await result.current.apply();
    });

    devices = [device('videoinput', 'camera-1', 'Built-in Camera')];
    act(() => {
      deviceChangeListener?.(new Event('devicechange'));
    });

    await waitFor(() => expect(result.current.effectiveApplied.videoDeviceId).toBeNull());
    expect(result.current.applied.videoDeviceId).toBe('phone-1');
    expect(result.current.videoFallbackNotice).toMatch(/default camera will be used/i);

    act(() => result.current.dismissVideoFallbackNotice());
    expect(result.current.videoFallbackNotice).toBeNull();
  });

  it('shares one apply operation across same-tick callers', async () => {
    const pending = deferred<void>();
    const onApply = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useCapturePreferences({ stream: null, onApply }), {
      wrapper: StrictMode,
    });

    act(() => result.current.updateVideoDeviceId('camera-2'));

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.apply();
      second = result.current.apply();
    });

    expect(first).toBe(second);
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledWith({
      videoDeviceId: 'camera-2',
      audioDeviceId: null,
      profile: '720p30',
    });
    expect(result.current.applying).toBe(true);

    await act(async () => {
      pending.resolve();
      await expect(first).resolves.toBe(true);
    });
    expect(result.current.applying).toBe(false);
    expect(result.current.hasPendingChanges).toBe(false);
  });

  it('rescans after a live stream grants permission so phone cameras become discoverable', async () => {
    let scan = 0;
    const enumerateDevices = vi.fn(() => {
      scan += 1;
      return Promise.resolve(
        scan === 1
          ? [device('videoinput', 'camera-1', '')]
          : [
              device('videoinput', 'camera-1', 'Front Camera', ['user']),
              device('videoinput', 'camera-2', 'Back Camera', ['environment']),
            ],
      );
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices,
        getSupportedConstraints: () => ({}),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCapturePreferences({ stream: streamWithLiveVideo, onApply }),
    );

    await waitFor(() =>
      expect(result.current.cameraDevices).toEqual([
        { deviceId: 'camera-1', label: 'Front Camera', facingModes: ['user'] },
        { deviceId: 'camera-2', label: 'Back Camera', facingModes: ['environment'] },
      ]),
    );
    expect(enumerateDevices).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('does not publish a late apply result after unmount', async () => {
    const pending = deferred<void>();
    const onApply = vi.fn(() => pending.promise);
    const { result, unmount } = renderHook(() => useCapturePreferences({ stream: null, onApply }));

    act(() => result.current.updateAudioDeviceId('microphone-2'));
    const request = result.current.apply();
    unmount();
    pending.resolve();

    await expect(request).resolves.toBe(true);
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('clears the in-flight guard after a failed apply so retry can succeed', async () => {
    const onApply = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('device failed'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useCapturePreferences({ stream: null, onApply }));

    act(() => result.current.updateVideoDeviceId('camera-3'));
    await act(async () => {
      await expect(result.current.apply()).resolves.toBe(false);
    });
    expect(result.current.applyError).not.toBeNull();

    await act(async () => {
      await expect(result.current.apply()).resolves.toBe(true);
    });
    expect(onApply).toHaveBeenCalledTimes(2);
    expect(result.current.applyError).toBeNull();
  });
});
