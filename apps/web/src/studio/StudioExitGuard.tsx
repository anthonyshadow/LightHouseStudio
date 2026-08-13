import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, useLocation } from 'react-router';
import { isStudioPath, projectIdFromPath } from '../app/paths';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import { Button } from '../ui/primitives/Button';
import { ConfirmationDialog } from '../ui/primitives/ConfirmationDialog';
import { OverlayPanel } from '../ui/primitives/OverlayPanel';

export interface StudioExitGuardProps {
  readonly recordingOrFinalizing: boolean;
  readonly videoRenderingActive: boolean;
  readonly hasTemporaryTake: boolean;
  readonly voiceProcessingActive: boolean;
  readonly shelfDirty: boolean;
  readonly projectSourceActivity?: Readonly<{
    projectId: string;
    accepted: boolean;
    busy: boolean;
    abort: (() => void) | null;
  }> | null;
  readonly projectSession?: ProjectSessionPort | null;
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

export const shouldBlockStudioExit = (
  currentPathname: string,
  nextPathname: string,
  unsafeWorkActive: boolean,
): boolean => isStudioPath(currentPathname) && !isStudioPath(nextPathname) && unsafeWorkActive;

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
  shelfDirty,
  projectSourceActivity = null,
  projectSession = null,
  onDiscardTemporaryWork,
}: StudioExitGuardProps) => {
  const location = useLocation();
  const projectSourceStaging = projectSourceActivity?.busy ?? false;
  const projectSavePending =
    projectSession?.hasLocalProposal === true || projectSession?.phase === 'saving';
  const hasDiscardableWork =
    hasTemporaryTake || voiceProcessingActive || shelfDirty || projectSourceStaging;
  const unsafeWorkActive =
    recordingOrFinalizing || videoRenderingActive || hasDiscardableWork || projectSavePending;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const currentProjectId = projectIdFromPath(currentLocation.pathname);
    const projectDraftActive = hasUnacceptedProjectDraft(
      currentProjectId,
      hasTemporaryTake,
      projectSourceActivity,
    );
    const unsafeProjectWorkActive =
      recordingOrFinalizing || projectSourceStaging || projectDraftActive || projectSavePending;
    return (
      shouldBlockStudioExit(currentLocation.pathname, nextLocation.pathname, unsafeWorkActive) ||
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
      const outsideStudioBlocked = shouldBlockStudioExit(
        location.pathname,
        nextPathname,
        recordingOrFinalizing || videoRenderingActive || hasDiscardableWork,
      );
      const projectChangeBlocked = shouldBlockProjectContextChange(
        location.pathname,
        nextPathname,
        recordingOrFinalizing || projectSourceStaging || projectDraftActive,
      );
      return outsideStudioBlocked || projectChangeBlocked;
    },
    [
      hasDiscardableWork,
      hasTemporaryTake,
      location.pathname,
      projectSourceActivity,
      projectSourceStaging,
      recordingOrFinalizing,
      videoRenderingActive,
    ],
  );

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
      if (saved && !otherWorkBlocks(destination) && blocker.state === 'blocked') blocker.proceed();
    });
  }, [blocker, location.pathname, otherWorkBlocks, projectSavePending, projectSession]);

  useEffect(() => {
    if (
      !recordingOrFinalizing &&
      !videoRenderingActive &&
      !voiceProcessingActive &&
      !shelfDirty &&
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
    projectSavePending,
    recordingOrFinalizing,
    shelfDirty,
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
      if (saved && !otherWorkBlocks(destination) && blocker.state === 'blocked') blocker.proceed();
    });
  }, [blocker, otherWorkBlocks, projectSession]);

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
  const activeWorkCopy = videoRenderingActive
    ? {
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
        description="Lightframe is flushing the current semantic checkpoint before changing Project context."
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
        description="The destination was not opened. Your local semantic proposal remains available in this Project."
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
            'Project authority is unavailable. Retry the preserved proposal or explicitly discard it.'}
        </p>
      </OverlayPanel>

      <ConfirmationDialog
        open={projectDiscardConfirmationOpen}
        title="Discard staged source work and switch Projects?"
        description="Switching now cancels the active source transfer or discards the finalized in-memory recording. Any source already accepted by the server remains attached to the original Project."
        confirmLabel="Discard and switch"
        cancelLabel="Stay in Project"
        danger
        onCancel={stayInStudio}
        onConfirm={discardAndLeave}
      />

      <ConfirmationDialog
        open={discardConfirmationOpen}
        title="Discard temporary work and leave?"
        description="Leaving Studio discards the current temporary take, active Project source staging, active Voice work, unsaved video edits, and Recipe Shelf changes. Saved browser-local items remain available."
        confirmLabel="Discard and leave"
        cancelLabel="Stay in Studio"
        danger
        onCancel={stayInStudio}
        onConfirm={discardAndLeave}
      />
    </>
  );
};
