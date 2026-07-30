import { canonicalPrompt } from '../common/text';

export const CHARACTER_REFERENCE_PROMPT_FRAMINGS = [
  'head_and_shoulders',
  'waist_up',
  'full_body',
] as const;

/** Canonical, deterministic input used by the server to calculate the SHA-256 marker. */
export const characterReferencePromptHashInput = (workshopPrompt: string): string =>
  canonicalPrompt(workshopPrompt);
