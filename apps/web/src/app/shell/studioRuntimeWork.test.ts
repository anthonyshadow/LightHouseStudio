import { describe, expect, it } from 'vitest';
import {
  hasDiscardableStudioWork,
  hasUninterruptibleStudioWork,
  NO_STUDIO_RUNTIME_STATUS,
  type StudioRuntimeWork,
} from './studioRuntimeWork';

const work = (overrides: Partial<StudioRuntimeWork> = {}): StudioRuntimeWork => ({
  ...NO_STUDIO_RUNTIME_STATUS.work,
  ...overrides,
});

describe('what the shell offers to discard', () => {
  it('asks about a take nothing has taken on', () => {
    expect(hasDiscardableStudioWork(work({ hasTemporaryTake: true, hasUnclaimedTake: true }))).toBe(
      true,
    );
  });

  it('says nothing about a Project video merely presented on the stage', () => {
    /*
     * The steady state of every Project that has a video: its source streamed from the server and
     * showing on the stage. Reading the broad fact, logout and session expiry offered to discard
     * bytes the server holds — work that was never at risk — and expiry stopped to ask instead of
     * redirecting. The route-exit guard was corrected for this; these two paths read the same
     * record and had been left behind.
     */
    expect(
      hasDiscardableStudioWork(work({ hasTemporaryTake: true, hasUnclaimedTake: false })),
    ).toBe(false);
  });

  it('still asks about every other kind of in-memory work', () => {
    for (const holding of [
      { voiceProcessingActive: true },
      { creativeWorkDirty: true },
      {
        projectSourceActivity: {
          projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
          phase: 'preparing' as const,
          busy: true,
          abort: null,
        },
      },
    ]) {
      expect(hasDiscardableStudioWork(work(holding))).toBe(true);
    }
  });

  it('holds nothing when no Studio runtime is mounted', () => {
    expect(hasDiscardableStudioWork(NO_STUDIO_RUNTIME_STATUS.work)).toBe(false);
    expect(hasUninterruptibleStudioWork(NO_STUDIO_RUNTIME_STATUS.work)).toBe(false);
  });
});
