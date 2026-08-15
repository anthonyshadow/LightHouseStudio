import type { ExistingVideoSavedRecipe } from '../features/existing-video/ExistingVideoRecipeChooser';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterVariant,
} from '../features/creative-assets/types';
import type { ModelMode } from '../application/types';

export interface AcceptedExistingVideoBatchStep {
  readonly modelId: ModelMode;
  readonly prompt: string;
  readonly savedRecipeId: string | null;
  readonly referenceImage: File | null;
  readonly inputKind: 'character' | 'saved-outfit' | 'reference-image' | 'prompt';
  readonly enhancePrompt: boolean;
}

export const deriveExistingVideoSavedRecipes = (
  store: CreativeAssetStore,
): readonly ExistingVideoSavedRecipe[] => {
  const variantsByCharacter = new Map<string, SavedCharacterVariant[]>();
  for (const variant of store.savedCharacterVariants) {
    const variants = variantsByCharacter.get(variant.parentCharacterId) ?? [];
    variants.push(variant);
    variantsByCharacter.set(variant.parentCharacterId, variants);
  }

  return [
    ...store.savedPrompts.map((recipe) => ({
      id: recipe.id,
      label: recipe.title,
      modelId: recipe.modelModeId,
      prompt: recipe.prompt,
      referenceImageAssetId: recipe.referenceImageAssetId,
      vtonInputKind: recipe.vtonInputKind,
      enhancePrompt: recipe.enhancePrompt,
    })),
    ...store.savedCharacterPrompts.flatMap((character) => [
      {
        id: character.id,
        label: `${character.name} · Original`,
        modelId: 'lucy-latest' as const,
        prompt: character.prompt,
        referenceImageAssetId: character.referenceImageAssetId,
        vtonInputKind: null,
        enhancePrompt: false,
        savedCharacterPromptId: character.id,
        characterName: character.name,
        originalCharacterVersion: true,
        defaultVoice: character.defaultVoice,
      },
      ...(variantsByCharacter.get(character.id) ?? []).map((variant) => ({
        id: variant.id,
        label: `${character.name} · ${variant.title}`,
        modelId: 'lucy-latest' as const,
        prompt: character.prompt,
        referenceImageAssetId: variant.referenceImageAssetId,
        vtonInputKind: null,
        enhancePrompt: false,
        savedCharacterPromptId: character.id,
        savedCharacterVariantId: variant.id,
        characterName: character.name,
        characterVariantName: variant.title,
        originalCharacterVersion: false,
        defaultVoice: character.defaultVoice,
      })),
    ]),
  ];
};

export const recordAcceptedExistingVideoBatchStep = (
  repository: CreativeAssetRepository,
  recipes: readonly ExistingVideoSavedRecipe[],
  step: AcceptedExistingVideoBatchStep,
): void => {
  const recipe = step.savedRecipeId
    ? recipes.find((item) => item.id === step.savedRecipeId)
    : undefined;
  const saved = step.savedRecipeId
    ? repository.getSnapshot().store.savedPrompts.find((item) => item.id === step.savedRecipeId)
    : undefined;
  if (!step.prompt.trim() && !recipe?.referenceImageAssetId) return;

  void repository.recordSuccessfulPrompt({
    prompt: recipe?.prompt ?? step.prompt,
    modelModeId: step.modelId,
    ...(saved ? { savedPromptId: saved.id } : {}),
    ...(recipe?.savedCharacterPromptId
      ? { savedCharacterPromptId: recipe.savedCharacterPromptId }
      : {}),
    ...(recipe?.savedCharacterVariantId
      ? { savedCharacterVariantId: recipe.savedCharacterVariantId }
      : {}),
    ...(recipe?.savedCharacterPromptId ? { characterName: recipe.label.split(' · ')[0] } : {}),
    referenceImageAssetId: recipe?.referenceImageAssetId ?? null,
    vtonInputKind:
      step.modelId === 'lucy-vton-latest'
        ? (saved?.vtonInputKind ?? (step.inputKind === 'prompt' ? 'prompt' : 'saved-outfit'))
        : null,
    enhancePrompt:
      step.modelId === 'lucy-vton-latest'
        ? (saved?.enhancePrompt ?? (step.inputKind === 'prompt' && step.enhancePrompt))
        : false,
  });
};
