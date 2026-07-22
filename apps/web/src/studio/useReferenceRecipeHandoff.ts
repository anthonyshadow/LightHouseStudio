import type { CreateReferenceImageRequest, ReferenceImageAsset } from '@studio/contracts';
import { canonicalPrompt } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiClientError,
  createReferenceImage,
  fetchReferenceImageMetadata,
  hydrateReferenceImage,
} from '../adapters/api-client/apiClient';
import type { ModelMode } from '../application/types';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../features/creative-assets/types';
import type { RecipeSelection } from '../features/creative-assets/RecipeShelf.types';
import type {
  CharacterSaveProgress,
  CharacterSaveSnapshot,
  CharacterSaveStage,
} from '../features/character-builder/useCharacterBuilderController';
import { confirmModeReplacement } from '../features/media-session/draftPolicy';
import type {
  SessionDraft,
  SessionReferenceImage,
  StudioMode,
  StudioSessionController,
} from '../features/media-session/types';
import type {
  PromptWorkshopAction,
  SavePromptWorkshopAction,
  WorkshopReferenceGenerationInput,
} from '../features/prompt-authoring/CharacterPromptWorkshop';
import type { PromptBuilderDraft, PromptIntent } from '../features/prompt-authoring/model';
import type {
  ReferenceGenerationState,
  WorkshopReferenceImage,
} from '../features/prompt-authoring/ReferenceImageGenerator';
import { canReplaceDirtyLibraryMode } from './studioPolicies';

export type ActiveStudioRecipe = {
  origin: 'character-prompt' | 'saved-prompt';
  assetId: string;
} | null;

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
  destination: 'shelf' | 'workshop';
};

type ActiveRecipeFingerprint = {
  mode: StudioMode;
  prompt: string;
  referenceImageAssetId: string | null;
  assetPrompt: string;
  assetReferenceImageAssetId: string | null;
};

type RecipeAsset = SavedCharacterPrompt | SavedPrompt;

type ExactActiveRecipeInput = {
  readonly fingerprint: ActiveRecipeFingerprint;
  readonly asset: RecipeAsset;
  readonly draft: Pick<SessionDraft, 'mode' | 'prompt' | 'referenceImage'>;
};

const EPHEMERAL_REFERENCE_IDENTITY = 'session:ephemeral-reference';

const referenceIdentity = (reference: SessionReferenceImage | null): string | null =>
  reference?.kind === 'persisted'
    ? reference.assetId
    : reference?.kind === 'ephemeral'
      ? EPHEMERAL_REFERENCE_IDENTITY
      : null;

/** Active shelf identity is retained only while both the draft and stored asset remain exact. */
export const isExactActiveRecipe = ({
  fingerprint,
  asset,
  draft,
}: ExactActiveRecipeInput): boolean => {
  const assetMode = 'modelModeId' in asset ? asset.modelModeId : 'lucy-2.5';
  return (
    draft.mode === fingerprint.mode &&
    canonicalPrompt(draft.prompt) === canonicalPrompt(fingerprint.prompt) &&
    referenceIdentity(draft.referenceImage) === fingerprint.referenceImageAssetId &&
    assetMode === fingerprint.mode &&
    canonicalPrompt(asset.prompt) === canonicalPrompt(fingerprint.assetPrompt) &&
    asset.referenceImageAssetId === fingerprint.assetReferenceImageAssetId &&
    fingerprint.referenceImageAssetId === fingerprint.assetReferenceImageAssetId
  );
};

const referenceGenerationError = (error: unknown): string => {
  if (!(error instanceof ApiClientError)) {
    return 'The local server could not create the reference. Check the connection and try again.';
  }
  switch (error.code) {
    case 'moderation_blocked':
      return 'OpenAI blocked this character request. Adjust the character description and try again.';
    case 'rate_limited':
    case 'provider_quota':
      return 'OpenAI is temporarily limiting image generation. Wait a moment, then retry.';
    case 'provider_configuration':
    case 'provider_authentication':
      return 'Reference generation is not configured correctly on this local server.';
    case 'request_timeout':
      return 'Generation timed out before a safe asset was stored. Retry with a new request.';
    case 'invalid_provider_image':
      return 'OpenAI returned an image that failed local validation. Retry the generation.';
    case 'storage_failure':
      return 'The image was created but could not be saved locally. Check the data directory and retry.';
    case 'generation_in_progress':
      return 'Another reference is already being created. Wait for it to finish, then retry.';
    default:
      return error.message || 'Reference generation failed before the current image could change.';
  }
};

const referenceHydrationError = (error: unknown): string =>
  error instanceof ApiClientError && error.code === 'not_found'
    ? 'This local reference asset is no longer available. Retry after restoring the data directory, or continue without it.'
    : 'The exact local reference could not be validated. Retry, or continue without the reference.';

const toWorkshopReferenceImage = (
  asset: ReferenceImageAsset,
  generatedFromPrompt = asset.originalPrompt,
): WorkshopReferenceImage => ({ ...asset, generatedFromPrompt });

type UseReferenceRecipeHandoffOptions = {
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly session: StudioSessionController;
  readonly referenceImagesAvailable: boolean;
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
  referenceImagesAvailable,
  mediaLocked,
  recordingActive,
  sessionModeLocked,
  characterBuilderOpenBlockedReason,
  openWorkshopOverlay,
  closeOverlay,
}: UseReferenceRecipeHandoffOptions) => {
  const [activeRecipe, setActiveRecipe] = useState<ActiveStudioRecipe>(null);
  const [libraryMode, setLibraryMode] = useState<ModelMode>('lucy-2.5');
  const [workshopDraft, setWorkshopDraft] = useState<PromptBuilderDraft | undefined>();
  const [workshopDrafts, setWorkshopDrafts] = useState<
    Partial<Record<PromptIntent, PromptBuilderDraft>>
  >({});
  const [workshopReferenceImage, setWorkshopReferenceImage] =
    useState<WorkshopReferenceImage | null>(null);
  const [referenceGeneration, setReferenceGeneration] = useState<ReferenceGenerationState>({
    status: 'idle',
    error: null,
  });
  const [referenceUsePending, setReferenceUsePending] = useState(false);
  const [referenceUseFailureMessage, setReferenceUseFailureMessage] = useState<string | null>(null);
  const [shelfDirty, setShelfDirty] = useState(false);
  if (session.draft.mode !== 'local' && !shelfDirty && libraryMode !== session.draft.mode) {
    setLibraryMode(session.draft.mode);
  }
  const generationRequestRef = useRef<string | null>(null);
  const workshopRevisionRef = useRef(0);
  const referenceRestoreRef = useRef<{ assetId: string; prompt: string } | null>(null);
  const pendingReferenceUseRef = useRef<PendingReferenceUse | null>(null);
  const referenceUsePendingRef = useRef(false);
  const selectedSavedPrompt = useRef<string | undefined>(undefined);
  const selectedCharacterPrompt = useRef<string | undefined>(undefined);
  const workshopSourceRecipeRef = useRef<ActiveStudioRecipe>(null);
  const [activeRecipeFingerprint, setActiveRecipeFingerprint] =
    useState<ActiveRecipeFingerprint | null>(null);

  const rememberWorkshopDraft = useCallback((draft: PromptBuilderDraft) => {
    workshopRevisionRef.current += 1;
    setWorkshopDraft(draft);
    setWorkshopDrafts((current) => ({ ...current, [draft.intent]: draft }));
  }, []);

  const recordCommittedPrompt = useCallback<PromptCommittedHandler>(
    (mode, prompt, committedReferenceAssetId) => {
      const activeFingerprint = activeRecipeFingerprint;
      const activeRecipeStillMatches = Boolean(
        activeFingerprint &&
        activeFingerprint.mode === mode &&
        canonicalPrompt(activeFingerprint.prompt) === canonicalPrompt(prompt) &&
        activeFingerprint.referenceImageAssetId === committedReferenceAssetId &&
        activeFingerprint.referenceImageAssetId === activeFingerprint.assetReferenceImageAssetId,
      );
      const matchingGeneratedReference =
        !activeRecipeStillMatches &&
        mode === 'lucy-2.5' &&
        committedReferenceAssetId !== null &&
        workshopReferenceImage?.assetId === committedReferenceAssetId
          ? workshopReferenceImage
          : null;
      let libraryPrompt = prompt;
      if (activeRecipeStillMatches && activeFingerprint) {
        libraryPrompt = activeFingerprint.assetPrompt;
      } else if (
        matchingGeneratedReference &&
        canonicalPrompt(prompt) ===
          canonicalPrompt(matchingGeneratedReference.lucy25CharacterPrompt)
      ) {
        libraryPrompt = matchingGeneratedReference.originalPrompt;
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
      });
    },
    [activeRecipeFingerprint, repository, workshopReferenceImage],
  );

  const generateWorkshopReference = useCallback(
    async (input: WorkshopReferenceGenerationInput, signal: AbortSignal): Promise<void> => {
      if (!referenceImagesAvailable || generationRequestRef.current) return;
      const requestId = crypto.randomUUID();
      const revision = workshopRevisionRef.current;
      const request: CreateReferenceImageRequest = { requestId, ...input };
      generationRequestRef.current = requestId;
      setReferenceGeneration({ status: 'generating', error: null });

      try {
        const asset = await createReferenceImage(request, signal);
        if (workshopRevisionRef.current !== revision) return;
        setWorkshopReferenceImage(toWorkshopReferenceImage(asset, input.rawPrompt));
        setReferenceGeneration({ status: 'idle', error: null });
        referenceRestoreRef.current = { assetId: asset.assetId, prompt: input.rawPrompt };
        repository.enrichNewestMatchingRecent(input.rawPrompt, 'lucy-2.5', asset.assetId);
      } catch (error: unknown) {
        if (signal.aborted || workshopRevisionRef.current !== revision) return;
        setReferenceGeneration({
          status: 'error',
          error: referenceGenerationError(error),
          errorKind: 'generation',
        });
      } finally {
        if (generationRequestRef.current === requestId) {
          generationRequestRef.current = null;
          if (signal.aborted || workshopRevisionRef.current !== revision) {
            setReferenceGeneration({ status: 'idle', error: null });
          }
        }
      }
    },
    [referenceImagesAvailable, repository],
  );

  const restoreWorkshopReference = useCallback(
    (assetId: string, prompt: string) => {
      const revision = workshopRevisionRef.current;
      referenceRestoreRef.current = { assetId, prompt };
      setReferenceGeneration({ status: 'restoring', error: null });
      void fetchReferenceImageMetadata(assetId)
        .then((asset) => {
          if (workshopRevisionRef.current !== revision) return;
          setWorkshopReferenceImage(toWorkshopReferenceImage(asset));
          setReferenceGeneration({ status: 'idle', error: null });
          repository.enrichNewestMatchingRecent(prompt, 'lucy-2.5', asset.assetId);
        })
        .catch((error: unknown) => {
          if (workshopRevisionRef.current !== revision) return;
          setWorkshopReferenceImage(null);
          setReferenceGeneration({
            status: 'error',
            error: referenceHydrationError(error),
            errorKind: 'restore',
          });
        });
    },
    [repository],
  );

  const detachWorkshopReference = useCallback(() => {
    workshopRevisionRef.current += 1;
    referenceRestoreRef.current = null;
    setWorkshopReferenceImage(null);
    setReferenceGeneration({ status: 'idle', error: null });
  }, []);

  const retryWorkshopReferenceRestore = useCallback(() => {
    const restore = referenceRestoreRef.current;
    if (restore) restoreWorkshopReference(restore.assetId, restore.prompt);
  }, [restoreWorkshopReference]);

  const activeRecipeAsset = useMemo<RecipeAsset | null>(() => {
    if (!activeRecipe) return null;
    return activeRecipe.origin === 'character-prompt'
      ? (store.savedCharacterPrompts.find((candidate) => candidate.id === activeRecipe.assetId) ??
          null)
      : (store.savedPrompts.find((candidate) => candidate.id === activeRecipe.assetId) ?? null);
  }, [activeRecipe, store.savedCharacterPrompts, store.savedPrompts]);

  const activeCharacterName =
    activeRecipe?.origin === 'character-prompt' && activeRecipeAsset && 'name' in activeRecipeAsset
      ? activeRecipeAsset.name
      : undefined;

  const activeRecipeInvalid = Boolean(
    activeRecipe &&
    (!activeRecipeAsset ||
      (activeRecipeFingerprint &&
        !isExactActiveRecipe({
          fingerprint: activeRecipeFingerprint,
          asset: activeRecipeAsset,
          draft: session.draft,
        }))),
  );
  if (activeRecipeInvalid) {
    setActiveRecipe(null);
    setActiveRecipeFingerprint(null);
  }

  useEffect(() => {
    if (activeRecipe) return;
    selectedSavedPrompt.current = undefined;
    selectedCharacterPrompt.current = undefined;
  }, [activeRecipe]);

  const changeLibraryMode = useCallback(
    (mode: ModelMode) => {
      if (mode === libraryMode) return;
      if (
        !canReplaceDirtyLibraryMode(shelfDirty, () =>
          window.confirm('Switch recipe models and discard the unsaved shelf form changes?'),
        )
      ) {
        return;
      }
      setShelfDirty(false);
      setLibraryMode(mode);
    },
    [libraryMode, shelfDirty],
  );

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
      let referenceMetadata: WorkshopReferenceImage | null = null;
      try {
        if (pending.referenceImageAssetId && !continueWithoutReference) {
          const storedReference = await fetchReferenceImageMetadata(pending.referenceImageAssetId);
          referenceMetadata = toWorkshopReferenceImage(storedReference);
          referenceImage = await hydrateReferenceImage(
            pending.referenceImageAssetId,
            referenceMetadata,
          );
        } else if (pending.preserveCurrentReference && !continueWithoutReference) {
          referenceImage = session.draft.referenceImage;
        }

        const generatedLucyReference = pending.mode === 'lucy-2.5' && referenceMetadata !== null;
        const appliedPrompt =
          pending.mode === 'lucy-2.5' && referenceMetadata
            ? referenceMetadata.lucy25CharacterPrompt
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
          !referenceMetadata ||
          canonicalPrompt(referenceMetadata.originalPrompt) === canonicalPrompt(pending.prompt);
        const sourceStillMatches = Boolean(
          sourceAsset &&
          sourceMode === pending.mode &&
          canonicalPrompt(sourceAsset.prompt) === canonicalPrompt(pending.prompt) &&
          sourceAsset.referenceImageAssetId === pending.referenceImageAssetId &&
          appliedReferenceIdentity === sourceAsset.referenceImageAssetId &&
          referenceMatchesPendingPrompt,
        );
        const exactSavedPromptId =
          sourceStillMatches && pending.savedPromptId ? pending.savedPromptId : undefined;
        const exactCharacterPromptId =
          sourceStillMatches && pending.savedCharacterPromptId
            ? pending.savedCharacterPromptId
            : undefined;
        selectedSavedPrompt.current = exactSavedPromptId;
        selectedCharacterPrompt.current = exactCharacterPromptId;
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
        if (pending.builderDraft) rememberWorkshopDraft(pending.builderDraft);
        workshopRevisionRef.current += 1;
        setWorkshopReferenceImage(referenceMetadata);
        setReferenceGeneration({ status: 'idle', error: null });
        referenceRestoreRef.current = referenceMetadata
          ? { assetId: referenceMetadata.assetId, prompt: pending.prompt }
          : null;
        if (referenceMetadata && referenceMatchesPendingPrompt) {
          repository.enrichNewestMatchingRecent(
            pending.prompt,
            pending.mode,
            referenceMetadata.assetId,
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
    [closeOverlay, mediaLocked, rememberWorkshopDraft, repository, session],
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
      const pending: PendingReferenceUse = {
        mode: selection.modelModeId,
        prompt: selection.prompt,
        referenceImageAssetId: selectedReferenceAssetId,
        preserveCurrentReference: false,
        destination: 'shelf',
        ...(selection.builderDraft ? { builderDraft: selection.builderDraft } : {}),
        ...(selection.origin === 'saved-prompt' && selection.assetId
          ? { savedPromptId: selection.assetId }
          : {}),
        ...(linkedRecentPrompt ? { savedPromptId: linkedRecentPrompt.id } : {}),
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

  const saveBuiltCharacter = useCallback(
    async (
      snapshot: CharacterSaveSnapshot,
      characterId: string,
      stage: CharacterSaveStage,
      progress: CharacterSaveProgress,
    ): Promise<void> => {
      if (characterBuilderSaveBlockedReason) {
        throw new Error(characterBuilderSaveBlockedReason);
      }
      if (
        session.draft.mode !== 'lucy-2.5' &&
        !confirmModeReplacement(session.draft, 'lucy-2.5', (message) => window.confirm(message))
      ) {
        throw new Error('Character save was cancelled. The resumable draft is unchanged.');
      }

      const referenceMetadata = snapshot.referenceImage;
      let hydratedReference: SessionReferenceImage | null = null;
      if (referenceMetadata) {
        hydratedReference = await hydrateReferenceImage(
          referenceMetadata.assetId,
          referenceMetadata,
        );
      }

      const studioPrompt = referenceMetadata
        ? referenceMetadata.lucy25CharacterPrompt
        : snapshot.prompt;
      const currentReferenceId = referenceIdentity(session.draft.referenceImage);
      const incomingReferenceId = referenceMetadata?.assetId ?? null;
      const hasCurrentLucyRecipe =
        session.draft.mode === 'lucy-2.5' &&
        (canonicalPrompt(session.draft.prompt).length > 0 || currentReferenceId !== null);
      if (
        hasCurrentLucyRecipe &&
        (canonicalPrompt(session.draft.prompt) !== canonicalPrompt(studioPrompt) ||
          currentReferenceId !== incomingReferenceId) &&
        !window.confirm(
          'Replace the current Lucy 2.5 recipe in the Dock with this saved character? Your current Dock values will be replaced.',
        )
      ) {
        throw new Error('Character save was cancelled. The resumable draft is unchanged.');
      }

      repository.persistSavedCharacterPrompt({
        id: characterId,
        name: snapshot.name,
        prompt: snapshot.prompt,
        source: 'generator',
        promptIntent: 'character-transform',
        builderDraft: snapshot.draft,
        guidedDesign: snapshot.design,
        referenceImageStatus: referenceMetadata ? 'persisted-reference' : 'prompt-only',
        referenceImageAssetId: referenceMetadata?.assetId ?? null,
      });
      if (stage === 'intent') await progress.markCharacterPersisted();

      const preloaded = session.replaceRecipeDraft({
        mode: 'lucy-2.5',
        prompt: studioPrompt,
        referenceImage: hydratedReference,
        enhance: Boolean(referenceMetadata),
      });
      if (!preloaded) {
        throw new Error(
          'Release the active camera or AI session, then retry preloading this saved character.',
        );
      }

      selectedSavedPrompt.current = undefined;
      selectedCharacterPrompt.current = characterId;
      setActiveRecipe({ origin: 'character-prompt', assetId: characterId });
      setActiveRecipeFingerprint({
        mode: 'lucy-2.5',
        prompt: studioPrompt,
        referenceImageAssetId: referenceMetadata?.assetId ?? null,
        assetPrompt: snapshot.prompt,
        assetReferenceImageAssetId: referenceMetadata?.assetId ?? null,
      });
      setLibraryMode('lucy-2.5');
      rememberWorkshopDraft(snapshot.draft);
      workshopRevisionRef.current += 1;
      setWorkshopReferenceImage(
        referenceMetadata ? toWorkshopReferenceImage(referenceMetadata, snapshot.prompt) : null,
      );
      referenceRestoreRef.current = referenceMetadata
        ? { assetId: referenceMetadata.assetId, prompt: snapshot.prompt }
        : null;
      setReferenceGeneration({ status: 'idle', error: null });
      await progress.markStudioPreloaded();
    },
    [characterBuilderSaveBlockedReason, rememberWorkshopDraft, repository, session],
  );

  const openSavedWorkshop = useCallback(
    (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => {
      if (recordingActive) return;
      if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
      workshopSourceRecipeRef.current = { origin: 'character-prompt', assetId: asset.id };
      rememberWorkshopDraft(draft);
      workshopRevisionRef.current += 1;
      setWorkshopReferenceImage(null);
      referenceRestoreRef.current = null;
      setReferenceGeneration({ status: 'idle', error: null });
      if (asset.referenceImageAssetId) {
        restoreWorkshopReference(asset.referenceImageAssetId, asset.prompt);
      }
      openWorkshopOverlay();
    },
    [
      openWorkshopOverlay,
      recordingActive,
      rememberWorkshopDraft,
      restoreWorkshopReference,
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
      const needsReference =
        action.draft.intent === 'character-transform' && action.draft.matchReference;
      const selectedReferenceAssetId = action.referenceImageAssetId;
      repository.createSavedCharacterPrompt({
        name: action.name,
        prompt: action.prompt,
        source: 'generator',
        promptIntent: action.draft.intent,
        builderDraft: action.draft,
        referenceImageStatus: selectedReferenceAssetId
          ? 'persisted-reference'
          : session.draft.referenceImage?.kind === 'ephemeral'
            ? 'session-portrait-not-saved'
            : needsReference
              ? 'portrait-required-not-saved'
              : 'prompt-only',
        referenceImageAssetId: selectedReferenceAssetId,
      });
    },
    [repository, session.draft.referenceImage],
  );

  const openWorkshop = useCallback(() => {
    if (recordingActive) return;
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    workshopSourceRecipeRef.current = activeRecipe;
    if (!workshopReferenceImage && session.draft.referenceImage?.kind === 'persisted') {
      workshopRevisionRef.current += 1;
      restoreWorkshopReference(session.draft.referenceImage.assetId, session.draft.prompt);
    }
    openWorkshopOverlay();
  }, [
    activeRecipe,
    openWorkshopOverlay,
    recordingActive,
    restoreWorkshopReference,
    selectModeWithDraftProtection,
    session.draft,
    workshopReferenceImage,
  ]);

  const recipeInsertionBlocked =
    mediaLocked || (sessionModeLocked && session.draft.mode !== libraryMode);

  return {
    state: {
      activeRecipe,
      activeCharacterName,
      libraryMode,
      workshopDraft,
      workshopDrafts,
      workshopReferenceImage,
      referenceGeneration,
      referenceUsePending,
      referenceUseFailureMessage,
      shelfDirty,
      recipeInsertionBlocked,
      characterBuilderSaveBlockedReason,
    },
    actions: {
      recordCommittedPrompt,
      changeLibraryMode,
      rememberWorkshopDraft,
      generateWorkshopReference,
      detachWorkshopReference,
      retryWorkshopReferenceRestore,
      setShelfDirty,
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
