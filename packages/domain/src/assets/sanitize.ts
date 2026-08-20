import {
  ASSET_NAME_MAX_LENGTH,
  BUILDER_DETAIL_MAX_LENGTH,
  CHARACTER_NOTES_MAX_LENGTH,
  containsMeaningfulText,
  normalizeAuthoredPrompt,
  normalizeTags,
  normalizeWhitespace,
} from '../common/text';
import { PROMPT_INTENTS, sanitizePromptBuilderDraft, type PromptIntent } from '../prompts';
import { isModelModeId, type ModelModeId } from '../session';
import { canonicalPrompt } from '../common/text';
import { createEmptyCreativeAssetStore } from './operations';
import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  EARLIER_CREATIVE_ASSET_SCHEMA_VERSION,
  GUIDED_CHOICE_KEYS,
  LEGACY_CREATIVE_ASSET_SCHEMA_VERSION,
  OLDER_CREATIVE_ASSET_SCHEMA_VERSION,
  ORIGINAL_CREATIVE_ASSET_SCHEMA_VERSION,
  PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION,
  WARDROBE_CREATIVE_ASSET_SCHEMA_VERSION,
  RECENT_PROMPT_LIMIT,
  SAVED_CHARACTER_PROMPT_LIMIT,
  SAVED_CHARACTER_VARIANT_LIMIT,
  SAVED_PROMPT_LIMIT,
  type CreativeAssetStore,
  type GuidedChoiceKey,
  type GuidedChoiceValue,
  type GuidedDesignV1,
  type RecentPrompt,
  type ReferenceImageStatus,
  type SanitizeCreativeAssetResult,
  type SavedCharacterPrompt,
  type SavedCharacterVariant,
  type SavedCharacterPromptSource,
  type SavedCharacterVoicePreference,
  type SavedPrompt,
  type SavedPromptSource,
  type VtonInputKind,
} from './types';
import { isRecord, isTimestamp } from '../common/guards';

const stableJson = (value: unknown): string | undefined =>
  JSON.stringify(value, (_key, candidate: unknown) =>
    isRecord(candidate)
      ? Object.fromEntries(
          Object.entries(candidate).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        )
      : candidate,
  );

const validDate = (value: unknown): string | null =>
  isTimestamp(value) ? new Date(value).toISOString() : null;

const normalizedId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const id = normalizeWhitespace(value, 128);
  return containsMeaningfulText(id) ? id : null;
};

const referenceImageAssetId = (value: unknown): string | null =>
  value == null ? null : normalizedId(value);

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

const nullableDate = (value: unknown): string | null =>
  value === null || value === undefined ? null : validDate(value);

const sourceForPrompt = (value: unknown): SavedPromptSource | null =>
  value === 'manual' || value === 'generated' ? value : null;

const sourceForCharacter = (value: unknown): SavedCharacterPromptSource | null =>
  value === 'manual' || value === 'generator' ? value : null;

const savedCharacterVoice = (value: unknown): SavedCharacterVoicePreference | null => {
  if (!isRecord(value) || value.kind !== 'elevenlabs') return null;
  const voiceId = normalizedId(value.voiceId);
  const voiceName =
    typeof value.voiceName === 'string'
      ? normalizeWhitespace(value.voiceName, ASSET_NAME_MAX_LENGTH)
      : '';
  return voiceId && containsMeaningfulText(voiceName)
    ? { kind: 'elevenlabs', voiceId, voiceName }
    : null;
};

const vtonInputKind = (value: unknown): VtonInputKind | null =>
  value === 'prompt' || value === 'saved-outfit' ? value : null;

type SanitizedVtonConfiguration = Readonly<{
  inputKind: VtonInputKind | null;
  enhancePrompt: boolean;
  invalid: boolean;
}>;

const sanitizeVtonConfiguration = (
  value: Record<string, unknown>,
  modelModeId: ModelModeId | null,
  persistedReferenceImageAssetId: string | null,
  includeVtonConfiguration: boolean,
): SanitizedVtonConfiguration => {
  const storedInputKind = includeVtonConfiguration ? vtonInputKind(value.vtonInputKind) : null;
  const invalidInputKind =
    includeVtonConfiguration &&
    (modelModeId === 'lucy-vton-latest'
      ? value.vtonInputKind !== undefined && !storedInputKind
      : value.vtonInputKind !== undefined && value.vtonInputKind !== null);
  const inputKind =
    modelModeId === 'lucy-vton-latest'
      ? includeVtonConfiguration
        ? (storedInputKind ?? (persistedReferenceImageAssetId ? 'saved-outfit' : 'prompt'))
        : persistedReferenceImageAssetId
          ? 'saved-outfit'
          : 'prompt'
      : null;
  const invalidEnhancePrompt =
    includeVtonConfiguration &&
    value.enhancePrompt !== undefined &&
    typeof value.enhancePrompt !== 'boolean';
  return {
    inputKind,
    enhancePrompt:
      inputKind === 'prompt' && includeVtonConfiguration ? value.enhancePrompt === true : false,
    invalid: invalidInputKind || invalidEnhancePrompt,
  };
};

const promptIntent = (value: unknown): PromptIntent | null =>
  PROMPT_INTENTS.some((intent) => intent === value) ? (value as PromptIntent) : null;

const referenceStatus = (value: unknown): ReferenceImageStatus | null => {
  switch (value) {
    case 'prompt-only':
    case 'portrait-required-not-saved':
    case 'session-portrait-not-saved':
    case 'persisted-reference':
      return value;
    default:
      return null;
  }
};

const readTags = (value: unknown): readonly string[] =>
  normalizeTags(
    Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [],
  );

const sanitizeGuidedChoice = (value: unknown): GuidedChoiceValue | null | undefined => {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.optionId !== 'string') return undefined;
  const optionId = normalizeWhitespace(value.optionId, 128);
  if (!containsMeaningfulText(optionId)) return undefined;
  if (optionId !== 'custom') return { optionId };
  if (typeof value.customValue !== 'string') return undefined;
  const customValue = normalizeWhitespace(value.customValue, BUILDER_DETAIL_MAX_LENGTH);
  return containsMeaningfulText(customValue) ? { optionId, customValue } : undefined;
};

/**
 * Canonical allowlist parser for guided-design provenance persisted by every browser store.
 * Missing newly introduced first-class choices are accepted as unselected so older
 * guided designs remain loadable.
 */
export const sanitizeGuidedDesignV1 = (value: unknown): GuidedDesignV1 | null => {
  if (!isRecord(value) || value.catalogVersion !== 1 || !isRecord(value.choices)) return null;
  const starterId = value.starterId == null ? null : normalizedId(value.starterId);
  if (value.starterId != null && !starterId) return null;

  const choices = {} as Record<GuidedChoiceKey, GuidedChoiceValue | null>;
  for (const key of GUIDED_CHOICE_KEYS) {
    const storedChoice = value.choices[key];
    const choice =
      (key === 'ethnicity' || key === 'skinTone') && storedChoice === undefined
        ? null
        : sanitizeGuidedChoice(storedChoice);
    if (choice === undefined) return null;
    choices[key] = choice;
  }
  return { catalogVersion: 1, starterId, choices };
};

const sanitizeSavedPrompt = (
  value: unknown,
  includeReferenceImage: boolean,
  includeVtonConfiguration: boolean,
): SavedPrompt | null => {
  if (!isRecord(value)) return null;
  const id = normalizedId(value.id);
  const title =
    typeof value.title === 'string' ? normalizeWhitespace(value.title, ASSET_NAME_MAX_LENGTH) : '';
  const prompt = typeof value.prompt === 'string' ? normalizeAuthoredPrompt(value.prompt) : '';
  const modelModeId: ModelModeId | null = isModelModeId(value.modelModeId)
    ? value.modelModeId
    : null;
  const source = sourceForPrompt(value.source);
  const createdAt = validDate(value.createdAt);
  const updatedAt = validDate(value.updatedAt);
  const lastUsedAt = nullableDate(value.lastUsedAt);
  const persistedReferenceImageAssetId = includeReferenceImage
    ? referenceImageAssetId(value.referenceImageAssetId)
    : null;
  const vtonConfiguration = sanitizeVtonConfiguration(
    value,
    modelModeId,
    persistedReferenceImageAssetId,
    includeVtonConfiguration,
  );
  const hasPrompt = containsMeaningfulText(prompt);
  const validRecipe =
    modelModeId === 'lucy-vton-latest'
      ? vtonConfiguration.inputKind === 'prompt'
        ? hasPrompt && persistedReferenceImageAssetId === null
        : vtonConfiguration.inputKind === 'saved-outfit' && persistedReferenceImageAssetId !== null
      : hasPrompt &&
        (!includeVtonConfiguration ||
          ((value.vtonInputKind === undefined || value.vtonInputKind === null) &&
            (value.enhancePrompt === undefined || value.enhancePrompt === false)));
  if (
    !id ||
    !containsMeaningfulText(title) ||
    !modelModeId ||
    !validRecipe ||
    vtonConfiguration.invalid ||
    !source ||
    !createdAt ||
    !updatedAt ||
    (value.lastUsedAt != null && !lastUsedAt)
  ) {
    return null;
  }
  return {
    id,
    title,
    prompt,
    modelModeId,
    source,
    referenceImageAssetId: persistedReferenceImageAssetId,
    vtonInputKind: vtonConfiguration.inputKind,
    enhancePrompt: vtonConfiguration.enhancePrompt,
    tags: readTags(value.tags),
    createdAt,
    updatedAt,
    lastUsedAt,
    useCount: count(value.useCount),
  };
};

const sanitizeRecentPrompt = (
  value: unknown,
  includeReferenceImage: boolean,
  includeCharacterIdentity: boolean,
  includeVtonConfiguration: boolean,
  includeWardrobeIdentity: boolean,
): RecentPrompt | null => {
  if (!isRecord(value)) return null;
  const id = normalizedId(value.id);
  const prompt = typeof value.prompt === 'string' ? normalizeAuthoredPrompt(value.prompt) : '';
  const modelModeId: ModelModeId | null = isModelModeId(value.modelModeId)
    ? value.modelModeId
    : null;
  const usedAt = validDate(value.usedAt);
  const savedPromptId =
    value.savedPromptId === undefined ? null : normalizedId(value.savedPromptId);
  const savedCharacterPromptId =
    includeCharacterIdentity && value.savedCharacterPromptId !== undefined
      ? normalizedId(value.savedCharacterPromptId)
      : null;
  const savedCharacterVariantId =
    includeWardrobeIdentity && value.savedCharacterVariantId !== undefined
      ? normalizedId(value.savedCharacterVariantId)
      : null;
  const characterName =
    includeCharacterIdentity && typeof value.characterName === 'string'
      ? normalizeWhitespace(value.characterName, ASSET_NAME_MAX_LENGTH)
      : '';
  const persistedReferenceImageAssetId = includeReferenceImage
    ? referenceImageAssetId(value.referenceImageAssetId)
    : null;
  const hasPrompt = containsMeaningfulText(prompt);
  const vtonConfiguration = sanitizeVtonConfiguration(
    value,
    modelModeId,
    persistedReferenceImageAssetId,
    includeVtonConfiguration,
  );
  const validImageOnlyCharacter =
    !hasPrompt &&
    modelModeId === 'lucy-latest' &&
    persistedReferenceImageAssetId !== null &&
    containsMeaningfulText(characterName);
  const validVtonRecipe =
    modelModeId === 'lucy-vton-latest' &&
    (vtonConfiguration.inputKind === 'prompt'
      ? hasPrompt && persistedReferenceImageAssetId === null
      : vtonConfiguration.inputKind === 'saved-outfit' && persistedReferenceImageAssetId !== null);
  const validNonVtonRecipe =
    modelModeId !== 'lucy-vton-latest' &&
    (hasPrompt || validImageOnlyCharacter) &&
    (!includeVtonConfiguration ||
      ((value.vtonInputKind === undefined || value.vtonInputKind === null) &&
        (value.enhancePrompt === undefined || value.enhancePrompt === false)));
  if (
    !id ||
    !modelModeId ||
    (!validVtonRecipe && !validNonVtonRecipe) ||
    vtonConfiguration.invalid ||
    !usedAt ||
    (value.savedPromptId !== undefined && !savedPromptId) ||
    (includeCharacterIdentity &&
      value.savedCharacterPromptId !== undefined &&
      !savedCharacterPromptId) ||
    (includeWardrobeIdentity &&
      value.savedCharacterVariantId !== undefined &&
      !savedCharacterVariantId)
  ) {
    return null;
  }
  return {
    id,
    prompt,
    modelModeId,
    ...(savedPromptId ? { savedPromptId } : {}),
    ...(savedCharacterPromptId ? { savedCharacterPromptId } : {}),
    ...(savedCharacterVariantId ? { savedCharacterVariantId } : {}),
    ...(containsMeaningfulText(characterName) ? { characterName } : {}),
    referenceImageAssetId: persistedReferenceImageAssetId,
    vtonInputKind: vtonConfiguration.inputKind,
    enhancePrompt: vtonConfiguration.enhancePrompt,
    usedAt,
  };
};

const sanitizeSavedCharacterPrompt = (
  value: unknown,
  includeReferenceImage: boolean,
  includeGuidedDesign: boolean,
  includeReferenceProvenance: boolean,
  includeWardrobeSelection: boolean,
  includeDefaultVoice: boolean,
): SavedCharacterPrompt | null => {
  if (!isRecord(value)) return null;
  const id = normalizedId(value.id);
  const name =
    typeof value.name === 'string' ? normalizeWhitespace(value.name, ASSET_NAME_MAX_LENGTH) : '';
  const prompt = typeof value.prompt === 'string' ? normalizeAuthoredPrompt(value.prompt) : '';
  const source = sourceForCharacter(value.source);
  const intent = value.promptIntent == null ? null : promptIntent(value.promptIntent);
  const status = referenceStatus(value.referenceImageStatus);
  const createdAt = validDate(value.createdAt);
  const updatedAt = validDate(value.updatedAt);
  const lastUsedAt = nullableDate(value.lastUsedAt);
  const builderDraft =
    value.builderDraft == null ? null : sanitizePromptBuilderDraft(value.builderDraft);
  const guidedDesign =
    includeGuidedDesign && value.guidedDesign != null
      ? sanitizeGuidedDesignV1(value.guidedDesign)
      : null;
  const persistedReferenceImageAssetId = includeReferenceImage
    ? referenceImageAssetId(value.referenceImageAssetId)
    : null;
  const uploadedReferenceImageAssetId = includeReferenceProvenance
    ? referenceImageAssetId(value.uploadedReferenceImageAssetId)
    : null;
  const finalReferenceKind = includeReferenceProvenance
    ? value.finalReferenceKind === 'uploaded' || value.finalReferenceKind === 'generated'
      ? value.finalReferenceKind
      : value.finalReferenceKind === null
        ? null
        : value.finalReferenceKind === undefined
          ? persistedReferenceImageAssetId
            ? ('generated' as const)
            : null
          : undefined
    : persistedReferenceImageAssetId
      ? ('generated' as const)
      : null;
  const selectedWardrobeVariantId = includeWardrobeSelection
    ? referenceImageAssetId(value.selectedWardrobeVariantId)
    : null;
  const validReferenceProvenance =
    finalReferenceKind !== undefined &&
    ((finalReferenceKind === null &&
      persistedReferenceImageAssetId === null &&
      uploadedReferenceImageAssetId === null) ||
      (finalReferenceKind === 'generated' && persistedReferenceImageAssetId !== null) ||
      (finalReferenceKind === 'uploaded' &&
        persistedReferenceImageAssetId !== null &&
        uploadedReferenceImageAssetId === persistedReferenceImageAssetId));
  const hasPrompt = containsMeaningfulText(prompt);
  if (
    !id ||
    !containsMeaningfulText(name) ||
    !source ||
    (value.promptIntent != null && !intent) ||
    !status ||
    !createdAt ||
    !updatedAt ||
    (value.lastUsedAt != null && !lastUsedAt) ||
    (value.builderDraft != null && !builderDraft) ||
    (includeGuidedDesign && value.guidedDesign != null && !guidedDesign) ||
    !validReferenceProvenance ||
    (!hasPrompt &&
      (finalReferenceKind !== 'uploaded' || builderDraft !== null || guidedDesign !== null))
  ) {
    return null;
  }
  return {
    id,
    name,
    prompt,
    source,
    promptIntent: intent,
    builderDraft: intent && builderDraft?.intent === intent ? builderDraft : null,
    guidedDesign:
      intent === 'character-transform' && builderDraft?.intent === 'character-transform'
        ? guidedDesign
        : null,
    referenceImageStatus: persistedReferenceImageAssetId
      ? 'persisted-reference'
      : status === 'persisted-reference'
        ? 'prompt-only'
        : status,
    referenceImageAssetId: persistedReferenceImageAssetId,
    uploadedReferenceImageAssetId,
    finalReferenceKind,
    selectedWardrobeVariantId,
    defaultVoice: includeDefaultVoice ? savedCharacterVoice(value.defaultVoice) : null,
    notes:
      typeof value.notes === 'string'
        ? normalizeWhitespace(value.notes, CHARACTER_NOTES_MAX_LENGTH)
        : '',
    tags: readTags(value.tags),
    createdAt,
    updatedAt,
    lastUsedAt,
    useCount: count(value.useCount),
  };
};

const sanitizeSavedCharacterVariant = (value: unknown): SavedCharacterVariant | null => {
  if (!isRecord(value) || !isRecord(value.creation)) return null;
  const id = normalizedId(value.id);
  const parentCharacterId = normalizedId(value.parentCharacterId);
  const title =
    typeof value.title === 'string' ? normalizeWhitespace(value.title, ASSET_NAME_MAX_LENGTH) : '';
  const resultReferenceImageAssetId = referenceImageAssetId(value.referenceImageAssetId);
  const sourceReferenceImageAssetId = referenceImageAssetId(
    value.creation.sourceReferenceImageAssetId,
  );
  const createdAt = validDate(value.createdAt);
  const updatedAt = validDate(value.updatedAt);
  const lastUsedAt = nullableDate(value.lastUsedAt);
  if (
    !id ||
    !parentCharacterId ||
    !containsMeaningfulText(title) ||
    !resultReferenceImageAssetId ||
    !sourceReferenceImageAssetId ||
    !createdAt ||
    !updatedAt ||
    (value.lastUsedAt != null && !lastUsedAt)
  ) {
    return null;
  }
  const common = {
    id,
    parentCharacterId,
    title,
    referenceImageAssetId: resultReferenceImageAssetId,
    createdAt,
    updatedAt,
    lastUsedAt,
    useCount: count(value.useCount),
  } as const;
  if (value.creation.method === 'add-outfit') {
    const garmentReferenceImageAssetId = referenceImageAssetId(
      value.creation.garmentReferenceImageAssetId,
    );
    return garmentReferenceImageAssetId
      ? {
          ...common,
          creation: {
            method: 'add-outfit',
            sourceReferenceImageAssetId,
            garmentReferenceImageAssetId,
          },
        }
      : null;
  }
  if (value.creation.method === 'change-features') {
    const changeInstructions =
      typeof value.creation.changeInstructions === 'string'
        ? normalizeAuthoredPrompt(value.creation.changeInstructions)
        : '';
    return containsMeaningfulText(changeInstructions)
      ? {
          ...common,
          creation: {
            method: 'change-features',
            sourceReferenceImageAssetId,
            changeInstructions,
          },
        }
      : null;
  }
  return null;
};

const uniqueById = <T extends { readonly id: string }>(records: readonly T[]): readonly T[] => {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
};

const sanitizeArray = <T>(
  value: unknown,
  parse: (record: unknown) => T | null,
): { readonly records: readonly T[]; readonly inputCount: number } => {
  if (!Array.isArray(value)) return { records: [], inputCount: value === undefined ? 0 : 1 };
  return {
    records: value.map(parse).filter((record): record is T => record !== null),
    inputCount: value.length,
  };
};

type VersionedUntrustedStore = Record<string, unknown> & { readonly schemaVersion: number };

const migrateRecords = (
  value: unknown,
  migrate: (record: Record<string, unknown>) => Record<string, unknown>,
): unknown => {
  if (!Array.isArray(value)) return value;
  const records: unknown[] = value;
  return records.map((record) => (isRecord(record) ? migrate(record) : record));
};

const migrateV1ToV2 = (store: VersionedUntrustedStore): VersionedUntrustedStore => ({
  ...store,
  schemaVersion: LEGACY_CREATIVE_ASSET_SCHEMA_VERSION,
  savedPrompts: migrateRecords(
    store.savedPrompts,
    ({ referenceImageAssetId: _, ...record }) => record,
  ),
  recentPrompts: migrateRecords(
    store.recentPrompts,
    ({ referenceImageAssetId: _, ...record }) => record,
  ),
  savedCharacterPrompts: migrateRecords(
    store.savedCharacterPrompts,
    ({ referenceImageAssetId: _, ...record }) => record,
  ),
});

const migrateV2ToV3 = (store: VersionedUntrustedStore): VersionedUntrustedStore => ({
  ...store,
  schemaVersion: EARLIER_CREATIVE_ASSET_SCHEMA_VERSION,
  savedCharacterPrompts: migrateRecords(
    store.savedCharacterPrompts,
    ({ guidedDesign: _, ...record }) => record,
  ),
});

const migrateV3ToV4 = (store: VersionedUntrustedStore): VersionedUntrustedStore => ({
  ...store,
  schemaVersion: OLDER_CREATIVE_ASSET_SCHEMA_VERSION,
  recentPrompts: migrateRecords(
    store.recentPrompts,
    ({ savedCharacterPromptId: _, characterName: __, ...record }) => record,
  ),
  savedCharacterPrompts: migrateRecords(
    store.savedCharacterPrompts,
    ({ uploadedReferenceImageAssetId: _, finalReferenceKind: __, ...record }) => record,
  ),
});

const migrateV4ToV5 = (store: VersionedUntrustedStore): VersionedUntrustedStore => ({
  ...store,
  schemaVersion: PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION,
  savedPrompts: migrateRecords(
    store.savedPrompts,
    ({ vtonInputKind: _, enhancePrompt: __, ...record }) => record,
  ),
  recentPrompts: migrateRecords(
    store.recentPrompts,
    ({ vtonInputKind: _, enhancePrompt: __, ...record }) => record,
  ),
});

const migrateV5ToV6 = (store: VersionedUntrustedStore): VersionedUntrustedStore => ({
  ...store,
  schemaVersion: WARDROBE_CREATIVE_ASSET_SCHEMA_VERSION,
  recentPrompts: migrateRecords(
    store.recentPrompts,
    ({ savedCharacterVariantId: _, ...record }) => record,
  ),
  savedCharacterPrompts: migrateRecords(
    store.savedCharacterPrompts,
    ({ selectedWardrobeVariantId: _, ...record }) => record,
  ),
  savedCharacterVariants: [],
});

const migrateV6ToV7 = (store: VersionedUntrustedStore): VersionedUntrustedStore => ({
  ...store,
  schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
  savedCharacterPrompts: migrateRecords(
    store.savedCharacterPrompts,
    ({ defaultVoice: _, ...record }) => ({ ...record, defaultVoice: null }),
  ),
});

const migrateCreativeAssetStore = (value: unknown): VersionedUntrustedStore | null => {
  if (!isRecord(value) || typeof value.schemaVersion !== 'number') return null;
  const store = value as VersionedUntrustedStore;
  switch (store.schemaVersion) {
    case ORIGINAL_CREATIVE_ASSET_SCHEMA_VERSION:
      return migrateV6ToV7(
        migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(store))))),
      );
    case LEGACY_CREATIVE_ASSET_SCHEMA_VERSION:
      return migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(store)))));
    case EARLIER_CREATIVE_ASSET_SCHEMA_VERSION:
      return migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(migrateV3ToV4(store))));
    case OLDER_CREATIVE_ASSET_SCHEMA_VERSION:
      return migrateV6ToV7(migrateV5ToV6(migrateV4ToV5(store)));
    case PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION:
      return migrateV6ToV7(migrateV5ToV6(store));
    case WARDROBE_CREATIVE_ASSET_SCHEMA_VERSION:
      return migrateV6ToV7(store);
    case CREATIVE_ASSET_SCHEMA_VERSION:
      return store;
    default:
      return null;
  }
};

export const sanitizeCreativeAssetStore = (value: unknown): SanitizeCreativeAssetResult => {
  const originalSchemaVersion = isRecord(value) ? value.schemaVersion : undefined;
  const migrated = migrateCreativeAssetStore(value);
  if (migrated === null) {
    return { store: createEmptyCreativeAssetStore(), recovered: true, droppedRecords: 0 };
  }

  const savedInput = sanitizeArray(migrated.savedPrompts, (record) =>
    sanitizeSavedPrompt(record, true, true),
  );
  const recentInput = sanitizeArray(migrated.recentPrompts, (record) =>
    sanitizeRecentPrompt(record, true, true, true, true),
  );
  const characterInput = sanitizeArray(migrated.savedCharacterPrompts, (record) =>
    sanitizeSavedCharacterPrompt(record, true, true, true, true, true),
  );
  const variantInput = sanitizeArray(migrated.savedCharacterVariants, (record) =>
    sanitizeSavedCharacterVariant(record),
  );

  const savedPrompts = uniqueById(
    [...savedInput.records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  ).slice(0, SAVED_PROMPT_LIMIT);
  const savedById = new Map(savedPrompts.map((saved) => [saved.id, saved]));
  const parsedCharacters = uniqueById(
    [...characterInput.records].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
  ).slice(0, SAVED_CHARACTER_PROMPT_LIMIT);
  const parsedCharactersById = new Map(parsedCharacters.map((saved) => [saved.id, saved]));
  const savedCharacterVariants = uniqueById(
    [...variantInput.records]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .filter((variant) => parsedCharactersById.has(variant.parentCharacterId)),
  ).slice(0, SAVED_CHARACTER_VARIANT_LIMIT);
  const variantsById = new Map(savedCharacterVariants.map((variant) => [variant.id, variant]));
  const savedCharacterPrompts = parsedCharacters.map((character) => {
    const selected = character.selectedWardrobeVariantId
      ? variantsById.get(character.selectedWardrobeVariantId)
      : undefined;
    return selected?.parentCharacterId === character.id
      ? character
      : { ...character, selectedWardrobeVariantId: null };
  });
  const charactersById = new Map(savedCharacterPrompts.map((saved) => [saved.id, saved]));

  const recentKeys = new Set<string>();
  const recentPrompts = [...recentInput.records]
    .sort((left, right) => right.usedAt.localeCompare(left.usedAt))
    .filter((recent) => {
      const key = `${recent.modelModeId}\u0000${canonicalPrompt(recent.prompt)}\u0000${recent.referenceImageAssetId ?? ''}\u0000${recent.vtonInputKind ?? ''}\u0000${recent.enhancePrompt ? '1' : '0'}\u0000${recent.savedCharacterPromptId ?? recent.characterName ?? ''}\u0000${recent.savedCharacterVariantId ?? ''}`;
      if (recentKeys.has(key)) return false;
      recentKeys.add(key);
      return true;
    })
    .slice(0, RECENT_PROMPT_LIMIT)
    .map((recent): RecentPrompt => {
      if (recent.savedCharacterPromptId) {
        const character = charactersById.get(recent.savedCharacterPromptId);
        const variant = recent.savedCharacterVariantId
          ? variantsById.get(recent.savedCharacterVariantId)
          : undefined;
        const expectedReferenceImageAssetId = variant
          ? variant.referenceImageAssetId
          : character?.referenceImageAssetId;
        if (
          character &&
          (!recent.savedCharacterVariantId || variant?.parentCharacterId === character.id) &&
          recent.modelModeId === 'lucy-latest' &&
          canonicalPrompt(character.prompt) === canonicalPrompt(recent.prompt) &&
          expectedReferenceImageAssetId === recent.referenceImageAssetId
        ) {
          return { ...recent, characterName: character.name };
        }
        return {
          id: recent.id,
          prompt: recent.prompt,
          modelModeId: recent.modelModeId,
          referenceImageAssetId: recent.referenceImageAssetId,
          vtonInputKind: recent.vtonInputKind,
          enhancePrompt: recent.enhancePrompt,
          ...(recent.characterName ? { characterName: recent.characterName } : {}),
          usedAt: recent.usedAt,
        };
      }
      if (!recent.savedPromptId) return recent;
      const saved = savedById.get(recent.savedPromptId);
      if (
        saved?.modelModeId === recent.modelModeId &&
        canonicalPrompt(saved.prompt) === canonicalPrompt(recent.prompt) &&
        saved.referenceImageAssetId === recent.referenceImageAssetId &&
        saved.vtonInputKind === recent.vtonInputKind &&
        saved.enhancePrompt === recent.enhancePrompt
      ) {
        return recent;
      }
      return {
        id: recent.id,
        prompt: recent.prompt,
        modelModeId: recent.modelModeId,
        referenceImageAssetId: recent.referenceImageAssetId,
        vtonInputKind: recent.vtonInputKind,
        enhancePrompt: recent.enhancePrompt,
        ...(recent.characterName ? { characterName: recent.characterName } : {}),
        usedAt: recent.usedAt,
      };
    });

  const keptCount =
    savedPrompts.length +
    recentPrompts.length +
    savedCharacterPrompts.length +
    savedCharacterVariants.length;
  const inputCount =
    savedInput.inputCount +
    recentInput.inputCount +
    characterInput.inputCount +
    variantInput.inputCount;
  const droppedRecords = Math.max(0, inputCount - keptCount);
  const store: CreativeAssetStore = {
    schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
    savedPrompts,
    recentPrompts,
    savedCharacterPrompts,
    savedCharacterVariants,
  };
  let inputMatchesSanitizedStore = false;
  try {
    inputMatchesSanitizedStore = stableJson(migrated) === stableJson(store);
  } catch {
    // Untrusted in-memory input can be cyclic or otherwise non-serializable. It must be rewritten.
  }
  return {
    store,
    recovered:
      originalSchemaVersion !== CREATIVE_ASSET_SCHEMA_VERSION ||
      droppedRecords > 0 ||
      !inputMatchesSanitizedStore,
    droppedRecords,
  };
};

export const parseCreativeAssetStore = (serialized: string | null): SanitizeCreativeAssetResult => {
  if (serialized === null) {
    return { store: createEmptyCreativeAssetStore(), recovered: false, droppedRecords: 0 };
  }
  try {
    return sanitizeCreativeAssetStore(JSON.parse(serialized) as unknown);
  } catch {
    return { store: createEmptyCreativeAssetStore(), recovered: true, droppedRecords: 0 };
  }
};
