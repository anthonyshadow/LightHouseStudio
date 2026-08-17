import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { useAuth } from '../../application/auth/AuthProvider';
import { SessionCleanupCoordinator } from '../../orchestration/lifecycle/SessionCleanupCoordinator';
import { useStudioLogoutController } from '../../studio/useStudioLogoutController';
import { useStudioSessionExpiryController } from '../../studio/useStudioSessionExpiryController';
import { APP_PATHS } from '../paths';
import {
  hasDiscardableStudioWork,
  hasUninterruptibleStudioWork,
  NO_STUDIO_RUNTIME_STATUS,
  type StudioRuntimeRegistry,
  type StudioRuntimeStatus,
} from './studioRuntimeWork';

/**
 * Everything that has to happen when an authenticated session ends, voluntarily or not.
 *
 * This lives in the shell rather than the Studio runtime because the shell is what stays mounted.
 * The teardown hold is the reason: while a hold is registered, `expire()` parks in `'expiring'` so
 * the operator can be told what is about to be lost instead of being dropped at a login screen.
 * When only the Studio runtime held it, that protection existed on Studio routes and nowhere else —
 * a session expiring on the Dashboard took the redirect with no warning.
 *
 * The runtime reports what it is holding through {@link StudioRuntimeRegistry}; with no runtime
 * mounted the answer is {@link NO_STUDIO_RUNTIME_WORK}, which is correct rather than merely safe —
 * nothing transient can exist without the capture graph that owns it.
 */
export const useAuthenticatedSessionLifecycle = (auth: ReturnType<typeof useAuth>) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StudioRuntimeStatus>(NO_STUDIO_RUNTIME_STATUS);
  const { work, creativeLocks } = status;
  const cleanup = useMemo(() => new SessionCleanupCoordinator(), []);

  const registry = useMemo<StudioRuntimeRegistry>(
    () => ({ cleanup, report: setStatus }),
    [cleanup],
  );
  const runCleanup = useCallback(async () => {
    await cleanup.run();
  }, [cleanup]);

  const hasTemporaryWork = hasDiscardableStudioWork(work);
  const hasActiveWork = hasUninterruptibleStudioWork(work);

  const handleLoggedOut = useCallback(() => {
    void navigate(APP_PATHS.entry, { replace: true });
  }, [navigate]);

  const logout = useStudioLogoutController({
    projectSourceActivity: work.projectSourceActivity,
    projectSession: work.projectSession,
    hasTemporaryWork,
    hasActiveWork,
    runCleanup,
    logout: auth.logout,
    onLoggedOut: handleLoggedOut,
  });

  // Holding session teardown is what keeps the shell — and whatever in-memory work the runtime has
  // reported — alive long enough to say what is about to be lost. Releasing on unmount is the
  // backstop: if the shell goes away for any other reason, the session finalizes and the redirect
  // proceeds. The route error boundary sits above the shell precisely so a runtime crash still
  // reaches this release.
  const holdSessionEnd = auth.holdSessionEnd;
  useEffect(() => holdSessionEnd(), [holdSessionEnd]);

  const sessionEnding = auth.status === 'expiring';
  const sessionExpiry = useStudioSessionExpiryController({
    expiring: sessionEnding,
    projectSourceActivity: work.projectSourceActivity,
    projectSession: work.projectSession,
    hasTemporaryWork,
    hasActiveWork,
    runCleanup,
    completeSessionEnd: auth.completeSessionEnd,
  });

  return { registry, logout, sessionExpiry, sessionEnding, work, creativeLocks } as const;
};
