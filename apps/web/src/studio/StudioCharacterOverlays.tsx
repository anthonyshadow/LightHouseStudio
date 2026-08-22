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

const CharacterWardrobePanel = lazy(() =>
  import('../features/character-wardrobe/CharacterWardrobePanel').then((module) => ({
    default: module.CharacterWardrobePanel,
  })),
);
const SavedCharacterLibrary = lazy(() =>
  import('../features/account-library/SavedCreativeLibrary').then((module) => ({
    default: module.SavedCharacterLibrary,
  })),
);

export const StudioCharacterOverlays = ({
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
  onClose,
  onOpenSavedCharacters,
  onUnselectCharacter,
}: {
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
        returnFocusRef={characterSelectorRef}
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
        open={activeOverlay === 'saved-characters'}
        onClose={onClose}
        title="Characters"
        description="Choose a saved character for this Studio session."
        placement={desktopStudioLayout ? 'right' : 'fullscreen'}
        size="wide"
        bodyMode="scroll"
        returnFocusRef={characterSelectorRef}
      >
        {activeOverlay === 'saved-characters' ? (
          <Suspense fallback={<p role="status">Loading saved characters…</p>}>
            <SavedCharacterLibrary
              items={store.savedCharacterPrompts}
              repository={repository}
              onUse={(savedCharacter) => {
                handoff.actions.useRecipe({
                  origin: 'character-prompt',
                  prompt: savedCharacter.prompt,
                  modelModeId: 'lucy-latest',
                  assetId: savedCharacter.id,
                  characterName: savedCharacter.name,
                  referenceImageAssetId: savedCharacter.referenceImageAssetId,
                  ...(savedCharacter.builderDraft
                    ? { builderDraft: savedCharacter.builderDraft }
                    : {}),
                });
              }}
              onCreateFrom={character.copy}
              onOpenWardrobe={character.openWardrobe}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={activeOverlay === 'character-wardrobe' && Boolean(character.wardrobeCharacter)}
        onClose={() => void character.closeWardrobe()}
        title={
          character.wardrobeCharacter
            ? `${character.wardrobeCharacter.name} wardrobe`
            : 'Character wardrobe'
        }
        description="Browse the original and saved variants, or create a new variant without changing the parent character."
        placement={desktopStudioLayout ? 'right' : 'fullscreen'}
        size="wide"
        bodyMode="contained"
        closeOnBackdrop={!character.wardrobeDirty}
        returnFocusRef={characterSelectorRef}
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
              onClose={() => void character.closeWardrobe()}
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
    </>
  );
};
