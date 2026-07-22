// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCapturePreferences } from './useCapturePreferences';

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
