import { lazy, Suspense, type RefObject } from 'react';
import { SaveVideoDialog } from '../features/saved-videos/SaveVideoDialog';
import { defaultSavedVideoName } from '../features/saved-videos/useSaveVideo';
import type { useProjectWorkingMediaController } from '../features/projects/useProjectWorkingMediaController';
import type { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import { Button, OverlayPanel } from '../ui';
import type { ConfirmationRequest } from './useConfirmationRequest';
import type { useStudioLogoutController } from './useStudioLogoutController';
import type { useStudioSavedVideoController } from './useStudioSavedVideoController';
import type { useStudioSessionExpiryController } from './useStudioSessionExpiryController';

const ConfirmationDialog = lazy(() =>
  import('../ui/primitives/ConfirmationDialog').then((module) => ({
    default: module.ConfirmationDialog,
  })),
);
// Deferred with the other post-review surfaces: it is only reachable after a save completes, and
// the Studio shell's static closure has a hard byte budget.
const SaveVideoSuccessPanel = lazy(() =>
  import('../features/saved-videos/SaveVideoSuccessPanel').then((module) => ({
    default: module.SaveVideoSuccessPanel,
  })),
);
const SessionExpiryNotice = lazy(() =>
  import('./SessionExpiryNotice').then((module) => ({ default: module.SessionExpiryNotice })),
);

interface StudioLifecycleDialogsProps {
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly logout: ReturnType<typeof useStudioLogoutController>;
  readonly sessionExpiry: ReturnType<typeof useStudioSessionExpiryController>;
  readonly savedVideo: ReturnType<typeof useStudioSavedVideoController>;
  /**
   * The shell's awaitable confirmations. Rendered here because this component already owns every
   * Studio-level confirmation, so there is one place that decides how a destructive question looks.
   */
  readonly confirmation: ConfirmationRequest;
  readonly videoEditor: ReturnType<typeof useVideoEditSession>;
  /**
   * Present only when a durable working-media owner is in play. Its presence *is* the signal that
   * a render is adopted rather than committed, so there is no second boolean to keep in agreement.
   */
  readonly projectWorkingMedia: ReturnType<typeof useProjectWorkingMediaController> | null;
  /**
   * Suppressed while a Project video context owns the save: that path attaches the new Video and
   * redirects to the Project, so a second completion surface would compete with it.
   */
  readonly saveSuccessSuppressed: boolean;
  readonly onOpenSavedVideosLibrary: () => void;
  readonly onCreateAnotherVideo: () => void;
}

export const StudioLifecycleDialogs = ({
  mainRef,
  logout,
  sessionExpiry,
  savedVideo,
  videoEditor,
  confirmation,
  projectWorkingMedia,
  saveSuccessSuppressed,
  onOpenSavedVideosLibrary,
  onCreateAnotherVideo,
}: StudioLifecycleDialogsProps) => (
  <>
    <Suspense fallback={null}>
      <ConfirmationDialog
        open={confirmation.pending !== null}
        title={confirmation.pending?.title ?? ''}
        description={confirmation.pending?.description ?? ''}
        confirmLabel={confirmation.pending?.confirmLabel ?? 'Confirm'}
        {...(confirmation.pending?.cancelLabel === undefined
          ? {}
          : { cancelLabel: confirmation.pending.cancelLabel })}
        danger={confirmation.pending?.danger ?? false}
        returnFocusRef={mainRef}
        onCancel={confirmation.cancel}
        onConfirm={confirmation.confirm}
      />
    </Suspense>

    {savedVideo.pendingSave ? (
      <SaveVideoDialog
        fallbackName={defaultSavedVideoName(savedVideo.pendingSave.artifact)}
        onCancel={savedVideo.dismissPendingSave}
        onSave={savedVideo.confirmPendingSave}
      />
    ) : null}

    <Suspense fallback={null}>
      <SaveVideoSuccessPanel
        video={saveSuccessSuppressed ? null : savedVideo.saveOutcome}
        returnFocusRef={mainRef}
        onDismiss={savedVideo.dismissSaveOutcome}
        onOpenInAssets={() => {
          savedVideo.dismissSaveOutcome();
          onOpenSavedVideosLibrary();
        }}
        onCreateAnother={() => {
          savedVideo.dismissSaveOutcome();
          onCreateAnotherVideo();
        }}
      />
    </Suspense>

    {/*
      Deferred like the other end-of-session surfaces: it is only reachable once a session actually
      expires, and the Studio shell's static closure has a hard byte budget. The chunk is a
      same-origin asset, not an API call, so the expired session does not block it; if it failed to
      load, the route error boundary would unmount the shell, which releases the teardown hold and
      completes the redirect — the pre-fix behaviour, not a stuck app.
    */}
    <Suspense fallback={null}>
      <SessionExpiryNotice
        open={sessionExpiry.noticeOpen}
        activeWork={sessionExpiry.hasActiveWork}
        projectProposal={sessionExpiry.hasProjectProposal}
        busy={sessionExpiry.busy}
        returnFocusRef={mainRef}
        onAcknowledge={sessionExpiry.acknowledge}
      />
    </Suspense>

    <Suspense fallback={null}>
      <ConfirmationDialog
        open={logout.promptOpen}
        title={
          logout.failure
            ? 'Could not log out'
            : logout.hasProjectProposal
              ? 'Log out and discard unsaved Project changes?'
              : 'Log out and discard temporary work?'
        }
        description={
          logout.failure
            ? 'Cleanup and sign-out did not complete. Lightframe kept you in Studio so you can retry without silently abandoning the session.'
            : logout.hasProjectProposal
              ? 'Project saving did not complete. Logging out now explicitly discards the preserved local proposal plus any temporary media or library work. Server-saved Project revisions remain available.'
              : 'Logging out stops local media and discards the current temporary take, active source staging, active Voice work, unsaved video edits, and unsaved library changes. Saved account items remain available.'
        }
        alert={logout.failure ?? undefined}
        confirmLabel={
          logout.busy ? 'Logging out…' : logout.failure ? 'Retry logout' : 'Log out and discard'
        }
        cancelLabel="Stay in Studio"
        danger
        busy={logout.busy}
        returnFocusRef={mainRef}
        onCancel={logout.dismissPrompt}
        onConfirm={logout.confirmDiscard}
      />
      <OverlayPanel
        open={logout.blockedOpen}
        onClose={logout.dismissBlocked}
        title="Finish active work before logging out"
        description="Stop recording, wait for finalization or provider processing, or cancel the active video render before logging out."
        placement="bottom"
        size="standard"
        returnFocusRef={mainRef}
        footer={
          <Button variant="primary" onClick={logout.dismissBlocked}>
            Return to Studio
          </Button>
        }
      >
        <p>Lightframe will not abandon active media work during logout.</p>
      </OverlayPanel>
      <ConfirmationDialog
        open={savedVideo.discardPromptOpen}
        title="Discard video edits?"
        description="Your current video stays unchanged. All trim, crop, rotation, lighting, and filter changes in this edit session will be discarded."
        confirmLabel="Discard edits"
        cancelLabel="Keep editing"
        danger
        returnFocusRef={mainRef}
        onCancel={savedVideo.dismissVideoEditDiscard}
        onConfirm={savedVideo.returnFromVideoEditor}
      />
      {projectWorkingMedia !== null ? (
        <ConfirmationDialog
          open={videoEditor.phase === 'awaiting-replacement'}
          title="Adopt Render preview as Project working media?"
          description={
            projectWorkingMedia.message ??
            'This render only exists on your device until you keep it. Keeping it stores and checks the file, then makes it the video this Project works from. Your original source stays as it is, and no Saved Video or Version is created.'
          }
          confirmLabel={
            projectWorkingMedia.busy ? 'Adopting working media…' : 'Adopt as working media'
          }
          cancelLabel="Keep editing"
          busy={projectWorkingMedia.busy}
          returnFocusRef={mainRef}
          onCancel={projectWorkingMedia.cancel}
          onConfirm={() => void projectWorkingMedia.adoptRenderPreview()}
        />
      ) : (
        <ConfirmationDialog
          open={videoEditor.phase === 'awaiting-replacement'}
          title="Replace the current video?"
          description="The edited video becomes the source that Voice and the other video tools work from, and it cannot be changed back. You can save the current one to Assets first."
          confirmLabel="Replace and Save"
          cancelLabel="Cancel"
          busy={videoEditor.phase === 'committing'}
          secondaryAction={{
            label: 'Replace Without Saving',
            onAction: () => void savedVideo.commitVideoEdit(false),
          }}
          returnFocusRef={mainRef}
          onCancel={videoEditor.resumeEditing}
          onConfirm={savedVideo.requestSaveAndCommitVideoEdit}
        />
      )}
    </Suspense>
  </>
);
