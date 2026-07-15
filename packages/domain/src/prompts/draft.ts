import { BUILDER_DETAIL_MAX_LENGTH, normalizeWhitespace } from '../common/text';
import {
  ADULT_AGE_CHOICES,
  CHARACTER_GENDER_CHOICES,
  PROMPT_INTENTS,
  type AddObjectDraft,
  type AdultAgeChoice,
  type ChangeAttributeDraft,
  type CharacterTransformDraft,
  type CharacterGenderChoice,
  type PromptBuilderDraft,
  type PromptIntent,
  type ReplaceObjectDraft,
} from './types';

const normalizeField = (value: string): string =>
  normalizeWhitespace(value, BUILDER_DETAIL_MAX_LENGTH);
const normalizePreset = (value: string | null): string | null =>
  value ? normalizeWhitespace(value, 80) || null : null;

export function createPromptBuilderDraft(intent: 'character-transform'): CharacterTransformDraft;
export function createPromptBuilderDraft(intent: 'add-object'): AddObjectDraft;
export function createPromptBuilderDraft(intent: 'replace-object'): ReplaceObjectDraft;
export function createPromptBuilderDraft(intent: 'change-attribute'): ChangeAttributeDraft;
export function createPromptBuilderDraft(intent: PromptIntent): PromptBuilderDraft;
export function createPromptBuilderDraft(intent: PromptIntent): PromptBuilderDraft {
  const common = { intent, presetId: null, customDetails: '' } as const;
  switch (intent) {
    case 'character-transform':
      return {
        ...common,
        intent,
        adultAge: null,
        gender: null,
        characterBase: '',
        matchReference: false,
        appearance: '',
        hair: '',
        outfit: '',
        accessories: '',
        expression: '',
        mood: '',
        preserve: '',
      };
    case 'add-object':
      return { ...common, intent, objectDescription: '', placement: '' };
    case 'replace-object':
      return { ...common, intent, target: '', replacementDescription: '' };
    case 'change-attribute':
      return { ...common, intent, target: '', attribute: '', newValue: '' };
  }
}

export const normalizePromptBuilderDraft = (draft: PromptBuilderDraft): PromptBuilderDraft => {
  const common = {
    intent: draft.intent,
    presetId: normalizePreset(draft.presetId),
    customDetails: normalizeField(draft.customDetails),
  } as const;

  switch (draft.intent) {
    case 'character-transform':
      return {
        ...common,
        intent: draft.intent,
        adultAge: draft.adultAge,
        gender: draft.gender,
        characterBase: normalizeField(draft.characterBase),
        matchReference: draft.matchReference,
        appearance: normalizeField(draft.appearance),
        hair: normalizeField(draft.hair),
        outfit: normalizeField(draft.outfit),
        accessories: normalizeField(draft.accessories),
        expression: normalizeField(draft.expression),
        mood: normalizeField(draft.mood),
        preserve: normalizeField(draft.preserve),
      };
    case 'add-object':
      return {
        ...common,
        intent: draft.intent,
        objectDescription: normalizeField(draft.objectDescription),
        placement: normalizeField(draft.placement),
      };
    case 'replace-object':
      return {
        ...common,
        intent: draft.intent,
        target: normalizeField(draft.target),
        replacementDescription: normalizeField(draft.replacementDescription),
      };
    case 'change-attribute':
      return {
        ...common,
        intent: draft.intent,
        target: normalizeField(draft.target),
        attribute: normalizeField(draft.attribute),
        newValue: normalizeField(draft.newValue),
      };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const stringField = (record: Record<string, unknown>, key: string): string =>
  typeof record[key] === 'string' ? record[key] : '';
const nullableStringField = (record: Record<string, unknown>, key: string): string | null =>
  typeof record[key] === 'string' ? record[key] : null;
const isIntent = (value: unknown): value is PromptIntent =>
  PROMPT_INTENTS.some((intent) => intent === value);
const isAdultAge = (value: unknown): value is AdultAgeChoice =>
  ADULT_AGE_CHOICES.some((age) => age === value);
const isCharacterGender = (value: unknown): value is CharacterGenderChoice =>
  CHARACTER_GENDER_CHOICES.some((gender) => gender === value);

/** Allowlist-only parser for structured drafts loaded from untrusted browser storage. */
export const sanitizePromptBuilderDraft = (value: unknown): PromptBuilderDraft | null => {
  if (!isRecord(value) || !isIntent(value.intent)) return null;
  const common = {
    presetId: nullableStringField(value, 'presetId'),
    customDetails: stringField(value, 'customDetails'),
  };

  let draft: PromptBuilderDraft;
  switch (value.intent) {
    case 'character-transform':
      draft = {
        ...common,
        intent: value.intent,
        adultAge: isAdultAge(value.adultAge) ? value.adultAge : null,
        gender: isCharacterGender(value.gender) ? value.gender : null,
        characterBase: stringField(value, 'characterBase'),
        matchReference: value.matchReference === true,
        appearance: stringField(value, 'appearance'),
        hair: stringField(value, 'hair'),
        outfit: stringField(value, 'outfit'),
        accessories: stringField(value, 'accessories'),
        expression: stringField(value, 'expression'),
        mood: stringField(value, 'mood'),
        preserve: stringField(value, 'preserve'),
      };
      break;
    case 'add-object':
      draft = {
        ...common,
        intent: value.intent,
        objectDescription: stringField(value, 'objectDescription'),
        placement: stringField(value, 'placement'),
      };
      break;
    case 'replace-object':
      draft = {
        ...common,
        intent: value.intent,
        target: stringField(value, 'target'),
        replacementDescription: stringField(value, 'replacementDescription'),
      };
      break;
    case 'change-attribute':
      draft = {
        ...common,
        intent: value.intent,
        target: stringField(value, 'target'),
        attribute: stringField(value, 'attribute'),
        newValue: stringField(value, 'newValue'),
      };
      break;
  }

  return normalizePromptBuilderDraft(draft);
};
