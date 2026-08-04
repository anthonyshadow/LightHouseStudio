import type { PromptBuilderDraft, PromptIntent } from '../prompts';
import type { ModelModeId } from '../session';

export const CREATIVE_ASSET_SCHEMA_VERSION = 6 as const;
export const PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION = 5 as const;
export const OLDER_CREATIVE_ASSET_SCHEMA_VERSION = 4 as const;
export const EARLIER_CREATIVE_ASSET_SCHEMA_VERSION = 3 as const;
export const LEGACY_CREATIVE_ASSET_SCHEMA_VERSION = 2 as const;
export const ORIGINAL_CREATIVE_ASSET_SCHEMA_VERSION = 1 as const;
export const SAVED_PROMPT_LIMIT = 100;
export const RECENT_PROMPT_LIMIT = 30;
export const SAVED_CHARACTER_PROMPT_LIMIT = 50;
export const SAVED_CHARACTER_VARIANT_LIMIT = 500;

export type SavedPromptSource = 'manual' | 'generated';
export type VtonInputKind = 'prompt' | 'saved-outfit';
export type SavedCharacterPromptSource = 'manual' | 'generator';
export type ReferenceImageStatus =
  | 'prompt-only'
  | 'portrait-required-not-saved'
  | 'session-portrait-not-saved'
  | 'persisted-reference';
export type StorageHealth = 'ready' | 'recovered' | 'session-only';

export type VisualProfile = 'woman' | 'man' | 'non-binary' | 'unspecified';

export const GUIDED_CHOICE_KEYS = [
  'gender',
  'adultAge',
  'appearance',
  'ethnicity',
  'skinTone',
  'bodyShape',
  'hair',
  'hairColor',
  'outfit',
  'accessories',
  'expression',
  'mood',
  'role',
  'style',
  'background',
] as const;
export type GuidedChoiceKey = (typeof GUIDED_CHOICE_KEYS)[number];

export type GuidedChoiceValue =
  | { readonly optionId: string; readonly customValue?: never }
  | { readonly optionId: 'custom'; readonly customValue: string };

export interface GuidedDesignV1 {
  readonly catalogVersion: 1;
  readonly starterId: string | null;
  readonly choices: Readonly<Record<GuidedChoiceKey, GuidedChoiceValue | null>>;
}

export interface SavedPrompt {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly source: SavedPromptSource;
  readonly referenceImageAssetId: string | null;
  /** Null for Character recipes; explicit preparation mode for Virtual Try-On outfits. */
  readonly vtonInputKind: VtonInputKind | null;
  /** Only meaningful for prompt-based Virtual Try-On outfits. */
  readonly enhancePrompt: boolean;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastUsedAt: string | null;
  readonly useCount: number;
}

export interface RecentPrompt {
  readonly id: string;
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly savedPromptId?: string;
  readonly savedCharacterPromptId?: string;
  readonly savedCharacterVariantId?: string;
  readonly characterName?: string;
  readonly referenceImageAssetId: string | null;
  readonly vtonInputKind: VtonInputKind | null;
  readonly enhancePrompt: boolean;
  readonly usedAt: string;
}

export interface SavedCharacterPrompt {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly source: SavedCharacterPromptSource;
  readonly promptIntent: PromptIntent | null;
  readonly builderDraft: PromptBuilderDraft | null;
  /** Optional guided-catalog provenance. The canonical builder draft remains authoritative. */
  readonly guidedDesign: GuidedDesignV1 | null;
  /** Explicitly records that no image bytes or URL are included in this asset. */
  readonly referenceImageStatus: ReferenceImageStatus;
  /** Opaque local asset identity. Image bytes and storage details are not persisted here. */
  readonly referenceImageAssetId: string | null;
  readonly uploadedReferenceImageAssetId: string | null;
  readonly finalReferenceKind: 'uploaded' | 'generated' | null;
  /** Null selects the original; otherwise this is a validated child wardrobe variant. */
  readonly selectedWardrobeVariantId: string | null;
  readonly notes: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastUsedAt: string | null;
  readonly useCount: number;
}

export type SavedCharacterVariantCreation =
  | {
      readonly method: 'add-outfit';
      readonly sourceReferenceImageAssetId: string;
      readonly garmentReferenceImageAssetId: string;
    }
  | {
      readonly method: 'change-features';
      readonly sourceReferenceImageAssetId: string;
      readonly changeInstructions: string;
    };

export interface SavedCharacterVariant {
  readonly id: string;
  readonly parentCharacterId: string;
  readonly title: string;
  readonly referenceImageAssetId: string;
  readonly creation: SavedCharacterVariantCreation;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastUsedAt: string | null;
  readonly useCount: number;
}

export interface CharacterVersionSelection {
  readonly characterId: string;
  /** Null identifies the parent's original reference. */
  readonly variantId: string | null;
}

export interface ResolvedCharacterVersion {
  readonly selection: CharacterVersionSelection;
  readonly character: SavedCharacterPrompt;
  readonly variant: SavedCharacterVariant | null;
  readonly displayLabel: string;
  readonly prompt: string;
  readonly referenceImageAssetId: string | null;
}

export interface CreativeAssetStore {
  readonly schemaVersion: typeof CREATIVE_ASSET_SCHEMA_VERSION;
  readonly savedPrompts: readonly SavedPrompt[];
  readonly recentPrompts: readonly RecentPrompt[];
  readonly savedCharacterPrompts: readonly SavedCharacterPrompt[];
  readonly savedCharacterVariants: readonly SavedCharacterVariant[];
}

export interface SavedPromptInput {
  readonly title: string;
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly source: SavedPromptSource;
  readonly referenceImageAssetId?: string | null;
  readonly vtonInputKind?: VtonInputKind | null;
  readonly enhancePrompt?: boolean;
  readonly tags?: readonly string[];
}

export interface SavedCharacterPromptInput {
  readonly name: string;
  readonly prompt: string;
  readonly source: SavedCharacterPromptSource;
  readonly promptIntent: PromptIntent | null;
  readonly builderDraft?: PromptBuilderDraft | null;
  readonly guidedDesign?: GuidedDesignV1 | null;
  readonly referenceImageStatus: ReferenceImageStatus;
  readonly referenceImageAssetId?: string | null;
  readonly uploadedReferenceImageAssetId?: string | null;
  readonly finalReferenceKind?: 'uploaded' | 'generated' | null;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

export interface SavedCharacterVariantInput {
  readonly parentCharacterId: string;
  readonly title: string;
  readonly referenceImageAssetId: string;
  readonly creation: SavedCharacterVariantCreation;
}

export interface AssetMutationContext {
  readonly now: string;
  readonly createId: () => string;
}

export interface CreativeAssetSearchResults {
  readonly savedPrompts: readonly SavedPrompt[];
  readonly recentPrompts: readonly RecentPrompt[];
  readonly savedCharacterPrompts: readonly SavedCharacterPrompt[];
  readonly savedCharacterVariants: readonly SavedCharacterVariant[];
}

export interface SanitizeCreativeAssetResult {
  readonly store: CreativeAssetStore;
  readonly recovered: boolean;
  readonly droppedRecords: number;
}
