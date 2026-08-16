import { useCallback, useEffect, useMemo } from 'react';
import { SessionCleanupCoordinator } from '../orchestration/lifecycle/SessionCleanupCoordinator';

interface UseStudioSessionCleanupOptions {
  readonly cleanupTemporaryState: () => void | Promise<void>;
  readonly releaseMedia: () => void | Promise<void>;
}

/**
 * One coordinator for every way a local Studio session ends — voluntary logout and session expiry
 * both run the same ordered teardown. Keeping the registrations here means the two paths cannot
 * drift onto separate coordinators and release different things.
 */
export const useStudioSessionCleanup = ({
  cleanupTemporaryState,
  releaseMedia,
}: UseStudioSessionCleanupOptions) => {
  const cleanup = useMemo(() => new SessionCleanupCoordinator(), []);

  useEffect(
    () => cleanup.register('studio-temporary-state', 'cancel-operations', cleanupTemporaryState),
    [cleanup, cleanupTemporaryState],
  );
  useEffect(
    () => cleanup.register('studio-media-session', 'release-media', releaseMedia),
    [cleanup, releaseMedia],
  );

  return useCallback(async () => {
    await cleanup.run();
  }, [cleanup]);
};
