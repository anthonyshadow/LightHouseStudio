import { useMemo } from 'react';
import type { CreativeAssetStore } from '../features/creative-assets/types';
import type { StudioMode } from '../features/media-session';
import type { SavedVideoCharacterAttribution } from '../features/saved-videos/useSaveVideo';
import type { ActiveStudioRecipe, ResolvedActiveRecipe } from './referenceRecipeIdentity';

interface UseStudioCharacterAttributionOptions {
  readonly activeCharacter: ResolvedActiveRecipe['character'];
  readonly activeCharacterName: string | undefined;
  readonly activeRecipe: ActiveStudioRecipe;
  readonly store: CreativeAssetStore;
  readonly sessionMode: StudioMode;
}

/**
 * Resolves who a recording will be credited to.
 *
 * The active recipe carries ids, not names, and a Character can be renamed or have a variant chosen
 * after selection — so the stored record is the source of truth for the name, with the recipe's own
 * label as the fallback when no record survives. Only a Character session attributes at all.
 */
export const useStudioCharacterAttribution = ({
  activeCharacter,
  activeCharacterName,
  activeRecipe,
  store,
  sessionMode,
}: UseStudioCharacterAttributionOptions) => {
  const activeCharacterRecord = activeCharacter
    ? store.savedCharacterPrompts.find((candidate) => candidate.id === activeCharacter.id)
    : undefined;
  const activeCharacterVariantName =
    activeRecipe?.origin === 'character-prompt' && activeRecipe.variantId
      ? (store.savedCharacterVariants.find(
          (variant) =>
            variant.id === activeRecipe.variantId &&
            variant.parentCharacterId === activeRecipe.assetId,
        )?.title ?? null)
      : null;
  const activeCharacterRecordName = activeCharacterRecord?.name;
  const recordingCharacterAttribution = useMemo<SavedVideoCharacterAttribution | null>(() => {
    const characterName = activeCharacterRecordName ?? activeCharacterName;
    return sessionMode === 'lucy-latest' && characterName
      ? { characterName, characterVariantName: activeCharacterVariantName }
      : null;
  }, [activeCharacterName, activeCharacterRecordName, activeCharacterVariantName, sessionMode]);

  return { activeCharacterRecord, recordingCharacterAttribution } as const;
};
