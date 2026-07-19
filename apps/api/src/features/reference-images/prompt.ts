import { createHash } from 'node:crypto';
import {
  buildCharacterReferenceImagePrompt,
  characterReferencePromptHashInput,
} from '@studio/domain';

/** Deterministically wraps, but never mutates, the authored Lucy prompt. */
export const createReferenceImagePrompt = (workshopPrompt: string): string =>
  buildCharacterReferenceImagePrompt(workshopPrompt);

/** Hashes the same canonical identity used by the local Recipe Shelf. */
export const createWorkshopPromptHash = (workshopPrompt: string): string =>
  createHash('sha256')
    .update(characterReferencePromptHashInput(workshopPrompt), 'utf8')
    .digest('hex');

export interface ReferenceImagePromptVersion {
  readonly originalPrompt: string;
  readonly derivedPrompt: string;
  readonly promptHash: string;
}

export const versionReferenceImagePrompt = (
  workshopPrompt: string,
): ReferenceImagePromptVersion => ({
  originalPrompt: workshopPrompt,
  derivedPrompt: createReferenceImagePrompt(workshopPrompt),
  promptHash: createWorkshopPromptHash(workshopPrompt),
});
