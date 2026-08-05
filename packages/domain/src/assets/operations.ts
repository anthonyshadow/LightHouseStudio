import {
  ASSET_NAME_MAX_LENGTH,
  CHARACTER_NOTES_MAX_LENGTH,
  canonicalPrompt,
  containsMeaningfulText,
  normalizeAuthoredPrompt,
  normalizeTags,
  normalizeWhitespace,
} from '../common/text';
import { AssetRuleError, type AssetRuleErrorReason } from './errors';
import type { ModelModeId } from '../session';
import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  RECENT_PROMPT_LIMIT,
  SAVED_CHARACTER_PROMPT_LIMIT,
  SAVED_CHARACTER_VARIANT_LIMIT,
  SAVED_PROMPT_LIMIT,
  type AssetMutationContext,
  type CreativeAssetSearchResults,
  type CreativeAssetStore,
  type RecentPrompt,
  type SavedCharacterPrompt,
  type SavedCharacterPromptInput,
  type SavedCharacterVariant,
  type SavedCharacterVariantInput,
  type SavedPrompt,
  type SavedPromptInput,
  type VtonInputKind,
} from './types';

export const createEmptyCreativeAssetStore = (): CreativeAssetStore => ({
  schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
  savedPrompts: [],
  recentPrompts: [],
  savedCharacterPrompts: [],
  savedCharacterVariants: [],
});

const requireName = (
  value: string,
  label: string,
  reason: AssetRuleErrorReason = 'invalid-name',
): string => {
  const name = normalizeWhitespace(value, ASSET_NAME_MAX_LENGTH);
  if (!containsMeaningfulText(name)) {
    throw new AssetRuleError(reason, `${label} needs a useful name.`);
  }
  return name;
};

const requirePrompt = (value: string): string => {
  const prompt = normalizeAuthoredPrompt(value);
  if (!containsMeaningfulText(prompt)) {
    throw new AssetRuleError('invalid-prompt', 'A saved prompt cannot be empty.');
  }
  return prompt;
};

const normalizeReferenceImageAssetId = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const assetId = normalizeWhitespace(value, 128);
  if (!containsMeaningfulText(assetId)) {
    throw new AssetRuleError('invalid-id', 'A reference image asset ID cannot be empty.');
  }
  return assetId;
};

const normalizeVtonRecipe = (input: {
  readonly prompt: string;
  readonly modelModeId: ModelModeId;
  readonly referenceImageAssetId?: string | null;
  readonly vtonInputKind?: VtonInputKind | null;
  readonly enhancePrompt?: boolean;
}) => {
  const referenceImageAssetId = normalizeReferenceImageAssetId(input.referenceImageAssetId);
  if (input.modelModeId !== 'lucy-vton-latest') {
    return {
      prompt: requirePrompt(input.prompt),
      referenceImageAssetId,
      vtonInputKind: null,
      enhancePrompt: false,
    } as const;
  }

  const vtonInputKind = input.vtonInputKind ?? (referenceImageAssetId ? 'saved-outfit' : 'prompt');
  const prompt = normalizeAuthoredPrompt(input.prompt);
  if (vtonInputKind === 'prompt') {
    if (!containsMeaningfulText(prompt)) {
      throw new AssetRuleError('invalid-prompt', 'A prompt outfit needs garment direction.');
    }
    return {
      prompt,
      referenceImageAssetId: null,
      vtonInputKind,
      enhancePrompt: Boolean(input.enhancePrompt),
    } as const;
  }
  if (!referenceImageAssetId) {
    throw new AssetRuleError('invalid-id', 'An image outfit needs a persisted reference image.');
  }
  return {
    prompt,
    referenceImageAssetId,
    vtonInputKind,
    enhancePrompt: false,
  } as const;
};

const normalizeCharacterReference = (input: {
  readonly referenceImageAssetId?: string | null;
  readonly uploadedReferenceImageAssetId?: string | null;
  readonly finalReferenceKind?: 'uploaded' | 'generated' | null;
}) => {
  const referenceImageAssetId = normalizeReferenceImageAssetId(input.referenceImageAssetId);
  const uploadedReferenceImageAssetId = normalizeReferenceImageAssetId(
    input.uploadedReferenceImageAssetId,
  );
  const finalReferenceKind =
    input.finalReferenceKind === undefined
      ? referenceImageAssetId
        ? 'generated'
        : null
      : input.finalReferenceKind;
  const valid =
    (finalReferenceKind === null &&
      referenceImageAssetId === null &&
      uploadedReferenceImageAssetId === null) ||
    (finalReferenceKind === 'generated' && referenceImageAssetId !== null) ||
    (finalReferenceKind === 'uploaded' &&
      referenceImageAssetId !== null &&
      uploadedReferenceImageAssetId === referenceImageAssetId);
  if (!valid) {
    throw new AssetRuleError(
      'invalid-id',
      'The final and uploaded reference-image identities are inconsistent.',
    );
  }
  return { referenceImageAssetId, uploadedReferenceImageAssetId, finalReferenceKind };
};

const normalizeCharacterPrompt = (
  value: string,
  reference: ReturnType<typeof normalizeCharacterReference>,
): string => {
  const prompt = normalizeAuthoredPrompt(value);
  if (!containsMeaningfulText(prompt) && reference.finalReferenceKind !== 'uploaded') {
    throw new AssetRuleError(
      'invalid-prompt',
      'An image-only character requires an uploaded reference image.',
    );
  }
  return prompt;
};

const assertTimestamp = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) {
    throw new AssetRuleError('invalid-id', 'A valid timestamp is required.');
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
    vtonInputKind: recent.vtonInputKind,
    enhancePrompt: recent.enhancePrompt,
    usedAt: recent.usedAt,
  };
};

const withoutRecentCharacterAttribution = (recent: RecentPrompt): RecentPrompt => ({
  id: recent.id,
  prompt: recent.prompt,
  modelModeId: recent.modelModeId,
  ...(recent.savedPromptId ? { savedPromptId: recent.savedPromptId } : {}),
  ...(recent.characterName ? { characterName: recent.characterName } : {}),
  referenceImageAssetId: recent.referenceImageAssetId,
  vtonInputKind: recent.vtonInputKind,
  enhancePrompt: recent.enhancePrompt,
  usedAt: recent.usedAt,
});

const unlinkRecentCharacter = (
  recent: RecentPrompt,
  savedCharacterPromptId: string,
): RecentPrompt => {
  if (recent.savedCharacterPromptId !== savedCharacterPromptId) return recent;
  return withoutRecentCharacterAttribution(recent);
};

const unlinkRecentCharacterVariant = (
  recent: RecentPrompt,
  savedCharacterVariantId: string,
): RecentPrompt => {
  if (recent.savedCharacterVariantId !== savedCharacterVariantId) return recent;
  return withoutRecentCharacterAttribution(recent);
};

export const createSavedPrompt = (
  store: CreativeAssetStore,
  input: SavedPromptInput,
  context: AssetMutationContext,
): CreativeAssetStore => {
  const now = assertTimestamp(context.now);
  const recipe = normalizeVtonRecipe(input);
  const asset: SavedPrompt = {
    id: requireName(context.createId(), 'Asset', 'invalid-id'),
    title: requireName(input.title, 'Saved prompt'),
    prompt: recipe.prompt,
    modelModeId: input.modelModeId,
    source: input.source,
    referenceImageAssetId: recipe.referenceImageAssetId,
    vtonInputKind: recipe.vtonInputKind,
    enhancePrompt: recipe.enhancePrompt,
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
    Pick<
      SavedPromptInput,
      | 'title'
      | 'prompt'
      | 'source'
      | 'referenceImageAssetId'
      | 'vtonInputKind'
      | 'enhancePrompt'
      | 'tags'
    >
  >,
  nowValue: string,
): CreativeAssetStore => {
  const now = assertTimestamp(nowValue);
  let found = false;
  const savedPrompts = store.savedPrompts.map((asset) => {
    if (asset.id !== id) return asset;
    found = true;
    const nextPrompt = patch.prompt === undefined ? asset.prompt : patch.prompt;
    const promptChanged = canonicalPrompt(nextPrompt) !== canonicalPrompt(asset.prompt);
    const requestedReferenceImageAssetId =
      patch.referenceImageAssetId === undefined
        ? promptChanged && asset.modelModeId !== 'lucy-vton-latest'
          ? null
          : asset.referenceImageAssetId
        : normalizeReferenceImageAssetId(patch.referenceImageAssetId);
    const recipe = normalizeVtonRecipe({
      prompt: nextPrompt,
      modelModeId: asset.modelModeId,
      referenceImageAssetId: requestedReferenceImageAssetId,
      vtonInputKind: patch.vtonInputKind === undefined ? asset.vtonInputKind : patch.vtonInputKind,
      enhancePrompt: patch.enhancePrompt === undefined ? asset.enhancePrompt : patch.enhancePrompt,
    });
    return {
      ...asset,
      ...(patch.title === undefined ? {} : { title: requireName(patch.title, 'Saved prompt') }),
      prompt: recipe.prompt,
      ...(patch.source === undefined ? {} : { source: patch.source }),
      referenceImageAssetId: recipe.referenceImageAssetId,
      vtonInputKind: recipe.vtonInputKind,
      enhancePrompt: recipe.enhancePrompt,
      ...(patch.tags === undefined ? {} : { tags: normalizeTags(patch.tags) }),
      updatedAt: now,
    };
  });
  if (!found) throw new AssetRuleError('not-found', 'Saved prompt was not found.');
  const updated = savedPrompts.find((asset) => asset.id === id);
  return {
    ...store,
    savedPrompts,
    recentPrompts: store.recentPrompts.map((recent) =>
      recent.savedPromptId === id &&
      (!updated ||
        recent.modelModeId !== updated.modelModeId ||
        canonicalPrompt(recent.prompt) !== canonicalPrompt(updated.prompt) ||
        recent.referenceImageAssetId !== updated.referenceImageAssetId ||
        recent.vtonInputKind !== updated.vtonInputKind ||
        recent.enhancePrompt !== updated.enhancePrompt)
        ? unlinkRecentPrompt(recent, id)
        : recent,
    ),
  };
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
  if (!asset) throw new AssetRuleError('not-found', 'Saved prompt was not found.');
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
    readonly savedCharacterPromptId?: string;
    readonly savedCharacterVariantId?: string;
    readonly characterName?: string;
    readonly referenceImageAssetId?: string | null;
    readonly vtonInputKind?: VtonInputKind | null;
    readonly enhancePrompt?: boolean;
  },
  context: AssetMutationContext,
): CreativeAssetStore => {
  const prompt = normalizeAuthoredPrompt(input.prompt);
  const now = assertTimestamp(context.now);
  const promptKey = canonicalPrompt(prompt);
  const referenceImageAssetId = normalizeReferenceImageAssetId(input.referenceImageAssetId);
  const vtonInputKind =
    input.modelModeId === 'lucy-vton-latest'
      ? (input.vtonInputKind ?? (referenceImageAssetId ? 'saved-outfit' : 'prompt'))
      : null;
  const enhancePrompt = vtonInputKind === 'prompt' ? Boolean(input.enhancePrompt) : false;
  const matchingCharacter =
    input.modelModeId === 'lucy-latest' && input.savedCharacterPromptId
      ? store.savedCharacterPrompts.find(
          (asset) =>
            asset.id === input.savedCharacterPromptId &&
            canonicalPrompt(asset.prompt) === promptKey &&
            (input.savedCharacterVariantId
              ? store.savedCharacterVariants.some(
                  (variant) =>
                    variant.id === input.savedCharacterVariantId &&
                    variant.parentCharacterId === asset.id &&
                    variant.referenceImageAssetId === referenceImageAssetId,
                )
              : asset.referenceImageAssetId === referenceImageAssetId),
        )
      : undefined;
  const matchingVariant =
    matchingCharacter && input.savedCharacterVariantId
      ? store.savedCharacterVariants.find(
          (variant) =>
            variant.id === input.savedCharacterVariantId &&
            variant.parentCharacterId === matchingCharacter.id &&
            variant.referenceImageAssetId === referenceImageAssetId,
        )
      : undefined;
  const characterName = matchingCharacter?.name ?? input.characterName;
  const hasPrompt = containsMeaningfulText(prompt);
  const validImageOnlyOutfit =
    input.modelModeId === 'lucy-vton-latest' &&
    vtonInputKind === 'saved-outfit' &&
    referenceImageAssetId !== null;
  if (
    !hasPrompt &&
    !validImageOnlyOutfit &&
    (!referenceImageAssetId ||
      input.modelModeId !== 'lucy-latest' ||
      !characterName ||
      !containsMeaningfulText(characterName))
  ) {
    return store;
  }
  const matchingSaved =
    store.savedPrompts.find(
      (asset) =>
        asset.modelModeId === input.modelModeId &&
        asset.id === input.savedPromptId &&
        canonicalPrompt(asset.prompt) === promptKey &&
        asset.referenceImageAssetId === referenceImageAssetId &&
        asset.vtonInputKind === vtonInputKind &&
        asset.enhancePrompt === enhancePrompt,
    ) ??
    store.savedPrompts.find(
      (asset) =>
        asset.modelModeId === input.modelModeId &&
        canonicalPrompt(asset.prompt) === promptKey &&
        asset.referenceImageAssetId === referenceImageAssetId &&
        asset.vtonInputKind === vtonInputKind &&
        asset.enhancePrompt === enhancePrompt,
    );
  const existingRecent = store.recentPrompts.find(
    (recent) =>
      recent.modelModeId === input.modelModeId &&
      canonicalPrompt(recent.prompt) === promptKey &&
      recent.referenceImageAssetId === referenceImageAssetId &&
      recent.vtonInputKind === vtonInputKind &&
      recent.enhancePrompt === enhancePrompt &&
      (matchingCharacter
        ? recent.savedCharacterPromptId === matchingCharacter.id &&
          recent.savedCharacterVariantId === matchingVariant?.id
        : recent.characterName === characterName),
  );
  const recent: RecentPrompt = {
    id: existingRecent?.id ?? requireName(context.createId(), 'Recent prompt', 'invalid-id'),
    prompt,
    modelModeId: input.modelModeId,
    ...(matchingSaved ? { savedPromptId: matchingSaved.id } : {}),
    ...(matchingCharacter ? { savedCharacterPromptId: matchingCharacter.id } : {}),
    ...(matchingVariant ? { savedCharacterVariantId: matchingVariant.id } : {}),
    ...(characterName ? { characterName: requireName(characterName, 'Character') } : {}),
    referenceImageAssetId,
    vtonInputKind,
    enhancePrompt,
    usedAt: now,
  };
  const recentPrompts = [
    recent,
    ...store.recentPrompts.filter(
      (candidate) =>
        !(
          candidate.modelModeId === input.modelModeId &&
          canonicalPrompt(candidate.prompt) === promptKey &&
          candidate.referenceImageAssetId === referenceImageAssetId &&
          candidate.vtonInputKind === vtonInputKind &&
          candidate.enhancePrompt === enhancePrompt &&
          (matchingCharacter
            ? candidate.savedCharacterPromptId === matchingCharacter.id &&
              candidate.savedCharacterVariantId === matchingVariant?.id
            : candidate.characterName === characterName)
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
    savedCharacterPrompts: matchingCharacter
      ? store.savedCharacterPrompts.map((asset) =>
          asset.id === matchingCharacter.id
            ? {
                ...asset,
                selectedWardrobeVariantId: matchingVariant?.id ?? null,
                useCount: asset.useCount + 1,
                lastUsedAt: now,
              }
            : asset,
        )
      : store.savedCharacterPrompts,
    savedCharacterVariants: matchingVariant
      ? store.savedCharacterVariants.map((variant) =>
          variant.id === matchingVariant.id
            ? { ...variant, useCount: variant.useCount + 1, lastUsedAt: now }
            : variant,
        )
      : store.savedCharacterVariants,
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
  const reference = normalizeCharacterReference(input);
  const prompt = normalizeCharacterPrompt(input.prompt, reference);
  if (!containsMeaningfulText(prompt) && (input.builderDraft || input.guidedDesign)) {
    throw new AssetRuleError(
      'invalid-prompt',
      'Image-only characters cannot retain prompt-builder provenance.',
    );
  }
  const asset: SavedCharacterPrompt = {
    id: requireName(context.createId(), 'Character asset', 'invalid-id'),
    name: requireName(input.name, 'Character prompt'),
    prompt,
    source: input.source,
    promptIntent: input.promptIntent,
    builderDraft: containsMeaningfulText(prompt) ? (input.builderDraft ?? null) : null,
    guidedDesign:
      containsMeaningfulText(prompt) &&
      input.promptIntent === 'character-transform' &&
      input.builderDraft?.intent === 'character-transform'
        ? (input.guidedDesign ?? null)
        : null,
    referenceImageStatus: reference.referenceImageAssetId
      ? 'persisted-reference'
      : input.referenceImageStatus === 'persisted-reference'
        ? 'prompt-only'
        : input.referenceImageStatus,
    ...reference,
    selectedWardrobeVariantId: null,
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
      | 'guidedDesign'
      | 'referenceImageStatus'
      | 'referenceImageAssetId'
      | 'uploadedReferenceImageAssetId'
      | 'finalReferenceKind'
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
    const rawNextPrompt = patch.prompt === undefined ? asset.prompt : patch.prompt;
    const promptWasManuallyEdited =
      normalizeAuthoredPrompt(rawNextPrompt) !== asset.prompt &&
      patch.source === undefined &&
      patch.promptIntent === undefined &&
      patch.builderDraft === undefined &&
      patch.guidedDesign === undefined;
    const nextPromptIntent = promptWasManuallyEdited
      ? null
      : patch.promptIntent === undefined
        ? asset.promptIntent
        : patch.promptIntent;
    const nextBuilderDraft = promptWasManuallyEdited
      ? null
      : patch.builderDraft === undefined
        ? asset.builderDraft
        : patch.builderDraft;
    const requestedGuidedDesign = promptWasManuallyEdited
      ? null
      : patch.guidedDesign === undefined
        ? asset.guidedDesign
        : patch.guidedDesign;
    const nextGuidedDesign =
      nextPromptIntent === 'character-transform' &&
      nextBuilderDraft?.intent === 'character-transform'
        ? requestedGuidedDesign
        : null;
    const promptChanged =
      canonicalPrompt(normalizeAuthoredPrompt(rawNextPrompt)) !== canonicalPrompt(asset.prompt);
    const requestedReferenceImageAssetId =
      patch.referenceImageAssetId === undefined
        ? promptChanged
          ? asset.uploadedReferenceImageAssetId
          : asset.referenceImageAssetId
        : normalizeReferenceImageAssetId(patch.referenceImageAssetId);
    const requestedUploadedReferenceImageAssetId =
      patch.uploadedReferenceImageAssetId === undefined
        ? asset.uploadedReferenceImageAssetId
        : normalizeReferenceImageAssetId(patch.uploadedReferenceImageAssetId);
    const requestedFinalReferenceKind =
      patch.finalReferenceKind === undefined
        ? promptChanged
          ? requestedReferenceImageAssetId
            ? 'uploaded'
            : null
          : asset.finalReferenceKind
        : patch.finalReferenceKind;
    const reference = normalizeCharacterReference({
      referenceImageAssetId: requestedReferenceImageAssetId,
      uploadedReferenceImageAssetId: requestedUploadedReferenceImageAssetId,
      finalReferenceKind: requestedFinalReferenceKind,
    });
    const nextPrompt = normalizeCharacterPrompt(rawNextPrompt, reference);
    const requestedReferenceStatus = patch.referenceImageStatus ?? asset.referenceImageStatus;
    const nextReferenceImageStatus: SavedCharacterPrompt['referenceImageStatus'] =
      reference.referenceImageAssetId
        ? 'persisted-reference'
        : requestedReferenceStatus === 'persisted-reference'
          ? 'prompt-only'
          : requestedReferenceStatus;
    return {
      ...asset,
      ...(patch.name === undefined ? {} : { name: requireName(patch.name, 'Character prompt') }),
      ...(patch.prompt === undefined ? {} : { prompt: nextPrompt }),
      ...(promptWasManuallyEdited
        ? { source: 'manual' as const }
        : {
            ...(patch.source === undefined ? {} : { source: patch.source }),
          }),
      promptIntent: nextPromptIntent,
      builderDraft: nextBuilderDraft,
      guidedDesign: nextGuidedDesign,
      referenceImageStatus: nextReferenceImageStatus,
      ...reference,
      ...(patch.notes === undefined
        ? {}
        : { notes: normalizeWhitespace(patch.notes, CHARACTER_NOTES_MAX_LENGTH) }),
      ...(patch.tags === undefined ? {} : { tags: normalizeTags(patch.tags) }),
      updatedAt: now,
    };
  });
  if (!found) throw new AssetRuleError('not-found', 'Character prompt was not found.');
  return { ...store, savedCharacterPrompts };
};

export const deleteSavedCharacterPrompt = (
  store: CreativeAssetStore,
  id: string,
): CreativeAssetStore => ({
  ...store,
  savedCharacterPrompts: store.savedCharacterPrompts.filter((asset) => asset.id !== id),
  recentPrompts: store.recentPrompts.map((recent) => unlinkRecentCharacter(recent, id)),
  savedCharacterVariants: store.savedCharacterVariants.filter(
    (variant) => variant.parentCharacterId !== id,
  ),
});

export const createSavedCharacterVariant = (
  store: CreativeAssetStore,
  input: SavedCharacterVariantInput,
  context: AssetMutationContext,
): CreativeAssetStore => {
  const now = assertTimestamp(context.now);
  if (!store.savedCharacterPrompts.some((character) => character.id === input.parentCharacterId)) {
    throw new AssetRuleError('not-found', 'The parent character was not found.');
  }
  const sourceReferenceImageAssetId = normalizeReferenceImageAssetId(
    input.creation.sourceReferenceImageAssetId,
  );
  const referenceImageAssetId = normalizeReferenceImageAssetId(input.referenceImageAssetId);
  if (!sourceReferenceImageAssetId || !referenceImageAssetId) {
    throw new AssetRuleError('invalid-id', 'Wardrobe variants require source and result images.');
  }
  const creation =
    input.creation.method === 'add-outfit'
      ? {
          method: 'add-outfit' as const,
          sourceReferenceImageAssetId,
          garmentReferenceImageAssetId:
            normalizeReferenceImageAssetId(input.creation.garmentReferenceImageAssetId) ?? '',
        }
      : {
          method: 'change-features' as const,
          sourceReferenceImageAssetId,
          changeInstructions: normalizeAuthoredPrompt(input.creation.changeInstructions),
        };
  if (
    (creation.method === 'add-outfit' && !creation.garmentReferenceImageAssetId) ||
    (creation.method === 'change-features' && !containsMeaningfulText(creation.changeInstructions))
  ) {
    throw new AssetRuleError('invalid-prompt', 'Complete the wardrobe generation details.');
  }
  const variant: SavedCharacterVariant = {
    id: requireName(context.createId(), 'Wardrobe variant', 'invalid-id'),
    parentCharacterId: input.parentCharacterId,
    title: requireName(input.title, 'Wardrobe variant'),
    referenceImageAssetId,
    creation,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    useCount: 0,
  };
  const savedCharacterVariants = capByUpdated(
    [variant, ...store.savedCharacterVariants],
    SAVED_CHARACTER_VARIANT_LIMIT,
  );
  const retainedVariantIds = new Set(savedCharacterVariants.map((candidate) => candidate.id));
  return {
    ...store,
    savedCharacterPrompts: store.savedCharacterPrompts.map((character) =>
      character.selectedWardrobeVariantId &&
      !retainedVariantIds.has(character.selectedWardrobeVariantId)
        ? { ...character, selectedWardrobeVariantId: null }
        : character,
    ),
    savedCharacterVariants,
  };
};

export const deleteSavedCharacterVariant = (
  store: CreativeAssetStore,
  id: string,
): CreativeAssetStore => ({
  ...store,
  savedCharacterPrompts: store.savedCharacterPrompts.map((character) =>
    character.selectedWardrobeVariantId === id
      ? { ...character, selectedWardrobeVariantId: null }
      : character,
  ),
  recentPrompts: store.recentPrompts.map((recent) => unlinkRecentCharacterVariant(recent, id)),
  savedCharacterVariants: store.savedCharacterVariants.filter((variant) => variant.id !== id),
});

export const selectCharacterVersion = (
  store: CreativeAssetStore,
  characterId: string,
  variantId: string | null,
  nowValue: string,
): CreativeAssetStore => {
  const now = assertTimestamp(nowValue);
  const character = store.savedCharacterPrompts.find((candidate) => candidate.id === characterId);
  if (!character) throw new AssetRuleError('not-found', 'The character was not found.');
  if (
    variantId !== null &&
    !store.savedCharacterVariants.some(
      (variant) => variant.id === variantId && variant.parentCharacterId === characterId,
    )
  ) {
    throw new AssetRuleError('not-found', 'The wardrobe variant was not found.');
  }
  return {
    ...store,
    savedCharacterPrompts: store.savedCharacterPrompts.map((candidate) =>
      candidate.id === characterId
        ? { ...candidate, selectedWardrobeVariantId: variantId, updatedAt: now }
        : candidate,
    ),
  };
};

export const useSavedCharacterPrompt = (
  store: CreativeAssetStore,
  id: string,
  nowValue: string,
): {
  readonly store: CreativeAssetStore;
  readonly prompt: string;
  readonly builderDraft: SavedCharacterPrompt['builderDraft'];
  readonly guidedDesign: SavedCharacterPrompt['guidedDesign'];
} => {
  const now = assertTimestamp(nowValue);
  const asset = store.savedCharacterPrompts.find((candidate) => candidate.id === id);
  if (!asset) throw new AssetRuleError('not-found', 'Character prompt was not found.');
  return {
    prompt: asset.prompt,
    builderDraft: asset.builderDraft,
    guidedDesign: asset.guidedDesign,
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
      (recent) =>
        (!modelModeId || recent.modelModeId === modelModeId) &&
        matches([recent.prompt, recent.characterName ?? '']),
    ),
    savedCharacterPrompts:
      modelModeId === 'lucy-vton-latest'
        ? []
        : store.savedCharacterPrompts.filter((asset) =>
            matches([asset.name, asset.prompt, asset.notes, ...asset.tags]),
          ),
    savedCharacterVariants:
      modelModeId === 'lucy-vton-latest'
        ? []
        : store.savedCharacterVariants.filter((variant) =>
            matches([variant.title, variant.creation.method]),
          ),
  };
};
