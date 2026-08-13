import type { CapabilitiesResponse } from '@studio/contracts';
import { useState } from 'react';
import { hydrateReferenceImage } from '../../adapters/api-client/apiClient';
import { validateReferenceImage } from '../../adapters/browser-media/imageValidation';
import type { ExistingVideoSavedRecipe } from './ExistingVideoRecipeChooser';
import {
  capabilityForExistingVideoStep,
  savedCharacterStepInput,
  type ExistingVideoStep,
  type ExistingVideoWorkflow,
} from './useExistingVideoWorkflow';

type MissingVtonReferenceRecovery = Readonly<{
  stepId: string;
  recipe: ExistingVideoSavedRecipe;
}>;

export const useExistingVideoRecipeHydration = ({
  workflow,
  savedRecipes,
  visualCapabilities,
}: {
  readonly workflow: ExistingVideoWorkflow;
  readonly savedRecipes: readonly ExistingVideoSavedRecipe[];
  readonly visualCapabilities: CapabilitiesResponse['videoProcessing'];
}) => {
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [missingVtonReference, setMissingVtonReference] =
    useState<MissingVtonReferenceRecovery | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);

  const clearReferenceRecovery = () => {
    setReferenceError(null);
    setMissingVtonReference(null);
  };

  const chooseReference = async (step: ExistingVideoStep, file: File) => {
    setMissingVtonReference(null);
    const validation = await validateReferenceImage(file, step.modelId);
    if (validation.blockingError) {
      setReferenceError(validation.blockingError);
      return;
    }
    setReferenceError(null);
    workflow.updateStep(step.id, { referenceImage: file });
  };

  const applySavedRecipe = async (step: ExistingVideoStep, recipeId: string) => {
    const recipe = savedRecipes.find(
      (candidate) => candidate.id === recipeId && candidate.modelId === step.modelId,
    );
    if (!recipe) return;
    setRecipeLoading(true);
    clearReferenceRecovery();
    try {
      const referenceImage = recipe.referenceImageAssetId
        ? await hydrateReferenceImage(recipe.referenceImageAssetId)
        : null;
      workflow.updateStep(step.id, {
        savedRecipeId: recipe.id,
        characterName: recipe.characterName ?? null,
        characterVariantName: recipe.characterVariantName ?? null,
        ...(step.modelId === 'lucy-latest'
          ? capabilityForExistingVideoStep(step, visualCapabilities).promptInput ===
            'server-default'
            ? { prompt: '', referenceImage: referenceImage?.file ?? null }
            : savedCharacterStepInput(recipe.prompt, referenceImage?.file ?? null)
          : {
              prompt: recipe.prompt,
              referenceImage: referenceImage?.file ?? null,
            }),
        ...(step.modelId === 'lucy-vton-latest'
          ? {
              inputKind:
                recipe.vtonInputKind === 'prompt' ? ('prompt' as const) : ('saved-outfit' as const),
              enhancePrompt: recipe.vtonInputKind === 'prompt' && recipe.enhancePrompt,
            }
          : {}),
      });
      if (step.modelId === 'lucy-latest' && recipe.defaultVoice) {
        workflow.selectVoice(recipe.defaultVoice.voiceId, recipe.defaultVoice.voiceName);
      }
    } catch {
      if (step.modelId === 'lucy-vton-latest') {
        setReferenceError(
          recipe.prompt.trim()
            ? 'This outfit image could not be loaded. Retry, continue with its garment direction, or remove the outfit.'
            : 'This outfit image could not be loaded. Retry or remove the outfit.',
        );
        setMissingVtonReference({ stepId: step.id, recipe });
      } else {
        setReferenceError(
          'This saved character reference image could not be loaded. Choose the character again to retry, or write a different prompt manually.',
        );
      }
    } finally {
      setRecipeLoading(false);
    }
  };

  const retryMissingReference = () => {
    if (!missingVtonReference) return;
    const step = workflow.steps.find((candidate) => candidate.id === missingVtonReference.stepId);
    if (step) void applySavedRecipe(step, missingVtonReference.recipe.id);
  };

  const continueWithoutReference = () => {
    if (!missingVtonReference) return;
    workflow.updateStep(missingVtonReference.stepId, {
      savedRecipeId: missingVtonReference.recipe.id,
      characterName: null,
      characterVariantName: null,
      prompt: missingVtonReference.recipe.prompt,
      referenceImage: null,
      inputKind: 'prompt',
      enhancePrompt: missingVtonReference.recipe.enhancePrompt,
    });
    clearReferenceRecovery();
  };

  const removeMissingOutfit = () => {
    if (!missingVtonReference) return;
    workflow.updateStep(missingVtonReference.stepId, {
      savedRecipeId: null,
      characterName: null,
      characterVariantName: null,
      prompt: '',
      referenceImage: null,
      inputKind: 'saved-outfit',
      enhancePrompt: false,
    });
    clearReferenceRecovery();
  };

  return {
    applySavedRecipe,
    chooseReference,
    clearReferenceRecovery,
    continueWithoutReference,
    missingVtonReference,
    recipeLoading,
    referenceError,
    removeMissingOutfit,
    retryMissingReference,
  };
};
