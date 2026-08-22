import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useBlocker, useLocation } from 'react-router';
import { APP_PATHS, isProjectWorkspacePath, projectIdFromPath } from '../app/paths';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import { Button } from '../ui/primitives/Button';
import { ConfirmationDialog } from '../ui/primitives/ConfirmationDialog';
import { OverlayPanel } from '../ui/primitives/OverlayPanel';

export interface StudioExitGuardProps {
  readonly recordingOrFinalizing: boolean;
  readonly videoRenderingActive: boolean;
  readonly hasTemporaryTake: boolean;
  readonly voiceProcessingActive: boolean;
  readonly creativeWorkDirty: boolean;
  readonly projectContextDirty?: boolean;
  readonly projectSourceActivity?: Readonly<{
    projectId: string;
    accepted: boolean;
    busy: boolean;
    abort: (() => void) | null;
  }> | null;
  readonly projectSession?: ProjectSessionPort | null;
  /**
   * True while the session is ending underneath the user. The expiry notice already names what is
   * about to be lost and owns the discard, so this guard must not raise a second prompt over the
   * redirect that follows it.
   */
  readonly sessionEnding?: boolean;
  readonly onDiscardTemporaryWork: () => void;
}

const hasUnacceptedProjectDraft = (
  currentProjectId: string | null,
  hasTemporaryTake: boolean,
  projectSourceActivity: StudioExitGuardProps['projectSourceActivity'],
): boolean =>
  hasTemporaryTake &&
  (currentProjectId === null ||
    (projectSourceActivity?.projectId === currentProjectId && !projectSourceActivity.accepted));

const studioWorkspaceKeyFromPath = (pathname: string): string | null => {
  if (pathname === APP_PATHS.create || pathname === APP_PATHS.live) return 'studio:create';
  if (!isProjectWorkspacePath(pathname)) return null;
  const projectId = projectIdFromPath(pathname);
  return projectId === null ? null : `project:${projectId}`;
};

export const shouldBlockStudioExit = (
  currentPathname: string,
  nextPathname: string,
  unsafeWorkActive: boolean,
): boolean => {
  const currentWorkspace = studioWorkspaceKeyFromPath(currentPathname);
  return (
    unsafeWorkActive &&
    currentWorkspace !== null &&
    currentWorkspace !== studioWorkspaceKeyFromPath(nextPathname)
  );
};

export const shouldBlockProjectContextChange = (
  currentPathname: string,
  nextPathname: string,
  unsafeProjectWorkActive: boolean,
): boolean => {
  const currentProjectId = projectIdFromPath(currentPathname);
  const nextProjectId = projectIdFromPath(nextPathname);
  return (
    unsafeProjectWorkActive &&
    currentProjectId !== nextProjectId &&
    (currentProjectId !== null || nextProjectId !== null)
  );
};

export const StudioExitGuard = ({
  recordingOrFinalizing,
  videoRenderingActive,
  hasTemporaryTake,
  voiceProcessingActive,
  creativeWorkDirty,
  projectContextDirty = false,
  projectSourceActivity = null,
  projectSession = null,
  sessionEnding = false,
  onDiscardTemporaryWork,
}: StudioExitGuardProps) => {
  const location = useLocation();
  const projectSourceStaging = projectSourceActivity?.busy ?? false;
  const projectSavePending =
    projectSession?.hasLocalProposal === true || projectSession?.phase === 'saving';
  const hasDiscardableWork =
    hasTemporaryTake ||
    voiceProcessingActive ||
    creativeWorkDirty ||
    projectContextDirty ||
    projectSourceStaging;
  const unsafeWorkActive =
    recordingOrFinalizing || videoRenderingActive || hasDiscardableWork || projectSavePending;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (sessionEnding) return false;
    const currentProjectId = projectIdFromPath(currentLocation.pathname);
    const projectDraftActive = hasUnacceptedProjectDraft(
      currentProjectId,
      hasTemporaryTake,
      projectSourceActivity,
    );
    const unsafeProjectWorkActive =
      recordingOrFinalizing ||
      videoRenderingActive ||
      voiceProcessingActive ||
      projectContextDirty ||
      projectSourceStaging ||
      projectDraftActive ||
      projectSavePending;
    const workspaceExitUnsafe =
      currentProjectId === null ? unsafeWorkActive : unsafeProjectWorkActive;
    return (
      shouldBlockStudioExit(currentLocation.pathname, nextLocation.pathname, workspaceExitUnsafe) ||
      shouldBlockProjectContextChange(
        currentLocation.pathname,
        nextLocation.pathname,
        unsafeProjectWorkActive,
      )
    );
  });

  const otherWorkBlocks = useCallback(
    (nextPathname: string): boolean => {
      const currentProjectId = projectIdFromPath(location.pathname);
      const projectDraftActive = hasUnacceptedProjectDraft(
        currentProjectId,
        hasTemporaryTake,
        projectSourceActivity,
      );
      const unsafeProjectWorkActive =
        recordingOrFinalizing ||
        videoRenderingActive ||
        voiceProcessingActive ||
        projectContextDirty ||
        projectSourceStaging ||
        projectDraftActive;
      const outsideStudioBlocked = shouldBlockStudioExit(
        location.pathname,
        nextPathname,
        currentProjectId === null
          ? recordingOrFinalizing || videoRenderingActive || hasDiscardableWork
          : unsafeProjectWorkActive,
      );
      const projectChangeBlocked = shouldBlockProjectContextChange(
        location.pathname,
        nextPathname,
        unsafeProjectWorkActive,
      );
      return outsideStudioBlocked || projectChangeBlocked;
    },
    [
      hasDiscardableWork,
      hasTemporaryTake,
      location.pathname,
      projectSourceActivity,
      projectSourceStaging,
      projectContextDirty,
      recordingOrFinalizing,
      videoRenderingActive,
      voiceProcessingActive,
    ],
  );

  /**
   * The blocker as of the latest render. An awaited save resolves against a snapshot captured
   * before it started, which cannot see an intervening "Stay here" — proceeding on that dead
   * snapshot either throws an invalid state transition or navigates to a destination the operator
   * already declined. Continuations therefore re-read the live blocker, and only proceed while it
   * still blocks the same destination they saved for.
   */
  const blockerRef = useRef(blocker);
  useLayoutEffect(() => {
    blockerRef.current = blocker;
  }, [blocker]);
  const proceedIfStillBlocking = useCallback((destination: string) => {
    const live = blockerRef.current;
    if (live.state !== 'blocked' || live.location.pathname !== destination) return;
    live.proceed();
  }, []);

  const saveAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (blocker.state !== 'blocked') {
      saveAttemptRef.current = null;
      return;
    }
    if (
      projectSession === null ||
      projectSession.projectId !== projectIdFromPath(location.pathname) ||
      !projectSavePending ||
      projectSession.phase === 'conflict' ||
      projectSession.phase === 'error'
    ) {
      return;
    }
    const destination = blocker.location.pathname;
    if (saveAttemptRef.current === destination) return;
    saveAttemptRef.current = destination;
    void projectSession.flush().then((saved) => {
      saveAttemptRef.current = null;
      if (saved && !otherWorkBlocks(destination)) proceedIfStillBlocking(destination);
    });
  }, [
    blocker,
    location.pathname,
    otherWorkBlocks,
    proceedIfStillBlocking,
    projectSavePending,
    projectSession,
  ]);

  useEffect(() => {
    if (
      !recordingOrFinalizing &&
      !videoRenderingActive &&
      !voiceProcessingActive &&
      !creativeWorkDirty &&
      !projectContextDirty &&
      !projectSourceStaging &&
      !projectSavePending
    )
      return;

    const protectTransientWork = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectTransientWork);
    return () => window.removeEventListener('beforeunload', protectTransientWork);
  }, [
    projectSourceStaging,
    projectContextDirty,
    projectSavePending,
    recordingOrFinalizing,
    creativeWorkDirty,
    videoRenderingActive,
    voiceProcessingActive,
  ]);

  const stayInStudio = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const discardAndLeave = useCallback(() => {
    if (blocker.state !== 'blocked') return;
    projectSourceActivity?.abort?.();
    projectSession?.discard();
    onDiscardTemporaryWork();
    blocker.proceed();
  }, [blocker, onDiscardTemporaryWork, projectSession, projectSourceActivity]);

  const retrySaveAndLeave = useCallback(() => {
    if (blocker.state !== 'blocked' || projectSession === null) return;
    const destination = blocker.location.pathname;
    void projectSession.retry().then((saved) => {
      if (saved && !otherWorkBlocks(destination)) proceedIfStillBlocking(destination);
    });
  }, [blocker, otherWorkBlocks, proceedIfStillBlocking, projectSession]);

  const navigationBlocked = blocker.state === 'blocked';
  const projectContextChangeBlocked =
    blocker.state === 'blocked' &&
    shouldBlockProjectContextChange(location.pathname, blocker.location.pathname, true);
  const activeWorkExitBlocked =
    navigationBlocked && (recordingOrFinalizing || videoRenderingActive);
  const projectSaveBlocked =
    navigationBlocked && !activeWorkExitBlocked && projectSavePending && projectSession !== null;
  const projectSaveFailed =
    projectSaveBlocked && (projectSession.phase === 'conflict' || projectSession.phase === 'error');
  const projectSaveInProgress = projectSaveBlocked && !projectSaveFailed;
  const temporaryWorkPromptOpen =
    navigationBlocked &&
    !activeWorkExitBlocked &&
    !projectSaveInProgress &&
    !projectSaveFailed &&
    hasDiscardableWork;
  const projectDiscardConfirmationOpen = temporaryWorkPromptOpen && projectContextChangeBlocked;
  const discardConfirmationOpen = temporaryWorkPromptOpen && !projectContextChangeBlocked;
  const currentProjectId = projectIdFromPath(location.pathname);
  const destinationProjectId =
    blocker.state === 'blocked' ? projectIdFromPath(blocker.location.pathname) : null;
  const projectDiscardCopy =
    currentProjectId === null
      ? {
          title: 'Discard temporary Studio work and open this Project?',
          description:
            'Opening a Project now discards the current in-memory take, active Voice work, unsaved edits, and unsaved creative configuration. Saved Studio resources remain available.',
          confirmLabel: 'Discard and open Project',
        }
      : destinationProjectId === null
        ? {
            title: 'Discard temporary Project work and leave this Project?',
            description:
              'Leaving this Project now cancels active source staging and discards finalized in-memory recordings, active Voice work, unsaved edits, and unsaved creative configuration. Server-accepted source and autosaved Project changes remain attached to this Project.',
            confirmLabel: 'Discard and leave Project',
          }
        : {
            title: 'Discard temporary Project work and switch Projects?',
            description:
              'Switching Projects now cancels active source staging and discards finalized in-memory recordings, active Voice work, unsaved edits, and unsaved creative configuration. Server-accepted source and autosaved Project changes remain attached to the original Project.',
            confirmLabel: 'Discard and switch',
          };
  const activeWorkCopy = videoRenderingActive
    ? projectContextChangeBlocked
      ? {
          title: 'Finish Project media work before switching Projects',
          description:
            'This Project is still rendering or updating its current cut. Stay here until that finishes or can be cancelled.',
          detail:
            'Finish or cancel the active media operation before choosing another Project or leaving its workspace.',
        }
      : {
          title: 'Cancel the video render before leaving',
          description:
            'Studio cannot abandon a local video worker. Stay here, cancel the render, then discard or save the draft before leaving.',
          detail: 'Return to the edit settings and cancel the active render before leaving Studio.',
        }
    : {
        title: projectContextChangeBlocked
          ? 'Finish the take before switching Projects'
          : 'Finish the take before leaving',
        description: projectContextChangeBlocked
          ? 'This recording belongs to the current Project. Finish the take and let finalization reach a safe point before switching.'
          : 'Studio cannot leave while recording or finalization is active. Stay here, finish the take, then try again.',
        detail: projectContextChangeBlocked
          ? 'Stop the recording and wait for the finalized take before choosing another Project.'
          : 'Stop the recording and wait for the take to finish finalizing before leaving Studio.',
      };

  return (
    <>
      <OverlayPanel
        open={activeWorkExitBlocked}
        onClose={stayInStudio}
        title={activeWorkCopy.title}
        description={activeWorkCopy.description}
        placement="bottom"
        size="standard"
        closeOnBackdrop={false}
        footer={
          <Button variant="primary" onClick={stayInStudio}>
            {projectContextChangeBlocked ? 'Stay in Project' : 'Stay in Studio'}
          </Button>
        }
      >
        <p>{activeWorkCopy.detail}</p>
      </OverlayPanel>

      <OverlayPanel
        open={projectSaveInProgress}
        onClose={stayInStudio}
        title="Saving Project before leaving"
        description="Lightframe is saving your progress before leaving this Project."
        placement="bottom"
        size="standard"
        closeOnBackdrop={false}
        footer={
          <Button onClick={stayInStudio}>
            {projectContextChangeBlocked ? 'Stay in Project' : 'Stay in Studio'}
          </Button>
        }
      >
        <p role="status">Saving changes…</p>
      </OverlayPanel>

      <OverlayPanel
        open={projectSaveFailed}
        onClose={stayInStudio}
        title={projectSession?.phase === 'conflict' ? 'Project save conflict' : 'Project not saved'}
        description="Lightframe did not open that destination. Your unsaved changes are still here."
        placement="bottom"
        size="standard"
        closeOnBackdrop={false}
        footer={
          <>
            <Button onClick={stayInStudio}>Stay in Project</Button>
            <Button onClick={retrySaveAndLeave}>Reapply and leave</Button>
            <Button variant="danger" onClick={discardAndLeave}>
              Discard and leave
            </Button>
          </>
        }
      >
        <p role="alert">
          {projectSession?.message ??
            'Lightframe could not be reached. Try saving again, or discard these changes.'}
        </p>
      </OverlayPanel>

      <ConfirmationDialog
        open={projectDiscardConfirmationOpen}
        title={projectDiscardCopy.title}
        description={projectDiscardCopy.description}
        confirmLabel={projectDiscardCopy.confirmLabel}
        cancelLabel="Stay in Project"
        danger
        onCancel={stayInStudio}
        onConfirm={discardAndLeave}
      />

      <ConfirmationDialog
        open={discardConfirmationOpen}
        title="Discard temporary work and leave?"
        description="Leaving Studio discards the current temporary take, active Project source staging, active Voice work, unsaved video edits, and unsaved creative settings. Saved browser-local items remain available."
        confirmLabel="Discard and leave"
        cancelLabel="Stay in Studio"
        danger
        onCancel={stayInStudio}
        onConfirm={discardAndLeave}
      />
    </>
  );
};
