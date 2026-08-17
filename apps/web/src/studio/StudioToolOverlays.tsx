import type { RefObject } from 'react';
import type { BrowserCapabilities, ModelMode } from '../application/types';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
} from '../features/creative-assets/types';
import type { ExistingVideoSavedRecipe } from '../features/existing-video/ExistingVideoRecipeChooser';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import { hasDraftContent, SessionComposer } from '../features/media-session';
import { CaptureSettingsPanel } from '../features/recording';
import type { SaveVideoState } from '../features/saved-videos/useSaveVideo';
import type { useStudioSession } from '../orchestration/session';
import { OverlayPanel } from '../ui';
import { AIExperienceChooser } from './AIExperienceChooser';
import { StudioCharacterOverlays } from './StudioCharacterOverlays';
import { StudioExistingVideoOverlay } from './StudioExistingVideoOverlay';
import { StudioOutfitOverlays } from './StudioOutfitOverlays';
import { StudioTakeOverlays } from './StudioTakeOverlays';
import type { useProviderAvailability } from './useProviderAvailability';
import type { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import type { useStudioCharacterWorkflow } from './useStudioCharacterWorkflow';
import type { useStudioOutfitWorkflow } from './useStudioOutfitWorkflow';
import type { ActiveOverlay } from './useStudioOverlayController';
import type { useStudioSavedVideoController } from './useStudioSavedVideoController';
import type { useTakeReviewFlow } from './useTakeReviewFlow';
import type { ProjectProcessingController } from '../features/projects/useProjectProcessingController';
import { REVIEW_LOCK_REASON } from './studioPolicies';

interface StudioToolOverlaysProps {
  readonly activeOverlay: ActiveOverlay;
  readonly desktopStudioLayout: boolean;
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly provider: ReturnType<typeof useProviderAvailability>;
  readonly browser: BrowserCapabilities;
  readonly session: ReturnType<typeof useStudioSession>;
  readonly advancedLiveSession: ReturnType<typeof useStudioSession>;
  readonly takeReview: ReturnType<typeof useTakeReviewFlow>;
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
  readonly savedVideo: ReturnType<typeof useStudioSavedVideoController>;
  readonly saveVideoState: SaveVideoState;
  readonly savedRecipes: readonly ExistingVideoSavedRecipe[];
  readonly handoff: ReturnType<typeof useReferenceRecipeHandoff>;
  readonly character: ReturnType<typeof useStudioCharacterWorkflow>;
  readonly outfit: ReturnType<typeof useStudioOutfitWorkflow>;
  readonly activeCharacterRecord: SavedCharacterPrompt | undefined;
  readonly characterOpenBlockedReason: string | undefined;
  readonly characterRemovalBlockedReason: string | undefined;
  readonly aiSessionActive: boolean;
  readonly captureSettingsDisabledReason: string | undefined;
  readonly providerStartBlockedReason?: string | undefined;
  readonly projectProcessing?: ProjectProcessingController | undefined;
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly characterSelectorRef: RefObject<HTMLButtonElement | null>;
  readonly outfitToggleRef: RefObject<HTMLButtonElement | null>;
  readonly editVideoToggleRef: RefObject<HTMLButtonElement | null>;
  readonly uploadToggleRef: RefObject<HTMLButtonElement | null>;
  readonly onOpenOverlay: (overlay: Exclude<ActiveOverlay, null>) => void;
  readonly onCloseOverlay: () => void;
  readonly onCloseExistingVideo: () => void;
  readonly onFinishExistingVideo: () => void;
  readonly onStartExistingVideoRecording: () => void;
  readonly onDiscardExistingVideoSelection: () => void;
  readonly onOpenExistingVideo: () => void;
  readonly onOpenSavedCharacters: () => void;
  readonly onOpenSavedOutfits: () => void;
  readonly onOpenSavedVideosLibrary: () => void;
  readonly onConfigureVirtualTryOn: () => void;
  readonly onStartPreparedAi: (mode: ModelMode) => void;
  readonly onUnselectCharacter: () => void;
  readonly onUnselectAi: () => void;
}

export const StudioToolOverlays = ({
  activeOverlay,
  desktopStudioLayout,
  repository,
  store,
  provider,
  browser,
  session,
  advancedLiveSession,
  takeReview,
  existingVideo,
  savedVideo,
  saveVideoState,
  savedRecipes,
  handoff,
  character,
  outfit,
  activeCharacterRecord,
  characterOpenBlockedReason,
  characterRemovalBlockedReason,
  aiSessionActive,
  captureSettingsDisabledReason,
  providerStartBlockedReason,
  projectProcessing,
  mainRef,
  characterSelectorRef,
  outfitToggleRef,
  editVideoToggleRef,
  uploadToggleRef,
  onOpenOverlay,
  onCloseOverlay,
  onCloseExistingVideo,
  onFinishExistingVideo,
  onStartExistingVideoRecording,
  onDiscardExistingVideoSelection,
  onOpenExistingVideo,
  onOpenSavedCharacters,
  onOpenSavedOutfits,
  onOpenSavedVideosLibrary,
  onConfigureVirtualTryOn,
  onStartPreparedAi,
  onUnselectCharacter,
  onUnselectAi,
}: StudioToolOverlaysProps) => {
  const { availability, state: capabilityState } = provider;
  const { recording, processing, recordingActive, mediaLocked } = takeReview;
  const { activeCharacterName } = handoff.state;

  return (
    <>
      <StudioExistingVideoOverlay
        open={activeOverlay === 'video-upload'}
        existingVideo={existingVideo}
        provider={provider}
        browser={browser}
        savedRecipes={savedRecipes}
        character={character}
        takeReview={takeReview}
        savedVideo={savedVideo}
        saveVideoState={saveVideoState}
        onOpenSavedVideosLibrary={onOpenSavedVideosLibrary}
        editVideoToggleRef={editVideoToggleRef}
        uploadToggleRef={uploadToggleRef}
        onClose={onCloseExistingVideo}
        onFinish={onFinishExistingVideo}
        onStartRecording={onStartExistingVideoRecording}
        {...(providerStartBlockedReason ? { providerStartBlockedReason } : {})}
        {...(projectProcessing ? { projectProcessing } : {})}
      />

      <StudioOutfitOverlays
        activeOverlay={activeOverlay}
        desktopStudioLayout={desktopStudioLayout}
        repository={repository}
        session={session}
        handoff={handoff}
        outfit={outfit}
        characterOpenBlockedReason={characterOpenBlockedReason}
        mainRef={mainRef}
        outfitToggleRef={outfitToggleRef}
        onClose={onCloseOverlay}
        onUnselectAi={onUnselectAi}
      />

      <StudioCharacterOverlays
        activeOverlay={activeOverlay}
        desktopStudioLayout={desktopStudioLayout}
        repository={repository}
        store={store}
        provider={provider}
        handoff={handoff}
        character={character}
        activeCharacterRecord={activeCharacterRecord}
        characterOpenBlockedReason={characterOpenBlockedReason}
        characterRemovalBlockedReason={characterRemovalBlockedReason}
        recordingActive={recordingActive}
        mainRef={mainRef}
        characterSelectorRef={characterSelectorRef}
        onClose={onCloseOverlay}
        onOpenSavedCharacters={onOpenSavedCharacters}
        onUnselectCharacter={onUnselectCharacter}
      />

      <AIExperienceChooser
        open={activeOverlay === 'ai-experience'}
        decartAvailable={availability.decart}
        capabilityState={capabilityState}
        {...(activeCharacterName ? { activeCharacterName } : {})}
        characterReady={
          Boolean(activeCharacterName) &&
          session.draft.mode === 'lucy-latest' &&
          hasDraftContent(session.draft)
        }
        virtualTryOnReady={
          session.draft.mode === 'lucy-vton-latest' && hasDraftContent(session.draft)
        }
        {...(providerStartBlockedReason ? { providerStartBlockedReason } : {})}
        onClose={onCloseOverlay}
        onStartCharacter={() => onStartPreparedAi('lucy-latest')}
        onCreateCharacter={character.openNew}
        onChooseSavedCharacter={onOpenSavedCharacters}
        onStartVirtualTryOn={() => onStartPreparedAi('lucy-vton-latest')}
        onConfigureVirtualTryOn={onConfigureVirtualTryOn}
        onChooseSavedVirtualTryOn={onOpenSavedOutfits}
      />

      <OverlayPanel
        open={activeOverlay === 'ai-settings'}
        onClose={onCloseOverlay}
        title="AI Settings"
        description="Prepare freely. Camera and provider work begin only from explicit actions."
        placement="right"
        bodyMode="contained"
        returnFocusRef={mainRef}
      >
        <SessionComposer
          embedded
          session={advancedLiveSession}
          recording={mediaLocked}
          {...(providerStartBlockedReason
            ? { modelStartBlockedReason: providerStartBlockedReason }
            : {})}
          {...(activeCharacterName ? { activeCharacterName } : {})}
          {...(takeReview.reviewLocked
            ? {
                lockReason: REVIEW_LOCK_REASON,
              }
            : {})}
          onOpenWorkshop={() => void handoff.actions.openWorkshop()}
        />
      </OverlayPanel>

      <OverlayPanel
        open={activeOverlay === 'capture-settings' && !desktopStudioLayout}
        onClose={onCloseOverlay}
        title="Capture Settings"
        description="Choose session-only sources, video format, and a local capture target without starting media."
        placement="right"
        bodyMode="contained"
      >
        {!desktopStudioLayout ? (
          <CaptureSettingsPanel
            controller={session.capturePreferences}
            mode={session.draft.mode}
            disabled={mediaLocked || aiSessionActive}
            {...(captureSettingsDisabledReason
              ? { disabledReason: captureSettingsDisabledReason }
              : {})}
          />
        ) : null}
      </OverlayPanel>

      <StudioTakeOverlays
        activeOverlay={activeOverlay}
        recording={recording}
        processing={processing}
        elevenLabsAvailable={availability.elevenLabs}
        elevenLabsModel={availability.elevenLabsModel}
        browserCapabilities={browser}
        mainRef={mainRef}
        onClose={onCloseOverlay}
        onDiscardTake={onDiscardExistingVideoSelection}
        {...(existingVideo.selection ? { onEditVideo: onOpenExistingVideo } : {})}
        onOpenVoiceTreatments={() => onOpenOverlay('voice-treatments')}
        onBackToTakeReview={() => onOpenOverlay('take-review')}
        {...(recording.presented ? { onSaveVideo: savedVideo.requestSavePresentedVideo } : {})}
        saveVideoState={saveVideoState}
        onOpenSavedVideosLibrary={onOpenSavedVideosLibrary}
        hasUnsavedChanges={savedVideo.presentedHasUnsavedChanges}
        {...(savedVideo.activeLoadedSource &&
        recording.presented?.id !== savedVideo.activeLoadedSource.artifactId
          ? { onReplaceSavedVideo: () => void savedVideo.replaceLoadedSavedVideo() }
          : {})}
      />
    </>
  );
};
