import { characterReferencePromptHashInput } from '@studio/domain';

export const hashWorkshopPrompt = async (prompt: string): Promise<string> => {
  const bytes = new TextEncoder().encode(characterReferencePromptHashInput(prompt));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const isSameCanonicalWorkshopPrompt = (left: string, right: string): boolean =>
  characterReferencePromptHashInput(left) === characterReferencePromptHashInput(right);
