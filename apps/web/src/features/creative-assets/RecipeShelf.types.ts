import type { PromptBuilderDraft } from '../prompt-authoring';
import type { CreativeAssetRepository, ModelModeId, SavedCharacterPrompt } from './types';

export interface RecipeSelection {
  origin: 'saved-prompt' | 'recent-prompt' | 'character-prompt';
  prompt: string;
  modelModeId: ModelModeId;
  /** Stable identity of the generated reference to hydrate before committing this recipe. */
  referenceImageAssetId?: string | null;
  /** Recipe record identity used for usage tracking. */
  assetId?: string;
  builderDraft?: PromptBuilderDraft;
}

export interface RecipeShelfProps {
  repository: CreativeAssetRepository;
  activeMode: ModelModeId;
  promptUseDisabled?: boolean;
  embedded?: boolean;
  onUsePrompt: (selection: RecipeSelection) => void;
  onOpenCharacterWorkshop?: (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => void;
  onDirtyChange?: (dirty: boolean) => void;
}
