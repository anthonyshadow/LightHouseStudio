import { useCallback, useState } from 'react';
import type { ProjectSourceActivity } from '../features/projects/useProjectSourceController';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';

interface UseStudioLogoutControllerOptions {
  readonly projectSourceActivity: ProjectSourceActivity | null;
  readonly projectSession: ProjectSessionPort | null;
  readonly hasTemporaryWork: boolean;
  readonly hasActiveWork: boolean;
  readonly runCleanup: () => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly onLoggedOut: () => void;
}

export const useStudioLogoutController = ({
  projectSourceActivity,
  projectSession,
  hasTemporaryWork,
  hasActiveWork,
  runCleanup,
  logout,
  onLoggedOut,
}: UseStudioLogoutControllerOptions) => {
  const [promptOpen, setPromptOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [failure, setFailure] = useState<{
    readonly message: string;
    readonly discardPendingWork: boolean;
  } | null>(null);

  const complete = useCallback(
    async (discardPendingWork = false) => {
      if (busy) return;
      setBusy(true);
      setPromptOpen(false);
      setFailure(null);
      try {
        if (discardPendingWork) {
          projectSourceActivity?.abort?.();
          projectSession?.discard();
        }
        await runCleanup();
        await logout();
        onLoggedOut();
      } catch {
        setFailure({
          message:
            'Lightframe could not finish local cleanup and sign-out. You are still in Studio; retry or stay and check the local API.',
          discardPendingWork,
        });
        setPromptOpen(true);
      } finally {
        setBusy(false);
      }
    },
    [busy, logout, onLoggedOut, projectSession, projectSourceActivity, runCleanup],
  );

  const request = useCallback(async () => {
    setFailure(null);
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
      let saved: boolean;
      try {
        saved = await projectSession.flush();
      } catch {
        saved = false;
      } finally {
        setPreparing(false);
      }
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
    failure: failure?.message ?? null,
    hasProjectProposal: projectSession?.hasLocalProposal ?? false,
    request,
    dismissPrompt: () => {
      setPromptOpen(false);
      setFailure(null);
    },
    dismissBlocked: () => setBlockedOpen(false),
    confirmDiscard: () => void complete(failure?.discardPendingWork ?? true),
  } as const;
};
