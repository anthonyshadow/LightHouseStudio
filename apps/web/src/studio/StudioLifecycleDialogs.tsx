import { lazy, Suspense, type RefObject } from 'react';
import { SaveVideoDialog } from '../features/saved-videos/SaveVideoDialog';
import { defaultSavedVideoName } from '../features/saved-videos/useSaveVideo';
import type { useProjectWorkingMediaController } from '../features/projects/useProjectWorkingMediaController';
import type { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import { Button, OverlayPanel } from '../ui';
import type { useStudioLogoutController } from './useStudioLogoutController';
import type { useStudioSavedVideoController } from './useStudioSavedVideoController';

const ConfirmationDialog = lazy(() =>
  import('../ui/primitives/ConfirmationDialog').then((module) => ({
    default: module.ConfirmationDialog,
  })),
);

interface StudioLifecycleDialogsProps {
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly logout: ReturnType<typeof useStudioLogoutController>;
  readonly savedVideo: ReturnType<typeof useStudioSavedVideoController>;
  readonly videoEditor: ReturnType<typeof useVideoEditSession>;
  readonly projectContextActive: boolean;
  readonly projectWorkingMedia: ReturnType<typeof useProjectWorkingMediaController>;
}

export const StudioLifecycleDialogs = ({
  mainRef,
  logout,
  savedVideo,
  videoEditor,
  projectContextActive,
  projectWorkingMedia,
}: StudioLifecycleDialogsProps) => (
  <>
    {savedVideo.pendingSave ? (
      <SaveVideoDialog
        fallbackName={defaultSavedVideoName(savedVideo.pendingSave.artifact)}
        onCancel={savedVideo.dismissPendingSave}
        onSave={savedVideo.confirmPendingSave}
      />
    ) : null}

    <Suspense fallback={null}>
      <ConfirmationDialog
        open={logout.promptOpen}
        title={
          logout.hasProjectProposal
            ? 'Log out and discard unsaved Project changes?'
            : 'Log out and discard temporary work?'
        }
        description={
          logout.hasProjectProposal
            ? 'Project saving did not complete. Logging out now explicitly discards the preserved local proposal plus any temporary media or library work. Server-saved Project revisions remain available.'
            : 'Logging out stops local media and discards the current temporary take, active source staging, active Voice work, unsaved video edits, and unsaved library changes. Saved account items remain available.'
        }
        confirmLabel={logout.busy ? 'Logging out…' : 'Log out and discard'}
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
      {projectContextActive ? (
        <ConfirmationDialog
          open={videoEditor.phase === 'awaiting-replacement'}
          title="Adopt Render preview as Project working media?"
          description={
            projectWorkingMedia.message ??
            'The validated render is temporary until adoption stores, inspects, and checksums it. Adoption advances working/presented media without replacing the immutable original or creating a Saved Video or Version.'
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
          description="The validated edit will become the new immutable source for Voice and later video tools. You can save the current source to Saved Videos first."
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
