import { describe, expect, it, vi } from 'vitest';
import { SessionCleanupCoordinator } from './SessionCleanupCoordinator';

describe('SessionCleanupCoordinator', () => {
  it('coalesces cleanup and runs cancellation, media release, then cache cleanup', async () => {
    const events: string[] = [];
    const coordinator = new SessionCleanupCoordinator();
    coordinator.register('cache', 'clear-caches', () => {
      events.push('cache');
    });
    coordinator.register('media', 'release-media', async () => {
      await Promise.resolve();
      events.push('media');
    });
    coordinator.register('requests', 'cancel-operations', () => {
      events.push('requests');
    });

    const first = coordinator.run();
    const second = coordinator.run();
    expect(second).toBe(first);
    await first;
    expect(events).toEqual(['requests', 'media', 'cache']);
  });

  it('supports unregistering a cleanup owner before logout', async () => {
    const cleanup = vi.fn();
    const coordinator = new SessionCleanupCoordinator();
    const unregister = coordinator.register('feature', 'cancel-operations', cleanup);
    unregister();

    await coordinator.run();
    expect(cleanup).not.toHaveBeenCalled();
  });
});
