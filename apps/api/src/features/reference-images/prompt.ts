import { createHash } from 'node:crypto';
import {
  optimizeCharacterReferencePromptRequestSchema,
  REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH,
  type OptimizeCharacterReferencePromptRequest,
} from '@studio/contracts';
import { characterReferencePromptHashInput } from '@studio/domain';

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

export const REFERENCE_IMAGE_EDIT_PROMPT_TEMPLATE_VERSION = 'character-reference-edit-v5' as const;
export const REFERENCE_IMAGE_COMPOSITION_PROMPT_TEMPLATE_VERSION =
  'character-reference-compose-v2' as const;

/**
 * Builds the provider-only edit instruction. Callers persist the optimized character
 * direction and a hash of the user's requested change, never this combined text.
 */
export const createReferenceImageEditPrompt = (
  optimizedCharacterPrompt: string | null,
  changeInstructions: string,
  allowDrasticChanges = false,
): string => {
  const requestedChange = `Edit the person in the supplied image. Apply every requested change:\n${changeInstructions}`;
  const direction =
    optimizedCharacterPrompt && !allowDrasticChanges
      ? '\n\nCharacter context for unchanged identity and style details only; ignore anything here that conflicts with a requested change:\n'
      : '';
  const requirements = allowDrasticChanges
    ? '\n\nThe final image must visibly satisfy every requested change. The requested changes are authoritative and may replace the person or character identity, face, body traits, age, appearance, pose, outfit, framing, lighting, background, and visual style. Treat the supplied image only as optional composition guidance where it does not conflict. Do not preserve recognizable identity unless the request asks for it, and do not return an unchanged or near-unchanged image.'
    : '\n\nThe final image must visibly satisfy every requested change. Use the strength and extent stated; when none is stated, make each change strong, obvious, and realistic. Requested changes override the source image and character context. Keep the same recognizable character and preserve pose, outfit, framing, lighting, background, and visual style only where they do not conflict. Do not return an unchanged or near-unchanged image, skip a requested change, or introduce unrelated changes.';
  const availablePromptLength = Math.max(
    0,
    REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH -
      requestedChange.length -
      direction.length -
      requirements.length,
  );
  const characterContext = direction
    ? (optimizedCharacterPrompt?.slice(0, availablePromptLength) ?? '')
    : '';
  return `${requestedChange}${direction}${characterContext}${requirements}`;
};

/** Builds the provider-only first composition instruction for a user-uploaded source image. */
export const createReferenceImageCompositionPrompt = (optimizedCharacterPrompt: string): string => {
  const prefix =
    'Create a polished, provider-neutral character identity reference from the supplied source image. Preserve the recognizable person or character identity, face, body traits, and useful source-image details. Apply the following character direction to role, outfit, styling, expression, framing, and lighting. Use the required neutral reference background instead of the source environment. Explicit identity changes in the direction are authoritative.\n\nCharacter direction:\n';
  return `${prefix}${optimizedCharacterPrompt.slice(
    0,
    Math.max(0, REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH - prefix.length),
  )}`;
};
