import type { EphemeralImageDescriptor } from '../session/image';

export const PROMPT_INTENTS = [
  'character-transform',
  'add-object',
  'replace-object',
  'change-attribute',
] as const;
export type PromptIntent = (typeof PROMPT_INTENTS)[number];

export const ADULT_AGE_CHOICES = [
  'adult',
  'young-adult',
  'middle-aged-adult',
  'older-adult',
] as const;
export type AdultAgeChoice = (typeof ADULT_AGE_CHOICES)[number];

export const CHARACTER_GENDER_CHOICES = ['woman', 'man', 'non-binary'] as const;
export type CharacterGenderChoice = (typeof CHARACTER_GENDER_CHOICES)[number];

interface PromptBuilderBase {
  readonly intent: PromptIntent;
  readonly presetId: string | null;
  readonly customDetails: string;
}

export interface CharacterTransformDraft extends PromptBuilderBase {
  readonly intent: 'character-transform';
  readonly adultAge: AdultAgeChoice | null;
  readonly gender: CharacterGenderChoice | null;
  readonly characterBase: string;
  readonly matchReference: boolean;
  readonly appearance: string;
  readonly skinTone: string;
  readonly bodyShape: string;
  readonly hair: string;
  readonly hairColor: string;
  readonly outfit: string;
  readonly accessories: string;
  readonly expression: string;
  readonly mood: string;
  readonly preserve: string;
}

export interface AddObjectDraft extends PromptBuilderBase {
  readonly intent: 'add-object';
  readonly objectDescription: string;
  readonly placement: string;
}

export interface ReplaceObjectDraft extends PromptBuilderBase {
  readonly intent: 'replace-object';
  readonly target: string;
  readonly replacementDescription: string;
}

export interface ChangeAttributeDraft extends PromptBuilderBase {
  readonly intent: 'change-attribute';
  readonly target: string;
  readonly attribute: string;
  readonly newValue: string;
}

export type PromptBuilderDraft =
  CharacterTransformDraft | AddObjectDraft | ReplaceObjectDraft | ChangeAttributeDraft;

export type PromptBlockingCode =
  | 'character-detail-required'
  | 'custom-details-too-long'
  | 'minor-description-not-allowed'
  | 'new-value-required'
  | 'object-description-required'
  | 'placement-required'
  | 'replacement-description-required'
  | 'target-required';

export type PromptWarningCode =
  | 'background-edit'
  | 'contradictory-traits'
  | 'generic-description'
  | 'low-reference-resolution'
  | 'multiple-goals'
  | 'reference-image-missing'
  | 'weak-reference-aspect';

export interface PromptIssue<TCode extends string> {
  readonly code: TCode;
  readonly message: string;
  readonly field?: string;
}

export interface PromptValidation {
  readonly valid: boolean;
  readonly blockingIssues: readonly PromptIssue<PromptBlockingCode>[];
  readonly warnings: readonly PromptIssue<PromptWarningCode>[];
}

export interface PromptValidationContext {
  readonly hasReferenceImage: boolean;
  readonly image?: Pick<EphemeralImageDescriptor, 'width' | 'height'>;
}

export interface StructuredPromptResult {
  readonly prompt: string;
  readonly validation: PromptValidation;
}
