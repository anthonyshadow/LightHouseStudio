import type { RecipeSelection } from './RecipeShelf.types';
import type { SavedPrompt } from './types';

export const savedPromptToRecipeSelection = (item: SavedPrompt): RecipeSelection => ({
  origin: 'saved-prompt',
  prompt: item.prompt,
  modelModeId: item.modelModeId,
  assetId: item.id,
  referenceImageAssetId: item.referenceImageAssetId,
  vtonInputKind: item.vtonInputKind,
  enhancePrompt: item.enhancePrompt,
});
