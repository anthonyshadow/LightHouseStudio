import {
  BUILDER_DETAIL_MAX_LENGTH,
  createPromptBuilderDraft as createDomainPromptBuilderDraft,
  generateStructuredPrompt as generateDomainStructuredPrompt,
  normalizePromptBuilderDraft as normalizeDomainPromptBuilderDraft,
  validatePromptBuilderDraft as validateDomainPromptBuilderDraft,
  type AdultAgeChoice,
  type CharacterTransformDraft as DomainCharacterTransformDraft,
  type CharacterGenderChoice,
  type PromptBuilderDraft as DomainPromptBuilderDraft,
  type PromptIntent as DomainPromptIntent,
  type PromptValidation as DomainPromptValidation,
  type PromptValidationContext,
} from '@studio/domain';

export const PROMPT_DETAIL_LIMIT = BUILDER_DETAIL_MAX_LENGTH;

export type PromptIntent = DomainPromptIntent;
export type AdultAge = AdultAgeChoice;
export type CharacterGender = CharacterGenderChoice;
export type PromptBuilderDraft = DomainPromptBuilderDraft;
export type CharacterTransformDraft = DomainCharacterTransformDraft;

export interface PromptIssue {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

/** Presentation shape kept stable while the pure rules live in @studio/domain. */
export interface PromptValidation {
  readonly valid: boolean;
  readonly blocking: readonly PromptIssue[];
  readonly warnings: readonly PromptIssue[];
}

export interface ReferenceImageContext {
  readonly hasReferenceImage: boolean;
  readonly width?: number;
  readonly height?: number;
}

const toDomainContext = (context: ReferenceImageContext): PromptValidationContext => ({
  hasReferenceImage: context.hasReferenceImage,
  ...(typeof context.width === 'number' || typeof context.height === 'number'
    ? {
        image: {
          ...(typeof context.width === 'number' ? { width: context.width } : {}),
          ...(typeof context.height === 'number' ? { height: context.height } : {}),
        },
      }
    : {}),
});

const toPresentationValidation = (validation: DomainPromptValidation): PromptValidation => ({
  valid: validation.valid,
  blocking: validation.blockingIssues,
  warnings: validation.warnings,
});

export const createPromptBuilderDraft = (intent: PromptIntent): PromptBuilderDraft =>
  createDomainPromptBuilderDraft(intent);

export const normalizePromptBuilderDraft = (draft: PromptBuilderDraft): PromptBuilderDraft =>
  normalizeDomainPromptBuilderDraft(draft);

export const validatePromptBuilderDraft = (
  draft: PromptBuilderDraft,
  context: ReferenceImageContext = { hasReferenceImage: false },
): PromptValidation =>
  toPresentationValidation(validateDomainPromptBuilderDraft(draft, toDomainContext(context)));

export const generateStructuredPrompt = (
  draft: PromptBuilderDraft,
  context: ReferenceImageContext = { hasReferenceImage: false },
): string => generateDomainStructuredPrompt(draft, toDomainContext(context)).prompt;
