// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionCleanupCoordinator } from '../orchestration/lifecycle/SessionCleanupCoordinator';
import { useStudioSessionCleanup } from './useStudioSessionCleanup';

afterEach(cleanup);

describe('useStudioSessionCleanup', () => {
  it('cancels temporary state before releasing media, whichever path ends the session', async () => {
    const order: string[] = [];
    const coordinator = new SessionCleanupCoordinator();
    const cleanupTemporaryState = vi.fn(() => {
      order.push('cancel-operations');
    });
    const releaseMedia = vi.fn(() => {
      order.push('release-media');
    });
    renderHook(() =>
      useStudioSessionCleanup({ cleanup: coordinator, cleanupTemporaryState, releaseMedia }),
    );

    await coordinator.run();

    expect(cleanupTemporaryState).toHaveBeenCalledOnce();
    expect(releaseMedia).toHaveBeenCalledOnce();
    expect(order).toEqual(['cancel-operations', 'release-media']);
  });

  it('shares one coordinator across renders so repeat runs do not stack registrations', async () => {
    const coordinator = new SessionCleanupCoordinator();
    const cleanupTemporaryState = vi.fn();
    const releaseMedia = vi.fn();
    const { rerender } = renderHook(() =>
      useStudioSessionCleanup({ cleanup: coordinator, cleanupTemporaryState, releaseMedia }),
    );

    rerender();
    await coordinator.run();

    expect(cleanupTemporaryState).toHaveBeenCalledOnce();
    expect(releaseMedia).toHaveBeenCalledOnce();
  });

  it('withdraws its steps when the runtime unmounts, so the shell releases nothing twice', async () => {
    const coordinator = new SessionCleanupCoordinator();
    const cleanupTemporaryState = vi.fn();
    const releaseMedia = vi.fn();
    const { unmount } = renderHook(() =>
      useStudioSessionCleanup({ cleanup: coordinator, cleanupTemporaryState, releaseMedia }),
    );

    unmount();
    await coordinator.run();

    expect(cleanupTemporaryState).not.toHaveBeenCalled();
    expect(releaseMedia).not.toHaveBeenCalled();
  });
});
