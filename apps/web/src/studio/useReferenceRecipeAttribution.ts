import { canonicalPrompt } from '@studio/domain';
import { useCallback, useEffect, useRef, type Dispatch } from 'react';
import type { PromptCommittedHandler } from '../application/types';
import type { RecipeSelection } from '../features/creative-assets/RecipeShelf.types';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
} from '../features/creative-assets/types';
import {
  useCharacterStudioPreload,
  type PreloadedCharacter,
} from '../features/character-builder/useCharacterStudioPreload';
import type { StudioSessionController } from '../features/media-session/types';
import {
  referenceIdentity,
  type ActiveRecipeAction,
  type ActiveRecipeFingerprint,
  type ActiveStudioRecipe,
} from './referenceRecipeIdentity';
import type {
  PendingReferenceRecipeUse,
  ReferenceRecipeHydrationResult,
} from './useReferenceRecipeHydration';

export const createPendingReferenceRecipeUse = (
  selection: RecipeSelection,
  store: CreativeAssetStore,
): PendingReferenceRecipeUse => {
  const selectedReferenceAssetId = selection.referenceImageAssetId ?? null;
  const linkedRecentPrompt =
    selection.origin === 'recent-prompt' && selection.assetId
      ? store.savedPrompts.find(
          (candidate) =>
            candidate.id === selection.assetId &&
            candidate.modelModeId === selection.modelModeId &&
            canonicalPrompt(candidate.prompt) === canonicalPrompt(selection.prompt) &&
            candidate.referenceImageAssetId === selectedReferenceAssetId,
        )
      : null;
  const linkedRecentCharacter =
    selection.origin === 'recent-prompt' && selection.savedCharacterPromptId
      ? store.savedCharacterPrompts.find(
          (candidate) =>
            candidate.id === selection.savedCharacterPromptId &&
            canonicalPrompt(candidate.prompt) === canonicalPrompt(selection.prompt) &&
            candidate.referenceImageAssetId === selectedReferenceAssetId,
        )
      : null;

  return {
    mode: selection.modelModeId,
    prompt: selection.prompt,
    referenceImageAssetId: selectedReferenceAssetId,
    preserveCurrentReference: false,
    destination: 'shelf',
    ...(selection.builderDraft ? { builderDraft: selection.builderDraft } : {}),
    ...(selection.characterName ? { characterName: selection.characterName } : {}),
    ...(selection.origin === 'saved-prompt' && selection.assetId
      ? { savedPromptId: selection.assetId }
      : {}),
    ...(linkedRecentPrompt ? { savedPromptId: linkedRecentPrompt.id } : {}),
    ...(linkedRecentCharacter ? { savedCharacterPromptId: linkedRecentCharacter.id } : {}),
    ...(selection.origin === 'character-prompt' && selection.assetId
      ? { savedCharacterPromptId: selection.assetId }
      : {}),
  };
};

export const characterBuilderSaveBlockedReason = ({
  openBlockedReason,
  shelfDirty,
  canReplaceLucyRecipe,
  referenceUsePending,
}: {
  readonly openBlockedReason: string | undefined;
  readonly shelfDirty: boolean;
  readonly canReplaceLucyRecipe: boolean;
  readonly referenceUsePending: boolean;
}): string | undefined => {
  if (openBlockedReason) return openBlockedReason;
  if (shelfDirty) {
    return 'Save or discard the unfinished Recipe Shelf changes before saving this character.';
  }
  if (!canReplaceLucyRecipe) {
    return 'Release the active camera or AI session before Studio can preload Lucy 2.5.';
  }
  return referenceUsePending
    ? 'Wait for the current recipe handoff to finish before saving this character.'
    : undefined;
};

type StandaloneRecentCharacter = {
  readonly mode: PendingReferenceRecipeUse['mode'];
  readonly prompt: string;
  readonly referenceImageAssetId: string | null;
  readonly characterName: string;
};

type UseReferenceRecipeAttributionOptions = {
  readonly repository: CreativeAssetRepository;
  readonly session: StudioSessionController;
  readonly activeRecipe: ActiveStudioRecipe;
  readonly activeFingerprint: ActiveRecipeFingerprint | null;
  readonly activeCharacterName: string | undefined;
  readonly dispatchActiveRecipe: Dispatch<ActiveRecipeAction>;
  readonly characterBuilderOpenBlockedReason: string | undefined;
  readonly shelfDirty: boolean;
  readonly referenceUsePending: boolean;
};

/**
 * Owns saved/recent attribution plus the Builder save-to-preload bridge.
 * Active identity itself remains authoritative in the facade-owned reducer.
 */
export const useReferenceRecipeAttribution = ({
  repository,
  session,
  activeRecipe,
  activeFingerprint,
  activeCharacterName,
  dispatchActiveRecipe,
  characterBuilderOpenBlockedReason,
  shelfDirty,
  referenceUsePending,
}: UseReferenceRecipeAttributionOptions) => {
  const selectedSavedPromptRef = useRef<string | undefined>(undefined);
  const selectedCharacterPromptRef = useRef<string | undefined>(undefined);
  const standaloneRecentCharacterRef = useRef<StandaloneRecentCharacter | null>(null);

  const recordCommittedPrompt = useCallback<PromptCommittedHandler>(
    (mode, prompt, committedReferenceAssetId) => {
      const activeRecipeStillMatches = Boolean(
        activeFingerprint &&
        activeFingerprint.mode === mode &&
        canonicalPrompt(activeFingerprint.prompt) === canonicalPrompt(prompt) &&
        activeFingerprint.referenceImageAssetId === committedReferenceAssetId &&
        activeFingerprint.referenceImageAssetId === activeFingerprint.assetReferenceImageAssetId,
      );
      const standaloneRecentCharacter =
        standaloneRecentCharacterRef.current?.mode === mode &&
        canonicalPrompt(standaloneRecentCharacterRef.current.prompt) === canonicalPrompt(prompt) &&
        standaloneRecentCharacterRef.current.referenceImageAssetId === committedReferenceAssetId
          ? standaloneRecentCharacterRef.current
          : null;
      repository.recordSuccessfulPrompt({
        prompt:
          activeRecipeStillMatches && activeFingerprint ? activeFingerprint.assetPrompt : prompt,
        modelModeId: mode,
        referenceImageAssetId: committedReferenceAssetId,
        ...(activeRecipeStillMatches && selectedSavedPromptRef.current
          ? { savedPromptId: selectedSavedPromptRef.current }
          : {}),
        ...(activeRecipeStillMatches && selectedCharacterPromptRef.current
          ? { savedCharacterPromptId: selectedCharacterPromptRef.current }
          : {}),
        ...(activeRecipeStillMatches && activeCharacterName
          ? { characterName: activeCharacterName }
          : standaloneRecentCharacter
            ? { characterName: standaloneRecentCharacter.characterName }
            : {}),
      });
    },
    [activeCharacterName, activeFingerprint, repository],
  );

  useEffect(() => {
    if (activeRecipe) return;
    selectedSavedPromptRef.current = undefined;
    selectedCharacterPromptRef.current = undefined;
  }, [activeRecipe]);

  const commitHydratedRecipe = useCallback(
    ({
      pending,
      referenceImage,
      storedReferenceMetadata,
      appliedPrompt,
      referenceMatchesPendingPrompt,
    }: ReferenceRecipeHydrationResult) => {
      const repositorySnapshot = repository.getSnapshot().store;
      const sourceAsset = pending.savedCharacterPromptId
        ? repositorySnapshot.savedCharacterPrompts.find(
            (candidate) => candidate.id === pending.savedCharacterPromptId,
          )
        : pending.savedPromptId
          ? repositorySnapshot.savedPrompts.find(
              (candidate) => candidate.id === pending.savedPromptId,
            )
          : null;
      const sourceMode =
        sourceAsset && 'modelModeId' in sourceAsset ? sourceAsset.modelModeId : 'lucy-2.5';
      const appliedReferenceIdentity = referenceIdentity(referenceImage);
      const sourceStillMatches = Boolean(
        sourceAsset &&
        sourceMode === pending.mode &&
        canonicalPrompt(sourceAsset.prompt) === canonicalPrompt(pending.prompt) &&
        sourceAsset.referenceImageAssetId === pending.referenceImageAssetId &&
        appliedReferenceIdentity === sourceAsset.referenceImageAssetId,
      );
      const exactSavedPromptId =
        sourceStillMatches && pending.savedPromptId ? pending.savedPromptId : undefined;
      const exactCharacterPromptId =
        sourceStillMatches && pending.savedCharacterPromptId
          ? pending.savedCharacterPromptId
          : undefined;
      selectedSavedPromptRef.current = exactSavedPromptId;
      selectedCharacterPromptRef.current = exactCharacterPromptId;
      standaloneRecentCharacterRef.current =
        !exactCharacterPromptId && pending.characterName
          ? {
              mode: pending.mode,
              prompt: appliedPrompt,
              referenceImageAssetId: appliedReferenceIdentity,
              characterName: pending.characterName,
            }
          : null;
      const nextRecipe = exactCharacterPromptId
        ? ({ origin: 'character-prompt', assetId: exactCharacterPromptId } as const)
        : exactSavedPromptId
          ? ({ origin: 'saved-prompt', assetId: exactSavedPromptId } as const)
          : null;
      if (nextRecipe) {
        dispatchActiveRecipe({
          type: 'commit',
          recipe: nextRecipe,
          fingerprint: {
            mode: pending.mode,
            prompt: appliedPrompt,
            referenceImageAssetId: appliedReferenceIdentity,
            assetPrompt: sourceAsset?.prompt ?? pending.prompt,
            assetReferenceImageAssetId: sourceAsset?.referenceImageAssetId ?? null,
          },
        });
      } else {
        dispatchActiveRecipe({ type: 'clear' });
      }

      if (storedReferenceMetadata?.source === 'generated' && referenceMatchesPendingPrompt) {
        repository.enrichNewestMatchingRecent(
          pending.prompt,
          pending.mode,
          storedReferenceMetadata.assetId,
        );
      }
    },
    [dispatchActiveRecipe, repository],
  );

  const rememberPreloadedCharacter = useCallback(
    ({ characterId, snapshot, studioPrompt, referenceImage }: PreloadedCharacter) => {
      selectedSavedPromptRef.current = undefined;
      selectedCharacterPromptRef.current = characterId;
      standaloneRecentCharacterRef.current = null;
      dispatchActiveRecipe({
        type: 'commit',
        recipe: { origin: 'character-prompt', assetId: characterId },
        fingerprint: {
          mode: 'lucy-2.5',
          prompt: studioPrompt,
          referenceImageAssetId: referenceImage?.assetId ?? null,
          assetPrompt: snapshot.prompt,
          assetReferenceImageAssetId: referenceImage?.assetId ?? null,
        },
      });
    },
    [dispatchActiveRecipe],
  );

  const saveBlockedReason = characterBuilderSaveBlockedReason({
    openBlockedReason: characterBuilderOpenBlockedReason,
    shelfDirty,
    canReplaceLucyRecipe: session.canReplaceRecipeDraft('lucy-2.5'),
    referenceUsePending,
  });
  const saveBuiltCharacter = useCharacterStudioPreload({
    repository,
    session,
    saveBlockedReason,
    onStudioPreloaded: rememberPreloadedCharacter,
  });

  return {
    recordCommittedPrompt,
    commitHydratedRecipe,
    saveBuiltCharacter,
    characterBuilderSaveBlockedReason: saveBlockedReason,
  } as const;
};
