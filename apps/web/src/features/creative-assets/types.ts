import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  LEGACY_CREATIVE_ASSET_SCHEMA_VERSION,
  type CreativeAssetSearchResults as DomainCreativeAssetSearchResults,
  type CreativeAssetStore as DomainCreativeAssetStore,
  type ModelModeId as DomainModelModeId,
  type RecentPrompt as DomainRecentPrompt,
  type ReferenceImageStatus as DomainReferenceImageStatus,
  type SavedCharacterPrompt as DomainSavedCharacterPrompt,
  type SavedPrompt as DomainSavedPrompt,
  type SavedPromptSource,
  type StorageHealth as DomainStorageHealth,
} from '@studio/domain';
import type { PromptBuilderDraft, PromptIntent } from '../prompt-authoring';

export { CREATIVE_ASSET_SCHEMA_VERSION, LEGACY_CREATIVE_ASSET_SCHEMA_VERSION };
export const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v2';
export const LEGACY_CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v1';

export type ModelModeId = DomainModelModeId;
export type AssetSource = SavedPromptSource;
export type ReferenceImageStatus = DomainReferenceImageStatus;
export type StorageHealth = DomainStorageHealth;
export type SavedPrompt = DomainSavedPrompt;
export type RecentPrompt = DomainRecentPrompt;
export type SavedCharacterPrompt = DomainSavedCharacterPrompt;
export type CreativeAssetStore = DomainCreativeAssetStore;
export type CreativeAssetSearchResults = DomainCreativeAssetSearchResults;

export interface CreativeAssetRepositoryState {
  readonly store: CreativeAssetStore;
  readonly health: StorageHealth;
  readonly notice: string | null;
}

export interface CreateSavedPromptInput {
  readonly title: string;
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly source?: AssetSource;
  readonly referenceImageAssetId?: string | null;
  readonly tags?: readonly string[];
}

export interface UpdateSavedPromptInput {
  readonly title?: string;
  readonly prompt?: string;
  readonly referenceImageAssetId?: string | null;
  readonly tags?: readonly string[];
}

export interface CreateSavedCharacterPromptInput {
  readonly name: string;
  readonly prompt: string;
  readonly source?: 'manual' | 'generator';
  readonly promptIntent: PromptIntent;
  readonly builderDraft?: PromptBuilderDraft | null;
  readonly referenceImageStatus?: ReferenceImageStatus;
  readonly referenceImageAssetId?: string | null;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

export interface UpdateSavedCharacterPromptInput {
  readonly name?: string;
  readonly prompt?: string;
  readonly builderDraft?: PromptBuilderDraft | null;
  readonly referenceImageStatus?: ReferenceImageStatus;
  readonly referenceImageAssetId?: string | null;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

export interface RecordSuccessfulPromptInput {
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly savedPromptId?: string;
  readonly savedCharacterPromptId?: string;
  readonly referenceImageAssetId?: string | null;
}

export interface CreativeAssetRepository {
  getSnapshot: () => CreativeAssetRepositoryState;
  subscribe: (listener: () => void) => () => void;
  createSavedPrompt: (input: CreateSavedPromptInput) => SavedPrompt;
  updateSavedPrompt: (id: string, input: UpdateSavedPromptInput) => SavedPrompt;
  renameSavedPrompt: (id: string, title: string) => SavedPrompt;
  deleteSavedPrompt: (id: string) => void;
  createSavedCharacterPrompt: (input: CreateSavedCharacterPromptInput) => SavedCharacterPrompt;
  updateSavedCharacterPrompt: (
    id: string,
    input: UpdateSavedCharacterPromptInput,
  ) => SavedCharacterPrompt;
  renameSavedCharacterPrompt: (id: string, name: string) => SavedCharacterPrompt;
  deleteSavedCharacterPrompt: (id: string) => void;
  recordSuccessfulPrompt: (input: RecordSuccessfulPromptInput) => void;
  enrichNewestMatchingRecent: (
    prompt: string,
    modelModeId: ModelModeId,
    referenceImageAssetId: string,
  ) => void;
  search: (query: string, modelModeId?: ModelModeId) => CreativeAssetSearchResults;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}
