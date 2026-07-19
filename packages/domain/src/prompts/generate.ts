import { normalizeWhitespace } from '../common/text';
import { normalizePromptBuilderDraft } from './draft';
import type {
  AdultAgeChoice,
  CharacterGenderChoice,
  CharacterTransformDraft,
  PromptBuilderDraft,
  PromptValidationContext,
  StructuredPromptResult,
} from './types';
import { validatePromptBuilderDraft } from './validation';

const ageLabels: Readonly<Record<AdultAgeChoice, string>> = {
  adult: 'adult',
  'young-adult': 'young adult',
  'middle-aged-adult': 'middle-aged adult',
  'older-adult': 'older adult',
};

const genderLabels: Readonly<Record<CharacterGenderChoice, string>> = {
  woman: 'woman',
  man: 'man',
  'non-binary': 'non-binary person',
};

const sentence = (value: string): string => {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';
  return /[.!?]$/u.test(normalized) ? normalized : `${normalized}.`;
};

const generateCharacterTransform = (draft: CharacterTransformDraft): string => {
  const parts: string[] = [];
  const base = [
    draft.adultAge ? ageLabels[draft.adultAge] : draft.gender ? 'adult' : '',
    draft.gender ? genderLabels[draft.gender] : '',
    draft.characterBase,
  ]
    .filter(Boolean)
    .join(' ');

  if (base) parts.push(sentence(`Substitute the character in the video with ${base}`));
  if (draft.matchReference) parts.push('Match the provided portrait reference.');
  if (draft.appearance) parts.push(sentence(`Appearance: ${draft.appearance}`));
  if (draft.hair) parts.push(sentence(`Hair: ${draft.hair}`));
  if (draft.outfit) parts.push(sentence(`Outfit: ${draft.outfit}`));
  if (draft.accessories) parts.push(sentence(`Accessories: ${draft.accessories}`));
  if (draft.expression) parts.push(sentence(`Expression: ${draft.expression}`));
  if (draft.mood) parts.push(sentence(`Mood: ${draft.mood}`));
  if (draft.preserve) parts.push(sentence(`Preserve: ${draft.preserve}`));
  if (draft.customDetails) parts.push(sentence(draft.customDetails));
  return parts.join(' ');
};

const renderPrompt = (draft: PromptBuilderDraft): string => {
  switch (draft.intent) {
    case 'character-transform':
      return generateCharacterTransform(draft);
    case 'add-object':
      return [
        sentence(`Add ${draft.objectDescription}`),
        sentence(`Placement: ${draft.placement}`),
        sentence(draft.customDetails),
      ]
        .filter(Boolean)
        .join(' ');
    case 'replace-object':
      return [
        sentence(`Replace the visible ${draft.target} with ${draft.replacementDescription}`),
        sentence(draft.customDetails),
      ]
        .filter(Boolean)
        .join(' ');
    case 'change-attribute':
      return [
        sentence(`Change the ${draft.target}'s ${draft.attribute} to ${draft.newValue}`),
        sentence(draft.customDetails),
      ]
        .filter(Boolean)
        .join(' ');
  }
};

export const generateStructuredPrompt = (
  draft: PromptBuilderDraft,
  context: PromptValidationContext = { hasReferenceImage: false },
): StructuredPromptResult => {
  const validation = validatePromptBuilderDraft(draft, context);
  if (!validation.valid) return { prompt: '', validation };
  return {
    prompt: normalizeWhitespace(renderPrompt(normalizePromptBuilderDraft(draft))),
    validation,
  };
};
