import { createHash } from 'node:crypto';
import {
  optimizeCharacterReferencePromptRequestSchema,
  REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH,
  type OptimizeCharacterReferencePromptRequest,
} from '@studio/contracts';
import {
  buildCharacterReferenceImagePrompt,
  characterReferencePromptHashInput,
  type CharacterReferencePromptFraming,
} from '@studio/domain';

/** Deterministically wraps, but never mutates, the authored Lucy prompt. */
export const createReferenceImagePrompt = (
  workshopPrompt: string,
  framing: CharacterReferencePromptFraming = 'full_body',
): string => buildCharacterReferenceImagePrompt(workshopPrompt, framing);

/** Hashes the same canonical identity used by the local Recipe Shelf. */
export const createWorkshopPromptHash = (workshopPrompt: string): string =>
  createHash('sha256')
    .update(characterReferencePromptHashInput(workshopPrompt), 'utf8')
    .digest('hex');

export const createPromptOptimizationInputHash = (
  input: OptimizeCharacterReferencePromptRequest,
  optimizerVersion: string,
): string => {
  const validated = optimizeCharacterReferencePromptRequestSchema.parse(input);
  return createHash('sha256')
    .update(
      JSON.stringify({
        rawPrompt: validated.rawPrompt,
        options: validated.options,
        generator: validated.generator ?? null,
        optimizerVersion,
      }),
      'utf8',
    )
    .digest('hex');
};

export const REFERENCE_IMAGE_EDIT_PROMPT_TEMPLATE_VERSION =
  'lucy-character-reference-edit-v1' as const;
export const REFERENCE_IMAGE_COMPOSITION_PROMPT_TEMPLATE_VERSION =
  'lucy-character-reference-compose-v1' as const;

/**
 * Builds the provider-only edit instruction. Callers persist the optimized character
 * direction and a hash of the user's requested change, never this combined text.
 */
export const createReferenceImageEditPrompt = (
  optimizedCharacterPrompt: string,
  changeInstructions: string,
): string => {
  const prefix =
    'Edit the supplied character reference image while preserving the same character identity, face, anatomy, visual medium, framing, lighting, and background unless the requested change explicitly requires otherwise.\n\nUse this current character direction as authoritative:\n';
  const suffix = `\n\nRequested change:\n${changeInstructions}`;
  const availablePromptLength = Math.max(
    0,
    REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH - prefix.length - suffix.length,
  );
  return `${prefix}${optimizedCharacterPrompt.slice(0, availablePromptLength)}${suffix}`;
};

/** Builds the provider-only first composition instruction for a user-uploaded source image. */
export const createReferenceImageCompositionPrompt = (optimizedCharacterPrompt: string): string => {
  const prefix =
    'Create a polished Lucy 2.5 character reference from the supplied source image. Preserve the recognizable person or character identity, face, body traits, and useful source-image details. Apply the following character direction to role, outfit, styling, expression, framing, lighting, and background. Explicit identity changes in the direction are authoritative.\n\nCharacter direction:\n';
  return `${prefix}${optimizedCharacterPrompt.slice(
    0,
    Math.max(0, REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH - prefix.length),
  )}`;
};

export interface ReferenceImagePromptVersion {
  readonly originalPrompt: string;
  readonly derivedPrompt: string;
  readonly promptHash: string;
}

export const versionReferenceImagePrompt = (
  workshopPrompt: string,
  framing: CharacterReferencePromptFraming = 'full_body',
): ReferenceImagePromptVersion => ({
  originalPrompt: workshopPrompt,
  derivedPrompt: createReferenceImagePrompt(workshopPrompt, framing),
  promptHash: createWorkshopPromptHash(workshopPrompt),
});
