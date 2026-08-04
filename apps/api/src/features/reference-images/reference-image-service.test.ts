import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type {
  CharacterPromptOptimizationResult,
  OptimizeCharacterReferencePromptRequest,
} from '@studio/contracts';
import type { CharacterPromptOptimizer } from '../../providers/openai/character-prompt-optimizer.js';
import { CharacterPromptOptimizerError } from '../../providers/openai/character-prompt-optimizer.js';
import type { ReferenceImageProvider } from '../../providers/openai/reference-image-provider.js';
import { type ReferenceImageAssetStore, type StoreReferenceImageInput } from './asset-store.js';
import { createStoredReferenceImageMetadata } from './asset-layout.js';
import { createPromptOptimizationInputHash } from './prompt.js';
import { hashReferenceImageEditInstructions } from './reference-image-preparation.js';
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

const localOwnerId = 'a'.repeat(64);
const sourceAssetId = '9d21643d-501e-4b36-9fd0-e8a56d969949';
const sourceRequestId = '2a8439ab-d290-424e-95c7-6a8e3c43bca3';
const generationRequestId = '59014ddf-261a-4a80-b84b-53c65a21a285';
const editRequestId = '7e1ce882-2325-4a68-b45e-41b4609b3eaa';
const compositionRequestId = '03fc33e5-cb79-41af-9921-70b83d53385d';
const optimizerVersion = 'lucy-character-reference-v1';

const optimizedRequest = {
  rawPrompt: input.rawPrompt,
  options: input.options,
  optimization: {
    enabled: true as const,
    result,
    model: 'gpt-5.6',
    version: optimizerVersion,
    inputHash: createPromptOptimizationInputHash(input, optimizerVersion),
    manuallyEdited: false,
  },
};

const configuredOptimizer: CharacterPromptOptimizer = {
  model: 'gpt-5.6',
  version: optimizerVersion,
  optimize: () => Promise.resolve(result),
};

const sourceBytes = Buffer.from('owner-scoped source bytes');
const sourceMetadata = createStoredReferenceImageMetadata(
  {
    localOwnerId,
    bytes: sourceBytes,
    mimeType: 'image/png',
    source: 'uploaded',
    width: 32,
    height: 32,
    requestId: sourceRequestId,
    requestFingerprint: 'b'.repeat(64),
  },
  sourceAssetId,
  '2026-07-27T12:00:00.000Z',
);

const createGeneratedBytes = (): Promise<Buffer> =>
  sharp({
    create: { width: 1024, height: 1024, channels: 3, background: '#49637a' },
  })
    .jpeg()
    .toBuffer();

const createStore = (
  storeImplementation: ReferenceImageAssetStore['store'],
): ReferenceImageAssetStore => ({
  findByRequestId: () => Promise.resolve(null),
  getMetadata: () => Promise.resolve(null),
  getContent: (ownerId, assetId) =>
    Promise.resolve(
      ownerId === localOwnerId && assetId === sourceAssetId
        ? { metadata: sourceMetadata, bytes: sourceBytes }
        : null,
    ),
  store: storeImplementation,
});

const createProvider = (
  generatedBytes: Buffer,
  cleanupRemoteArtifacts?: () => Promise<void>,
): ReferenceImageProvider => {
  const providerResult = {
    bytes: generatedBytes,
    mimeType: 'image/jpeg' as const,
    providerId: 'bfl' as const,
    modelId: 'flux-2-pro',
    providerRequestId: 'provider-task-one',
    safeUsage: { cost: 0.05, inputMegapixels: 0, outputMegapixels: 1 },
    ...(cleanupRemoteArtifacts === undefined ? {} : { cleanupRemoteArtifacts }),
  };
  return {
    descriptor: {
      providerId: 'bfl',
      modelId: 'flux-2-pro',
      adapterVersion: 'bfl-flux-2-pro-v1',
      effectiveSettings: {
        safetyTolerance: 4,
        disablePromptUpsampling: true,
      },
    },
    generate: vi.fn(() => Promise.resolve(providerResult)),
    edit: vi.fn(() => Promise.resolve(providerResult)),
  };
};

const runProviderOperation = (
  service: ReferenceImageService,
  operation: 'generate' | 'edit' | 'compose',
) => {
  if (operation === 'generate') {
    return service.generate({
      localOwnerId,
      requestId: generationRequestId,
      ...optimizedRequest,
    });
  }
  if (operation === 'edit') {
    return service.edit({
      localOwnerId,
      sourceAssetId,
      requestId: editRequestId,
      changeInstructions: 'Change only the coat to green.',
      ...optimizedRequest,
    });
  }
  return service.compose({
    localOwnerId,
    sourceAssetId,
    requestId: compositionRequestId,
    ...optimizedRequest,
  });
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

  it.each(['generate', 'edit', 'compose'] as const)(
    'runs provider artifact cleanup only after the %s persistence attempt settles',
    async (operation) => {
      const generatedBytes = await createGeneratedBytes();
      const cleanupRemoteArtifacts = vi.fn().mockResolvedValue(undefined);
      let rejectStore: ((error: Error) => void) | undefined;
      const store = vi.fn<ReferenceImageAssetStore['store']>(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectStore = reject;
          }),
      );
      const service = new ReferenceImageService(
        createProvider(generatedBytes, cleanupRemoteArtifacts),
        createStore(store),
        { optimizer: configuredOptimizer },
      );

      const pending = runProviderOperation(service, operation);
      await vi.waitFor(() => expect(store).toHaveBeenCalledOnce());
      expect(cleanupRemoteArtifacts).not.toHaveBeenCalled();

      rejectStore?.(new Error('local store failed'));

      await expect(pending).rejects.toThrow('local store failed');
      expect(cleanupRemoteArtifacts).toHaveBeenCalledOnce();
    },
  );
});

describe('ReferenceImageService provider-result finalization parity', () => {
  it('uses only the selected image and requested changes for an image-only edit', async () => {
    const generatedBytes = await createGeneratedBytes();
    const provider = createProvider(generatedBytes);
    const editProvider = provider.edit;
    if (!editProvider) throw new Error('Expected the fake edit provider.');
    const editMock = vi.mocked(editProvider);
    const store = vi.fn<ReferenceImageAssetStore['store']>((storedInput) =>
      Promise.resolve(
        createStoredReferenceImageMetadata(
          storedInput,
          '1bd46fbc-3e57-46a3-96b4-b4281f5f39da',
          '2026-07-27T12:00:00.000Z',
        ),
      ),
    );
    const service = new ReferenceImageService(provider, createStore(store), {
      optimizer: configuredOptimizer,
    });

    await service.edit({
      localOwnerId,
      sourceAssetId,
      requestId: editRequestId,
      sourcePromptMode: 'image-only',
      changeInstructions: 'Add a warm expression.',
      options: input.options,
      optimization: { enabled: false },
    });

    const providerPrompt = editMock.mock.calls[0]?.[0].prompt;
    expect(providerPrompt).toContain('Add a warm expression.');
    expect(providerPrompt).not.toContain(input.rawPrompt);
    expect(providerPrompt).not.toContain('current character direction');
  });

  it('persists identical validated provider audit fields with operation-specific lineage', async () => {
    const generatedBytes = await createGeneratedBytes();
    const storedInputs: StoreReferenceImageInput[] = [];
    const assetIds = [
      '1bd46fbc-3e57-46a3-96b4-b4281f5f39da',
      '7962e549-c527-4d2a-bff5-acbcf16007eb',
      '1dd9265b-17ed-409d-b5ba-c1715b4a8815',
    ] as const;
    const store = vi.fn<ReferenceImageAssetStore['store']>((storedInput) => {
      storedInputs.push(storedInput);
      const assetId = assetIds[storedInputs.length - 1];
      if (assetId === undefined) throw new Error('Missing test asset ID.');
      return Promise.resolve(
        createStoredReferenceImageMetadata(storedInput, assetId, '2026-07-27T12:00:00.000Z'),
      );
    });
    const provider = createProvider(generatedBytes);
    const service = new ReferenceImageService(provider, createStore(store), {
      optimizer: configuredOptimizer,
    });

    const generated = await runProviderOperation(service, 'generate');
    const edited = await runProviderOperation(service, 'edit');
    const composed = await runProviderOperation(service, 'compose');

    expect(provider.generate).toHaveBeenCalledOnce();
    expect(provider.edit).toHaveBeenCalledTimes(2);
    expect(storedInputs).toHaveLength(3);
    expect(storedInputs.map((storedInput) => storedInput.bytes)).toEqual([
      generatedBytes,
      generatedBytes,
      generatedBytes,
    ]);

    const expectedDerivations = [
      { kind: 'generate' },
      {
        kind: 'edit',
        sourceAssetId,
        changeInstructionsHash: hashReferenceImageEditInstructions(
          'Change only the coat to green.',
        ),
      },
      { kind: 'compose', sourceAssetId },
    ] as const;
    const expectedRequestIds = [generationRequestId, editRequestId, compositionRequestId] as const;

    storedInputs.forEach((storedInput, index) => {
      expect(storedInput).toMatchObject({
        localOwnerId,
        mimeType: 'image/jpeg',
        size: '1024x1024',
        width: 1024,
        height: 1024,
        provider: 'bfl',
        model: 'flux-2-pro',
        quality: 'high',
        originalPrompt: input.rawPrompt,
        derivedPrompt: result.optimizedImagePrompt,
        promptAudit: {
          optimizationEnabled: true,
          result,
          options: input.options,
          requestedGenerator: null,
          optimizer: { model: 'gpt-5.6', version: optimizerVersion },
          inputHash: optimizedRequest.optimization.inputHash,
          manuallyEdited: false,
        },
        requestId: expectedRequestIds[index],
        requestFingerprintVersion: 2,
        derivation: expectedDerivations[index],
        providerRequestId: 'provider-task-one',
        providerSettings: {
          safetyTolerance: 4,
          disablePromptUpsampling: true,
        },
        providerUsage: {
          cost: 0.05,
          inputMegapixels: 0,
          outputMegapixels: 1,
        },
      });
      if (storedInput.source === 'uploaded' || storedInput.source === 'derived') {
        throw new TypeError('Expected generated reference-image metadata.');
      }
      expect(storedInput.promptHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(storedInput.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    });
    expect(new Set(storedInputs.map(({ requestFingerprint }) => requestFingerprint)).size).toBe(3);
    expect([generated.derivation, edited.derivation, composed.derivation]).toEqual([
      { kind: 'generate' },
      { kind: 'edit', sourceAssetId },
      { kind: 'compose', sourceAssetId },
    ]);
  });

  it.each(['generate', 'edit', 'compose'] as const)(
    'rejects invalid %s bytes before persistence and still performs provider cleanup',
    async (operation) => {
      const cleanupRemoteArtifacts = vi.fn().mockResolvedValue(undefined);
      const store = vi.fn<ReferenceImageAssetStore['store']>();
      const service = new ReferenceImageService(
        createProvider(Buffer.from('not an image'), cleanupRemoteArtifacts),
        createStore(store),
        { optimizer: configuredOptimizer },
      );

      await expect(runProviderOperation(service, operation)).rejects.toThrow(
        'The provider returned an undecodable image.',
      );
      expect(store).not.toHaveBeenCalled();
      expect(cleanupRemoteArtifacts).toHaveBeenCalledOnce();
    },
  );
});
