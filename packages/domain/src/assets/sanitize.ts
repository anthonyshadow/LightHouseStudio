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
  GUIDED_CHOICE_KEYS,
  LEGACY_CREATIVE_ASSET_SCHEMA_VERSION,
  PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION,
  RECENT_PROMPT_LIMIT,
  SAVED_CHARACTER_PROMPT_LIMIT,
  SAVED_PROMPT_LIMIT,
  type CreativeAssetStore,
  type GuidedChoiceKey,
  type GuidedChoiceValue,
  type GuidedDesignV1,
  type RecentPrompt,
  type ReferenceImageStatus,
  type SanitizeCreativeAssetResult,
  type SavedCharacterPrompt,
  type SavedCharacterPromptSource,
  type SavedPrompt,
  type SavedPromptSource,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
};

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
  if (value == null) return null;
  if (!isRecord(value) || typeof value.optionId !== 'string') return undefined;
  const optionId = normalizeWhitespace(value.optionId, 128);
  if (!containsMeaningfulText(optionId)) return undefined;
  if (optionId !== 'custom') return { optionId };
  if (typeof value.customValue !== 'string') return undefined;
  const customValue = normalizeWhitespace(value.customValue, BUILDER_DETAIL_MAX_LENGTH);
  return containsMeaningfulText(customValue) ? { optionId, customValue } : undefined;
};

const sanitizeGuidedDesign = (value: unknown): GuidedDesignV1 | null => {
  if (!isRecord(value) || value.catalogVersion !== 1 || !isRecord(value.choices)) return null;
  const starterId = value.starterId == null ? null : normalizedId(value.starterId);
  if (value.starterId != null && !starterId) return null;

  const choices = {} as Record<GuidedChoiceKey, GuidedChoiceValue | null>;
  for (const key of GUIDED_CHOICE_KEYS) {
    const storedChoice = value.choices[key];
    const choice =
      key === 'skinTone' && storedChoice === undefined ? null : sanitizeGuidedChoice(storedChoice);
    if (choice === undefined) return null;
    choices[key] = choice;
  }
  return { catalogVersion: 1, starterId, choices };
};

const sanitizeSavedPrompt = (
  value: unknown,
  includeReferenceImage: boolean,
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
  if (
    !id ||
    !containsMeaningfulText(title) ||
    !containsMeaningfulText(prompt) ||
    !modelModeId ||
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
    referenceImageAssetId: includeReferenceImage
      ? referenceImageAssetId(value.referenceImageAssetId)
      : null,
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
  if (
    !id ||
    !containsMeaningfulText(prompt) ||
    !modelModeId ||
    !usedAt ||
    (value.savedPromptId !== undefined && !savedPromptId)
  ) {
    return null;
  }
  return {
    id,
    prompt,
    modelModeId,
    ...(savedPromptId ? { savedPromptId } : {}),
    referenceImageAssetId: includeReferenceImage
      ? referenceImageAssetId(value.referenceImageAssetId)
      : null,
    usedAt,
  };
};

const sanitizeSavedCharacterPrompt = (
  value: unknown,
  includeReferenceImage: boolean,
  includeGuidedDesign: boolean,
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
      ? sanitizeGuidedDesign(value.guidedDesign)
      : null;
  const persistedReferenceImageAssetId = includeReferenceImage
    ? referenceImageAssetId(value.referenceImageAssetId)
    : null;
  if (
    !id ||
    !containsMeaningfulText(name) ||
    !containsMeaningfulText(prompt) ||
    !source ||
    (value.promptIntent != null && !intent) ||
    !status ||
    !createdAt ||
    !updatedAt ||
    (value.lastUsedAt != null && !lastUsedAt) ||
    (value.builderDraft != null && !builderDraft) ||
    (includeGuidedDesign && value.guidedDesign != null && !guidedDesign)
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

export const sanitizeCreativeAssetStore = (value: unknown): SanitizeCreativeAssetResult => {
  if (
    !isRecord(value) ||
    (value.schemaVersion !== CREATIVE_ASSET_SCHEMA_VERSION &&
      value.schemaVersion !== PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION &&
      value.schemaVersion !== LEGACY_CREATIVE_ASSET_SCHEMA_VERSION)
  ) {
    return { store: createEmptyCreativeAssetStore(), recovered: true, droppedRecords: 0 };
  }

  const includeReferenceImages = value.schemaVersion !== LEGACY_CREATIVE_ASSET_SCHEMA_VERSION;
  const includeGuidedDesign = value.schemaVersion === CREATIVE_ASSET_SCHEMA_VERSION;
  const savedInput = sanitizeArray(value.savedPrompts, (record) =>
    sanitizeSavedPrompt(record, includeReferenceImages),
  );
  const recentInput = sanitizeArray(value.recentPrompts, (record) =>
    sanitizeRecentPrompt(record, includeReferenceImages),
  );
  const characterInput = sanitizeArray(value.savedCharacterPrompts, (record) =>
    sanitizeSavedCharacterPrompt(record, includeReferenceImages, includeGuidedDesign),
  );

  const savedPrompts = uniqueById(
    [...savedInput.records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  ).slice(0, SAVED_PROMPT_LIMIT);
  const savedById = new Map(savedPrompts.map((saved) => [saved.id, saved]));

  const recentKeys = new Set<string>();
  const recentPrompts = [...recentInput.records]
    .sort((left, right) => right.usedAt.localeCompare(left.usedAt))
    .filter((recent) => {
      const key = `${recent.modelModeId}\u0000${canonicalPrompt(recent.prompt)}\u0000${recent.referenceImageAssetId ?? ''}`;
      if (recentKeys.has(key)) return false;
      recentKeys.add(key);
      return true;
    })
    .slice(0, RECENT_PROMPT_LIMIT)
    .map((recent): RecentPrompt => {
      if (!recent.savedPromptId) return recent;
      const saved = savedById.get(recent.savedPromptId);
      if (
        saved?.modelModeId === recent.modelModeId &&
        canonicalPrompt(saved.prompt) === canonicalPrompt(recent.prompt) &&
        saved.referenceImageAssetId === recent.referenceImageAssetId
      ) {
        return recent;
      }
      return {
        id: recent.id,
        prompt: recent.prompt,
        modelModeId: recent.modelModeId,
        referenceImageAssetId: recent.referenceImageAssetId,
        usedAt: recent.usedAt,
      };
    });

  const savedCharacterPrompts = uniqueById(
    [...characterInput.records].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
  ).slice(0, SAVED_CHARACTER_PROMPT_LIMIT);

  const keptCount = savedPrompts.length + recentPrompts.length + savedCharacterPrompts.length;
  const inputCount = savedInput.inputCount + recentInput.inputCount + characterInput.inputCount;
  const droppedRecords = Math.max(0, inputCount - keptCount);
  const store: CreativeAssetStore = {
    schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
    savedPrompts,
    recentPrompts,
    savedCharacterPrompts,
  };
  let inputMatchesSanitizedStore = false;
  try {
    inputMatchesSanitizedStore = JSON.stringify(value) === JSON.stringify(store);
  } catch {
    // Untrusted in-memory input can be cyclic or otherwise non-serializable. It must be rewritten.
  }
  return {
    store,
    recovered:
      value.schemaVersion !== CREATIVE_ASSET_SCHEMA_VERSION ||
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
