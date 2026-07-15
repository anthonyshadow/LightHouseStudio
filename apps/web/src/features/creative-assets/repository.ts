import {
  canonicalPrompt,
  createSavedCharacterPrompt as createDomainCharacterPrompt,
  createSavedPrompt as createDomainSavedPrompt,
  deleteSavedCharacterPrompt as deleteDomainCharacterPrompt,
  deleteSavedPrompt as deleteDomainSavedPrompt,
  DomainRuleError,
  parseCreativeAssetStore,
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
  type CreateSavedCharacterPromptInput,
  type CreateSavedPromptInput,
  type CreativeAssetRepository,
  type CreativeAssetRepositoryState,
  type RecordSuccessfulPromptInput,
  type SavedCharacterPrompt,
  type SavedPrompt,
  type StorageLike,
  type UpdateSavedCharacterPromptInput,
  type UpdateSavedPromptInput,
} from './types';

export type CreativeAssetErrorCode = 'invalid-name' | 'invalid-prompt' | 'not-found';

export class CreativeAssetError extends Error {
  readonly code: CreativeAssetErrorCode;

  constructor(code: CreativeAssetErrorCode, message: string) {
    super(message);
    this.name = 'CreativeAssetError';
    this.code = code;
  }
}

export interface CreativeAssetRepositoryOptions {
  readonly storage?: StorageLike | null;
  readonly storageKey?: string;
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

const loadInitialState = (
  storage: StorageLike | null,
  storageKey: string,
): { state: CreativeAssetRepositoryState; storage: StorageLike | null } => {
  if (!storage) {
    const health = 'session-only' as const;
    return {
      state: { store: createEmptyCreativeAssetStore(), health, notice: storageNotice(health) },
      storage: null,
    };
  }

  let serialized: string | null;
  try {
    serialized = storage.getItem(storageKey);
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
  const health = result.recovered ? 'recovered' : 'ready';
  if (result.recovered) {
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
  let storage = options.storage === undefined ? browserStorage() : options.storage;
  const initial = loadInitialState(storage, storageKey);
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
          referenceImageStatus: input.referenceImageStatus ?? 'prompt-only',
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
          ...(input.referenceImageStatus === undefined
            ? {}
            : { referenceImageStatus: input.referenceImageStatus }),
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
      },
      context,
    );
    if (input.modelModeId === 'lucy-2.5' && input.savedCharacterPromptId) {
      const character = next.savedCharacterPrompts.find(
        (item) =>
          item.id === input.savedCharacterPromptId &&
          canonicalPrompt(item.prompt) === canonicalPrompt(input.prompt),
      );
      if (character) next = markSavedCharacterPromptUsed(next, character.id, context.now).store;
    }
    if (next !== state.store) commit(next);
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
    updateSavedCharacterPrompt,
    renameSavedCharacterPrompt: (id, name) => updateSavedCharacterPrompt(id, { name }),
    deleteSavedCharacterPrompt,
    recordSuccessfulPrompt,
    search: (query, modelModeId) => searchCreativeAssets(state.store, query, modelModeId),
  };
};
