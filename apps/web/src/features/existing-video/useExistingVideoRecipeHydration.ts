import type { CapabilitiesResponse } from '@studio/contracts';
import { useEffect, useRef, useState } from 'react';
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

  /**
   * The selection that currently owns this step's reference, its error state and its busy flag.
   *
   * A saved recipe is fetched over the network while the reference picker stays live — the picker
   * is gated on `recipeLocked`, which hydration does not set — so the operator can drop in their
   * own image mid-flight. Their local decode always finishes first, and the recipe's write then
   * landed on top of it: the step showed one face while the paid provider job carried another,
   * attributed to the character they had just replaced.
   *
   * One rule now: the newest claim wins, and every write states the claim it belongs to. The
   * controller is the claim token as well as the abort signal, so a superseded hydration also
   * stops fetching rather than running to completion to have its result discarded.
   */
  const claimRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      claimRef.current?.abort();
      // Nulled rather than flagged: `owns` is then false for everything still in flight, which is
      // what keeps a late result from writing into a torn-down hook.
      claimRef.current = null;
    },
    [],
  );

  const claimStep = (): AbortController => {
    claimRef.current?.abort();
    const controller = new AbortController();
    claimRef.current = controller;
    return controller;
  };

  const owns = (controller: AbortController): boolean => claimRef.current === controller;

  const clearReferenceRecovery = () => {
    setReferenceError(null);
    setMissingVtonReference(null);
  };

  const chooseReference = async (step: ExistingVideoStep, file: File) => {
    const claim = claimStep();
    // Nothing is loading for this step any more, whatever the abandoned hydration was doing.
    setRecipeLoading(false);
    setMissingVtonReference(null);
    const validation = await validateReferenceImage(file, step.modelId);
    if (!owns(claim)) return;
    if (validation.blockingError) {
      setReferenceError(validation.blockingError);
      return;
    }
    setReferenceError(null);
    // Choosing an image replaces the character it came from. Written here, with the reference
    // itself, so the step's image and the name attributed to it can never be set apart — and so a
    // file the validator rejects leaves both alone rather than clearing the name over a stale image.
    workflow.updateStep(step.id, {
      referenceImage: file,
      savedRecipeId: null,
      characterName: null,
      characterVariantName: null,
    });
  };

  const applySavedRecipe = async (step: ExistingVideoStep, recipeId: string) => {
    const recipe = savedRecipes.find(
      (candidate) => candidate.id === recipeId && candidate.modelId === step.modelId,
    );
    if (!recipe) return;
    const claim = claimStep();
    setRecipeLoading(true);
    clearReferenceRecovery();
    try {
      const referenceImage = recipe.referenceImageAssetId
        ? await hydrateReferenceImage(recipe.referenceImageAssetId, undefined, claim.signal)
        : null;
      // The operator chose something else while this was in flight; theirs is the newer intent.
      if (!owns(claim)) return;
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
      // A superseded hydration was aborted on purpose, so it has no failure to report — and the
      // selection that replaced it owns the step's error state now.
      if (!owns(claim)) return;
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
      if (owns(claim)) {
        claimRef.current = null;
        setRecipeLoading(false);
      }
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
