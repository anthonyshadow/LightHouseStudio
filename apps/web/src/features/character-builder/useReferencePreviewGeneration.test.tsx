// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  CharacterReferenceOptions,
  ComposeReferenceImageRequest,
  CreateReferenceImageRequest,
  EditReferenceImageRequest,
  GeneratedReferenceImageAsset,
  OptimizeCharacterReferencePromptRequest,
  OptimizeCharacterReferencePromptResponse,
  ReferenceImageAsset,
} from '@studio/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useReferencePreviewGeneration,
  type ReferencePreviewGenerationCallbacks,
} from './useReferencePreviewGeneration';
import {
  createReferencePromptOptimizationKey,
  createReferencePreviewSourceKey,
} from './characterReferenceIdentity';

const createReferenceImage = vi.hoisted(() =>
  vi.fn<
    (request: CreateReferenceImageRequest, signal?: AbortSignal) => Promise<ReferenceImageAsset>
  >(),
);
const editReferenceImage = vi.hoisted(() =>
  vi.fn<
    (
      sourceAssetId: string,
      request: EditReferenceImageRequest,
      signal?: AbortSignal,
    ) => Promise<ReferenceImageAsset>
  >(),
);
const composeReferenceImage = vi.hoisted(() =>
  vi.fn<
    (
      sourceAssetId: string,
      request: ComposeReferenceImageRequest,
      signal?: AbortSignal,
    ) => Promise<ReferenceImageAsset>
  >(),
);
const optimizeCharacterReferencePrompt = vi.hoisted(() =>
  vi.fn<
    (
      request: OptimizeCharacterReferencePromptRequest,
      signal: AbortSignal,
    ) => Promise<OptimizeCharacterReferencePromptResponse>
  >(),
);

vi.mock('../../adapters/api-client/apiClient', () => ({
  composeReferenceImage,
  createReferenceImage,
  editReferenceImage,
  optimizeCharacterReferencePrompt,
}));

const rawPrompt = 'Replace the subject with an adult lunar cartographer.';
const options: CharacterReferenceOptions = {
  framing: 'head_and_shoulders',
  orientation: 'auto',
  renderingMode: 'photorealistic',
  expression: 'neutral',
  background: 'neutral_gray',
  targetUse: 'lucy_2_5_character_reference',
};

const optimization: OptimizeCharacterReferencePromptResponse = {
  result: {
    optimizedImagePrompt:
      'A canonical head-and-shoulders reference photograph of an adult lunar cartographer.',
    lucy25CharacterPrompt: 'Replace the character in the video with an adult lunar cartographer.',
    normalizedCharacterDescription: 'An adult lunar cartographer.',
    preservedCharacterFacts: ['adult', 'lunar cartographer'],
    technicalDefaultsAdded: ['neutral gray background'],
    warnings: [],
    recommendedSettings: {
      framing: 'head_and_shoulders',
      orientation: 'square',
      size: '1024x1024',
      quality: 'high',
      format: 'png',
    },
  },
  model: 'gpt-5.6',
  version: 'lucy-character-reference-v1',
  inputHash: 'b'.repeat(64),
};

const referenceAsset = (
  assetId = '550e8400-e29b-41d4-a716-446655440000',
): GeneratedReferenceImageAsset => ({
  assetId,
  mimeType: 'image/jpeg',
  size: '1024x1024',
  width: 1024,
  height: 1024,
  byteSize: 1_024,
  source: 'generated',
  provider: 'openai',
  model: 'gpt-image-2',
  quality: 'high',
  promptHash: 'a'.repeat(64),
  optimizationEnabled: true,
  originalPrompt: rawPrompt,
  optimizedImagePrompt: optimization.result.optimizedImagePrompt,
  lucy25CharacterPrompt: optimization.result.lucy25CharacterPrompt,
  normalizedCharacterDescription: optimization.result.normalizedCharacterDescription,
  preservedCharacterFacts: optimization.result.preservedCharacterFacts,
  technicalDefaultsAdded: optimization.result.technicalDefaultsAdded,
  warnings: [],
  options,
  requestedGenerator: null,
  optimizer: { model: optimization.model, version: optimization.version },
  optimizationInputHash: optimization.inputHash,
  manuallyEdited: false,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
  contentUrl: `/api/reference-images/${assetId}/content`,
});

const rawReferenceAsset = (
  assetId = '550e8400-e29b-41d4-a716-446655440010',
): ReferenceImageAsset => ({
  ...referenceAsset(assetId),
  optimizationEnabled: false,
  optimizedImagePrompt: rawPrompt,
  lucy25CharacterPrompt: rawPrompt,
  normalizedCharacterDescription: rawPrompt,
  preservedCharacterFacts: [],
  technicalDefaultsAdded: [],
  optimizer: null,
  optimizationInputHash: null,
});

const callbacks = (): ReferencePreviewGenerationCallbacks => ({
  onPhase: vi.fn(),
  onOptimizationSuccess: vi.fn(),
  onSuccess: vi.fn(),
  onError: vi.fn(),
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  createReferenceImage.mockReset();
  composeReferenceImage.mockReset();
  editReferenceImage.mockReset();
  optimizeCharacterReferencePrompt.mockReset();
  optimizeCharacterReferencePrompt.mockResolvedValue(optimization);
  createReferenceImage.mockResolvedValue(referenceAsset());
  composeReferenceImage.mockResolvedValue(referenceAsset());
  editReferenceImage.mockResolvedValue(referenceAsset());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useReferencePreviewGeneration', () => {
  it('automatically optimizes before fresh generation and reports both phases in order', async () => {
    const handlers = callbacks();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));

    await act(async () => {
      await result.current.generate({ rawPrompt, options });
    });

    const sourceKey = createReferencePreviewSourceKey(rawPrompt, options);
    expect(optimizeCharacterReferencePrompt).toHaveBeenCalledWith(
      { rawPrompt, options },
      expect.any(AbortSignal),
    );
    expect(createReferenceImage).toHaveBeenCalledOnce();
    expect(editReferenceImage).not.toHaveBeenCalled();
    expect(vi.mocked(handlers.onPhase).mock.calls.map(([phase]) => phase)).toEqual([
      'optimizing',
      'generating',
    ]);
    const [, operationId, phaseSourceKey] = vi.mocked(handlers.onPhase).mock.calls[0]!;
    expect(phaseSourceKey).toBe(sourceKey);
    expect(vi.mocked(handlers.onPhase).mock.calls[1]).toEqual([
      'generating',
      operationId,
      sourceKey,
    ]);
    expect(createReferenceImage).toHaveBeenCalledWith(
      expect.objectContaining({
        rawPrompt,
        options,
        optimization: {
          enabled: true,
          result: optimization.result,
          model: optimization.model,
          version: optimization.version,
          inputHash: optimization.inputHash,
          manuallyEdited: false,
        },
      }),
      expect.any(AbortSignal),
    );
    expect(handlers.onOptimizationSuccess).toHaveBeenCalledWith(
      optimization,
      operationId,
      sourceKey,
      createReferencePromptOptimizationKey(rawPrompt, options),
    );
    expect(handlers.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ asset: referenceAsset(), optimization, sourceKey, operationId }),
    );
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('reuses a successful optimization when the user retries a failed image generation', async () => {
    const generationError = new Error('Provider unavailable');
    createReferenceImage
      .mockRejectedValueOnce(generationError)
      .mockResolvedValueOnce(referenceAsset());
    const handlers = callbacks();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));

    await act(async () => {
      await result.current.generate({ rawPrompt, options });
    });
    const firstRequest = createReferenceImage.mock.calls[0]![0];

    await act(async () => {
      await result.current.generate({ rawPrompt, options });
    });
    const retriedRequest = createReferenceImage.mock.calls[1]![0];

    expect(handlers.onError).toHaveBeenCalledWith(
      generationError,
      expect.any(String),
      createReferencePreviewSourceKey(rawPrompt, options),
    );
    expect(optimizeCharacterReferencePrompt).toHaveBeenCalledOnce();
    expect(handlers.onOptimizationSuccess).toHaveBeenCalledOnce();
    expect(createReferenceImage).toHaveBeenCalledTimes(2);
    expect(retriedRequest.requestId).toBe(firstRequest.requestId);
    expect(retriedRequest.optimization).toEqual(firstRequest.optimization);
    expect(handlers.onSuccess).toHaveBeenCalledOnce();
  });

  it('falls back to raw generation when optimization fails, then retries optimization before regenerating', async () => {
    const optimizationError = new Error('Optimizer unavailable');
    optimizeCharacterReferencePrompt
      .mockRejectedValueOnce(optimizationError)
      .mockResolvedValueOnce(optimization);
    createReferenceImage
      .mockResolvedValueOnce(rawReferenceAsset())
      .mockResolvedValueOnce(referenceAsset());
    const handlers = callbacks();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));

    await act(async () => {
      await result.current.generate({ rawPrompt, options });
    });

    expect(createReferenceImage.mock.calls[0]?.[0].optimization).toEqual({ enabled: false });
    expect(handlers.onSuccess).toHaveBeenLastCalledWith(
      expect.objectContaining({
        asset: rawReferenceAsset(),
        optimization: null,
      }),
    );
    expect(handlers.onError).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.generate({
        rawPrompt,
        options,
        attemptOptimization: true,
        fallbackOnOptimizationFailure: false,
        forceOptimization: true,
      });
    });

    expect(optimizeCharacterReferencePrompt).toHaveBeenCalledTimes(2);
    expect(createReferenceImage.mock.calls[1]?.[0].optimization).toMatchObject({
      enabled: true,
      inputHash: optimization.inputHash,
    });
    expect(handlers.onSuccess).toHaveBeenLastCalledWith(
      expect.objectContaining({
        asset: referenceAsset(),
        optimization,
      }),
    );
  });

  it('continues source-image composition through the raw branch after optimizer failure', async () => {
    optimizeCharacterReferencePrompt.mockRejectedValueOnce(new Error('Optimizer unavailable'));
    composeReferenceImage.mockResolvedValueOnce(rawReferenceAsset());
    const handlers = callbacks();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));
    const sourceAssetId = '550e8400-e29b-41d4-a716-446655440001';

    await act(async () => {
      await result.current.generate({ rawPrompt, options, sourceAssetId });
    });

    expect(composeReferenceImage).toHaveBeenCalledWith(
      sourceAssetId,
      expect.objectContaining({ optimization: { enabled: false } }),
      expect.any(AbortSignal),
    );
    expect(handlers.onSuccess).toHaveBeenCalledOnce();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('reuses the optimization when only the generation source changes', async () => {
    const handlers = callbacks();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));

    await act(async () => {
      await result.current.generate({ rawPrompt, options });
      await result.current.generate({
        rawPrompt,
        options,
        sourceAssetId: '550e8400-e29b-41d4-a716-446655440001',
      });
    });

    expect(createReferencePromptOptimizationKey(rawPrompt, options)).toBe(
      createReferencePromptOptimizationKey(rawPrompt, { ...options }),
    );
    expect(optimizeCharacterReferencePrompt).toHaveBeenCalledOnce();
    expect(createReferenceImage).toHaveBeenCalledOnce();
    expect(composeReferenceImage).toHaveBeenCalledOnce();
    expect(vi.mocked(handlers.onPhase).mock.calls.map(([phase]) => phase)).toEqual([
      'optimizing',
      'generating',
      'generating',
    ]);
  });

  it('re-optimizes when optimization-relevant settings change', async () => {
    const handlers = callbacks();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));
    const changedOptions: CharacterReferenceOptions = {
      ...options,
      framing: 'full_body',
    };

    await act(async () => {
      await result.current.generate({ rawPrompt, options });
      await result.current.generate({ rawPrompt, options: changedOptions });
    });

    expect(optimizeCharacterReferencePrompt).toHaveBeenCalledTimes(2);
    expect(optimizeCharacterReferencePrompt).toHaveBeenLastCalledWith(
      { rawPrompt, options: changedOptions },
      expect.any(AbortSignal),
    );
  });

  it('routes instructed regeneration to edit with the source asset and trimmed instructions', async () => {
    const handlers = callbacks();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));
    const sourceAssetId = '550e8400-e29b-41d4-a716-446655440001';

    await act(async () => {
      await result.current.generate({
        rawPrompt,
        options,
        sourceAssetId,
        changeInstructions: '  Change the field coat to cobalt blue.  ',
      });
    });

    expect(createReferenceImage).not.toHaveBeenCalled();
    const editInput = editReferenceImage.mock.calls[0]?.[1];
    expect(editReferenceImage.mock.calls[0]?.[0]).toBe(sourceAssetId);
    expect(editReferenceImage.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    expect(editInput).toMatchObject({
      rawPrompt,
      options,
      changeInstructions: 'Change the field coat to cobalt blue.',
    });
    expect(editInput?.optimization.enabled).toBe(true);
    if (editInput?.optimization.enabled) {
      expect(editInput.optimization.inputHash).toBe(optimization.inputHash);
    }
    expect(vi.mocked(handlers.onPhase).mock.calls.map(([phase]) => phase)).toEqual([
      'optimizing',
      'regenerating',
    ]);
  });

  it('routes a source image without edit instructions through composition', async () => {
    const handlers = callbacks();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));
    const sourceAssetId = '550e8400-e29b-41d4-a716-446655440001';

    await act(async () => {
      await result.current.generate({
        rawPrompt,
        options,
        sourceAssetId,
        changeInstructions: '   \n  ',
      });
    });

    expect(editReferenceImage).not.toHaveBeenCalled();
    expect(createReferenceImage).not.toHaveBeenCalled();
    expect(composeReferenceImage).toHaveBeenCalledOnce();
    const [composedSourceId, composedRequest, composedSignal] =
      composeReferenceImage.mock.calls[0]!;
    expect(composedSourceId).toBe(sourceAssetId);
    expect(composedRequest.rawPrompt).toBe(rawPrompt);
    expect(composedRequest.options).toEqual(options);
    expect(composedRequest.optimization).toMatchObject({ enabled: true });
    expect(composedSignal).toBeInstanceOf(AbortSignal);
    expect(vi.mocked(handlers.onPhase).mock.calls.map(([phase]) => phase)).toEqual([
      'optimizing',
      'generating',
    ]);
  });

  it('aborts the active request and rejects its late completion after a newer request succeeds', async () => {
    const firstGeneration = deferred<ReferenceImageAsset>();
    const firstAsset = referenceAsset('550e8400-e29b-41d4-a716-446655440002');
    const secondAsset = referenceAsset('550e8400-e29b-41d4-a716-446655440003');
    createReferenceImage
      .mockImplementationOnce(() => firstGeneration.promise)
      .mockResolvedValueOnce(secondAsset);
    const handlers = callbacks();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));

    let firstOperation!: Promise<void>;
    act(() => {
      firstOperation = result.current.generate({ rawPrompt, options });
    });
    await waitFor(() => expect(createReferenceImage).toHaveBeenCalledOnce());
    const firstSignal = createReferenceImage.mock.calls[0]![1] as AbortSignal;

    act(() => result.current.cancel());
    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      await result.current.generate({ rawPrompt, options });
    });
    expect(handlers.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ asset: secondAsset }),
    );

    await act(async () => {
      firstGeneration.resolve(firstAsset);
      await firstOperation;
    });

    expect(handlers.onSuccess).toHaveBeenCalledOnce();
    expect(handlers.onSuccess).not.toHaveBeenCalledWith(
      expect.objectContaining({ asset: firstAsset }),
    );
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it('links an owning caller signal to the provider operation', async () => {
    const generation = deferred<ReferenceImageAsset>();
    createReferenceImage.mockImplementationOnce(() => generation.promise);
    const handlers = callbacks();
    const owner = new AbortController();
    const { result } = renderHook(() => useReferencePreviewGeneration(handlers));

    let operation!: Promise<void>;
    act(() => {
      operation = result.current.generate({ rawPrompt, options }, owner.signal);
    });
    await waitFor(() => expect(createReferenceImage).toHaveBeenCalledOnce());
    const providerSignal = createReferenceImage.mock.calls[0]![1] as AbortSignal;

    owner.abort();
    expect(providerSignal.aborted).toBe(true);
    generation.resolve(referenceAsset());
    await act(async () => operation);

    expect(handlers.onSuccess).not.toHaveBeenCalled();
    expect(handlers.onError).not.toHaveBeenCalled();
  });
});
