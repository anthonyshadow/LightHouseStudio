import { lazy, Suspense, type RefObject } from 'react';
import type { BrowserCapabilities } from '../application/types';
import type { ExistingVideoSavedRecipe } from '../features/existing-video/ExistingVideoRecipeChooser';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import type { SaveVideoState } from '../features/saved-videos/useSaveVideo';
import { OverlayPanel } from '../ui';
import type { useProviderAvailability } from './useProviderAvailability';
import type { useStudioCharacterWorkflow } from './useStudioCharacterWorkflow';
import type { useStudioSavedVideoController } from './useStudioSavedVideoController';
import type { useTakeReviewFlow } from './useTakeReviewFlow';

const ExistingVideoPanel = lazy(() =>
  import('../features/existing-video/ExistingVideoPanel').then((module) => ({
    default: module.ExistingVideoPanel,
  })),
);

export const StudioExistingVideoOverlay = ({
  open,
  existingVideo,
  provider,
  browser,
  savedRecipes,
  character,
  takeReview,
  savedVideo,
  saveVideoState,
  editVideoToggleRef,
  uploadToggleRef,
  onClose,
  onFinish,
  onStartRecording,
}: {
  readonly open: boolean;
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
  readonly provider: ReturnType<typeof useProviderAvailability>;
  readonly browser: BrowserCapabilities;
  readonly savedRecipes: readonly ExistingVideoSavedRecipe[];
  readonly character: ReturnType<typeof useStudioCharacterWorkflow>;
  readonly takeReview: ReturnType<typeof useTakeReviewFlow>;
  readonly savedVideo: ReturnType<typeof useStudioSavedVideoController>;
  readonly saveVideoState: SaveVideoState;
  readonly editVideoToggleRef: RefObject<HTMLButtonElement | null>;
  readonly uploadToggleRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly onFinish: () => void;
  readonly onStartRecording: () => void;
}) => {
  const { availability } = provider;
  const { recording } = takeReview;

  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title="Use existing video"
      description="Add a source, choose optional edits, then compare and save the result."
      placement="right"
      size="workspace"
      bodyMode="contained"
      closeDisabled={existingVideo.providerActive}
      closeOnBackdrop={!existingVideo.selection}
      returnFocusRef={recording.presented ? editVideoToggleRef : uploadToggleRef}
    >
      <Suspense fallback={<p role="status">Loading studio tool…</p>}>
        <ExistingVideoPanel
          key={existingVideo.selection?.metadata.selectedAt ?? 'empty-existing-video'}
          workflow={existingVideo}
          videoProcessingAvailable={Boolean(
            availability.videoProcessing?.characterSwap.available ||
            availability.videoProcessing?.virtualTryOn.available,
          )}
          {...(availability.videoProcessing
            ? { videoProcessingCapabilities: availability.videoProcessing }
            : {})}
          elevenLabsAvailable={availability.elevenLabs}
          elevenLabsModel={availability.elevenLabsModel}
          browserCapabilities={browser}
          savedRecipes={savedRecipes}
          onCreateCharacter={character.createForExistingVideo}
          onCreateWardrobeVariant={character.openWardrobeForExistingVideo}
          onFinish={onFinish}
          {...(recording.presented ? { onSaveVideo: savedVideo.requestSavePresentedVideo } : {})}
          saveVideoState={saveVideoState}
          onAdjustVideo={savedVideo.openVideoAdjust}
          recordingSupported={
            browser.mediaRecorder && browser.mediaDevices && browser.secureContext
          }
          onRecordVideo={onStartRecording}
        />
      </Suspense>
    </OverlayPanel>
  );
};
