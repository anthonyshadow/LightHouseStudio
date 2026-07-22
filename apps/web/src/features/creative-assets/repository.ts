import {
  ASSET_NAME_MAX_LENGTH,
  canonicalPrompt,
  createSavedCharacterPrompt as createDomainCharacterPrompt,
  createSavedPrompt as createDomainSavedPrompt,
  deleteSavedCharacterPrompt as deleteDomainCharacterPrompt,
  deleteSavedPrompt as deleteDomainSavedPrompt,
  DomainRuleError,
  enrichNewestMatchingRecentWithReferenceImage,
  parseCreativeAssetStore,
  normalizeWhitespace,
  recordSuccessfulPromptUse,
  searchCreativeAssets,
  updateSavedCharacterPrompt as updateDomainCharacterPrompt,
  updateSavedPrompt as updateDomainSavedPrompt,
  useSavedCharacterPrompt as markSavedCharacterPromptUsed,
  type AssetMutationContext,
  type CreativeAssetStore,
} from '@studio/domain';
import { createEmptyCreativeAssetStore, sanitizeCreativeAssetStore } from './sanitation';
import {
  CREATIVE_ASSET_STORAGE_KEY,
  LEGACY_CREATIVE_ASSET_SCHEMA_VERSION,
  LEGACY_CREATIVE_ASSET_STORAGE_KEY,
  PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION,
  PREVIOUS_CREATIVE_ASSET_STORAGE_KEY,
  type CreateSavedCharacterPromptInput,
  type CreateSavedPromptInput,
  type CreativeAssetRepository,
  type CreativeAssetRepositoryState,
  type PersistSavedCharacterPromptInput,
  type RecordSuccessfulPromptInput,
  type SavedCharacterPrompt,
  type SavedPrompt,
  type StorageLike,
  type UpdateSavedCharacterPromptInput,
  type UpdateSavedPromptInput,
} from './types';

export type CreativeAssetErrorCode =
  | 'invalid-id'
  | 'invalid-name'
  | 'invalid-prompt'
  | 'not-found'
  | 'id-conflict'
  | 'storage-unavailable'
  | 'storage-write-failed';

export class CreativeAssetError extends Error {
  readonly code: CreativeAssetErrorCode;
  readonly retryable: boolean;

  constructor(
    code: CreativeAssetErrorCode,
    message: string,
    options: ErrorOptions & { readonly retryable?: boolean } = {},
  ) {
    super(message, options);
    this.name = 'CreativeAssetError';
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export interface CreativeAssetRepositoryOptions {
  readonly storage?: StorageLike | null;
  readonly storageKey?: string;
  readonly legacyStorageKey?: string | null;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
}

const defaultIdFactory = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const browserStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const storageNotice = (health: CreativeAssetRepositoryState['health']) => {
  if (health === 'recovered') {
    return 'Some damaged or outdated Recipe Shelf data was removed. Your library is safe to keep using.';
  }
  if (health === 'session-only') {
    return 'Browser storage is unavailable. Recipe Shelf changes will last only until this tab closes.';
  }
  return null;
};

const isSupportedLegacyPayload = (serialized: string): boolean => {
  try {
    const value = JSON.parse(serialized) as unknown;
    return (
      typeof value === 'object' &&
      value !== null &&
      'schemaVersion' in value &&
      (value.schemaVersion === LEGACY_CREATIVE_ASSET_SCHEMA_VERSION ||
        value.schemaVersion === PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION)
    );
  } catch {
    return false;
  }
};

const loadInitialState = (
  storage: StorageLike | null,
  storageKey: string,
  legacyStorageKeys: readonly string[],
): { state: CreativeAssetRepositoryState; storage: StorageLike | null } => {
  if (!storage) {
    const health = 'session-only' as const;
    return {
      state: { store: createEmptyCreativeAssetStore(), health, notice: storageNotice(health) },
      storage: null,
    };
  }

  let serialized: string | null;
  let migratedLegacy = false;
  try {
    serialized = storage.getItem(storageKey);
    for (const legacyStorageKey of legacyStorageKeys) {
      if (serialized !== null) break;
      if (legacyStorageKey === storageKey) continue;
      serialized = storage.getItem(legacyStorageKey);
      migratedLegacy = serialized !== null;
    }
  } catch {
    const health = 'session-only' as const;
    return {
      state: { store: createEmptyCreativeAssetStore(), health, notice: storageNotice(health) },
      storage: null,
    };
  }

  if (serialized === null) {
    return {
      state: { store: createEmptyCreativeAssetStore(), health: 'ready', notice: null },
      storage,
    };
  }

  const result = parseCreativeAssetStore(serialized);
  const isCleanLegacyMigration =
    migratedLegacy && isSupportedLegacyPayload(serialized) && result.droppedRecords === 0;
  const health = result.recovered && !isCleanLegacyMigration ? 'recovered' : 'ready';
  if (result.recovered || migratedLegacy) {
    try {
      storage.setItem(storageKey, JSON.stringify(result.store));
    } catch {
      const fallbackHealth = 'session-only' as const;
      return {
        state: {
          store: result.store,
          health: fallbackHealth,
          notice: storageNotice(fallbackHealth),
        },
        storage: null,
      };
    }
  }
  return { state: { store: result.store, health, notice: storageNotice(health) }, storage };
};

const mapDomainError = (error: unknown): never => {
  if (error instanceof CreativeAssetError) throw error;
  if (error instanceof DomainRuleError) {
    const lower = error.message.toLocaleLowerCase();
    const code: CreativeAssetErrorCode = lower.includes('not found')
      ? 'not-found'
      : lower.includes('prompt') && lower.includes('empty')
        ? 'invalid-prompt'
        : 'invalid-name';
    throw new CreativeAssetError(code, error.message);
  }
  throw error;
};

export const createCreativeAssetRepository = (
  options: CreativeAssetRepositoryOptions = {},
): CreativeAssetRepository => {
  const storageKey = options.storageKey ?? CREATIVE_ASSET_STORAGE_KEY;
  const legacyStorageKeys =
    options.legacyStorageKey === undefined
      ? options.storageKey === undefined
        ? [PREVIOUS_CREATIVE_ASSET_STORAGE_KEY, LEGACY_CREATIVE_ASSET_STORAGE_KEY]
        : []
      : options.legacyStorageKey === null
        ? []
        : [options.legacyStorageKey];
  const durableStorage = options.storage === undefined ? browserStorage() : options.storage;
  let storage = durableStorage;
  const initial = loadInitialState(storage, storageKey, legacyStorageKeys);
  storage = initial.storage;
  let state = initial.state;
  const listeners = new Set<() => void>();
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? defaultIdFactory;

  const notify = () => listeners.forEach((listener) => listener());

  const commit = (nextStore: CreativeAssetStore) => {
    const store = sanitizeCreativeAssetStore(nextStore).store;
    let health = state.health;
    let notice = state.notice;
    if (storage) {
      try {
        storage.setItem(storageKey, JSON.stringify(store));
      } catch {
        storage = null;
        health = 'session-only';
        notice = storageNotice(health);
      }
    }
    state = { store, health, notice };
    notify();
  };

  const commitDurably = (nextStore: CreativeAssetStore, publish: boolean) => {
    const store = sanitizeCreativeAssetStore(nextStore).store;
    if (!durableStorage) {
      throw new CreativeAssetError(
        'storage-unavailable',
        'Durable browser storage is unavailable. The character was not saved.',
        { retryable: true },
      );
    }
    try {
      durableStorage.setItem(storageKey, JSON.stringify(store));
    } catch (error) {
      throw new CreativeAssetError(
        'storage-write-failed',
        'Durable browser storage could not save the character. No character was published.',
        { cause: error, retryable: true },
      );
    }
    storage = durableStorage;
    if (!publish && state.health === 'ready') return;
    state = { store, health: 'ready', notice: null };
    notify();
  };

  const timestamp = () => {
    const value = now();
    return Number.isFinite(value.valueOf()) ? value.toISOString() : new Date(0).toISOString();
  };

  const uniqueId = () => {
    const existing = new Set([
      ...state.store.savedPrompts.map((item) => item.id),
      ...state.store.recentPrompts.map((item) => item.id),
      ...state.store.savedCharacterPrompts.map((item) => item.id),
    ]);
    const candidate = idFactory().replace(/\s+/gu, '-').slice(0, 128) || defaultIdFactory();
    if (!existing.has(candidate)) return candidate;
    let suffix = 2;
    while (existing.has(`${candidate}-${suffix}`)) suffix += 1;
    return `${candidate}-${suffix}`;
  };

  const mutationContext = (): AssetMutationContext => ({ now: timestamp(), createId: uniqueId });

  const createdSavedPrompt = (store: CreativeAssetStore, id: string) => {
    const item = store.savedPrompts.find((candidate) => candidate.id === id);
    if (!item)
      throw new CreativeAssetError('not-found', 'The saved prompt could not be read after saving.');
    return item;
  };

  const createdCharacterPrompt = (store: CreativeAssetStore, id: string) => {
    const item = store.savedCharacterPrompts.find((candidate) => candidate.id === id);
    if (!item)
      throw new CreativeAssetError(
        'not-found',
        'The character prompt could not be read after saving.',
      );
    return item;
  };

  const characterPayloadMatches = (
    existing: SavedCharacterPrompt,
    candidate: SavedCharacterPrompt,
  ) =>
    existing.id === candidate.id &&
    existing.name === candidate.name &&
    existing.prompt === candidate.prompt &&
    existing.source === candidate.source &&
    existing.promptIntent === candidate.promptIntent &&
    JSON.stringify(existing.builderDraft) === JSON.stringify(candidate.builderDraft) &&
    JSON.stringify(existing.guidedDesign) === JSON.stringify(candidate.guidedDesign) &&
    existing.referenceImageStatus === candidate.referenceImageStatus &&
    existing.referenceImageAssetId === candidate.referenceImageAssetId &&
    existing.notes === candidate.notes &&
    JSON.stringify(existing.tags) === JSON.stringify(candidate.tags);

  const candidateForDurableCharacter = (
    input: PersistSavedCharacterPromptInput,
    createdAt: string,
  ): SavedCharacterPrompt => {
    if (
      !input.id ||
      input.id.length > ASSET_NAME_MAX_LENGTH ||
      normalizeWhitespace(input.id, ASSET_NAME_MAX_LENGTH) !== input.id
    ) {
      throw new CreativeAssetError(
        'invalid-id',
        `The character save ID must be normalized text no longer than ${ASSET_NAME_MAX_LENGTH} characters.`,
      );
    }
    try {
      const candidateStore = sanitizeCreativeAssetStore(
        createDomainCharacterPrompt(
          createEmptyCreativeAssetStore(),
          {
            name: input.name,
            prompt: input.prompt,
            source: input.source ?? 'generator',
            promptIntent: input.promptIntent,
            builderDraft: input.builderDraft ?? null,
            guidedDesign: input.guidedDesign ?? null,
            referenceImageStatus: input.referenceImageStatus ?? 'prompt-only',
            referenceImageAssetId: input.referenceImageAssetId ?? null,
            notes: input.notes ?? '',
            tags: input.tags ?? [],
          },
          { now: createdAt, createId: () => input.id },
        ),
      ).store;
      const candidate = createdCharacterPrompt(candidateStore, input.id);
      return candidate;
    } catch (error) {
      return mapDomainError(error);
    }
  };

  const createSavedPrompt = (input: CreateSavedPromptInput): SavedPrompt => {
    const context = mutationContext();
    const id = context.createId();
    try {
      const next = createDomainSavedPrompt(
        state.store,
        {
          title: input.title,
          prompt: input.prompt,
          modelModeId: input.modelModeId,
          source: input.source ?? 'manual',
          referenceImageAssetId: input.referenceImageAssetId ?? null,
          tags: input.tags ?? [],
        },
        { ...context, createId: () => id },
      );
      const item = createdSavedPrompt(next, id);
      commit(next);
      return item;
    } catch (error) {
      return mapDomainError(error);
    }
  };

  const updateSavedPrompt = (id: string, input: UpdateSavedPromptInput): SavedPrompt => {
    try {
      const next = updateDomainSavedPrompt(
        state.store,
        id,
        {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.prompt === undefined ? {} : { prompt: input.prompt }),
          ...(input.referenceImageAssetId === undefined
            ? {}
            : { referenceImageAssetId: input.referenceImageAssetId }),
          ...(input.tags === undefined ? {} : { tags: input.tags }),
        },
        timestamp(),
      );
      const item = createdSavedPrompt(next, id);
      commit(next);
      return item;
    } catch (error) {
      return mapDomainError(error);
    }
  };

  const deleteSavedPrompt = (id: string) => {
    if (!state.store.savedPrompts.some((item) => item.id === id)) {
      throw new CreativeAssetError('not-found', 'That saved prompt is no longer in this library.');
    }
    commit(deleteDomainSavedPrompt(state.store, id));
  };

  const createSavedCharacterPrompt = (
    input: CreateSavedCharacterPromptInput,
  ): SavedCharacterPrompt => {
    const context = mutationContext();
    const id = context.createId();
    try {
      const next = createDomainCharacterPrompt(
        state.store,
        {
          name: input.name,
          prompt: input.prompt,
          source: input.source ?? 'generator',
          promptIntent: input.promptIntent,
          builderDraft: input.builderDraft ?? null,
          guidedDesign: input.guidedDesign ?? null,
          referenceImageStatus: input.referenceImageStatus ?? 'prompt-only',
          referenceImageAssetId: input.referenceImageAssetId ?? null,
          notes: input.notes ?? '',
          tags: input.tags ?? [],
        },
        { ...context, createId: () => id },
      );
      const item = createdCharacterPrompt(next, id);
      commit(next);
      return item;
    } catch (error) {
      return mapDomainError(error);
    }
  };

  const persistSavedCharacterPrompt = (
    input: PersistSavedCharacterPromptInput,
  ): SavedCharacterPrompt => {
    const createdAt = timestamp();
    const candidate = candidateForDurableCharacter(input, createdAt);
    if (
      state.store.savedPrompts.some((item) => item.id === input.id) ||
      state.store.recentPrompts.some((item) => item.id === input.id)
    ) {
      throw new CreativeAssetError(
        'id-conflict',
        `Character save ID ${input.id} is already in use by another creative asset.`,
      );
    }
    const existing = state.store.savedCharacterPrompts.find((item) => item.id === input.id);
    if (existing) {
      if (!characterPayloadMatches(existing, candidate)) {
        throw new CreativeAssetError(
          'id-conflict',
          `Character save ID ${input.id} already belongs to a different character.`,
        );
      }
      commitDurably(state.store, state.health !== 'ready');
      return state.store.savedCharacterPrompts.find((item) => item.id === input.id) ?? existing;
    }
    try {
      const next = createDomainCharacterPrompt(
        state.store,
        {
          name: input.name,
          prompt: input.prompt,
          source: input.source ?? 'generator',
          promptIntent: input.promptIntent,
          builderDraft: input.builderDraft ?? null,
          guidedDesign: input.guidedDesign ?? null,
          referenceImageStatus: input.referenceImageStatus ?? 'prompt-only',
          referenceImageAssetId: input.referenceImageAssetId ?? null,
          notes: input.notes ?? '',
          tags: input.tags ?? [],
        },
        { now: createdAt, createId: () => input.id },
      );
      commitDurably(next, true);
      return createdCharacterPrompt(state.store, input.id);
    } catch (error) {
      return mapDomainError(error);
    }
  };

  const updateSavedCharacterPrompt = (
    id: string,
    input: UpdateSavedCharacterPromptInput,
  ): SavedCharacterPrompt => {
    try {
      const next = updateDomainCharacterPrompt(
        state.store,
        id,
        {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.prompt === undefined ? {} : { prompt: input.prompt }),
          ...(input.builderDraft === undefined ? {} : { builderDraft: input.builderDraft }),
          ...(input.guidedDesign === undefined ? {} : { guidedDesign: input.guidedDesign }),
          ...(input.referenceImageStatus === undefined
            ? {}
            : { referenceImageStatus: input.referenceImageStatus }),
          ...(input.referenceImageAssetId === undefined
            ? {}
            : { referenceImageAssetId: input.referenceImageAssetId }),
          ...(input.notes === undefined ? {} : { notes: input.notes }),
          ...(input.tags === undefined ? {} : { tags: input.tags }),
        },
        timestamp(),
      );
      const item = createdCharacterPrompt(next, id);
      commit(next);
      return item;
    } catch (error) {
      return mapDomainError(error);
    }
  };

  const deleteSavedCharacterPrompt = (id: string) => {
    if (!state.store.savedCharacterPrompts.some((item) => item.id === id)) {
      throw new CreativeAssetError(
        'not-found',
        'That character recipe is no longer in this library.',
      );
    }
    commit(deleteDomainCharacterPrompt(state.store, id));
  };

  const recordSuccessfulPrompt = (input: RecordSuccessfulPromptInput) => {
    const context = mutationContext();
    let next = recordSuccessfulPromptUse(
      state.store,
      {
        prompt: input.prompt,
        modelModeId: input.modelModeId,
        ...(input.savedPromptId ? { savedPromptId: input.savedPromptId } : {}),
        referenceImageAssetId: input.referenceImageAssetId ?? null,
      },
      context,
    );
    if (input.modelModeId === 'lucy-2.5' && input.savedCharacterPromptId) {
      const character = next.savedCharacterPrompts.find(
        (item) =>
          item.id === input.savedCharacterPromptId &&
          canonicalPrompt(item.prompt) === canonicalPrompt(input.prompt) &&
          item.referenceImageAssetId === (input.referenceImageAssetId ?? null),
      );
      if (character) next = markSavedCharacterPromptUsed(next, character.id, context.now).store;
    }
    if (next !== state.store) commit(next);
  };

  const enrichNewestMatchingRecent: CreativeAssetRepository['enrichNewestMatchingRecent'] = (
    prompt,
    modelModeId,
    referenceImageAssetId,
  ) => {
    try {
      const next = enrichNewestMatchingRecentWithReferenceImage(state.store, {
        prompt,
        modelModeId,
        referenceImageAssetId,
      });
      if (next !== state.store) commit(next);
    } catch (error) {
      mapDomainError(error);
    }
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    createSavedPrompt,
    updateSavedPrompt,
    renameSavedPrompt: (id, title) => updateSavedPrompt(id, { title }),
    deleteSavedPrompt,
    createSavedCharacterPrompt,
    persistSavedCharacterPrompt,
    updateSavedCharacterPrompt,
    renameSavedCharacterPrompt: (id, name) => updateSavedCharacterPrompt(id, { name }),
    deleteSavedCharacterPrompt,
    recordSuccessfulPrompt,
    enrichNewestMatchingRecent,
    search: (query, modelModeId) => searchCreativeAssets(state.store, query, modelModeId),
  };
};
