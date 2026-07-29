// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type {
  CharacterReferenceOptions,
  ReferenceImageAsset,
  UploadedReferenceImageAsset,
} from '@studio/contracts';
import { createPromptBuilderDraft } from '@studio/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReferencePreviewGenerationCallbacks } from './useReferencePreviewGeneration';
import {
  createCharacterBuilderOperationLocks,
  createFreshCharacterBuilderDraftValue,
} from './characterBuilderControllerSupport';
import {
  characterBuilderReducer,
  createCharacterBuilderState,
  type CharacterBuilderState,
} from './machine';

const cancel = vi.hoisted(() => vi.fn());
const generate = vi.hoisted(() => vi.fn());
let generationCallbacks: ReferencePreviewGenerationCallbacks;

vi.mock('./useReferencePreviewGeneration', () => ({
  useReferencePreviewGeneration: (callbacks: ReferencePreviewGenerationCallbacks) => {
    generationCallbacks = callbacks;
    return { cancel, generate };
  },
}));

import { useCharacterReferenceGeneration } from './useCharacterReferenceGeneration';

const generatedAsset: ReferenceImageAsset = {
  assetId: '550e8400-e29b-41d4-a716-446655440000',
  mimeType: 'image/png',
  size: '1024x1536',
  width: 1024,
  height: 1536,
  byteSize: 12,
  source: 'generated',
  provider: 'openai',
  model: 'gpt-image-2',
  quality: 'high',
  promptHash: 'a'.repeat(64),
  optimizationEnabled: true,
  originalPrompt: 'Adult documentary presenter.',
  optimizedImagePrompt: 'Adult documentary presenter on a neutral background.',
  lucy25CharacterPrompt: 'Replace the subject with an adult documentary presenter.',
  normalizedCharacterDescription: 'Adult documentary presenter.',
  preservedCharacterFacts: ['adult'],
  technicalDefaultsAdded: [],
  warnings: [],
  options: createFreshCharacterBuilderDraftValue().options,
  requestedGenerator: null,
  optimizer: { model: 'gpt-5.6', version: 'lucy-character-reference-v1' },
  optimizationInputHash: 'b'.repeat(64),
  manuallyEdited: false,
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  contentUrl: '/api/reference-images/550e8400-e29b-41d4-a716-446655440000/content',
};

const rawGeneratedAsset: Extract<ReferenceImageAsset, { source: 'generated' }> = {
  ...(generatedAsset as Extract<ReferenceImageAsset, { source: 'generated' }>),
  optimizationEnabled: false,
  optimizedImagePrompt: generatedAsset.originalPrompt,
  optimizer: null,
  optimizationInputHash: null,
};

const uploadedAsset: UploadedReferenceImageAsset = {
  assetId: '8f45ea24-c274-41a5-a988-aa0602115191',
  mimeType: 'image/png',
  byteSize: 5,
  source: 'uploaded',
  width: 800,
  height: 1200,
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  contentUrl: '/api/reference-images/8f45ea24-c274-41a5-a988-aa0602115191/content',
};

const optimization = {
  result: {
    optimizedImagePrompt: generatedAsset.optimizedImagePrompt,
    lucy25CharacterPrompt: generatedAsset.lucy25CharacterPrompt,
    normalizedCharacterDescription: generatedAsset.normalizedCharacterDescription,
    preservedCharacterFacts: generatedAsset.preservedCharacterFacts,
    technicalDefaultsAdded: generatedAsset.technicalDefaultsAdded,
    warnings: generatedAsset.warnings,
    recommendedSettings: {
      framing: 'full_body' as const,
      orientation: 'portrait' as const,
      size: '1024x1536' as const,
      quality: 'high' as const,
      format: 'png' as const,
    },
  },
  model: 'gpt-5.6',
  version: 'lucy-character-reference-v1',
  inputHash: 'b'.repeat(64),
};

const createReadyState = (): CharacterBuilderState => {
  const value = createFreshCharacterBuilderDraftValue();
  return {
    ...createCharacterBuilderState(
      {
        ...createPromptBuilderDraft('character-transform'),
        presetId: 'documentary-presenter',
        adultAge: 'adult',
        characterBase: 'Documentary presenter',
      },
      value.design,
      value.options,
    ),
    phase: 'editing',
  };
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
};

const renderGeneration = (
  state: CharacterBuilderState,
  overrides: Partial<Parameters<typeof useCharacterReferenceGeneration>[0]> = {},
) => {
  const stateRef = { current: state };
  const locksRef = { current: createCharacterBuilderOperationLocks() };
  const dispatch = vi.fn((action: Parameters<typeof characterBuilderReducer>[1]) => {
    stateRef.current = characterBuilderReducer(stateRef.current, action);
  });
  const options: Parameters<typeof useCharacterReferenceGeneration>[0] = {
    open: true,
    generationAvailable: true,
    editAvailable: true,
    stateRef,
    locksRef,
    dispatch,
    hasPendingSave: () => false,
    ...overrides,
  };
  const rendered = renderHook(
    (props: Parameters<typeof useCharacterReferenceGeneration>[0]) =>
      useCharacterReferenceGeneration(props),
    { initialProps: options },
  );
  return { ...rendered, dispatch, locksRef, options, stateRef };
};

beforeEach(() => {
  cancel.mockReset();
  generate.mockReset();
  generate.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useCharacterReferenceGeneration', () => {
  it('validates unavailable generation, composition, prompt, and options before provider work', () => {
    const unavailable = renderGeneration(createReadyState(), { generationAvailable: false });
    act(() => unavailable.result.current.generatePreview());
    const unavailableAction = unavailable.dispatch.mock.lastCall?.[0];
    expect(unavailableAction).toMatchObject({ type: 'validation-failed' });
    expect(unavailableAction?.type === 'validation-failed' && unavailableAction.message).toContain(
      'not configured',
    );
    unavailable.unmount();

    const compositionState = createReadyState();
    compositionState.uploadedReference = { asset: uploadedAsset, displayName: 'portrait.png' };
    const composition = renderGeneration(compositionState, { editAvailable: false });
    act(() => composition.result.current.generatePreview());
    const compositionAction = composition.dispatch.mock.lastCall?.[0];
    expect(compositionAction).toMatchObject({ type: 'validation-failed' });
    expect(compositionAction?.type === 'validation-failed' && compositionAction.message).toContain(
      'Combined preview generation is unavailable',
    );
    composition.unmount();

    const invalidPrompt = createReadyState();
    invalidPrompt.draft = createPromptBuilderDraft('character-transform');
    const prompt = renderGeneration(invalidPrompt);
    act(() => prompt.result.current.generatePreview());
    expect(prompt.dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'validation-failed', kind: 'generation' }),
    );
    prompt.unmount();

    const invalidOptions = createReadyState();
    invalidOptions.options = {
      ...invalidOptions.options,
      framing: 'invalid-framing',
    } as unknown as CharacterReferenceOptions;
    const options = renderGeneration(invalidOptions);
    act(() => options.result.current.generatePreview());
    expect(options.dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'validation-failed', kind: 'generation' }),
    );

    expect(generate).not.toHaveBeenCalled();
  });

  it('locks same-turn duplicate generation and permits retry after settlement', async () => {
    const first = deferred();
    generate.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    const rendered = renderGeneration(createReadyState());

    act(() => {
      rendered.result.current.generatePreview();
      rendered.result.current.generatePreview();
    });

    expect(generate).toHaveBeenCalledOnce();
    expect(rendered.locksRef.current.generation).toBe(true);

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    await waitFor(() => expect(rendered.locksRef.current.generation).toBe(false));

    act(() => rendered.result.current.generatePreview());
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
  });

  it('routes stale-preview edits through the uploaded source and blank retries through composition', () => {
    const state = createReadyState();
    state.uploadedReference = { asset: uploadedAsset, displayName: 'portrait.png' };
    state.preview = { asset: generatedAsset, sourceKey: 'old-source', stale: true };
    const rendered = renderGeneration(state);

    act(() => rendered.result.current.regenerate('  Make the coat cobalt.  '));
    expect(generate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sourceAssetId: uploadedAsset.assetId,
        changeInstructions: 'Make the coat cobalt.',
      }),
    );

    rendered.locksRef.current.generation = false;
    act(() => rendered.result.current.regenerate('   '));
    expect(generate).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceAssetId: uploadedAsset.assetId }),
    );
    expect(generate.mock.calls[1]?.[0]).not.toHaveProperty('changeInstructions');
  });

  it('retries optimization from a restored raw preview before regenerating', () => {
    const state = createReadyState();
    state.phase = 'preview-ready';
    state.preview = { asset: rawGeneratedAsset, sourceKey: 'raw-source', stale: false };
    const rendered = renderGeneration(state);

    act(() => rendered.result.current.retryOptimization());

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptOptimization: true,
        fallbackOnOptimizationFailure: false,
        forceOptimization: true,
      }),
    );
  });

  it('cancels on close, clears its lock, and blocks work while save recovery is pending', () => {
    const rendered = renderGeneration(createReadyState(), { hasPendingSave: () => true });

    act(() => rendered.result.current.generatePreview());
    expect(generate).not.toHaveBeenCalled();

    rendered.locksRef.current.generation = true;
    rendered.rerender({ ...rendered.options, open: false });
    expect(cancel).toHaveBeenCalledOnce();
    expect(rendered.locksRef.current.generation).toBe(false);
  });

  it('publishes lifecycle events while the reducer rejects a late stale completion', () => {
    const state = createReadyState();
    const rendered = renderGeneration(state);

    act(() => generationCallbacks.onPhase('optimizing', 'operation-1', 'source-1'));
    expect(rendered.stateRef.current.operation).toMatchObject({
      id: 'operation-1',
      sourceKey: 'source-1',
    });

    act(() => generationCallbacks.onPhase('generating', 'operation-1', 'source-1'));
    expect(rendered.stateRef.current.phase).toBe('generating');

    rendered.stateRef.current = {
      ...rendered.stateRef.current,
      revision: rendered.stateRef.current.revision + 1,
    };
    act(() =>
      generationCallbacks.onSuccess({
        operationId: 'operation-1',
        requestId: 'request-1',
        asset: generatedAsset,
        sourceKey: 'source-1',
        optimization,
      }),
    );

    expect(rendered.stateRef.current.preview).toBeNull();
  });
});
