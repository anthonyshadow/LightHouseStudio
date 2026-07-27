import type { ReferenceImageAsset } from '@studio/contracts';
import { canonicalPrompt } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiClientError,
  fetchReferenceImageMetadata,
  hydrateReferenceImage,
} from '../adapters/api-client/apiClient';
import type { ModelMode } from '../application/types';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
} from '../features/creative-assets/types';
import type { RecipeSelection } from '../features/creative-assets/RecipeShelf.types';
import { useRecipeLibraryMode } from '../features/creative-assets/useRecipeLibraryMode';
import {
  useCharacterStudioPreload,
  type PreloadedCharacter,
} from '../features/character-builder/useCharacterStudioPreload';
import { confirmModeReplacement } from '../features/media-session/draftPolicy';
import type {
  SessionReferenceImage,
  StudioMode,
  StudioSessionController,
} from '../features/media-session/types';
import type {
  PromptWorkshopAction,
  SavePromptWorkshopAction,
} from '../features/prompt-authoring/CharacterPromptWorkshop';
import type { PromptBuilderDraft } from '../features/prompt-authoring/model';
import { useWorkshopDrafts } from '../features/prompt-authoring/useWorkshopDrafts';
import {
  isExactActiveRecipe,
  referenceIdentity,
  type ActiveRecipeFingerprint,
  type ActiveStudioRecipe,
  type RecipeAsset,
} from './referenceRecipeIdentity';

export { isExactActiveRecipe } from './referenceRecipeIdentity';
export type { ActiveStudioRecipe } from './referenceRecipeIdentity';

export type PromptCommittedHandler = (
  mode: ModelMode,
  prompt: string,
  referenceImageAssetId: string | null,
) => void;

type PendingReferenceUse = {
  mode: ModelMode;
  prompt: string;
  referenceImageAssetId: string | null;
  preserveCurrentReference: boolean;
  builderDraft?: PromptBuilderDraft;
  savedPromptId?: string;
  savedCharacterPromptId?: string;
  characterName?: string;
  destination: 'shelf' | 'workshop';
};

const referenceHydrationError = (error: unknown): string =>
  error instanceof ApiClientError && error.code === 'not_found'
    ? 'This local reference asset is no longer available. Retry after restoring the data directory, or continue without it.'
    : 'The exact local reference could not be validated. Retry, or continue without the reference.';

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
  const [activeRecipe, setActiveRecipe] = useState<ActiveStudioRecipe>(null);
  const [referenceUsePending, setReferenceUsePending] = useState(false);
  const [referenceUseFailureMessage, setReferenceUseFailureMessage] = useState<string | null>(null);
  const library = useRecipeLibraryMode(session.draft.mode);
  const { mode: resolvedLibraryMode, dirty: shelfDirty } = library;
  const pendingReferenceUseRef = useRef<PendingReferenceUse | null>(null);
  const referenceUsePendingRef = useRef(false);
  const selectedSavedPrompt = useRef<string | undefined>(undefined);
  const selectedCharacterPrompt = useRef<string | undefined>(undefined);
  const standaloneRecentCharacterRef = useRef<{
    mode: ModelMode;
    prompt: string;
    referenceImageAssetId: string | null;
    characterName: string;
  } | null>(null);
  const workshopSourceRecipeRef = useRef<ActiveStudioRecipe>(null);
  const [activeRecipeFingerprint, setActiveRecipeFingerprint] =
    useState<ActiveRecipeFingerprint | null>(null);

  const workshop = useWorkshopDrafts();

  const activeRecipeAsset = useMemo<RecipeAsset | null>(() => {
    if (!activeRecipe) return null;
    const assets =
      activeRecipe.origin === 'character-prompt' ? store.savedCharacterPrompts : store.savedPrompts;
    return assets.find((candidate) => candidate.id === activeRecipe.assetId) ?? null;
  }, [activeRecipe, store.savedCharacterPrompts, store.savedPrompts]);

  const activeRecipeIsExact = Boolean(
    activeRecipe &&
    activeRecipeAsset &&
    (!activeRecipeFingerprint ||
      isExactActiveRecipe({
        fingerprint: activeRecipeFingerprint,
        asset: activeRecipeAsset,
        draft: session.draft,
      })),
  );
  const resolvedActiveRecipe = activeRecipeIsExact ? activeRecipe : null;
  const resolvedActiveRecipeFingerprint = activeRecipeIsExact ? activeRecipeFingerprint : null;
  const activeCharacterName =
    resolvedActiveRecipe?.origin === 'character-prompt' &&
    activeRecipeAsset &&
    'name' in activeRecipeAsset
      ? activeRecipeAsset.name
      : undefined;
  const activeCharacter =
    activeCharacterName && activeRecipeAsset && 'name' in activeRecipeAsset
      ? {
          id: activeRecipeAsset.id,
          name: activeCharacterName,
          referenceImageAssetId: activeRecipeAsset.referenceImageAssetId,
        }
      : null;
  const activeRecipeLabel =
    resolvedActiveRecipe?.origin === 'saved-prompt' &&
    activeRecipeAsset &&
    'title' in activeRecipeAsset
      ? activeRecipeAsset.title
      : activeCharacterName;

  const recordCommittedPrompt = useCallback<PromptCommittedHandler>(
    (mode, prompt, committedReferenceAssetId) => {
      const activeFingerprint = resolvedActiveRecipeFingerprint;
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
      let libraryPrompt = prompt;
      if (activeRecipeStillMatches && activeFingerprint) {
        libraryPrompt = activeFingerprint.assetPrompt;
      }
      repository.recordSuccessfulPrompt({
        prompt: libraryPrompt,
        modelModeId: mode,
        referenceImageAssetId: committedReferenceAssetId,
        ...(activeRecipeStillMatches && selectedSavedPrompt.current
          ? { savedPromptId: selectedSavedPrompt.current }
          : {}),
        ...(activeRecipeStillMatches && selectedCharacterPrompt.current
          ? { savedCharacterPromptId: selectedCharacterPrompt.current }
          : {}),
        ...(activeRecipeStillMatches && activeCharacterName
          ? { characterName: activeCharacterName }
          : standaloneRecentCharacter
            ? { characterName: standaloneRecentCharacter.characterName }
            : {}),
      });
    },
    [activeCharacterName, repository, resolvedActiveRecipeFingerprint],
  );

  useEffect(() => {
    if (resolvedActiveRecipe) return;
    selectedSavedPrompt.current = undefined;
    selectedCharacterPrompt.current = undefined;
  }, [resolvedActiveRecipe]);

  const selectModeWithDraftProtection = useCallback(
    (mode: StudioMode): boolean =>
      !mediaLocked &&
      confirmModeReplacement(session.draft, mode, (message) => window.confirm(message)) &&
      session.selectMode(mode),
    [mediaLocked, session],
  );

  const commitReferenceUse = useCallback(
    async (pending: PendingReferenceUse, continueWithoutReference = false): Promise<void> => {
      if (mediaLocked || referenceUsePendingRef.current) return;
      if (
        pending.mode !== session.draft.mode &&
        !confirmModeReplacement(session.draft, pending.mode, (message) => window.confirm(message))
      ) {
        return;
      }

      pendingReferenceUseRef.current = pending;
      setReferenceUseFailureMessage(null);
      referenceUsePendingRef.current = true;
      setReferenceUsePending(true);
      let referenceImage: SessionReferenceImage | null = null;
      let storedReferenceMetadata: ReferenceImageAsset | null = null;
      try {
        if (pending.referenceImageAssetId && !continueWithoutReference) {
          const storedReference = await fetchReferenceImageMetadata(pending.referenceImageAssetId);
          storedReferenceMetadata = storedReference;
          referenceImage = await hydrateReferenceImage(
            pending.referenceImageAssetId,
            storedReference,
          );
        } else if (pending.preserveCurrentReference && !continueWithoutReference) {
          referenceImage = session.draft.referenceImage;
        }

        const generatedLucyReference =
          pending.mode === 'lucy-2.5' && storedReferenceMetadata?.source === 'generated';
        const appliedPrompt =
          pending.mode === 'lucy-2.5' && storedReferenceMetadata?.source === 'generated'
            ? storedReferenceMetadata.lucy25CharacterPrompt
            : pending.prompt;
        const committed = session.replaceRecipeDraft({
          mode: pending.mode,
          prompt: appliedPrompt,
          referenceImage,
          enhance: generatedLucyReference,
        });
        if (!committed) {
          setReferenceUseFailureMessage(
            'Release the active camera or AI session, then retry this complete recipe handoff.',
          );
          return;
        }

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
        const referenceMatchesPendingPrompt =
          storedReferenceMetadata?.source !== 'generated' ||
          canonicalPrompt(storedReferenceMetadata.originalPrompt) ===
            canonicalPrompt(pending.prompt);
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
        selectedSavedPrompt.current = exactSavedPromptId;
        selectedCharacterPrompt.current = exactCharacterPromptId;
        standaloneRecentCharacterRef.current =
          !exactCharacterPromptId && pending.characterName
            ? {
                mode: pending.mode,
                prompt: appliedPrompt,
                referenceImageAssetId: appliedReferenceIdentity,
                characterName: pending.characterName,
              }
            : null;
        const nextActiveRecipe: ActiveStudioRecipe = exactCharacterPromptId
          ? { origin: 'character-prompt', assetId: exactCharacterPromptId }
          : exactSavedPromptId
            ? { origin: 'saved-prompt', assetId: exactSavedPromptId }
            : null;
        setActiveRecipe(nextActiveRecipe);
        setActiveRecipeFingerprint(
          nextActiveRecipe
            ? {
                mode: pending.mode,
                prompt: appliedPrompt,
                referenceImageAssetId: appliedReferenceIdentity,
                assetPrompt: sourceAsset?.prompt ?? pending.prompt,
                assetReferenceImageAssetId: sourceAsset?.referenceImageAssetId ?? null,
              }
            : null,
        );
        if (pending.builderDraft && pending.builderDraft.intent !== 'character-transform') {
          workshop.rememberDraft(pending.builderDraft);
        }
        if (storedReferenceMetadata?.source === 'generated' && referenceMatchesPendingPrompt) {
          repository.enrichNewestMatchingRecent(
            pending.prompt,
            pending.mode,
            storedReferenceMetadata.assetId,
          );
        }
        if (pending.destination === 'workshop') workshopSourceRecipeRef.current = null;
        pendingReferenceUseRef.current = null;
        setReferenceUseFailureMessage(null);
        closeOverlay();
      } catch (error) {
        setReferenceUseFailureMessage(referenceHydrationError(error));
      } finally {
        referenceUsePendingRef.current = false;
        setReferenceUsePending(false);
      }
    },
    [closeOverlay, mediaLocked, repository, session, workshop],
  );

  const useRecipe = useCallback(
    (selection: RecipeSelection) => {
      const selectedReferenceAssetId = selection.referenceImageAssetId ?? null;
      const linkedRecentPrompt =
        selection.origin === 'recent-prompt' && selection.assetId
          ? repository
              .getSnapshot()
              .store.savedPrompts.find(
                (candidate) =>
                  candidate.id === selection.assetId &&
                  candidate.modelModeId === selection.modelModeId &&
                  canonicalPrompt(candidate.prompt) === canonicalPrompt(selection.prompt) &&
                  candidate.referenceImageAssetId === selectedReferenceAssetId,
              )
          : null;
      const linkedRecentCharacter =
        selection.origin === 'recent-prompt' && selection.savedCharacterPromptId
          ? repository
              .getSnapshot()
              .store.savedCharacterPrompts.find(
                (candidate) =>
                  candidate.id === selection.savedCharacterPromptId &&
                  canonicalPrompt(candidate.prompt) === canonicalPrompt(selection.prompt) &&
                  candidate.referenceImageAssetId === selectedReferenceAssetId,
              )
          : null;
      const pending: PendingReferenceUse = {
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
      void commitReferenceUse(pending);
    },
    [commitReferenceUse, repository],
  );

  const retryReferenceUse = useCallback(() => {
    const pending = pendingReferenceUseRef.current;
    if (pending) void commitReferenceUse(pending);
  }, [commitReferenceUse]);

  const continueReferenceUseWithoutImage = useCallback(() => {
    const pending = pendingReferenceUseRef.current;
    if (pending) void commitReferenceUse(pending, true);
  }, [commitReferenceUse]);

  const characterBuilderSaveBlockedReason = (() => {
    if (characterBuilderOpenBlockedReason) return characterBuilderOpenBlockedReason;
    if (shelfDirty) {
      return 'Save or discard the unfinished Recipe Shelf changes before saving this character.';
    }
    if (!session.canReplaceRecipeDraft('lucy-2.5')) {
      return 'Release the active camera or AI session before Studio can preload Lucy 2.5.';
    }
    return referenceUsePending
      ? 'Wait for the current recipe handoff to finish before saving this character.'
      : undefined;
  })();

  const rememberPreloadedCharacter = useCallback(
    ({ characterId, snapshot, studioPrompt, referenceImage }: PreloadedCharacter) => {
      selectedSavedPrompt.current = undefined;
      selectedCharacterPrompt.current = characterId;
      standaloneRecentCharacterRef.current = null;
      setActiveRecipe({ origin: 'character-prompt', assetId: characterId });
      setActiveRecipeFingerprint({
        mode: 'lucy-2.5',
        prompt: studioPrompt,
        referenceImageAssetId: referenceImage?.assetId ?? null,
        assetPrompt: snapshot.prompt,
        assetReferenceImageAssetId: referenceImage?.assetId ?? null,
      });
    },
    [],
  );
  const saveBuiltCharacter = useCharacterStudioPreload({
    repository,
    session,
    saveBlockedReason: characterBuilderSaveBlockedReason,
    onStudioPreloaded: rememberPreloadedCharacter,
  });

  const openSavedWorkshop = useCallback(
    (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => {
      if (recordingActive) return;
      if (draft.intent === 'character-transform') return;
      if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
      workshopSourceRecipeRef.current = { origin: 'character-prompt', assetId: asset.id };
      workshop.rememberDraft(draft);
      openWorkshopOverlay();
    },
    [
      openWorkshopOverlay,
      recordingActive,
      workshop,
      selectModeWithDraftProtection,
      session.draft.mode,
    ],
  );

  const applyWorkshopPrompt = useCallback(
    (action: PromptWorkshopAction) => {
      const sourceRecipe = workshopSourceRecipeRef.current;
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
      const sourceStillMatches =
        sourceAsset &&
        !preserveCurrentReference &&
        (sourceRecipe?.origin !== 'saved-prompt' ||
          ('modelModeId' in sourceAsset && sourceAsset.modelModeId === 'lucy-2.5')) &&
        canonicalPrompt(sourceAsset.prompt) === canonicalPrompt(action.prompt) &&
        sourceAsset.referenceImageAssetId === action.referenceImageAssetId;
      void commitReferenceUse({
        mode: 'lucy-2.5',
        prompt: action.prompt,
        referenceImageAssetId: action.referenceImageAssetId,
        preserveCurrentReference,
        builderDraft: action.draft,
        destination: 'workshop',
        ...(sourceStillMatches && sourceRecipe?.origin === 'character-prompt'
          ? { savedCharacterPromptId: sourceRecipe.assetId }
          : {}),
        ...(sourceStillMatches && sourceRecipe?.origin === 'saved-prompt'
          ? { savedPromptId: sourceRecipe.assetId }
          : {}),
      });
    },
    [commitReferenceUse, repository, session.draft.referenceImage],
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
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    workshopSourceRecipeRef.current = resolvedActiveRecipe;
    openWorkshopOverlay();
  }, [
    resolvedActiveRecipe,
    openWorkshopOverlay,
    recordingActive,
    selectModeWithDraftProtection,
    session.draft.mode,
  ]);

  const recipeInsertionBlocked =
    mediaLocked || (sessionModeLocked && session.draft.mode !== resolvedLibraryMode);

  return {
    state: {
      activeRecipe: resolvedActiveRecipe,
      activeCharacter,
      activeCharacterName,
      activeRecipeLabel,
      libraryMode: resolvedLibraryMode,
      workshopDraft: workshop.draft,
      workshopDrafts: workshop.drafts,
      referenceUsePending,
      referenceUseFailureMessage,
      shelfDirty,
      recipeInsertionBlocked,
      characterBuilderSaveBlockedReason,
    },
    actions: {
      recordCommittedPrompt,
      changeLibraryMode: library.changeMode,
      rememberWorkshopDraft: workshop.rememberDraft,
      setShelfDirty: library.setDirty,
      useRecipe,
      retryReferenceUse,
      continueReferenceUseWithoutImage,
      saveBuiltCharacter,
      openSavedWorkshop,
      applyWorkshopPrompt,
      saveWorkshopPrompt,
      openWorkshop,
    },
  } as const;
};
