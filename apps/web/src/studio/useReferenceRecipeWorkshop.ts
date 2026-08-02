import { canonicalPrompt } from '@studio/domain';
import { useCallback, useRef } from 'react';
import type {
  CreativeAssetRepository,
  SavedCharacterPrompt,
} from '../features/creative-assets/types';
import type { StudioSessionController } from '../features/media-session/types';
import type {
  PromptWorkshopAction,
  SavePromptWorkshopAction,
} from '../features/prompt-authoring/CharacterPromptWorkshop';
import type { PromptBuilderDraft } from '../features/prompt-authoring/model';
import { useWorkshopDrafts } from '../features/prompt-authoring/useWorkshopDrafts';
import type { ActiveStudioRecipe } from './referenceRecipeIdentity';
import type { PendingReferenceRecipeUse } from './useReferenceRecipeHydration';

type UseReferenceRecipeWorkshopOptions = {
  readonly repository: CreativeAssetRepository;
  readonly session: StudioSessionController;
  readonly recordingActive: boolean;
  readonly activeRecipe: ActiveStudioRecipe;
  readonly selectLucyMode: () => boolean;
  readonly openWorkshopOverlay: () => void;
};

/** Coordinates Workshop source identity, per-intent drafts, open policy, use, and save. */
export const useReferenceRecipeWorkshop = ({
  repository,
  session,
  recordingActive,
  activeRecipe,
  selectLucyMode,
  openWorkshopOverlay,
}: UseReferenceRecipeWorkshopOptions) => {
  const drafts = useWorkshopDrafts();
  const sourceRecipeRef = useRef<ActiveStudioRecipe>(null);

  const openSavedWorkshop = useCallback(
    (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => {
      if (recordingActive || draft.intent === 'character-transform') return;
      if (session.draft.mode !== 'lucy-latest' && !selectLucyMode()) return;
      sourceRecipeRef.current = { origin: 'character-prompt', assetId: asset.id };
      drafts.rememberDraft(draft);
      openWorkshopOverlay();
    },
    [drafts, openWorkshopOverlay, recordingActive, selectLucyMode, session.draft.mode],
  );

  const createPendingUse = useCallback(
    (action: PromptWorkshopAction): PendingReferenceRecipeUse => {
      const sourceRecipe = sourceRecipeRef.current;
      const repositorySnapshot = repository.getSnapshot().store;
      const sourceAsset = sourceRecipe
        ? sourceRecipe.origin === 'character-prompt'
          ? repositorySnapshot.savedCharacterPrompts.find(
              (candidate) => candidate.id === sourceRecipe.assetId,
            )
          : repositorySnapshot.savedPrompts.find(
              (candidate) => candidate.id === sourceRecipe.assetId,
            )
        : null;
      const preserveCurrentReference =
        action.referenceImageAssetId === null && session.draft.referenceImage?.kind === 'ephemeral';
      const sourceStillMatches = Boolean(
        sourceAsset &&
        !preserveCurrentReference &&
        (sourceRecipe?.origin !== 'saved-prompt' ||
          ('modelModeId' in sourceAsset && sourceAsset.modelModeId === 'lucy-latest')) &&
        canonicalPrompt(sourceAsset.prompt) === canonicalPrompt(action.prompt) &&
        sourceAsset.referenceImageAssetId === action.referenceImageAssetId,
      );
      return {
        mode: 'lucy-latest',
        prompt: action.prompt,
        referenceImageAssetId: action.referenceImageAssetId,
        vtonInputKind: null,
        enhancePrompt: false,
        preserveCurrentReference,
        builderDraft: action.draft,
        destination: 'workshop',
        ...(sourceStillMatches && sourceRecipe?.origin === 'character-prompt'
          ? { savedCharacterPromptId: sourceRecipe.assetId }
          : {}),
        ...(sourceStillMatches && sourceRecipe?.origin === 'saved-prompt'
          ? { savedPromptId: sourceRecipe.assetId }
          : {}),
      };
    },
    [repository, session.draft.referenceImage],
  );

  const completeUse = useCallback(
    (pending: PendingReferenceRecipeUse) => {
      if (pending.builderDraft && pending.builderDraft.intent !== 'character-transform') {
        drafts.rememberDraft(pending.builderDraft);
      }
      if (pending.destination === 'workshop') sourceRecipeRef.current = null;
    },
    [drafts],
  );

  const saveWorkshopPrompt = useCallback(
    (action: SavePromptWorkshopAction) => {
      repository.createSavedCharacterPrompt({
        name: action.name,
        prompt: action.prompt,
        source: 'generator',
        promptIntent: action.draft.intent,
        builderDraft: action.draft,
        referenceImageStatus:
          session.draft.referenceImage?.kind === 'ephemeral'
            ? 'session-portrait-not-saved'
            : 'prompt-only',
        referenceImageAssetId: null,
      });
    },
    [repository, session.draft.referenceImage],
  );

  const openWorkshop = useCallback(() => {
    if (recordingActive) return;
    if (session.draft.mode !== 'lucy-latest' && !selectLucyMode()) return;
    sourceRecipeRef.current = activeRecipe;
    openWorkshopOverlay();
  }, [activeRecipe, openWorkshopOverlay, recordingActive, selectLucyMode, session.draft.mode]);

  return {
    draft: drafts.draft,
    drafts: drafts.drafts,
    rememberDraft: drafts.rememberDraft,
    openSavedWorkshop,
    createPendingUse,
    completeUse,
    saveWorkshopPrompt,
    openWorkshop,
  } as const;
};
