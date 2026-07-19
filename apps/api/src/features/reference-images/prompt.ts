import { createHash } from 'node:crypto';
import {
  optimizeCharacterReferencePromptRequestSchema,
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
