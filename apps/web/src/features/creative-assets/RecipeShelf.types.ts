import type { PromptBuilderDraft } from '@studio/domain';
import type { ModelModeId, VtonInputKind } from './types';

export interface RecipeSelection {
  origin: 'saved-prompt' | 'recent-prompt' | 'character-prompt';
  prompt: string;
  modelModeId: ModelModeId;
  /** Stable identity of the generated reference to hydrate before committing this recipe. */
  referenceImageAssetId?: string | null;
  vtonInputKind?: VtonInputKind | null;
  enhancePrompt?: boolean;
  /** Recipe record identity used for usage tracking. */
  assetId?: string;
  /** Exact saved-character identity retained by an image-only or character Recent item. */
  savedCharacterPromptId?: string;
  /** Exact normalized wardrobe child; null/omitted identifies the original. */
  savedCharacterVariantId?: string;
  characterName?: string;
  builderDraft?: PromptBuilderDraft;
}
