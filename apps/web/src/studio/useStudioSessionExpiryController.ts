import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectSourceActivity } from '../features/projects/useProjectSourceController';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';

interface UseStudioSessionExpiryControllerOptions {
  readonly expiring: boolean;
  readonly projectSourceActivity: ProjectSourceActivity | null;
  readonly projectSession: ProjectSessionPort | null;
  readonly hasTemporaryWork: boolean;
  readonly hasActiveWork: boolean;
  readonly runCleanup: () => Promise<void>;
  readonly completeSessionEnd: () => void;
}

/**
 * The involuntary twin of {@link import('./useStudioLogoutController').useStudioLogoutController}.
 *
 * A session can end underneath the user at any moment — a TTL timer or any same-origin 401. The
 * session is genuinely gone by then, so there is nothing to flush: a Project save would 401 like
 * everything else. What the user is owed is the chance to see what ends before it does, which is
 * why the redirect is held until this controller finalizes.
 */
export const useStudioSessionExpiryController = ({
  expiring,
  projectSourceActivity,
  projectSession,
  hasTemporaryWork,
  hasActiveWork,
  runCleanup,
  completeSessionEnd,
}: UseStudioSessionExpiryControllerOptions) => {
  const [notice, setNotice] = useState<{
    readonly activeWork: boolean;
    readonly projectProposal: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Mirrored into a ref so the decision effect can depend on `expiring` alone. Pollers keep running
  // during expiry and a failing one can flip these flags; the decision must reflect the moment the
  // session ended, not whatever a background request settled on afterwards. Declared before the
  // decision effect so it refreshes first on the commit that starts an expiry.
  const workRef = useRef({
    hasTemporaryWork,
    hasActiveWork,
    hasProjectProposal: projectSession?.hasLocalProposal ?? false,
  });
  useEffect(() => {
    workRef.current = {
      hasTemporaryWork,
      hasActiveWork,
      hasProjectProposal: projectSession?.hasLocalProposal ?? false,
    };
  });

  const decidedRef = useRef(false);
  useEffect(() => {
    if (!expiring) {
      decidedRef.current = false;
      return;
    }
    if (decidedRef.current) return;
    decidedRef.current = true;
    const work = workRef.current;
    // Nothing to lose: end it now. Media is released on unmount either way, so this stays
    // indistinguishable from the immediate redirect this path always had.
    if (!work.hasTemporaryWork && !work.hasActiveWork && !work.hasProjectProposal) {
      completeSessionEnd();
      return;
    }
    setNotice({ activeWork: work.hasActiveWork, projectProposal: work.hasProjectProposal });
  }, [completeSessionEnd, expiring]);

  const acknowledge = useCallback(() => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        projectSourceActivity?.abort?.();
        projectSession?.discard();
        await runCleanup();
      } catch {
        // Deliberately unlike the logout path, which keeps the user in Studio when cleanup fails.
        // There is no session left to stay in, so finalize regardless and let unmount release what
        // the coordinator could not.
      } finally {
        setBusy(false);
        setNotice(null);
        completeSessionEnd();
      }
    })();
  }, [busy, completeSessionEnd, projectSession, projectSourceActivity, runCleanup]);

  return {
    noticeOpen: notice !== null,
    hasActiveWork: notice?.activeWork ?? false,
    hasProjectProposal: notice?.projectProposal ?? false,
    busy,
    acknowledge,
  } as const;
};
