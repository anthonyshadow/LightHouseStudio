import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectSourceActivity } from '../features/projects/useProjectSourceController';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import { SessionCleanupCoordinator } from '../orchestration/lifecycle/SessionCleanupCoordinator';

interface UseStudioLogoutControllerOptions {
  readonly projectSourceActivity: ProjectSourceActivity | null;
  readonly projectSession: ProjectSessionPort | null;
  readonly hasTemporaryWork: boolean;
  readonly hasActiveWork: boolean;
  readonly cleanupTemporaryState: () => void | Promise<void>;
  readonly releaseMedia: () => void | Promise<void>;
  readonly logout: () => Promise<void>;
  readonly onLoggedOut: () => void;
}

export const useStudioLogoutController = ({
  projectSourceActivity,
  projectSession,
  hasTemporaryWork,
  hasActiveWork,
  cleanupTemporaryState,
  releaseMedia,
  logout,
  onLoggedOut,
}: UseStudioLogoutControllerOptions) => {
  const cleanup = useMemo(() => new SessionCleanupCoordinator(), []);
  const [promptOpen, setPromptOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);

  useEffect(
    () => cleanup.register('studio-temporary-state', 'cancel-operations', cleanupTemporaryState),
    [cleanup, cleanupTemporaryState],
  );
  useEffect(
    () => cleanup.register('studio-media-session', 'release-media', releaseMedia),
    [cleanup, releaseMedia],
  );

  const complete = useCallback(
    async (discardPendingWork = false) => {
      if (busy) return;
      setBusy(true);
      setPromptOpen(false);
      try {
        if (discardPendingWork) {
          projectSourceActivity?.abort?.();
          projectSession?.discard();
        }
        await cleanup.run();
        await logout();
        onLoggedOut();
      } finally {
        setBusy(false);
      }
    },
    [busy, cleanup, logout, onLoggedOut, projectSession, projectSourceActivity],
  );

  const request = useCallback(async () => {
    if (hasActiveWork) {
      setBlockedOpen(true);
      return;
    }
    if (projectSession?.hasLocalProposal || projectSession?.phase === 'saving') {
      if (projectSession.phase === 'conflict' || projectSession.phase === 'error') {
        setPromptOpen(true);
        return;
      }
      setPreparing(true);
      const saved = await projectSession.flush();
      setPreparing(false);
      if (!saved) {
        setPromptOpen(true);
        return;
      }
    }
    if (hasTemporaryWork) {
      setPromptOpen(true);
      return;
    }
    void complete();
  }, [complete, hasActiveWork, hasTemporaryWork, projectSession]);

  return {
    promptOpen,
    blockedOpen,
    busy,
    preparing,
    hasProjectProposal: projectSession?.hasLocalProposal ?? false,
    request,
    dismissPrompt: () => setPromptOpen(false),
    dismissBlocked: () => setBlockedOpen(false),
    confirmDiscard: () => void complete(true),
  } as const;
};
