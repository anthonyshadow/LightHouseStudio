import type {
  CharacterVersionSelection,
  CreativeAssetStore,
  ResolvedCharacterVersion,
} from './types';

/** Resolves one authoritative parent/version pair without copying parent data into variants. */
export const resolveCharacterVersion = (
  store: CreativeAssetStore,
  selection: CharacterVersionSelection,
): ResolvedCharacterVersion | null => {
  const character = store.savedCharacterPrompts.find(
    (candidate) => candidate.id === selection.characterId,
  );
  if (!character) return null;
  if (selection.variantId === null) {
    return {
      selection,
      character,
      variant: null,
      displayLabel: `${character.name} · Original`,
      prompt: character.prompt,
      referenceImageAssetId: character.referenceImageAssetId,
    };
  }
  const variant = store.savedCharacterVariants.find(
    (candidate) =>
      candidate.id === selection.variantId && candidate.parentCharacterId === character.id,
  );
  if (!variant) return null;
  return {
    selection,
    character,
    variant,
    displayLabel: `${character.name} · ${variant.title}`,
    prompt: character.prompt,
    referenceImageAssetId: variant.referenceImageAssetId,
  };
};

export const preferredCharacterVersionSelection = (
  character: CreativeAssetStore['savedCharacterPrompts'][number],
): CharacterVersionSelection => ({
  characterId: character.id,
  variantId: character.selectedWardrobeVariantId,
});
