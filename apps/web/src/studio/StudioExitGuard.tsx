import { useCallback, useEffect } from 'react';
import { useBlocker } from 'react-router';
import { isStudioPath } from '../app/paths';
import { Button } from '../ui/primitives/Button';
import { ConfirmationDialog } from '../ui/primitives/ConfirmationDialog';
import { OverlayPanel } from '../ui/primitives/OverlayPanel';

export interface StudioExitGuardProps {
  readonly recordingOrFinalizing: boolean;
  readonly videoRenderingActive: boolean;
  readonly hasTemporaryTake: boolean;
  readonly voiceProcessingActive: boolean;
  readonly shelfDirty: boolean;
  readonly onDiscardTemporaryWork: () => void;
}

export const shouldBlockStudioExit = (
  currentPathname: string,
  nextPathname: string,
  unsafeWorkActive: boolean,
): boolean => isStudioPath(currentPathname) && !isStudioPath(nextPathname) && unsafeWorkActive;

export const StudioExitGuard = ({
  recordingOrFinalizing,
  videoRenderingActive,
  hasTemporaryTake,
  voiceProcessingActive,
  shelfDirty,
  onDiscardTemporaryWork,
}: StudioExitGuardProps) => {
  const hasDiscardableWork = hasTemporaryTake || voiceProcessingActive || shelfDirty;
  const unsafeWorkActive = recordingOrFinalizing || videoRenderingActive || hasDiscardableWork;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    shouldBlockStudioExit(currentLocation.pathname, nextLocation.pathname, unsafeWorkActive),
  );

  useEffect(() => {
    if (!recordingOrFinalizing && !videoRenderingActive && !voiceProcessingActive && !shelfDirty)
      return;

    const protectTransientWork = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectTransientWork);
    return () => window.removeEventListener('beforeunload', protectTransientWork);
  }, [recordingOrFinalizing, shelfDirty, videoRenderingActive, voiceProcessingActive]);

  const stayInStudio = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const discardAndLeave = useCallback(() => {
    if (blocker.state !== 'blocked') return;
    onDiscardTemporaryWork();
    blocker.proceed();
  }, [blocker, onDiscardTemporaryWork]);

  const navigationBlocked = blocker.state === 'blocked';
  const activeWorkExitBlocked =
    navigationBlocked && (recordingOrFinalizing || videoRenderingActive);
  const discardConfirmationOpen = navigationBlocked && !activeWorkExitBlocked && hasDiscardableWork;

  return (
    <>
      <OverlayPanel
        open={activeWorkExitBlocked}
        onClose={stayInStudio}
        title={
          videoRenderingActive
            ? 'Cancel the video render before leaving'
            : 'Finish the take before leaving'
        }
        description={
          videoRenderingActive
            ? 'Studio cannot abandon a local video worker. Stay here, cancel the render, then discard or save the draft before leaving.'
            : 'Studio cannot leave while recording or finalization is active. Stay here, finish the take, then try again.'
        }
        placement="bottom"
        size="standard"
        closeOnBackdrop={false}
        footer={
          <Button variant="primary" onClick={stayInStudio}>
            Stay in Studio
          </Button>
        }
      >
        <p>
          {videoRenderingActive
            ? 'Return to the edit settings and cancel the active render before leaving Studio.'
            : 'Stop the recording and wait for the take to finish finalizing before leaving Studio.'}
        </p>
      </OverlayPanel>

      <ConfirmationDialog
        open={discardConfirmationOpen}
        title="Discard temporary work and leave?"
        description="Leaving Studio discards the current temporary take, active Voice work, unsaved video edits, and Recipe Shelf changes. Saved browser-local items remain available."
        confirmLabel="Discard and leave"
        cancelLabel="Stay in Studio"
        danger
        onCancel={stayInStudio}
        onConfirm={discardAndLeave}
      />
    </>
  );
};
