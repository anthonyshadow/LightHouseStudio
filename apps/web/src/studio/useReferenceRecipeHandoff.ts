import { useCallback, useMemo, useReducer } from 'react';
import type { RecipeSelection } from '../features/creative-assets/RecipeShelf.types';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
} from '../features/creative-assets/types';
import { useRecipeLibraryMode } from '../features/creative-assets/useRecipeLibraryMode';
import { confirmModeReplacement } from '../features/media-session/draftPolicy';
import type { StudioMode, StudioSessionController } from '../features/media-session/types';
import type { PromptWorkshopAction } from '../features/prompt-authoring/CharacterPromptWorkshop';
import {
  activeRecipeReducer,
  INITIAL_ACTIVE_RECIPE_STATE,
  resolveActiveRecipe,
  type ActiveStudioRecipe as ActiveStudioRecipeState,
} from './referenceRecipeIdentity';
import {
  createPendingReferenceRecipeUse,
  useReferenceRecipeAttribution,
} from './useReferenceRecipeAttribution';
import { useReferenceRecipeHydration } from './useReferenceRecipeHydration';
import { useReferenceRecipeWorkshop } from './useReferenceRecipeWorkshop';

export { isExactActiveRecipe } from './referenceRecipeIdentity';
export type ActiveStudioRecipe = ActiveStudioRecipeState;

type UseReferenceRecipeHandoffOptions = {
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly session: StudioSessionController;
  readonly mediaLocked: boolean;
  readonly recordingActive: boolean;
  readonly sessionModeLocked: boolean;
  readonly characterBuilderOpenBlockedReason: string | undefined;
  readonly openWorkshopOverlay: () => void;
  readonly closeOverlay: () => void;
};

/**
 * Stable Studio facade for recipe identity, hydration, Workshop coordination,
 * Builder preload, and successful-use attribution.
 */
export const useReferenceRecipeHandoff = ({
  repository,
  store,
  session,
  mediaLocked,
  recordingActive,
  sessionModeLocked,
  characterBuilderOpenBlockedReason,
  openWorkshopOverlay,
  closeOverlay,
}: UseReferenceRecipeHandoffOptions) => {
  const [activeRecipeState, dispatchActiveRecipe] = useReducer(
    activeRecipeReducer,
    INITIAL_ACTIVE_RECIPE_STATE,
  );
  const activeRecipe = useMemo(
    () => resolveActiveRecipe(activeRecipeState, store, session.draft),
    [activeRecipeState, session.draft, store],
  );
  const library = useRecipeLibraryMode(session.draft.mode);
  const { mode: resolvedLibraryMode, dirty: shelfDirty } = library;

  const selectModeWithDraftProtection = useCallback(
    (mode: StudioMode): boolean =>
      !mediaLocked &&
      confirmModeReplacement(session.draft, mode, (message) => window.confirm(message)) &&
      session.selectMode(mode),
    [mediaLocked, session],
  );
  const selectLucyMode = useCallback(
    () => selectModeWithDraftProtection('lucy-2.5'),
    [selectModeWithDraftProtection],
  );

  const workshop = useReferenceRecipeWorkshop({
    repository,
    session,
    recordingActive,
    activeRecipe: activeRecipe.recipe,
    selectLucyMode,
    openWorkshopOverlay,
  });

  const hydration = useReferenceRecipeHydration({
    canStart: (pending) =>
      !mediaLocked &&
      (pending.mode === session.draft.mode ||
        confirmModeReplacement(session.draft, pending.mode, (message) => window.confirm(message))),
    currentReferenceImage: () => session.draft.referenceImage,
    onCommit: (result) => {
      const committed = session.replaceRecipeDraft({
        mode: result.pending.mode,
        prompt: result.appliedPrompt,
        referenceImage: result.referenceImage,
        enhance: result.enhance,
      });
      if (!committed) return false;

      attribution.commitHydratedRecipe(result);
      workshop.completeUse(result.pending);
      closeOverlay();
      return true;
    },
  });

  const attribution = useReferenceRecipeAttribution({
    repository,
    session,
    activeRecipe: activeRecipe.recipe,
    activeFingerprint: activeRecipe.fingerprint,
    activeCharacterName: activeRecipe.characterName,
    dispatchActiveRecipe,
    characterBuilderOpenBlockedReason,
    shelfDirty,
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

  const applyWorkshopPrompt = useCallback(
    (action: PromptWorkshopAction) => {
      hydration.useRecipe(workshop.createPendingUse(action));
    },
    [hydration, workshop],
  );

  const recipeInsertionBlocked =
    mediaLocked || (sessionModeLocked && session.draft.mode !== resolvedLibraryMode);

  return {
    state: {
      activeRecipe: activeRecipe.recipe satisfies ActiveStudioRecipe,
      activeCharacter: activeRecipe.character,
      activeCharacterName: activeRecipe.characterName,
      activeRecipeLabel: activeRecipe.label,
      libraryMode: resolvedLibraryMode,
      workshopDraft: workshop.draft,
      workshopDrafts: workshop.drafts,
      referenceUsePending: hydration.pending,
      referenceUseFailureMessage: hydration.failureMessage,
      shelfDirty,
      recipeInsertionBlocked,
      characterBuilderSaveBlockedReason: attribution.characterBuilderSaveBlockedReason,
    },
    actions: {
      recordCommittedPrompt: attribution.recordCommittedPrompt,
      changeLibraryMode: library.changeMode,
      rememberWorkshopDraft: workshop.rememberDraft,
      setShelfDirty: library.setDirty,
      useRecipe,
      retryReferenceUse: hydration.retry,
      continueReferenceUseWithoutImage: hydration.continueWithoutReference,
      saveBuiltCharacter: attribution.saveBuiltCharacter,
      openSavedWorkshop: workshop.openSavedWorkshop,
      applyWorkshopPrompt,
      saveWorkshopPrompt: workshop.saveWorkshopPrompt,
      openWorkshop: workshop.openWorkshop,
    },
  } as const;
};
