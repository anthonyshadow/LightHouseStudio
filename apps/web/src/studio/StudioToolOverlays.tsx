import { resolveCharacterVersion } from '@studio/domain';
import { lazy, Suspense, type RefObject } from 'react';
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
import { StudioCharacterSelectorOverlay } from './StudioCharacterSelectorOverlay';
import { StudioTakeOverlays } from './StudioTakeOverlays';
import type { useProviderAvailability } from './useProviderAvailability';
import type { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import type { useStudioCharacterWorkflow } from './useStudioCharacterWorkflow';
import type { useStudioOutfitWorkflow } from './useStudioOutfitWorkflow';
import type { ActiveOverlay } from './useStudioOverlayController';
import type { useStudioSavedVideoController } from './useStudioSavedVideoController';
import type { useTakeReviewFlow } from './useTakeReviewFlow';
import { REVIEW_LOCK_REASON } from './studioPolicies';

const CharacterBuilderCoordinator = lazy(() =>
  import('../features/character-builder/CharacterBuilderCoordinator').then((module) => ({
    default: module.CharacterBuilderCoordinator,
  })),
);
const CharacterWardrobePanel = lazy(() =>
  import('../features/character-wardrobe/CharacterWardrobePanel').then((module) => ({
    default: module.CharacterWardrobePanel,
  })),
);
const ExistingVideoPanel = lazy(() =>
  import('../features/existing-video/ExistingVideoPanel').then((module) => ({
    default: module.ExistingVideoPanel,
  })),
);
const OutfitBuilder = lazy(() =>
  import('../features/creative-assets/OutfitBuilder').then((module) => ({
    default: module.OutfitBuilder,
  })),
);
const OutfitSelector = lazy(() =>
  import('../features/creative-assets/OutfitSelector').then((module) => ({
    default: module.OutfitSelector,
  })),
);
const ConfirmationDialog = lazy(() =>
  import('../ui/primitives/ConfirmationDialog').then((module) => ({
    default: module.ConfirmationDialog,
  })),
);

const deferredToolFallback = <p role="status">Loading studio tool…</p>;

interface StudioToolOverlaysProps {
  readonly ownerUserId: string;
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
  readonly characterSelectorRef: RefObject<HTMLButtonElement | null>;
  readonly outfitToggleRef: RefObject<HTMLButtonElement | null>;
  readonly shelfToggleRef: RefObject<HTMLButtonElement | null>;
  readonly dockToggleRef: RefObject<HTMLButtonElement | null>;
  readonly editVideoToggleRef: RefObject<HTMLButtonElement | null>;
  readonly uploadToggleRef: RefObject<HTMLButtonElement | null>;
  readonly onOpenOverlay: (overlay: Exclude<ActiveOverlay, null>) => void;
  readonly onCloseOverlay: () => void;
  readonly onCloseExistingVideo: () => void;
  readonly onFinishExistingVideo: () => void;
  readonly onStartExistingVideoRecording: () => void;
  readonly onDiscardExistingVideoSelection: () => void;
  readonly onOpenExistingVideo: () => void;
  readonly onOpenSavedRecipesFor: (mode: ModelMode) => void;
  readonly onConfigureVirtualTryOn: () => void;
  readonly onStartPreparedAi: (mode: ModelMode) => void;
  readonly onUnselectCharacter: () => void;
  readonly onUnselectAi: () => void;
}

export const StudioToolOverlays = ({
  ownerUserId,
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
  characterSelectorRef,
  outfitToggleRef,
  shelfToggleRef,
  dockToggleRef,
  editVideoToggleRef,
  uploadToggleRef,
  onOpenOverlay,
  onCloseOverlay,
  onCloseExistingVideo,
  onFinishExistingVideo,
  onStartExistingVideoRecording,
  onDiscardExistingVideoSelection,
  onOpenExistingVideo,
  onOpenSavedRecipesFor,
  onConfigureVirtualTryOn,
  onStartPreparedAi,
  onUnselectCharacter,
  onUnselectAi,
}: StudioToolOverlaysProps) => {
  const { availability, state: capabilityState } = provider;
  const { recording, processing, recordingActive, mediaLocked } = takeReview;
  const { activeCharacterName, activeRecipeLabel, referenceUsePending, recipeInsertionBlocked } =
    handoff.state;
  const applyRecipeSelection = handoff.actions.useRecipe;

  return (
    <>
      <OverlayPanel
        open={activeOverlay === 'video-upload'}
        onClose={onCloseExistingVideo}
        title="Use existing video"
        description="Add a source, choose optional edits, then compare and save the result."
        placement="right"
        size="workspace"
        bodyMode="contained"
        closeDisabled={existingVideo.providerActive}
        closeOnBackdrop={!existingVideo.selection}
        returnFocusRef={recording.presented ? editVideoToggleRef : uploadToggleRef}
      >
        <Suspense fallback={deferredToolFallback}>
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
            onFinish={onFinishExistingVideo}
            {...(recording.presented ? { onSaveVideo: savedVideo.requestSavePresentedVideo } : {})}
            saveVideoState={saveVideoState}
            onAdjustVideo={savedVideo.openVideoAdjust}
            recordingSupported={
              browser.mediaRecorder && browser.mediaDevices && browser.secureContext
            }
            onRecordVideo={onStartExistingVideoRecording}
          />
        </Suspense>
      </OverlayPanel>

      <OverlayPanel
        open={activeOverlay === 'outfit-selector'}
        onClose={onCloseOverlay}
        title="Outfit"
        description="Create an outfit, or select a saved or recently used Virtual Try-On recipe."
        placement="right"
        bodyMode="scroll"
        returnFocusRef={desktopStudioLayout ? outfitToggleRef : shelfToggleRef}
      >
        {activeOverlay === 'outfit-selector' ? (
          <Suspense fallback={deferredToolFallback}>
            <OutfitSelector
              repository={repository}
              activeOutfitLabel={
                session.draft.mode === 'lucy-vton-latest' && hasDraftContent(session.draft)
                  ? (activeRecipeLabel ?? 'Configured VTO')
                  : undefined
              }
              onClear={onUnselectAi}
              disabledReason={
                recipeInsertionBlocked
                  ? 'Release the active media session before selecting another outfit.'
                  : characterOpenBlockedReason
              }
              onCreate={() => outfit.openNew(true, 'selector')}
              onEdit={(savedOutfit) => outfit.openEditor(savedOutfit, false, 'selector')}
              onSaveCopy={(savedOutfit) => outfit.openEditor(savedOutfit, true, 'selector')}
              onSelect={applyRecipeSelection}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={activeOverlay === 'outfit-builder'}
        onClose={outfit.close}
        title={outfit.launch.outfit ? 'Edit outfit' : 'Create a new outfit'}
        description="Choose Prompt or Reference image, then name and save the reusable outfit."
        placement="right"
        bodyMode="scroll"
        closeOnBackdrop={false}
        returnFocusRef={
          outfit.launch.destination === 'shelf'
            ? shelfToggleRef
            : desktopStudioLayout
              ? outfitToggleRef
              : shelfToggleRef
        }
      >
        {activeOverlay === 'outfit-builder' ? (
          <Suspense fallback={deferredToolFallback}>
            <OutfitBuilder
              key={`${outfit.launch.outfit?.id ?? 'new'}:${outfit.launch.saveAsCopy ? 'copy' : 'edit'}`}
              repository={repository}
              {...(outfit.launch.outfit ? { initialOutfit: outfit.launch.outfit } : {})}
              saveAsCopy={outfit.launch.saveAsCopy}
              saveAndSelect={outfit.launch.saveAndSelect}
              disabledReason={characterOpenBlockedReason}
              onDirtyChange={outfit.updateDirty}
              onCancel={outfit.close}
              onSaved={outfit.completeSave}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>

      <StudioCharacterSelectorOverlay
        open={activeOverlay === 'character-selector'}
        returnFocusRef={desktopStudioLayout ? characterSelectorRef : shelfToggleRef}
        activeCharacterName={activeCharacterName}
        activeCharacter={activeCharacterRecord}
        editBlockedReason={characterOpenBlockedReason}
        removalBlockedReason={characterRemovalBlockedReason}
        recordingActive={recordingActive}
        onClose={onCloseOverlay}
        onEdit={character.edit}
        onOpenWardrobe={character.openWardrobe}
        onUnselect={onUnselectCharacter}
        onCreate={character.openNew}
        onChooseSaved={() => onOpenSavedRecipesFor('lucy-latest')}
      />

      <OverlayPanel
        open={activeOverlay === 'character-wardrobe' && Boolean(character.wardrobeCharacter)}
        onClose={character.closeWardrobe}
        title={
          character.wardrobeCharacter
            ? `${character.wardrobeCharacter.name} wardrobe`
            : 'Character wardrobe'
        }
        description="Browse the original and saved variants, or create a new version without changing the parent character."
        placement={desktopStudioLayout ? 'right' : 'fullscreen'}
        size="wide"
        bodyMode="contained"
        closeOnBackdrop={!character.wardrobeDirty}
        returnFocusRef={desktopStudioLayout ? characterSelectorRef : shelfToggleRef}
      >
        {character.wardrobeCharacter ? (
          <Suspense fallback={deferredToolFallback}>
            <CharacterWardrobePanel
              repository={repository}
              store={store}
              character={character.wardrobeCharacter}
              addOutfitAvailable={Boolean(availability.wardrobeAddOutfitAvailable)}
              changeFeaturesAvailable={Boolean(availability.referenceImageEditAvailable)}
              elevenLabsAvailable={availability.elevenLabs}
              savedOutfits={store.savedPrompts.filter(
                (savedOutfit) => savedOutfit.modelModeId === 'lucy-vton-latest',
              )}
              useDisabled={recipeInsertionBlocked || referenceUsePending}
              onDirtyChange={character.setWardrobeDirty}
              onClose={character.closeWardrobe}
              {...(character.wardrobeExistingVideoStepId
                ? { onSaved: character.finishWardrobeVariantForExistingVideo }
                : {})}
              onUse={(selection) => {
                const resolved = resolveCharacterVersion(repository.getSnapshot().store, selection);
                if (!resolved) return;
                applyRecipeSelection({
                  origin: 'character-prompt',
                  prompt: resolved.prompt,
                  modelModeId: 'lucy-latest',
                  assetId: resolved.character.id,
                  characterName: resolved.displayLabel,
                  referenceImageAssetId: resolved.referenceImageAssetId,
                  ...(resolved.variant ? { savedCharacterVariantId: resolved.variant.id } : {}),
                  ...(resolved.character.builderDraft
                    ? { builderDraft: resolved.character.builderDraft }
                    : {}),
                });
              }}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>

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
        onClose={onCloseOverlay}
        onStartCharacter={() => onStartPreparedAi('lucy-latest')}
        onCreateCharacter={character.openNew}
        onChooseSavedCharacter={() => onOpenSavedRecipesFor('lucy-latest')}
        onStartVirtualTryOn={() => onStartPreparedAi('lucy-vton-latest')}
        onConfigureVirtualTryOn={onConfigureVirtualTryOn}
        onChooseSavedVirtualTryOn={() => onOpenSavedRecipesFor('lucy-vton-latest')}
      />

      <OverlayPanel
        open={activeOverlay === 'recipe-dock'}
        onClose={onCloseOverlay}
        title="Recipe Dock"
        description="Prepare freely. Camera and provider work begin only from explicit actions."
        placement="right"
        bodyMode="contained"
        returnFocusRef={dockToggleRef}
      >
        <SessionComposer
          embedded
          session={advancedLiveSession}
          recording={mediaLocked}
          {...(activeCharacterName ? { activeCharacterName } : {})}
          {...(takeReview.reviewLocked
            ? {
                lockReason: REVIEW_LOCK_REASON,
              }
            : {})}
          onOpenWorkshop={handoff.actions.openWorkshop}
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
        editVideoToggleRef={editVideoToggleRef}
        dockToggleRef={dockToggleRef}
        onClose={onCloseOverlay}
        onDiscardTake={onDiscardExistingVideoSelection}
        {...(existingVideo.selection ? { onEditVideo: onOpenExistingVideo } : {})}
        onOpenVoiceTreatments={() => onOpenOverlay('voice-treatments')}
        onBackToTakeReview={() => onOpenOverlay('take-review')}
        {...(recording.presented ? { onSaveVideo: savedVideo.requestSavePresentedVideo } : {})}
        saveVideoState={saveVideoState}
        {...(savedVideo.activeLoadedSource &&
        recording.presented?.id !== savedVideo.activeLoadedSource.artifactId
          ? { onReplaceSavedVideo: () => void savedVideo.replaceLoadedSavedVideo() }
          : {})}
      />

      {activeOverlay === 'character-builder' ? (
        <Suspense fallback={deferredToolFallback}>
          <CharacterBuilderCoordinator
            open
            ownerUserId={ownerUserId}
            target={character.launch.target}
            {...(character.launch.initialValue
              ? { initialValue: character.launch.initialValue }
              : {})}
            returnFocusRef={
              character.destination.kind === 'existing-video'
                ? editVideoToggleRef
                : desktopStudioLayout
                  ? characterSelectorRef
                  : shelfToggleRef
            }
            generationAvailable={Boolean(availability.referenceImages)}
            optimizationAvailable={Boolean(availability.referenceImageOptimizerAvailable)}
            editAvailable={Boolean(availability.referenceImageEditAvailable)}
            {...(availability.referenceImageProvider !== undefined
              ? { referenceImageProvider: availability.referenceImageProvider }
              : {})}
            {...(availability.referenceImageModel !== undefined
              ? { referenceImageModel: availability.referenceImageModel }
              : {})}
            {...(availability.referenceImageOptimizerModel !== undefined
              ? { referenceImageOptimizerModel: availability.referenceImageOptimizerModel }
              : {})}
            {...(character.saveBlockedReason
              ? { saveBlockedReason: character.saveBlockedReason }
              : {})}
            onSaveCharacter={character.saveCharacter}
            onDismiss={character.dismissBuilder}
          />
        </Suspense>
      ) : null}

      <Suspense fallback={null}>
        <ConfirmationDialog
          open={character.discardPrompt !== null}
          title="Unfinished character draft"
          description={
            character.discardPrompt ??
            'An unfinished character draft exists. Continue and discard it?'
          }
          confirmLabel="Continue"
          cancelLabel="Cancel"
          danger
          onCancel={() => character.resolveDiscard(false)}
          onConfirm={() => character.resolveDiscard(true)}
        />
      </Suspense>
    </>
  );
};
