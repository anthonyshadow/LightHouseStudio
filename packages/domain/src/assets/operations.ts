import {
  ASSET_NAME_MAX_LENGTH,
  CHARACTER_NOTES_MAX_LENGTH,
  canonicalPrompt,
  containsMeaningfulText,
  normalizeAuthoredPrompt,
  normalizeTags,
  normalizeWhitespace,
} from '../common/text';
import { DomainRuleError } from '../errors/safe-error';
import type { ModelModeId } from '../session';
import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  RECENT_PROMPT_LIMIT,
  SAVED_CHARACTER_PROMPT_LIMIT,
  SAVED_PROMPT_LIMIT,
  type AssetMutationContext,
  type CreativeAssetSearchResults,
  type CreativeAssetStore,
  type RecentPrompt,
  type SavedCharacterPrompt,
  type SavedCharacterPromptInput,
  type SavedPrompt,
  type SavedPromptInput,
} from './types';

export const createEmptyCreativeAssetStore = (): CreativeAssetStore => ({
  schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
  savedPrompts: [],
  recentPrompts: [],
  savedCharacterPrompts: [],
});

const requireName = (value: string, label: string): string => {
  const name = normalizeWhitespace(value, ASSET_NAME_MAX_LENGTH);
  if (!containsMeaningfulText(name)) {
    throw new DomainRuleError('invalid-input', `${label} needs a useful name.`);
  }
  return name;
};

const requirePrompt = (value: string): string => {
  const prompt = normalizeAuthoredPrompt(value);
  if (!containsMeaningfulText(prompt)) {
    throw new DomainRuleError('invalid-input', 'A saved prompt cannot be empty.');
  }
  return prompt;
};

const normalizeReferenceImageAssetId = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const assetId = normalizeWhitespace(value, 128);
  if (!containsMeaningfulText(assetId)) {
    throw new DomainRuleError('invalid-input', 'A reference image asset ID cannot be empty.');
  }
  return assetId;
};

const assertTimestamp = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    throw new DomainRuleError('invalid-input', 'A valid timestamp is required.');
  }
  return date.toISOString();
};

const capByUpdated = <T extends { readonly updatedAt: string }>(
  records: readonly T[],
  limit: number,
): readonly T[] =>
  [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, limit);

const unlinkRecentPrompt = (recent: RecentPrompt, savedPromptId: string): RecentPrompt => {
  if (recent.savedPromptId !== savedPromptId) return recent;
  return {
    id: recent.id,
    prompt: recent.prompt,
    modelModeId: recent.modelModeId,
    referenceImageAssetId: recent.referenceImageAssetId,
    usedAt: recent.usedAt,
  };
};

export const createSavedPrompt = (
  store: CreativeAssetStore,
  input: SavedPromptInput,
  context: AssetMutationContext,
): CreativeAssetStore => {
  const now = assertTimestamp(context.now);
  const asset: SavedPrompt = {
    id: requireName(context.createId(), 'Asset'),
    title: requireName(input.title, 'Saved prompt'),
    prompt: requirePrompt(input.prompt),
    modelModeId: input.modelModeId,
    source: input.source,
    referenceImageAssetId: normalizeReferenceImageAssetId(input.referenceImageAssetId),
    tags: normalizeTags(input.tags ?? []),
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    useCount: 0,
  };
  return {
    ...store,
    savedPrompts: capByUpdated([asset, ...store.savedPrompts], SAVED_PROMPT_LIMIT),
  };
};

export const updateSavedPrompt = (
  store: CreativeAssetStore,
  id: string,
  patch: Partial<
    Pick<SavedPromptInput, 'title' | 'prompt' | 'source' | 'referenceImageAssetId' | 'tags'>
  >,
  nowValue: string,
): CreativeAssetStore => {
  const now = assertTimestamp(nowValue);
  let found = false;
  const savedPrompts = store.savedPrompts.map((asset) => {
    if (asset.id !== id) return asset;
    found = true;
    return {
      ...asset,
      ...(patch.title === undefined ? {} : { title: requireName(patch.title, 'Saved prompt') }),
      ...(patch.prompt === undefined ? {} : { prompt: requirePrompt(patch.prompt) }),
      ...(patch.source === undefined ? {} : { source: patch.source }),
      ...(patch.referenceImageAssetId === undefined
        ? {}
        : { referenceImageAssetId: normalizeReferenceImageAssetId(patch.referenceImageAssetId) }),
      ...(patch.tags === undefined ? {} : { tags: normalizeTags(patch.tags) }),
      updatedAt: now,
    };
  });
  if (!found) throw new DomainRuleError('invalid-input', 'Saved prompt was not found.');
  return { ...store, savedPrompts };
};

export const deleteSavedPrompt = (store: CreativeAssetStore, id: string): CreativeAssetStore => ({
  ...store,
  savedPrompts: store.savedPrompts.filter((asset) => asset.id !== id),
  recentPrompts: store.recentPrompts.map((recent) => unlinkRecentPrompt(recent, id)),
});

export const useSavedPrompt = (
  store: CreativeAssetStore,
  id: string,
  nowValue: string,
): { readonly store: CreativeAssetStore; readonly prompt: string } => {
  const now = assertTimestamp(nowValue);
  const asset = store.savedPrompts.find((candidate) => candidate.id === id);
  if (!asset) throw new DomainRuleError('invalid-input', 'Saved prompt was not found.');
  return {
    prompt: asset.prompt,
    store: {
      ...store,
      savedPrompts: store.savedPrompts.map((candidate) =>
        candidate.id === id
          ? { ...candidate, useCount: candidate.useCount + 1, lastUsedAt: now }
          : candidate,
      ),
    },
  };
};

/** Call only after a successful model Start or Apply. */
export const recordSuccessfulPromptUse = (
  store: CreativeAssetStore,
  input: {
    readonly prompt: string;
    readonly modelModeId: ModelModeId;
    readonly savedPromptId?: string;
    readonly referenceImageAssetId?: string | null;
  },
  context: AssetMutationContext,
): CreativeAssetStore => {
  const prompt = normalizeAuthoredPrompt(input.prompt);
  if (!containsMeaningfulText(prompt)) return store;
  const now = assertTimestamp(context.now);
  const promptKey = canonicalPrompt(prompt);
  const referenceImageAssetId = normalizeReferenceImageAssetId(input.referenceImageAssetId);
  const matchingSaved =
    store.savedPrompts.find(
      (asset) =>
        asset.modelModeId === input.modelModeId &&
        asset.id === input.savedPromptId &&
        canonicalPrompt(asset.prompt) === promptKey,
    ) ??
    store.savedPrompts.find(
      (asset) =>
        asset.modelModeId === input.modelModeId && canonicalPrompt(asset.prompt) === promptKey,
    );
  const existingRecent = store.recentPrompts.find(
    (recent) =>
      recent.modelModeId === input.modelModeId &&
      canonicalPrompt(recent.prompt) === promptKey &&
      recent.referenceImageAssetId === referenceImageAssetId,
  );
  const recent: RecentPrompt = {
    id: existingRecent?.id ?? requireName(context.createId(), 'Recent prompt'),
    prompt,
    modelModeId: input.modelModeId,
    ...(matchingSaved ? { savedPromptId: matchingSaved.id } : {}),
    referenceImageAssetId,
    usedAt: now,
  };
  const recentPrompts = [
    recent,
    ...store.recentPrompts.filter(
      (candidate) =>
        !(
          candidate.modelModeId === input.modelModeId &&
          canonicalPrompt(candidate.prompt) === promptKey &&
          candidate.referenceImageAssetId === referenceImageAssetId
        ),
    ),
  ].slice(0, RECENT_PROMPT_LIMIT);

  return {
    ...store,
    recentPrompts,
    savedPrompts: matchingSaved
      ? store.savedPrompts.map((asset) =>
          asset.id === matchingSaved.id
            ? { ...asset, useCount: asset.useCount + 1, lastUsedAt: now }
            : asset,
        )
      : store.savedPrompts,
  };
};

/**
 * Enriches the newest matching text-only recent without creating a recent or replacing a
 * reference already attached to an earlier successful use.
 */
export const enrichNewestMatchingRecentWithReferenceImage = (
  store: CreativeAssetStore,
  input: {
    readonly prompt: string;
    readonly modelModeId: ModelModeId;
    readonly referenceImageAssetId: string;
  },
): CreativeAssetStore => {
  const promptKey = canonicalPrompt(normalizeAuthoredPrompt(input.prompt));
  if (!containsMeaningfulText(promptKey)) return store;
  const referenceImageAssetId = normalizeReferenceImageAssetId(input.referenceImageAssetId);
  if (!referenceImageAssetId) return store;

  const target = [...store.recentPrompts]
    .filter(
      (recent) =>
        recent.modelModeId === input.modelModeId &&
        canonicalPrompt(recent.prompt) === promptKey &&
        recent.referenceImageAssetId === null,
    )
    .sort((left, right) => right.usedAt.localeCompare(left.usedAt))[0];
  if (!target) return store;

  return {
    ...store,
    recentPrompts: store.recentPrompts.map((recent) =>
      recent.id === target.id ? { ...recent, referenceImageAssetId } : recent,
    ),
  };
};

export const createSavedCharacterPrompt = (
  store: CreativeAssetStore,
  input: SavedCharacterPromptInput,
  context: AssetMutationContext,
): CreativeAssetStore => {
  const now = assertTimestamp(context.now);
  const asset: SavedCharacterPrompt = {
    id: requireName(context.createId(), 'Character asset'),
    name: requireName(input.name, 'Character prompt'),
    prompt: requirePrompt(input.prompt),
    source: input.source,
    promptIntent: input.promptIntent,
    builderDraft: input.builderDraft ?? null,
    referenceImageStatus: input.referenceImageAssetId
      ? 'persisted-reference'
      : input.referenceImageStatus === 'persisted-reference'
        ? 'prompt-only'
        : input.referenceImageStatus,
    referenceImageAssetId: normalizeReferenceImageAssetId(input.referenceImageAssetId),
    notes: normalizeWhitespace(input.notes ?? '', CHARACTER_NOTES_MAX_LENGTH),
    tags: normalizeTags(input.tags ?? []),
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    useCount: 0,
  };
  return {
    ...store,
    savedCharacterPrompts: capByUpdated(
      [asset, ...store.savedCharacterPrompts],
      SAVED_CHARACTER_PROMPT_LIMIT,
    ),
  };
};

export const updateSavedCharacterPrompt = (
  store: CreativeAssetStore,
  id: string,
  patch: Partial<
    Pick<
      SavedCharacterPromptInput,
      | 'name'
      | 'prompt'
      | 'source'
      | 'promptIntent'
      | 'builderDraft'
      | 'referenceImageStatus'
      | 'referenceImageAssetId'
      | 'notes'
      | 'tags'
    >
  >,
  nowValue: string,
): CreativeAssetStore => {
  const now = assertTimestamp(nowValue);
  let found = false;
  const savedCharacterPrompts = store.savedCharacterPrompts.map((asset) => {
    if (asset.id !== id) return asset;
    found = true;
    const nextPrompt = patch.prompt === undefined ? asset.prompt : requirePrompt(patch.prompt);
    const promptWasManuallyEdited =
      nextPrompt !== asset.prompt &&
      patch.source === undefined &&
      patch.promptIntent === undefined &&
      patch.builderDraft === undefined;
    const nextReferenceImageAssetId =
      patch.referenceImageAssetId === undefined
        ? asset.referenceImageAssetId
        : normalizeReferenceImageAssetId(patch.referenceImageAssetId);
    const requestedReferenceStatus = patch.referenceImageStatus ?? asset.referenceImageStatus;
    const nextReferenceImageStatus: SavedCharacterPrompt['referenceImageStatus'] =
      nextReferenceImageAssetId
        ? 'persisted-reference'
        : requestedReferenceStatus === 'persisted-reference'
          ? 'prompt-only'
          : requestedReferenceStatus;
    return {
      ...asset,
      ...(patch.name === undefined ? {} : { name: requireName(patch.name, 'Character prompt') }),
      ...(patch.prompt === undefined ? {} : { prompt: nextPrompt }),
      ...(promptWasManuallyEdited
        ? { source: 'manual' as const, promptIntent: null, builderDraft: null }
        : {
            ...(patch.source === undefined ? {} : { source: patch.source }),
            ...(patch.promptIntent === undefined ? {} : { promptIntent: patch.promptIntent }),
            ...(patch.builderDraft === undefined ? {} : { builderDraft: patch.builderDraft }),
          }),
      referenceImageStatus: nextReferenceImageStatus,
      referenceImageAssetId: nextReferenceImageAssetId,
      ...(patch.notes === undefined
        ? {}
        : { notes: normalizeWhitespace(patch.notes, CHARACTER_NOTES_MAX_LENGTH) }),
      ...(patch.tags === undefined ? {} : { tags: normalizeTags(patch.tags) }),
      updatedAt: now,
    };
  });
  if (!found) throw new DomainRuleError('invalid-input', 'Character prompt was not found.');
  return { ...store, savedCharacterPrompts };
};

export const deleteSavedCharacterPrompt = (
  store: CreativeAssetStore,
  id: string,
): CreativeAssetStore => ({
  ...store,
  savedCharacterPrompts: store.savedCharacterPrompts.filter((asset) => asset.id !== id),
});

export const useSavedCharacterPrompt = (
  store: CreativeAssetStore,
  id: string,
  nowValue: string,
): {
  readonly store: CreativeAssetStore;
  readonly prompt: string;
  readonly builderDraft: SavedCharacterPrompt['builderDraft'];
} => {
  const now = assertTimestamp(nowValue);
  const asset = store.savedCharacterPrompts.find((candidate) => candidate.id === id);
  if (!asset) throw new DomainRuleError('invalid-input', 'Character prompt was not found.');
  return {
    prompt: asset.prompt,
    builderDraft: asset.builderDraft,
    store: {
      ...store,
      savedCharacterPrompts: store.savedCharacterPrompts.map((candidate) =>
        candidate.id === id
          ? { ...candidate, useCount: candidate.useCount + 1, lastUsedAt: now }
          : candidate,
      ),
    },
  };
};

export const searchCreativeAssets = (
  store: CreativeAssetStore,
  queryValue: string,
  modelModeId?: ModelModeId,
): CreativeAssetSearchResults => {
  const query = canonicalPrompt(queryValue);
  const matches = (values: readonly string[]): boolean =>
    !query || values.some((value) => canonicalPrompt(value).includes(query));
  return {
    savedPrompts: store.savedPrompts.filter(
      (asset) =>
        (!modelModeId || asset.modelModeId === modelModeId) &&
        matches([asset.title, asset.prompt, ...asset.tags]),
    ),
    recentPrompts: store.recentPrompts.filter(
      (recent) => (!modelModeId || recent.modelModeId === modelModeId) && matches([recent.prompt]),
    ),
    savedCharacterPrompts:
      modelModeId === 'lucy-vton-3'
        ? []
        : store.savedCharacterPrompts.filter((asset) =>
            matches([asset.name, asset.prompt, asset.notes, ...asset.tags]),
          ),
  };
};
