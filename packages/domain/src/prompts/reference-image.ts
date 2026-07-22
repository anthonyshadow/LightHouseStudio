import { canonicalPrompt } from '../common/text';

/**
 * Version of the composition instructions supplied to the image provider. The
 * workshop prompt remains a separate value and is never overwritten by this
 * derived prompt.
 */
export const CHARACTER_REFERENCE_PROMPT_TEMPLATE_VERSION =
  'lucy-2.5-character-reference-v2' as const;

export const CHARACTER_REFERENCE_PROMPT_FRAMINGS = [
  'head_and_shoulders',
  'waist_up',
  'full_body',
] as const;

export type CharacterReferencePromptFraming = (typeof CHARACTER_REFERENCE_PROMPT_FRAMINGS)[number];

const compositionInstructions = `Create one production-ready character reference image optimized for Decart Lucy 2.5 realtime character transformation.

Interpret the character description below as the desired visual identity and appearance. Ignore operational video-editing language such as “substitute the character”, “transform the person”, or references to a source video. Render the character itself, not an illustration of the editing operation.

Composition and reference requirements:
- Exactly one character with one clearly visible face
- Front-facing, centered, and viewed at eye level
- Full-body framing by default whenever the character's anatomy and explicit design permit it
- If the product already has an explicit full-body character mode, match that framing instead
- Neutral or mildly expressive face with a relaxed mouth
- Even, soft, clear lighting without harsh facial shadows
- Plain, neutral, uncluttered background
- Strong separation between the character and background
- Face, eyes, hairline, ears, clothing neckline, and distinctive identity features clearly visible
- Natural and internally consistent facial anatomy
- Coherent clothing, hair, fur, accessories, and materials
- Preserve the requested visual medium, such as photorealistic, anime, illustration, clay, or creature design
- No objects, hands, masks, hair, props, or accessories obscuring important facial features
- The frame contains no additional characters, faces, typography, logos, watermarks, borders, split screens, collages, or multi-view character sheets

Prioritize a readable identity that can remain recognizable during facial expressions, head movement, and realtime motion.`;

const framingInstructions: Record<CharacterReferencePromptFraming, string> = {
  head_and_shoulders:
    'Use a deliberate head-and-shoulders crop showing the full head, neck, shoulders, and enough upper torso to identify the outfit. Do not crop hair, ears, horns, headwear, or other defining head features.',
  waist_up:
    'Use a deliberate waist-up crop showing the entire head, torso, arms, and hands when the anatomy has them. Keep clothing construction and major accessories visible.',
  full_body:
    'Show the complete character from the top of the head to the bottom of the feet whenever the anatomy has them. Include both hands and both feet, preserve the full silhouette and all major features, and leave safe margin around the character.',
};

/** Returns the provider prompt while preserving the authored Lucy prompt separately. */
export const buildCharacterReferenceImagePrompt = (
  workshopPrompt: string,
  framing: CharacterReferencePromptFraming = 'full_body',
): string =>
  `${compositionInstructions}\n\nSelected framing:\n${framingInstructions[framing]}\n\nCharacter description from the Prompt Workshop:\n${workshopPrompt}`;

/** Canonical, deterministic input used by the server to calculate the SHA-256 marker. */
export const characterReferencePromptHashInput = (workshopPrompt: string): string =>
  canonicalPrompt(workshopPrompt);
