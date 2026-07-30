import { describe, expect, it } from 'vitest';
import {
  createReferenceImageEditPrompt,
  createPromptOptimizationInputHash,
  createWorkshopPromptHash,
} from './prompt.js';

describe('reference image prompt inputs', () => {
  it('produces a stable SHA-256 marker from the canonical workshop prompt', () => {
    const first = createWorkshopPromptHash('  A BLUE fox\nwith a scarf  ');
    const second = createWorkshopPromptHash('a blue   FOX with a scarf');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(createWorkshopPromptHash('a red fox with a scarf')).not.toBe(first);
  });

  it('fingerprints the validated raw prompt, options, generator, and optimizer version', () => {
    const input = {
      rawPrompt: '  A blue fox  ',
      options: {
        framing: 'head_and_shoulders' as const,
        orientation: 'square' as const,
        renderingMode: 'photorealistic' as const,
        expression: 'neutral' as const,
        background: 'neutral_gray' as const,
        targetUse: 'lucy_2_5_character_reference' as const,
      },
    };
    const first = createPromptOptimizationInputHash(input, 'optimizer-v1');
    expect(first).toBe(
      createPromptOptimizationInputHash({ ...input, rawPrompt: 'A blue fox' }, 'optimizer-v1'),
    );
    expect(first).not.toBe(
      createPromptOptimizationInputHash(
        { ...input, options: { ...input.options, framing: 'full_body' } },
        'optimizer-v1',
      ),
    );
    expect(first).not.toBe(createPromptOptimizationInputHash(input, 'optimizer-v2'));
  });

  it('builds a bounded edit prompt that preserves identity unless explicitly changed', () => {
    const prompt = createReferenceImageEditPrompt(
      'A blue fox wearing a red scarf.',
      'Change only the scarf to green.',
    );

    expect(prompt).toContain('preserving the same character identity');
    expect(prompt).toContain('A blue fox wearing a red scarf.');
    expect(prompt).toContain('Change only the scarf to green.');
    expect(prompt.length).toBeLessThanOrEqual(32_000);
    expect(createReferenceImageEditPrompt('x'.repeat(32_000), 'Change the scarf.').length).toBe(
      32_000,
    );
  });
});
