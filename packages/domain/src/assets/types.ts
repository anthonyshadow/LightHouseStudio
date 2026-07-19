import type { PromptBuilderDraft, PromptIntent } from '../prompts';
import type { ModelModeId } from '../session';

export const CREATIVE_ASSET_SCHEMA_VERSION = 2 as const;
export const LEGACY_CREATIVE_ASSET_SCHEMA_VERSION = 1 as const;
export const SAVED_PROMPT_LIMIT = 100;
export const RECENT_PROMPT_LIMIT = 30;
export const SAVED_CHARACTER_PROMPT_LIMIT = 50;

export type SavedPromptSource = 'manual' | 'generated';
export type SavedCharacterPromptSource = 'manual' | 'generator';
export type ReferenceImageStatus =
  | 'prompt-only'
  | 'portrait-required-not-saved'
  | 'session-portrait-not-saved'
  | 'persisted-reference';
export type StorageHealth = 'ready' | 'recovered' | 'session-only';

export interface SavedPrompt {
  readonly id: string;
  readonly title: string;
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly source: SavedPromptSource;
  readonly referenceImageAssetId: string | null;
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
  readonly referenceImageAssetId: string | null;
  readonly usedAt: string;
}

export interface SavedCharacterPrompt {
  readonly id: string;
  readonly name: string;
  readonly prompt: string;
  readonly source: SavedCharacterPromptSource;
  readonly promptIntent: PromptIntent | null;
  readonly builderDraft: PromptBuilderDraft | null;
  /** Explicitly records that no image bytes or URL are included in this asset. */
  readonly referenceImageStatus: ReferenceImageStatus;
  /** Opaque local asset identity. Image bytes and storage details are not persisted here. */
  readonly referenceImageAssetId: string | null;
  readonly notes: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastUsedAt: string | null;
  readonly useCount: number;
}

export interface CreativeAssetStore {
  readonly schemaVersion: typeof CREATIVE_ASSET_SCHEMA_VERSION;
  readonly savedPrompts: readonly SavedPrompt[];
  readonly recentPrompts: readonly RecentPrompt[];
  readonly savedCharacterPrompts: readonly SavedCharacterPrompt[];
}

export interface SavedPromptInput {
  readonly title: string;
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly source: SavedPromptSource;
  readonly referenceImageAssetId?: string | null;
  readonly tags?: readonly string[];
}

export interface SavedCharacterPromptInput {
  readonly name: string;
  readonly prompt: string;
  readonly source: SavedCharacterPromptSource;
  readonly promptIntent: PromptIntent | null;
  readonly builderDraft?: PromptBuilderDraft | null;
  readonly referenceImageStatus: ReferenceImageStatus;
  readonly referenceImageAssetId?: string | null;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

export interface AssetMutationContext {
  readonly now: string;
  readonly createId: () => string;
}

export interface CreativeAssetSearchResults {
  readonly savedPrompts: readonly SavedPrompt[];
  readonly recentPrompts: readonly RecentPrompt[];
  readonly savedCharacterPrompts: readonly SavedCharacterPrompt[];
}

export interface SanitizeCreativeAssetResult {
  readonly store: CreativeAssetStore;
  readonly recovered: boolean;
  readonly droppedRecords: number;
}
