import { useCallback, useEffect } from 'react';
import { useBlocker, useLocation } from 'react-router';
import { isStudioPath, projectIdFromPath } from '../app/paths';
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
  readonly onDiscardTemporaryWork: () => void;
}

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
  onDiscardTemporaryWork,
}: StudioExitGuardProps) => {
  const location = useLocation();
  const projectSourceStaging = projectSourceActivity?.busy ?? false;
  const hasDiscardableWork =
    hasTemporaryTake || voiceProcessingActive || shelfDirty || projectSourceStaging;
  const unsafeWorkActive = recordingOrFinalizing || videoRenderingActive || hasDiscardableWork;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const currentProjectId = projectIdFromPath(currentLocation.pathname);
    const projectDraftActive =
      hasTemporaryTake &&
      (currentProjectId === null ||
        (projectSourceActivity?.projectId === currentProjectId && !projectSourceActivity.accepted));
    const unsafeProjectWorkActive =
      recordingOrFinalizing || projectSourceStaging || projectDraftActive;
    return (
      shouldBlockStudioExit(currentLocation.pathname, nextLocation.pathname, unsafeWorkActive) ||
      shouldBlockProjectContextChange(
        currentLocation.pathname,
        nextLocation.pathname,
        unsafeProjectWorkActive,
      )
    );
  });

  useEffect(() => {
    if (
      !recordingOrFinalizing &&
      !videoRenderingActive &&
      !voiceProcessingActive &&
      !shelfDirty &&
      !projectSourceStaging
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
    onDiscardTemporaryWork();
    blocker.proceed();
  }, [blocker, onDiscardTemporaryWork, projectSourceActivity]);

  const navigationBlocked = blocker.state === 'blocked';
  const projectContextChangeBlocked =
    blocker.state === 'blocked' &&
    shouldBlockProjectContextChange(location.pathname, blocker.location.pathname, true);
  const activeWorkExitBlocked =
    navigationBlocked && (recordingOrFinalizing || videoRenderingActive);
  const projectDiscardConfirmationOpen =
    projectContextChangeBlocked && !activeWorkExitBlocked && hasDiscardableWork;
  const discardConfirmationOpen =
    navigationBlocked &&
    !projectContextChangeBlocked &&
    !activeWorkExitBlocked &&
    hasDiscardableWork;
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
