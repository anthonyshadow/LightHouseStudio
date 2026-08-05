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

  it('builds a bounded edit prompt that prioritizes visible requested changes', () => {
    const prompt = createReferenceImageEditPrompt(
      'A blue fox wearing a red scarf.',
      'Change only the scarf to green.',
    );

    expect(prompt).toMatch(/^Edit the person in the supplied image/u);
    expect(prompt).toContain('A blue fox wearing a red scarf.');
    expect(prompt).toContain('Change only the scarf to green.');
    expect(prompt).toContain('The final image must visibly satisfy every requested change.');
    expect(prompt).toContain('make each change strong, obvious, and realistic');
    expect(prompt).toContain('Requested changes override the source image and character context.');
    expect(prompt).toContain('Do not return an unchanged or near-unchanged image');
    expect(prompt.indexOf('Change only the scarf to green.')).toBeLessThan(
      prompt.indexOf('A blue fox wearing a red scarf.'),
    );
    expect(prompt.length).toBeLessThanOrEqual(32_000);
    expect(createReferenceImageEditPrompt('x'.repeat(32_000), 'Change the scarf.').length).toBe(
      32_000,
    );
  });

  it('keeps image-only edits focused on the requested change without character-direction text', () => {
    const prompt = createReferenceImageEditPrompt(null, 'Make the character visibly older.');

    expect(prompt).toContain('Make the character visibly older.');
    expect(prompt).not.toContain('Character context for unchanged identity');
    expect(prompt).toContain('Keep the same recognizable character');
  });
});
