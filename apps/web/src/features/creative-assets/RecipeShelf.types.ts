import type { PromptBuilderDraft } from '../prompt-authoring';
import type {
  CreativeAssetRepository,
  ModelModeId,
  RecentPrompt,
  SavedPrompt,
  SavedCharacterPrompt,
  VtonInputKind,
} from './types';

export type RecipeShelfCategory = 'saved' | 'recent' | 'characters';

export type RecipeShelfEntryIntent = Readonly<{
  id: number;
  category: RecipeShelfCategory;
}>;

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
  characterName?: string;
  builderDraft?: PromptBuilderDraft;
}

export type ActiveRecipeIdentity = {
  origin: 'character-prompt' | 'saved-prompt';
  assetId: string;
} | null;

export interface RecipeShelfProps {
  repository: CreativeAssetRepository;
  activeMode: ModelModeId;
  promptUseDisabled?: boolean;
  embedded?: boolean;
  /** Studio-owned applied/preloaded recipe identity used for controlled highlighting. */
  activeRecipe?: ActiveRecipeIdentity;
  /** App-owned, one-shot category request. It is navigation intent, not selected recipe state. */
  entryIntent?: RecipeShelfEntryIntent | null;
  onEntryIntentConsumed?: (id: number) => void;
  onUsePrompt: (selection: RecipeSelection) => void;
  onCreateCharacter?: () => void;
  onEditCharacter?: (asset: SavedCharacterPrompt) => void;
  onCreateOutfit?: () => void;
  onEditOutfit?: (asset: SavedPrompt) => void;
  onSaveOutfitCopy?: (asset: SavedPrompt | RecentPrompt) => void;
  onOpenCharacterWorkshop?: (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => void;
  onDirtyChange?: (dirty: boolean) => void;
}
