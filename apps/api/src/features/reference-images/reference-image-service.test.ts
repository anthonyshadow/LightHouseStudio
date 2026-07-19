import { describe, expect, it, vi } from 'vitest';
import type {
  CharacterPromptOptimizationResult,
  OptimizeCharacterReferencePromptRequest,
} from '@studio/contracts';
import type { CharacterPromptOptimizer } from '../../providers/openai/character-prompt-optimizer.js';
import type { ReferenceImageAssetStore } from './asset-store.js';
import { ReferenceImageService } from './reference-image-service.js';

const input: OptimizeCharacterReferencePromptRequest = {
  rawPrompt: 'A silver-haired cartographer with a blue coat.',
  options: {
    framing: 'head_and_shoulders',
    orientation: 'square',
    renderingMode: 'photorealistic',
    expression: 'neutral',
    background: 'neutral_gray',
    targetUse: 'lucy_2_5_character_reference',
  },
};

const result: CharacterPromptOptimizationResult = {
  optimizedImagePrompt: 'Canonical cartographer reference.',
  lucy25CharacterPrompt:
    'Replace the character in the video with the silver-haired cartographer in a blue coat. Preserve motion naturally.',
  normalizedCharacterDescription: 'A silver-haired cartographer wearing a blue coat.',
  preservedCharacterFacts: ['silver hair', 'blue coat'],
  technicalDefaultsAdded: ['soft lighting'],
  warnings: [],
  recommendedSettings: {
    framing: 'head_and_shoulders',
    orientation: 'square',
    size: '1024x1024',
    quality: 'high',
    format: 'jpeg',
  },
};

const unusedStore: ReferenceImageAssetStore = {
  findByRequestId: () => Promise.resolve(null),
  getMetadata: () => Promise.resolve(null),
  getContent: () => Promise.resolve(null),
  store: () => Promise.reject(new Error('not used')),
};

describe('ReferenceImageService prompt optimization', () => {
  it('coalesces duplicate in-flight optimizer calls and returns a versioned fingerprint', async () => {
    let finish: ((value: CharacterPromptOptimizationResult) => void) | undefined;
    const optimize = vi.fn(
      () =>
        new Promise<CharacterPromptOptimizationResult>((resolve) => {
          finish = resolve;
        }),
    );
    const promptOptimizer: CharacterPromptOptimizer = {
      model: 'gpt-5.6',
      version: 'lucy-character-reference-v1',
      optimize,
    };
    const service = new ReferenceImageService(null, unusedStore, {
      optimizer: promptOptimizer,
    });

    const first = service.optimize(input);
    const duplicate = service.optimize(input);
    expect(optimize).toHaveBeenCalledTimes(1);
    finish?.(result);

    await expect(first).resolves.toMatchObject({
      result,
      model: 'gpt-5.6',
      version: 'lucy-character-reference-v1',
    });
    await expect(duplicate).resolves.toEqual(await first);
    expect((await first).inputHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects optimizer settings that contradict validated framing or orientation', async () => {
    const promptOptimizer: CharacterPromptOptimizer = {
      model: 'gpt-5.6',
      version: 'lucy-character-reference-v1',
      optimize: () =>
        Promise.resolve({
          ...result,
          recommendedSettings: {
            framing: 'full_body',
            orientation: 'portrait',
            size: '1024x1536',
            quality: 'high',
            format: 'jpeg',
          },
        }),
    };
    const service = new ReferenceImageService(null, unusedStore, {
      optimizer: promptOptimizer,
    });

    await expect(service.optimize(input)).rejects.toMatchObject({
      name: 'CharacterPromptOptimizerError',
      reason: 'invalid-response',
    });
  });

  it('normalizes the recommended quality to the configured image-provider quality', async () => {
    const promptOptimizer: CharacterPromptOptimizer = {
      model: 'gpt-5.6',
      version: 'lucy-character-reference-v1',
      optimize: () => Promise.resolve(result),
    };
    const service = new ReferenceImageService(null, unusedStore, {
      optimizer: promptOptimizer,
      imageQuality: 'medium',
    });

    await expect(service.optimize(input)).resolves.toMatchObject({
      result: { recommendedSettings: { quality: 'medium' } },
    });
  });
});
