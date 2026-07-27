import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type {
  CharacterPromptOptimizationResult,
  OptimizeCharacterReferencePromptRequest,
} from '@studio/contracts';
import type { CharacterPromptOptimizer } from '../../providers/openai/character-prompt-optimizer.js';
import { CharacterPromptOptimizerError } from '../../providers/openai/character-prompt-optimizer.js';
import type { ReferenceImageProvider } from '../../providers/openai/reference-image-provider.js';
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
    let providerSignal: AbortSignal | undefined;
    const optimize = vi.fn(
      (_input: OptimizeCharacterReferencePromptRequest, signal: AbortSignal) =>
        new Promise<CharacterPromptOptimizationResult>((resolve) => {
          providerSignal = signal;
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

    const firstController = new AbortController();
    const duplicateController = new AbortController();
    const first = service.optimize(input, firstController.signal);
    const duplicate = service.optimize(input, duplicateController.signal);
    await vi.waitFor(() => expect(optimize).toHaveBeenCalledTimes(1));
    firstController.abort();

    await expect(first).rejects.toMatchObject({ reason: 'aborted' });
    expect(providerSignal?.aborted).toBe(false);
    finish?.(result);

    await expect(duplicate).resolves.toMatchObject({
      result,
      model: 'gpt-5.6',
      version: 'lucy-character-reference-v1',
    });
    expect((await duplicate).inputHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('aborts the optimizer operation when its final subscriber disconnects', async () => {
    let providerSignal: AbortSignal | undefined;
    const promptOptimizer: CharacterPromptOptimizer = {
      model: 'gpt-5.6',
      version: 'lucy-character-reference-v1',
      optimize: (_input, signal) =>
        new Promise<CharacterPromptOptimizationResult>((_resolve, reject) => {
          providerSignal = signal;
          signal.addEventListener(
            'abort',
            () => reject(new CharacterPromptOptimizerError('aborted')),
            { once: true },
          );
        }),
    };
    const service = new ReferenceImageService(null, unusedStore, {
      optimizer: promptOptimizer,
    });
    const caller = new AbortController();
    const pending = service.optimize(input, caller.signal);
    await vi.waitFor(() => expect(providerSignal).toBeInstanceOf(AbortSignal));

    caller.abort();

    await expect(pending).rejects.toMatchObject({ reason: 'aborted' });
    expect(providerSignal?.aborted).toBe(true);
  });

  it('starts fresh optimizer work instead of joining an abandoned operation', async () => {
    let finishAbandoned: ((value: CharacterPromptOptimizationResult) => void) | undefined;
    const optimize = vi
      .fn<CharacterPromptOptimizer['optimize']>()
      .mockImplementationOnce(
        () =>
          new Promise<CharacterPromptOptimizationResult>((resolve) => {
            finishAbandoned = resolve;
          }),
      )
      .mockResolvedValueOnce(result);
    const service = new ReferenceImageService(null, unusedStore, {
      optimizer: {
        model: 'gpt-5.6',
        version: 'lucy-character-reference-v1',
        optimize,
      },
    });
    const first = new AbortController();
    const abandoned = service.optimize(input, first.signal);
    await vi.waitFor(() => expect(optimize).toHaveBeenCalledOnce());
    first.abort();
    await expect(abandoned).rejects.toMatchObject({ reason: 'aborted' });

    await expect(service.optimize(input, new AbortController().signal)).resolves.toMatchObject({
      result,
    });
    expect(optimize).toHaveBeenCalledTimes(2);
    finishAbandoned?.(result);
  });

  it('does not let a late image waiter join abandoned owner work', async () => {
    let providerSignal: AbortSignal | undefined;
    const generate = vi.fn<ReferenceImageProvider['generate']>(
      (providerInput) =>
        new Promise(() => {
          providerSignal = providerInput.signal;
        }),
    );
    const service = new ReferenceImageService({ generate }, unusedStore);
    const caller = new AbortController();
    const generationInput = {
      localOwnerId: 'a'.repeat(64),
      requestId: '85c85adf-bb1b-4664-bfef-5e955e67af62',
      rawPrompt: 'A patient cartographer.',
      options: input.options,
      optimization: { enabled: false as const },
      signal: caller.signal,
    };
    const abandoned = service.generate(generationInput);
    await vi.waitFor(() => expect(providerSignal).toBeInstanceOf(AbortSignal));
    caller.abort();
    await expect(abandoned).rejects.toMatchObject({ reason: 'aborted' });

    await expect(
      service.generate({
        ...generationInput,
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ reason: 'generation-in-progress' });
    expect(generate).toHaveBeenCalledOnce();
  });

  it('normalizes model-selected settings to validated app-owned options', async () => {
    const promptOptimizer: CharacterPromptOptimizer = {
      model: 'gpt-5-nano',
      version: 'lucy-character-reference-v1',
      optimize: () =>
        Promise.resolve({
          ...result,
          recommendedSettings: {
            framing: 'head_and_shoulders',
            orientation: 'portrait',
            size: '1024x1536',
            quality: 'medium',
            format: 'webp',
          },
        }),
    };
    const service = new ReferenceImageService(null, unusedStore, {
      optimizer: promptOptimizer,
    });

    await expect(
      service.optimize({
        ...input,
        options: {
          ...input.options,
          framing: 'full_body',
          orientation: 'auto',
        },
      }),
    ).resolves.toMatchObject({
      model: 'gpt-5-nano',
      result: {
        optimizedImagePrompt: result.optimizedImagePrompt,
        recommendedSettings: {
          framing: 'full_body',
          orientation: 'landscape',
          size: '1536x1024',
          quality: 'high',
          format: 'webp',
        },
      },
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

  it('runs provider artifact cleanup only after the local persistence attempt settles', async () => {
    const generatedBytes = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: '#49637a' },
    })
      .jpeg()
      .toBuffer();
    const cleanupRemoteArtifacts = vi.fn().mockResolvedValue(undefined);
    let rejectStore: ((error: Error) => void) | undefined;
    const store = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectStore = reject;
        }),
    );
    const service = new ReferenceImageService(
      {
        descriptor: {
          providerId: 'wiro',
          modelId: 'seedream-v5-lite-uncensored',
          adapterVersion: 'wiro-seedream-v5-lite-v1',
          effectiveSettings: {
            owner: 'ByteDance',
            resolution: '2k',
            maxImages: 1,
            watermark: false,
          },
        },
        generate: () =>
          Promise.resolve({
            bytes: generatedBytes,
            mimeType: 'image/jpeg',
            providerId: 'wiro',
            modelId: 'seedream-v5-lite-uncensored',
            providerRequestId: 'task-one',
            cleanupRemoteArtifacts,
          }),
      },
      { ...unusedStore, store },
    );

    const pending = service.generate({
      localOwnerId: 'a'.repeat(64),
      requestId: '59014ddf-261a-4a80-b84b-53c65a21a285',
      rawPrompt: 'A patient cartographer.',
      options: input.options,
      optimization: { enabled: false },
    });
    await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());
    expect(cleanupRemoteArtifacts).not.toHaveBeenCalled();

    rejectStore?.(new Error('local store failed'));

    await expect(pending).rejects.toThrow('local store failed');
    expect(cleanupRemoteArtifacts).toHaveBeenCalledOnce();
  });
});
