import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  EARLIER_CREATIVE_ASSET_SCHEMA_VERSION,
  LEGACY_CREATIVE_ASSET_SCHEMA_VERSION,
  OLDER_CREATIVE_ASSET_SCHEMA_VERSION,
  ORIGINAL_CREATIVE_ASSET_SCHEMA_VERSION,
  PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION,
  WARDROBE_CREATIVE_ASSET_SCHEMA_VERSION,
  type CreativeAssetSearchResults as DomainCreativeAssetSearchResults,
  type CreativeAssetStore as DomainCreativeAssetStore,
  type GuidedDesignV1 as DomainGuidedDesignV1,
  type ModelModeId as DomainModelModeId,
  type PromptBuilderDraft,
  type PromptIntent,
  type RecentPrompt as DomainRecentPrompt,
  type ReferenceImageStatus as DomainReferenceImageStatus,
  type SavedCharacterPrompt as DomainSavedCharacterPrompt,
  type SavedCharacterVariant as DomainSavedCharacterVariant,
  type SavedCharacterVariantCreation as DomainSavedCharacterVariantCreation,
  type SavedCharacterVoicePreference as DomainSavedCharacterVoicePreference,
  type CharacterVersionSelection as DomainCharacterVersionSelection,
  type SavedPrompt as DomainSavedPrompt,
  type SavedPromptSource,
  type StorageHealth as DomainStorageHealth,
  type VtonInputKind as DomainVtonInputKind,
} from '@studio/domain';

export {
  CREATIVE_ASSET_SCHEMA_VERSION,
  EARLIER_CREATIVE_ASSET_SCHEMA_VERSION,
  LEGACY_CREATIVE_ASSET_SCHEMA_VERSION,
  OLDER_CREATIVE_ASSET_SCHEMA_VERSION,
  ORIGINAL_CREATIVE_ASSET_SCHEMA_VERSION,
  PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION,
  WARDROBE_CREATIVE_ASSET_SCHEMA_VERSION,
};
export const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v7';
export const WARDROBE_CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v6';
export const PREVIOUS_CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v5';
export const OLDER_CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v4';
export const EARLIER_CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v3';
export const LEGACY_CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v2';
export const ORIGINAL_CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v1';

export type ModelModeId = DomainModelModeId;
export type AssetSource = SavedPromptSource;
export type VtonInputKind = DomainVtonInputKind;
export type ReferenceImageStatus = DomainReferenceImageStatus;
export type StorageHealth = DomainStorageHealth;
export type GuidedDesignV1 = DomainGuidedDesignV1;
export type SavedPrompt = DomainSavedPrompt;
export type RecentPrompt = DomainRecentPrompt;
export type SavedCharacterPrompt = DomainSavedCharacterPrompt;
export type SavedCharacterVariant = DomainSavedCharacterVariant;
export type SavedCharacterVariantCreation = DomainSavedCharacterVariantCreation;
export type SavedCharacterVoicePreference = DomainSavedCharacterVoicePreference;
export type CharacterVersionSelection = DomainCharacterVersionSelection;
export type CreativeAssetStore = DomainCreativeAssetStore;
export type CreativeAssetSearchResults = DomainCreativeAssetSearchResults;

export interface CreativeAssetRepositoryState {
  readonly store: CreativeAssetStore;
  readonly health: StorageHealth;
  /** Local storage health only. Cloud sync owns its own status; the two fail independently. */
  readonly notice: string | null;
}

export interface CreateSavedPromptInput {
  readonly title: string;
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly source?: AssetSource;
  readonly referenceImageAssetId?: string | null;
  readonly vtonInputKind?: VtonInputKind | null;
  readonly enhancePrompt?: boolean;
  readonly tags?: readonly string[];
}

export interface UpdateSavedPromptInput {
  readonly title?: string;
  readonly prompt?: string;
  readonly referenceImageAssetId?: string | null;
  readonly vtonInputKind?: VtonInputKind | null;
  readonly enhancePrompt?: boolean;
  readonly tags?: readonly string[];
}

export interface CreateSavedCharacterPromptInput {
  readonly name: string;
  readonly prompt: string;
  readonly source?: 'manual' | 'generator';
  readonly promptIntent: PromptIntent | null;
  readonly builderDraft?: PromptBuilderDraft | null;
  readonly guidedDesign?: DomainGuidedDesignV1 | null;
  readonly referenceImageStatus?: ReferenceImageStatus;
  readonly referenceImageAssetId?: string | null;
  readonly uploadedReferenceImageAssetId?: string | null;
  readonly finalReferenceKind?: 'uploaded' | 'generated' | null;
  readonly defaultVoice?: SavedCharacterVoicePreference | null;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

/**
 * A retry-stable character save. The caller owns the ID and must reuse it for
 * every retry of the same logical save operation.
 */
export interface PersistSavedCharacterPromptInput extends CreateSavedCharacterPromptInput {
  readonly id: string;
}

export interface UpdateSavedCharacterPromptInput {
  readonly name?: string;
  readonly prompt?: string;
  readonly builderDraft?: PromptBuilderDraft | null;
  readonly guidedDesign?: DomainGuidedDesignV1 | null;
  readonly referenceImageStatus?: ReferenceImageStatus;
  readonly referenceImageAssetId?: string | null;
  readonly uploadedReferenceImageAssetId?: string | null;
  readonly finalReferenceKind?: 'uploaded' | 'generated' | null;
  readonly defaultVoice?: SavedCharacterVoicePreference | null;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

export interface RecordSuccessfulPromptInput {
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly savedPromptId?: string;
  readonly savedCharacterPromptId?: string;
  readonly savedCharacterVariantId?: string;
  readonly characterName?: string;
  readonly referenceImageAssetId?: string | null;
  readonly vtonInputKind?: VtonInputKind | null;
  readonly enhancePrompt?: boolean;
}

export interface CreateSavedCharacterVariantInput {
  readonly parentCharacterId: string;
  readonly title: string;
  readonly referenceImageAssetId: string;
  readonly creation: SavedCharacterVariantCreation;
}

export interface CreativeAssetRepository {
  getSnapshot: () => CreativeAssetRepositoryState;
  /** Resolves after IndexedDB load and any verified localStorage migration complete. */
  ready: () => Promise<void>;
  close: () => void;
  subscribe: (listener: () => void) => () => void;
  subscribeSelector: <Selection>(
    selector: (state: CreativeAssetRepositoryState) => Selection,
    listener: () => void,
    isEqual?: (left: Selection, right: Selection) => boolean,
  ) => () => void;
  createSavedPrompt: (input: CreateSavedPromptInput) => Promise<SavedPrompt>;
  updateSavedPrompt: (id: string, input: UpdateSavedPromptInput) => Promise<SavedPrompt>;
  renameSavedPrompt: (id: string, title: string) => Promise<SavedPrompt>;
  deleteSavedPrompt: (id: string) => Promise<void>;
  createSavedCharacterPrompt: (
    input: CreateSavedCharacterPromptInput,
  ) => Promise<SavedCharacterPrompt>;
  /**
   * Writes durable storage before publishing repository state. A failed write
   * never exposes the character through `getSnapshot()` or subscribers.
   */
  persistSavedCharacterPrompt: (
    input: PersistSavedCharacterPromptInput,
  ) => Promise<SavedCharacterPrompt>;
  updateSavedCharacterPrompt: (
    id: string,
    input: UpdateSavedCharacterPromptInput,
  ) => Promise<SavedCharacterPrompt>;
  renameSavedCharacterPrompt: (id: string, name: string) => Promise<SavedCharacterPrompt>;
  deleteSavedCharacterPrompt: (id: string) => Promise<void>;
  createSavedCharacterVariant: (
    input: CreateSavedCharacterVariantInput,
  ) => Promise<SavedCharacterVariant>;
  deleteSavedCharacterVariant: (id: string) => Promise<void>;
  selectCharacterVersion: (selection: CharacterVersionSelection) => Promise<void>;
  recordSuccessfulPrompt: (input: RecordSuccessfulPromptInput) => Promise<void>;
  enrichNewestMatchingRecent: (
    prompt: string,
    modelModeId: ModelModeId,
    referenceImageAssetId: string,
  ) => Promise<void>;
  search: (query: string, modelModeId?: ModelModeId) => CreativeAssetSearchResults;
  /** Cloud-sync seam; local writes remain immediately available while the server CAS settles. */
  replaceFromRemote?: (store: CreativeAssetStore) => Promise<void>;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}
