import { describe, expect, it } from 'vitest';
import {
  createReferenceImagePrompt,
  createWorkshopPromptHash,
  versionReferenceImagePrompt,
} from './prompt.js';

describe('reference image prompt versioning', () => {
  it('wraps the unchanged Lucy prompt in the single-character reference composition', () => {
    const original =
      'Substitute the character in the video with a blue-furred fox.\nKeep the scarf.';
    const result = versionReferenceImagePrompt(original);

    expect(result.originalPrompt).toBe(original);
    expect(result.derivedPrompt).toBe(createReferenceImagePrompt(original));
    expect(result.derivedPrompt).toContain('Exactly one character with one clearly visible face');
    expect(result.derivedPrompt).toContain('Front-facing, centered, and viewed at eye level');
    expect(result.derivedPrompt.endsWith(original)).toBe(true);
  });

  it('produces a stable SHA-256 marker from the canonical workshop prompt', () => {
    const first = createWorkshopPromptHash('  A BLUE fox\nwith a scarf  ');
    const second = createWorkshopPromptHash('a blue   FOX with a scarf');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(createWorkshopPromptHash('a red fox with a scarf')).not.toBe(first);
  });
});
