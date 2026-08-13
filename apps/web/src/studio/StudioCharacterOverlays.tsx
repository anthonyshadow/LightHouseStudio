import { resolveCharacterVersion } from '@studio/domain';
import { lazy, Suspense, type RefObject } from 'react';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
} from '../features/creative-assets/types';
import { OverlayPanel } from '../ui';
import { StudioCharacterSelectorOverlay } from './StudioCharacterSelectorOverlay';
import type { useProviderAvailability } from './useProviderAvailability';
import type { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import type { useStudioCharacterWorkflow } from './useStudioCharacterWorkflow';
import type { ActiveOverlay } from './useStudioOverlayController';

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
const ConfirmationDialog = lazy(() =>
  import('../ui/primitives/ConfirmationDialog').then((module) => ({
    default: module.ConfirmationDialog,
  })),
);

export const StudioCharacterOverlays = ({
  ownerUserId,
  activeOverlay,
  desktopStudioLayout,
  repository,
  store,
  provider,
  handoff,
  character,
  activeCharacterRecord,
  characterOpenBlockedReason,
  characterRemovalBlockedReason,
  recordingActive,
  characterSelectorRef,
  shelfToggleRef,
  editVideoToggleRef,
  onClose,
  onOpenSavedCharacters,
  onUnselectCharacter,
}: {
  readonly ownerUserId: string;
  readonly activeOverlay: ActiveOverlay;
  readonly desktopStudioLayout: boolean;
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly provider: ReturnType<typeof useProviderAvailability>;
  readonly handoff: ReturnType<typeof useReferenceRecipeHandoff>;
  readonly character: ReturnType<typeof useStudioCharacterWorkflow>;
  readonly activeCharacterRecord: SavedCharacterPrompt | undefined;
  readonly characterOpenBlockedReason: string | undefined;
  readonly characterRemovalBlockedReason: string | undefined;
  readonly recordingActive: boolean;
  readonly characterSelectorRef: RefObject<HTMLButtonElement | null>;
  readonly shelfToggleRef: RefObject<HTMLButtonElement | null>;
  readonly editVideoToggleRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly onOpenSavedCharacters: () => void;
  readonly onUnselectCharacter: () => void;
}) => {
  const { availability } = provider;
  const { activeCharacterName, referenceUsePending, recipeInsertionBlocked } = handoff.state;

  return (
    <>
      <StudioCharacterSelectorOverlay
        open={activeOverlay === 'character-selector'}
        returnFocusRef={desktopStudioLayout ? characterSelectorRef : shelfToggleRef}
        activeCharacterName={activeCharacterName}
        activeCharacter={activeCharacterRecord}
        editBlockedReason={characterOpenBlockedReason}
        removalBlockedReason={characterRemovalBlockedReason}
        recordingActive={recordingActive}
        onClose={onClose}
        onEdit={character.edit}
        onOpenWardrobe={character.openWardrobe}
        onUnselect={onUnselectCharacter}
        onCreate={character.openNew}
        onChooseSaved={onOpenSavedCharacters}
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
          <Suspense fallback={<p role="status">Loading studio tool…</p>}>
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
                handoff.actions.useRecipe({
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

      {activeOverlay === 'character-builder' ? (
        <Suspense fallback={<p role="status">Loading studio tool…</p>}>
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
