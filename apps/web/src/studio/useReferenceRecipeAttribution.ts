import { canonicalPrompt } from '@studio/domain';
import { resolveCharacterVersion } from '@studio/domain';
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
import type { ConfirmationRequest } from '../ui';

export const createPendingReferenceRecipeUse = (
  selection: RecipeSelection,
  store: CreativeAssetStore,
): PendingReferenceRecipeUse => {
  const selectedReferenceAssetId = selection.referenceImageAssetId ?? null;
  const selectedVtonInputKind =
    selection.modelModeId === 'lucy-vton-latest'
      ? (selection.vtonInputKind ?? (selectedReferenceAssetId ? 'saved-outfit' : 'prompt'))
      : null;
  const selectedEnhancePrompt =
    selectedVtonInputKind === 'prompt' ? Boolean(selection.enhancePrompt) : false;
  const linkedRecentPrompt =
    selection.origin === 'recent-prompt' && selection.assetId
      ? store.savedPrompts.find(
          (candidate) =>
            candidate.id === selection.assetId &&
            candidate.modelModeId === selection.modelModeId &&
            canonicalPrompt(candidate.prompt) === canonicalPrompt(selection.prompt) &&
            candidate.referenceImageAssetId === selectedReferenceAssetId &&
            candidate.vtonInputKind === selectedVtonInputKind &&
            candidate.enhancePrompt === selectedEnhancePrompt,
        )
      : null;
  const linkedRecentCharacter =
    selection.origin === 'recent-prompt' && selection.savedCharacterPromptId
      ? store.savedCharacterPrompts.find(
          (candidate) =>
            candidate.id === selection.savedCharacterPromptId &&
            canonicalPrompt(candidate.prompt) === canonicalPrompt(selection.prompt) &&
            resolveCharacterVersion(store, {
              characterId: candidate.id,
              variantId: selection.savedCharacterVariantId ?? null,
            })?.referenceImageAssetId === selectedReferenceAssetId,
        )
      : null;

  return {
    mode: selection.modelModeId,
    prompt: selection.prompt,
    referenceImageAssetId: selectedReferenceAssetId,
    vtonInputKind: selectedVtonInputKind,
    enhancePrompt: selectedEnhancePrompt,
    preserveCurrentReference: false,
    ...(selection.builderDraft ? { builderDraft: selection.builderDraft } : {}),
    ...(selection.characterName ? { characterName: selection.characterName } : {}),
    ...(selection.origin === 'saved-prompt' && selection.assetId
      ? { savedPromptId: selection.assetId }
      : {}),
    ...(linkedRecentPrompt ? { savedPromptId: linkedRecentPrompt.id } : {}),
    ...(linkedRecentCharacter ? { savedCharacterPromptId: linkedRecentCharacter.id } : {}),
    ...(selection.savedCharacterVariantId
      ? { savedCharacterVariantId: selection.savedCharacterVariantId }
      : {}),
    ...(selection.origin === 'character-prompt' && selection.assetId
      ? { savedCharacterPromptId: selection.assetId }
      : {}),
  };
};

export const characterBuilderSaveBlockedReason = ({
  openBlockedReason,
  canReplaceLucyRecipe,
  referenceUsePending,
}: {
  readonly openBlockedReason: string | undefined;
  readonly canReplaceLucyRecipe: boolean;
  readonly referenceUsePending: boolean;
}): string | undefined => {
  if (openBlockedReason) return openBlockedReason;
  if (!canReplaceLucyRecipe) {
    return 'Release the active camera or AI session before Studio can preload Lucy 2.5.';
  }
  return referenceUsePending
    ? 'Wait for the current creative setup to finish before saving this character.'
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
  readonly referenceUsePending: boolean;
  readonly confirmation: ConfirmationRequest;
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
  referenceUsePending,
  confirmation,
}: UseReferenceRecipeAttributionOptions) => {
  const selectedSavedPromptRef = useRef<string | undefined>(undefined);
  const selectedCharacterPromptRef = useRef<string | undefined>(undefined);
  const selectedCharacterVariantRef = useRef<string | undefined>(undefined);
  const standaloneRecentCharacterRef = useRef<StandaloneRecentCharacter | null>(null);

  const recordCommittedPrompt = useCallback<PromptCommittedHandler>(
    (mode, prompt, committedReferenceAssetId) => {
      const committedVtonInputKind =
        mode === 'lucy-vton-latest'
          ? (activeFingerprint?.vtonInputKind ??
            (committedReferenceAssetId ? 'saved-outfit' : 'prompt'))
          : null;
      const committedEnhancePrompt =
        committedVtonInputKind === 'prompt'
          ? (activeFingerprint?.enhancePrompt ?? session.draft.enhance)
          : false;
      const activeRecipeStillMatches = Boolean(
        activeFingerprint &&
        activeFingerprint.mode === mode &&
        canonicalPrompt(activeFingerprint.prompt) === canonicalPrompt(prompt) &&
        activeFingerprint.referenceImageAssetId === committedReferenceAssetId &&
        activeFingerprint.vtonInputKind === committedVtonInputKind &&
        activeFingerprint.enhancePrompt === committedEnhancePrompt &&
        activeFingerprint.referenceImageAssetId === activeFingerprint.assetReferenceImageAssetId,
      );
      const standaloneRecentCharacter =
        standaloneRecentCharacterRef.current?.mode === mode &&
        canonicalPrompt(standaloneRecentCharacterRef.current.prompt) === canonicalPrompt(prompt) &&
        standaloneRecentCharacterRef.current.referenceImageAssetId === committedReferenceAssetId
          ? standaloneRecentCharacterRef.current
          : null;
      void repository.recordSuccessfulPrompt({
        prompt:
          activeRecipeStillMatches && activeFingerprint ? activeFingerprint.assetPrompt : prompt,
        modelModeId: mode,
        referenceImageAssetId: committedReferenceAssetId,
        vtonInputKind: committedVtonInputKind,
        enhancePrompt: committedEnhancePrompt,
        ...(activeRecipeStillMatches && selectedSavedPromptRef.current
          ? { savedPromptId: selectedSavedPromptRef.current }
          : {}),
        ...(activeRecipeStillMatches && selectedCharacterPromptRef.current
          ? { savedCharacterPromptId: selectedCharacterPromptRef.current }
          : {}),
        ...(activeRecipeStillMatches && selectedCharacterVariantRef.current
          ? { savedCharacterVariantId: selectedCharacterVariantRef.current }
          : {}),
        ...(activeRecipeStillMatches && activeCharacterName
          ? { characterName: activeCharacterName }
          : standaloneRecentCharacter
            ? { characterName: standaloneRecentCharacter.characterName }
            : {}),
      });
    },
    [activeCharacterName, activeFingerprint, repository, session.draft.enhance],
  );

  useEffect(() => {
    if (activeRecipe) return;
    selectedSavedPromptRef.current = undefined;
    selectedCharacterPromptRef.current = undefined;
    selectedCharacterVariantRef.current = undefined;
  }, [activeRecipe]);

  const commitHydratedRecipe = useCallback(
    async ({
      pending,
      referenceImage,
      storedReferenceMetadata,
      appliedPrompt,
      referenceMatchesPendingPrompt,
    }: ReferenceRecipeHydrationResult): Promise<void> => {
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
        sourceAsset && 'modelModeId' in sourceAsset ? sourceAsset.modelModeId : 'lucy-latest';
      const appliedReferenceIdentity = referenceIdentity(referenceImage);
      const resolvedCharacterSource = pending.savedCharacterPromptId
        ? resolveCharacterVersion(repositorySnapshot, {
            characterId: pending.savedCharacterPromptId,
            variantId: pending.savedCharacterVariantId ?? null,
          })
        : null;
      const sourceReferenceImageAssetId =
        resolvedCharacterSource?.referenceImageAssetId ??
        sourceAsset?.referenceImageAssetId ??
        null;
      const sourceStillMatches = Boolean(
        sourceAsset &&
        sourceMode === pending.mode &&
        canonicalPrompt(sourceAsset.prompt) === canonicalPrompt(pending.prompt) &&
        sourceReferenceImageAssetId === pending.referenceImageAssetId &&
        ('vtonInputKind' in sourceAsset ? sourceAsset.vtonInputKind : null) ===
          (pending.vtonInputKind ?? null) &&
        ('enhancePrompt' in sourceAsset ? sourceAsset.enhancePrompt : false) ===
          Boolean(pending.enhancePrompt) &&
        appliedReferenceIdentity === sourceReferenceImageAssetId,
      );
      const exactSavedPromptId =
        sourceStillMatches && pending.savedPromptId ? pending.savedPromptId : undefined;
      const exactCharacterPromptId =
        sourceStillMatches && pending.savedCharacterPromptId
          ? pending.savedCharacterPromptId
          : undefined;
      selectedSavedPromptRef.current = exactSavedPromptId;
      selectedCharacterPromptRef.current = exactCharacterPromptId;
      selectedCharacterVariantRef.current =
        exactCharacterPromptId && pending.savedCharacterVariantId
          ? pending.savedCharacterVariantId
          : undefined;
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
        ? ({
            origin: 'character-prompt',
            assetId: exactCharacterPromptId,
            ...(pending.savedCharacterVariantId
              ? { variantId: pending.savedCharacterVariantId }
              : {}),
          } as const)
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
            assetReferenceImageAssetId: sourceReferenceImageAssetId,
            vtonInputKind: pending.vtonInputKind ?? null,
            enhancePrompt: Boolean(pending.enhancePrompt),
            assetVtonInputKind:
              sourceAsset && 'vtonInputKind' in sourceAsset ? sourceAsset.vtonInputKind : null,
            assetEnhancePrompt:
              sourceAsset && 'enhancePrompt' in sourceAsset ? sourceAsset.enhancePrompt : false,
          },
        });
      } else {
        dispatchActiveRecipe({ type: 'clear' });
      }

      if (exactCharacterPromptId) {
        await repository.selectCharacterVersion({
          characterId: exactCharacterPromptId,
          variantId: pending.savedCharacterVariantId ?? null,
        });
      }

      if (storedReferenceMetadata?.source === 'generated' && referenceMatchesPendingPrompt) {
        void repository.enrichNewestMatchingRecent(
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
      selectedCharacterVariantRef.current = undefined;
      standaloneRecentCharacterRef.current = null;
      dispatchActiveRecipe({
        type: 'commit',
        recipe: { origin: 'character-prompt', assetId: characterId },
        fingerprint: {
          mode: 'lucy-latest',
          prompt: studioPrompt,
          referenceImageAssetId: referenceImage?.assetId ?? null,
          assetPrompt: snapshot.prompt,
          assetReferenceImageAssetId: referenceImage?.assetId ?? null,
          vtonInputKind: null,
          enhancePrompt: false,
          assetVtonInputKind: null,
          assetEnhancePrompt: false,
        },
      });
    },
    [dispatchActiveRecipe],
  );

  const saveBlockedReason = characterBuilderSaveBlockedReason({
    openBlockedReason: characterBuilderOpenBlockedReason,
    canReplaceLucyRecipe: session.canReplaceRecipeDraft('lucy-latest'),
    referenceUsePending,
  });
  const saveBuiltCharacter = useCharacterStudioPreload({
    repository,
    session,
    saveBlockedReason,
    confirmation,
    onStudioPreloaded: rememberPreloadedCharacter,
  });

  return {
    recordCommittedPrompt,
    commitHydratedRecipe,
    saveBuiltCharacter,
    characterBuilderSaveBlockedReason: saveBlockedReason,
  } as const;
};
