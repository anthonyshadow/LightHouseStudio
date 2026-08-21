import { lazy, Suspense, type RefObject } from 'react';
import { SaveVideoDialog } from '../features/saved-videos/SaveVideoDialog';
import { defaultSavedVideoName } from '../features/saved-videos/useSaveVideo';
import type { useProjectWorkingMediaController } from '../features/projects/useProjectWorkingMediaController';
import type { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import type { useStudioSavedVideoController } from './useStudioSavedVideoController';

const ConfirmationDialog = lazy(() =>
  import('../ui/primitives/ConfirmationDialog').then((module) => ({
    default: module.ConfirmationDialog,
  })),
);
// Deferred with the other post-review surfaces: it is only reachable after a save completes, and
// the Studio runtime's static closure has a hard byte budget.
const SaveVideoSuccessPanel = lazy(() =>
  import('../features/saved-videos/SaveVideoSuccessPanel').then((module) => ({
    default: module.SaveVideoSuccessPanel,
  })),
);

/**
 * The dialogs a take can raise: naming a save, its completion panel, and the two decisions that
 * close a local edit. Session-level dialogs — confirmations, logout, expiry — belong to the shell,
 * which outlives this runtime.
 */
interface StudioLifecycleDialogsProps {
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly savedVideo: ReturnType<typeof useStudioSavedVideoController>;
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
  savedVideo,
  videoEditor,
  projectWorkingMedia,
  saveSuccessSuppressed,
  onOpenSavedVideosLibrary,
  onCreateAnotherVideo,
}: StudioLifecycleDialogsProps) => (
  <>
    {savedVideo.pendingSave ? (
      <SaveVideoDialog
        fallbackName={defaultSavedVideoName(savedVideo.pendingSave.artifact)}
        source={
          savedVideo.pendingSave.intent === 'presented' ? savedVideo.pendingSave.geometry : null
        }
        placementRender={{
          phase: savedVideo.placementRender.phase,
          progress: savedVideo.placementRender.progress,
          error: savedVideo.placementRender.error,
          onCancel: savedVideo.placementRender.cancel,
        }}
        onCancel={savedVideo.dismissPendingSave}
        onSave={(name, thumbnail, placement) =>
          void savedVideo.confirmPendingSave(name, thumbnail, placement)
        }
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

    <Suspense fallback={null}>
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
          title="Make this render the current cut?"
          description={
            projectWorkingMedia.message ??
            'This render only exists on your device until you keep it. Keeping it stores and checks the file, then makes it what this Project works from now. Your original video stays as it is, and no video or version is saved.'
          }
          confirmLabel={projectWorkingMedia.busy ? 'Saving current cut…' : 'Use as the current cut'}
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
