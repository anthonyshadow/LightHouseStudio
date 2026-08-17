import { useEffect } from 'react';
import type { SessionCleanupCoordinator } from '../orchestration/lifecycle/SessionCleanupCoordinator';

interface UseStudioSessionCleanupOptions {
  /** The shell's coordinator. The runtime contributes steps to it; it does not own it. */
  readonly cleanup: SessionCleanupCoordinator;
  readonly cleanupTemporaryState: () => void | Promise<void>;
  readonly releaseMedia: () => void | Promise<void>;
}

/**
 * The Studio runtime's ordered teardown, registered into the shell's coordinator.
 *
 * One coordinator serves every way a local session ends — voluntary logout and session expiry both
 * run the same steps — so the two paths cannot drift onto separate coordinators and release
 * different things. The registrations are effects so an unmounting runtime withdraws them: the
 * shell must not try to release media that this runtime already released on its way out.
 */
export const useStudioSessionCleanup = ({
  cleanup,
  cleanupTemporaryState,
  releaseMedia,
}: UseStudioSessionCleanupOptions) => {
  useEffect(
    () => cleanup.register('studio-temporary-state', 'cancel-operations', cleanupTemporaryState),
    [cleanup, cleanupTemporaryState],
  );
  useEffect(
    () => cleanup.register('studio-media-session', 'release-media', releaseMedia),
    [cleanup, releaseMedia],
  );
};
