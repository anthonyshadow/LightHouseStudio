import { describe, expect, it, vi } from 'vitest';
import { CpuAdmissionQueue } from './cpu-admission-queue.js';

describe('CpuAdmissionQueue', () => {
  it('bounds active work and removes an aborted waiter before it starts', async () => {
    const queue = new CpuAdmissionQueue(1);
    let releaseFirst: (() => void) | undefined;
    const first = queue.run(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const queuedOperation = vi.fn(() => Promise.resolve());
    const controller = new AbortController();
    const second = queue.run(queuedOperation, controller.signal);

    controller.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(queuedOperation).not.toHaveBeenCalled();

    releaseFirst?.();
    await first;
  });
});
