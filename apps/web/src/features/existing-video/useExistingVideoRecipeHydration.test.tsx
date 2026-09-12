// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { CapabilitiesResponse } from '@studio/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const adapters = vi.hoisted(() => ({
  hydrateReferenceImage: vi.fn(),
  validateReferenceImage: vi.fn(),
}));

vi.mock('../../adapters/api-client/apiClient', () => ({
  hydrateReferenceImage: adapters.hydrateReferenceImage,
}));
vi.mock('../../adapters/browser-media/imageValidation', () => ({
  validateReferenceImage: adapters.validateReferenceImage,
}));

import type { ExistingVideoSavedRecipe } from './ExistingVideoRecipeChooser';
import { useExistingVideoRecipeHydration } from './useExistingVideoRecipeHydration';
import type { ExistingVideoStep, ExistingVideoWorkflow } from './useExistingVideoWorkflow';

const visualCapabilities = {
  available: true,
  characterSwap: {
    available: true,
    inputPreparation: 'h264-mp4',
    referencePolicy: 'required',
    promptInput: 'editable',
    promptEnhancement: false,
    audioPolicy: 'optional',
    outputResolutions: ['720p'],
  },
  virtualTryOn: null,
  promptEnhancement: false,
} as unknown as CapabilitiesResponse['videoProcessing'];

const step = { id: 'step-1', modelId: 'lucy-latest' } as unknown as ExistingVideoStep;

const recipe: ExistingVideoSavedRecipe = {
  id: 'ada',
  modelId: 'lucy-latest',
  label: 'Ada',
  prompt: 'Ada, silver hair',
  characterName: 'Ada',
  characterVariantName: null,
  referenceImageAssetId: 'ada-asset',
} as unknown as ExistingVideoSavedRecipe;

describe('useExistingVideoRecipeHydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adapters.validateReferenceImage.mockResolvedValue({ blockingError: null });
  });

  const harness = () => {
    const updateStep = vi.fn();
    const workflow = {
      updateStep,
      selectVoice: vi.fn(),
      steps: [step],
    } as unknown as ExistingVideoWorkflow;
    const hook = renderHook(() =>
      useExistingVideoRecipeHydration({
        workflow,
        savedRecipes: [recipe],
        visualCapabilities,
      }),
    );
    return { hook, updateStep };
  };

  it('drops a saved-character hydration the operator replaced while it was loading', async () => {
    // The reference picker stays live during hydration, so the operator can drop their own image
    // in — and a local decode always beats a network fetch. Before the guard, the recipe's late
    // write landed on top of it and the paid job carried Ada's face under Ada's name.
    let deliverAda: ((value: unknown) => void) | undefined;
    adapters.hydrateReferenceImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          deliverAda = resolve;
        }),
    );
    const { hook, updateStep } = harness();
    const operatorFile = new File(['operator'], 'operator.png', { type: 'image/png' });

    act(() => void hook.result.current.applySavedRecipe(step, 'ada'));
    await act(async () => {
      await hook.result.current.chooseReference(step, operatorFile);
    });
    // The image and the character attributed to it are set together, so they cannot disagree.
    expect(updateStep).toHaveBeenCalledWith('step-1', {
      referenceImage: operatorFile,
      savedRecipeId: null,
      characterName: null,
      characterVariantName: null,
    });

    await act(async () => {
      deliverAda?.({ file: new File(['ada'], 'ada.png', { type: 'image/png' }) });
      await Promise.resolve();
    });

    // Exactly the operator's write, and nothing from the recipe that lost the step.
    expect(updateStep).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(hook.result.current.recipeLoading).toBe(false);
    });
  });

  it('applies a saved character that is still the current selection', async () => {
    const adaFile = new File(['ada'], 'ada.png', { type: 'image/png' });
    adapters.hydrateReferenceImage.mockResolvedValue({ file: adaFile });
    const { hook, updateStep } = harness();

    await act(async () => {
      await hook.result.current.applySavedRecipe(step, 'ada');
    });

    expect(updateStep).toHaveBeenCalledWith(
      'step-1',
      expect.objectContaining({ savedRecipeId: 'ada', characterName: 'Ada' }),
    );
  });
});
