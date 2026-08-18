import { useCallback, useMemo, useReducer } from 'react';
import type { RecipeSelection } from '../features/creative-assets/RecipeShelf.types';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
} from '../features/creative-assets/types';
import {
  MODE_REPLACEMENT_CONFIRMATION,
  modeReplacementNeedsConfirmation,
} from '../features/media-session/draftPolicy';
import type { StudioSessionController } from '../features/media-session/types';
import {
  activeRecipeReducer,
  INITIAL_ACTIVE_RECIPE_STATE,
  resolveActiveRecipe,
  type ActiveStudioRecipe,
} from './referenceRecipeIdentity';
import {
  createPendingReferenceRecipeUse,
  useReferenceRecipeAttribution,
} from './useReferenceRecipeAttribution';
import { useReferenceRecipeHydration } from './useReferenceRecipeHydration';
import type { ConfirmationRequest } from '../ui';

export { isExactActiveRecipe } from './referenceRecipeIdentity';
type UseReferenceRecipeHandoffOptions = {
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly session: StudioSessionController;
  readonly mediaLocked: boolean;
  readonly sessionModeLocked: boolean;
  readonly characterBuilderOpenBlockedReason: string | undefined;
  readonly closeOverlay: () => void;
  readonly confirmation: ConfirmationRequest;
};

/**
 * Stable Studio facade for recipe identity, hydration, Builder preload, and
 * successful-use attribution.
 */
export const useReferenceRecipeHandoff = ({
  repository,
  store,
  session,
  mediaLocked,
  sessionModeLocked,
  characterBuilderOpenBlockedReason,
  closeOverlay,
  confirmation,
}: UseReferenceRecipeHandoffOptions) => {
  const [activeRecipeState, dispatchActiveRecipe] = useReducer(
    activeRecipeReducer,
    INITIAL_ACTIVE_RECIPE_STATE,
  );
  const activeRecipe = useMemo(
    () => resolveActiveRecipe(activeRecipeState, store, session.draft),
    [activeRecipeState, session.draft, store],
  );
  const hydration = useReferenceRecipeHydration({
    // Deliberately not `async`: an `async` arrow would return a promise even when the answer is
    // already known, turning every hydration start into a deferred one. Only the branch that
    // actually has to ask the operator yields a promise.
    canStart: (pending) => {
      if (mediaLocked) return false;
      if (!modeReplacementNeedsConfirmation(session.draft, pending.mode)) return true;
      return confirmation.ask(MODE_REPLACEMENT_CONFIRMATION);
    },
    currentReferenceImage: () => session.draft.referenceImage,
    onCommit: async (result) => {
      const committed = session.replaceRecipeDraft({
        mode: result.pending.mode,
        prompt: result.appliedPrompt,
        referenceImage: result.referenceImage,
        enhance: result.pending.enhancePrompt || result.enhance,
      });
      if (!committed) return false;

      await attribution.commitHydratedRecipe(result);
      closeOverlay();
      return true;
    },
  });

  const attribution = useReferenceRecipeAttribution({
    confirmation,
    repository,
    session,
    activeRecipe: activeRecipe.recipe,
    activeFingerprint: activeRecipe.fingerprint,
    activeCharacterName: activeRecipe.characterName,
    dispatchActiveRecipe,
    characterBuilderOpenBlockedReason,
    referenceUsePending: hydration.pending,
  });

  const useRecipe = useCallback(
    (selection: RecipeSelection) => {
      hydration.useRecipe(
        createPendingReferenceRecipeUse(selection, repository.getSnapshot().store),
      );
    },
    [hydration, repository],
  );

  const clearActiveCharacter = useCallback((): boolean => {
    if (!activeRecipe.character || sessionModeLocked || !session.selectMode('local')) return false;
    dispatchActiveRecipe({ type: 'clear' });
    return true;
  }, [activeRecipe.character, session, sessionModeLocked]);
  const clearActiveRecipe = useCallback((): boolean => {
    const hasPreparedAi =
      activeRecipe.recipe !== null ||
      (session.draft.mode !== 'local' &&
        Boolean(session.draft.prompt.trim() || session.draft.referenceImage));
    if (!hasPreparedAi || sessionModeLocked || !session.selectMode('local')) return false;
    dispatchActiveRecipe({ type: 'clear' });
    return true;
  }, [activeRecipe.recipe, session, sessionModeLocked]);

  const recipeInsertionBlocked =
    mediaLocked || (sessionModeLocked && session.draft.mode === 'local');

  return {
    state: {
      activeRecipe: activeRecipe.recipe satisfies ActiveStudioRecipe,
      activeCharacter: activeRecipe.character,
      activeCharacterName: activeRecipe.characterName,
      activeRecipeLabel: activeRecipe.label,
      referenceUsePending: hydration.pending,
      referenceUseFailureMessage: hydration.failureMessage,
      canContinueReferenceUseWithoutImage: hydration.canContinueWithoutReference,
      recipeInsertionBlocked,
      characterBuilderSaveBlockedReason: attribution.characterBuilderSaveBlockedReason,
    },
    actions: {
      recordCommittedPrompt: attribution.recordCommittedPrompt,
      useRecipe,
      clearActiveCharacter,
      clearActiveRecipe,
      retryReferenceUse: hydration.retry,
      continueReferenceUseWithoutImage: hydration.continueWithoutReference,
      saveBuiltCharacter: attribution.saveBuiltCharacter,
    },
  } as const;
};
