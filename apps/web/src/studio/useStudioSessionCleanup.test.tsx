// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStudioSessionCleanup } from './useStudioSessionCleanup';

afterEach(cleanup);

describe('useStudioSessionCleanup', () => {
  it('cancels temporary state before releasing media, whichever path ends the session', async () => {
    const order: string[] = [];
    const cleanupTemporaryState = vi.fn(() => {
      order.push('cancel-operations');
    });
    const releaseMedia = vi.fn(() => {
      order.push('release-media');
    });
    const { result } = renderHook(() =>
      useStudioSessionCleanup({ cleanupTemporaryState, releaseMedia }),
    );

    await result.current();

    expect(cleanupTemporaryState).toHaveBeenCalledOnce();
    expect(releaseMedia).toHaveBeenCalledOnce();
    expect(order).toEqual(['cancel-operations', 'release-media']);
  });

  it('shares one coordinator across renders so repeat runs do not stack registrations', async () => {
    const cleanupTemporaryState = vi.fn();
    const releaseMedia = vi.fn();
    const { result, rerender } = renderHook(() =>
      useStudioSessionCleanup({ cleanupTemporaryState, releaseMedia }),
    );

    rerender();
    await result.current();

    expect(cleanupTemporaryState).toHaveBeenCalledOnce();
    expect(releaseMedia).toHaveBeenCalledOnce();
  });
});
