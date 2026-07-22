import { characterReferencePromptHashInput } from '@studio/domain';

export const isSameCanonicalWorkshopPrompt = (left: string, right: string): boolean =>
  characterReferencePromptHashInput(left) === characterReferencePromptHashInput(right);
