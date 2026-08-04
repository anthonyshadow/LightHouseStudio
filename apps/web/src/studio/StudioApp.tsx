import { useTheme } from '@emotion/react';
import { resolveCharacterVersion } from '@studio/domain';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { hydrateReferenceImage } from '../adapters/api-client/apiClient';
import { detectBrowserCapabilities } from '../adapters/browser-media/browserMedia';
import type { PromptCommittedHandler } from '../application/types';
import type {
  CharacterSaveProgress,
  CharacterSaveSnapshot,
} from '../features/character-builder/characterBuilderControllerSupport';
import type { CharacterSaveStage } from '../features/character-builder/characterBuilderPersistence';
import { persistCharacterSaveSnapshot } from '../features/character-builder/persistCharacterSaveSnapshot';
import { createCreativeAssetRepository } from '../features/creative-assets/repository';
import type { RecipeShelfEntryIntent } from '../features/creative-assets/RecipeShelf.types';
import { savedPromptToRecipeSelection } from '../features/creative-assets/recipeSelection';
import type {
  CharacterVersionSelection,
  RecentPrompt,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../features/creative-assets/types';
import { useCreativeAssetRepository } from '../features/creative-assets/useCreativeAssetRepository';
import { OutfitBuilder } from '../features/creative-assets/OutfitBuilder';
import { OutfitSelector } from '../features/creative-assets/OutfitSelector';
import { ExistingVideoPanel } from '../features/existing-video/ExistingVideoPanel';
import type { ExistingVideoSavedRecipe } from '../features/existing-video/ExistingVideoRecipeChooser';
import {
  savedCharacterStepInput,
  useExistingVideoWorkflow,
} from '../features/existing-video/useExistingVideoWorkflow';
import { MediaStage } from '../features/live-stage';
import {
  confirmModeReplacement,
  hasDraftContent,
  SessionComposer,
  type StudioMode,
} from '../features/media-session';
import { isModelSessionActive } from '../features/media-session/sessionComposerModel';
import { persistedReferenceAssetId } from '../features/media-session/types';
import { CaptureSettingsPanel, RecordingControls } from '../features/recording';
import { useStudioSession } from '../orchestration/session';
import { Button, OverlayPanel } from '../ui';
import {
  headerRegionStyles,
  firstSuccessGuideStyles,
  mainGridStyles,
  pageStyles,
  shellStyles,
  skipLinkStyles,
  stageColumnStyles,
} from './StudioApp.styles';
import { CreativeWorkspace, type AuxiliaryPanel, type ModelMode } from './CreativeWorkspace';
import { AIExperienceChooser } from './AIExperienceChooser';
import { AIPreparationChooser } from './AIPreparationChooser';
import { StudioExitGuard } from './StudioExitGuard';
import { StudioHeader } from './StudioHeader';
import { StudioSessionControlBar } from './StudioSessionControlBar';
import {
  deriveRecordingDurationNotices,
  deriveRealtimeSessionNotices,
  deriveStudioStageNotices,
  isStudioFormError,
} from './studioStageNotices';
import { useCharacterBuilderLaunchController } from './useCharacterBuilderLaunchController';
import { useLegacyProjectAvailability } from './useLegacyProjectAvailability';
import { useProviderAvailability } from './useProviderAvailability';
import { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import { useTakeReviewFlow } from './useTakeReviewFlow';
import { useDesktopStudioLayout } from './useDesktopStudioLayout';
import { useStudioOverlayController } from './useStudioOverlayController';

const CharacterBuilderCoordinator = lazy(() =>
  import('../features/character-builder/CharacterBuilderCoordinator').then((module) => ({
    default: module.CharacterBuilderCoordinator,
  })),
);
const ConfirmationDialog = lazy(() =>
  import('../ui/primitives/ConfirmationDialog').then((module) => ({
    default: module.ConfirmationDialog,
  })),
);
const LegacyProjectManager = lazy(() =>
  import('../features/legacy-projects/LegacyProjectManager').then((module) => ({
    default: module.LegacyProjectManager,
  })),
);
const TakeDock = lazy(() =>
  import('../features/take-review/TakeDock').then((module) => ({ default: module.TakeDock })),
);
const CharacterWardrobePanel = lazy(() =>
  import('../features/character-wardrobe/CharacterWardrobePanel').then((module) => ({
    default: module.CharacterWardrobePanel,
  })),
);

const deferredPanelFallback = <p role="status">Loading studio tool…</p>;

const REVIEW_LOCK_REASON =
  'Download and release or discard the temporary take before starting or changing media.';

const noopPromptCommitted: PromptCommittedHandler = () => undefined;

const focusDesktopCaptureSettings = () => {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[data-desktop-capture-settings]')?.focus();
  });
};

type CharacterBuilderDestination =
  Readonly<{ kind: 'studio' }> | Readonly<{ kind: 'existing-video'; stepId: string }>;

type OutfitBuilderLaunch = Readonly<{
  outfit?: SavedPrompt;
  saveAsCopy: boolean;
  saveAndSelect: boolean;
  destination: 'selector' | 'shelf';
}>;

interface StudioExperienceProps {
  focusMainOnMount: boolean;
  initialIntent?: 'upload';
}

const StudioExperience = ({ focusMainOnMount, initialIntent }: StudioExperienceProps) => {
  const theme = useTheme();
  const fullscreenWorkspaceRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const desktopStudioLayout = useDesktopStudioLayout();
  const repository = useMemo(() => createCreativeAssetRepository(), []);
  const repositoryState = useCreativeAssetRepository(repository);
  const existingVideoSavedRecipes = useMemo<readonly ExistingVideoSavedRecipe[]>(
    () => [
      ...repositoryState.store.savedPrompts.map((recipe) => ({
        id: recipe.id,
        label: recipe.title,
        modelId: recipe.modelModeId,
        prompt: recipe.prompt,
        referenceImageAssetId: recipe.referenceImageAssetId,
        vtonInputKind: recipe.vtonInputKind,
        enhancePrompt: recipe.enhancePrompt,
      })),
      ...repositoryState.store.savedCharacterPrompts.flatMap((character) => [
        {
          id: character.id,
          label: `${character.name} · Original`,
          modelId: 'lucy-latest' as const,
          prompt: character.prompt,
          referenceImageAssetId: character.referenceImageAssetId,
          vtonInputKind: null,
          enhancePrompt: false,
          savedCharacterPromptId: character.id,
          originalCharacterVersion: true,
        },
        ...repositoryState.store.savedCharacterVariants
          .filter((variant) => variant.parentCharacterId === character.id)
          .map((variant) => ({
            id: variant.id,
            label: `${character.name} · ${variant.title}`,
            modelId: 'lucy-latest' as const,
            prompt: character.prompt,
            referenceImageAssetId: variant.referenceImageAssetId,
            vtonInputKind: null,
            enhancePrompt: false,
            savedCharacterPromptId: character.id,
            savedCharacterVariantId: variant.id,
            originalCharacterVersion: false,
          })),
      ]),
    ],
    [repositoryState.store],
  );
  const recordAcceptedBatchStep = useCallback(
    (step: {
      readonly modelId: ModelMode;
      readonly prompt: string;
      readonly savedRecipeId: string | null;
      readonly referenceImage: File | null;
      readonly inputKind: 'character' | 'saved-outfit' | 'reference-image' | 'prompt';
      readonly enhancePrompt: boolean;
    }) => {
      const recipe = step.savedRecipeId
        ? existingVideoSavedRecipes.find((item) => item.id === step.savedRecipeId)
        : undefined;
      const saved = step.savedRecipeId
        ? repository.getSnapshot().store.savedPrompts.find((item) => item.id === step.savedRecipeId)
        : undefined;
      if (!step.prompt.trim() && !recipe?.referenceImageAssetId) return;
      repository.recordSuccessfulPrompt({
        prompt: recipe?.prompt ?? step.prompt,
        modelModeId: step.modelId,
        ...(saved ? { savedPromptId: saved.id } : {}),
        ...(recipe?.savedCharacterPromptId
          ? { savedCharacterPromptId: recipe.savedCharacterPromptId }
          : {}),
        ...(recipe?.savedCharacterVariantId
          ? { savedCharacterVariantId: recipe.savedCharacterVariantId }
          : {}),
        ...(recipe?.savedCharacterPromptId ? { characterName: recipe.label.split(' · ')[0] } : {}),
        referenceImageAssetId: recipe?.referenceImageAssetId ?? null,
        vtonInputKind:
          step.modelId === 'lucy-vton-latest'
            ? (saved?.vtonInputKind ?? (step.inputKind === 'prompt' ? 'prompt' : 'saved-outfit'))
            : null,
        enhancePrompt:
          step.modelId === 'lucy-vton-latest'
            ? (saved?.enhancePrompt ?? (step.inputKind === 'prompt' && step.enhancePrompt))
            : false,
      });
    },
    [existingVideoSavedRecipes, repository],
  );
  const {
    repository: legacyRepository,
    storage: legacyStorage,
    projectCount: legacyProjectCount,
    synchronizeProjectCount: synchronizeLegacyProjectCount,
  } = useLegacyProjectAvailability();
  const browser = useMemo(() => detectBrowserCapabilities(), []);
  const {
    availability,
    state: capabilityState,
    retry: retryProviderAvailability,
  } = useProviderAvailability();
  const {
    active: activeOverlay,
    open: openOverlay,
    close: closeOverlay,
    closeIf: closeOverlayIf,
    toggle: toggleOverlay,
  } = useStudioOverlayController(initialIntent === 'upload' ? 'video-upload' : null);

  useEffect(() => {
    if (desktopStudioLayout) closeOverlayIf(['capture-settings']);
  }, [closeOverlayIf, desktopStudioLayout]);
  const [dismissedNotices, setDismissedNotices] = useState<ReadonlySet<string>>(new Set());
  const [firstSuccessGuideVisible, setFirstSuccessGuideVisible] = useState(true);
  const [recordingForExistingVideo, setRecordingForExistingVideo] = useState(false);
  const adoptingExistingVideoRecordingRef = useRef<string | null>(null);
  const [recipeShelfEntryIntent, setRecipeShelfEntryIntent] =
    useState<RecipeShelfEntryIntent | null>(null);
  const [characterBuilderDestination, setCharacterBuilderDestination] =
    useState<CharacterBuilderDestination>({ kind: 'studio' });
  const [outfitBuilderLaunch, setOutfitBuilderLaunch] = useState<OutfitBuilderLaunch>({
    saveAsCopy: false,
    saveAndSelect: true,
    destination: 'selector',
  });
  const [outfitBuilderDirty, setOutfitBuilderDirty] = useState(false);
  const [wardrobeCharacterId, setWardrobeCharacterId] = useState<string | null>(null);
  const [wardrobeExistingVideoStepId, setWardrobeExistingVideoStepId] = useState<string | null>(
    null,
  );
  const [wardrobeDirty, setWardrobeDirty] = useState(false);
  const wardrobeCharacter = wardrobeCharacterId
    ? (repositoryState.store.savedCharacterPrompts.find(
        (item) => item.id === wardrobeCharacterId,
      ) ?? null)
    : null;
  const outfitBuilderDirtyRef = useRef(false);
  const updateOutfitBuilderDirty = useCallback((dirty: boolean) => {
    outfitBuilderDirtyRef.current = dirty;
    setOutfitBuilderDirty(dirty);
  }, []);
  const nextRecipeShelfEntryIntentIdRef = useRef(0);
  const promptCommittedHandlerRef = useRef<PromptCommittedHandler>(noopPromptCommitted);
  const characterSelectorRef = useRef<HTMLButtonElement>(null);
  const outfitToggleRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);
  const legacyManagerToggleRef = useRef<HTMLButtonElement>(null);
  const dockToggleRef = useRef<HTMLButtonElement>(null);
  const editVideoToggleRef = useRef<HTMLButtonElement>(null);
  const uploadToggleRef = useRef<HTMLButtonElement>(null);
  const closeTakeReview = useCallback(() => {
    closeOverlay();
    window.requestAnimationFrame(() => dockToggleRef.current?.focus());
  }, [closeOverlay]);
  const handlePromptCommitted = useCallback<PromptCommittedHandler>(
    (...args) => promptCommittedHandlerRef.current(...args),
    [],
  );
  const session = useStudioSession({ availability, onPromptCommitted: handlePromptCommitted });
  const handleReviewCleared = useCallback(
    () => closeOverlayIf(['take-review', 'voice-treatments']),
    [closeOverlayIf],
  );

  const {
    recording,
    processing,
    recordingActive,
    reviewLocked,
    mediaLocked,
    recordingMode,
    recordingSource,
    finalizingStartedAt,
    finalizingStream,
    automaticRecordingStopEvent,
    finishTake,
    publishUploadedVideo,
    stagePresentation: takeStagePresentation,
  } = useTakeReviewFlow({
    session,
    onReviewCleared: handleReviewCleared,
  });
  const existingVideo = useExistingVideoWorkflow({
    recording,
    processing,
    publishUploadedVideo,
    onSubmissionAccepted: recordAcceptedBatchStep,
    ...(availability.videoProcessing
      ? { videoProcessingCapabilities: availability.videoProcessing }
      : {}),
  });
  const comparedExistingVideoArtifact =
    existingVideo.comparison === 'original'
      ? recording.original
      : (recording.processed ?? recording.visual);
  const stagePresentation =
    activeOverlay === 'video-upload' &&
    existingVideo.selection !== null &&
    takeStagePresentation.kind === 'playback' &&
    comparedExistingVideoArtifact
      ? { ...takeStagePresentation, artifact: comparedExistingVideoArtifact }
      : takeStagePresentation;

  useEffect(() => {
    const artifact = recording.original;
    if (
      !recordingForExistingVideo ||
      !artifact ||
      existingVideo.selection ||
      takeStagePresentation.kind !== 'playback' ||
      adoptingExistingVideoRecordingRef.current === artifact.id
    ) {
      return;
    }

    adoptingExistingVideoRecordingRef.current = artifact.id;
    void existingVideo.adoptRecordedArtifact().then(() => {
      if (adoptingExistingVideoRecordingRef.current !== artifact.id) return;
      adoptingExistingVideoRecordingRef.current = null;
      setRecordingForExistingVideo(false);
      openOverlay('video-upload');
    });
  }, [
    existingVideo,
    openOverlay,
    recording.original,
    recordingForExistingVideo,
    takeStagePresentation.kind,
  ]);

  const aiSessionActive = isModelSessionActive(session);
  const sessionModeLocked = mediaLocked || aiSessionActive || session.lifecycle === 'disconnected';
  const characterBuilderActivityBlockedReason = recordingActive
    ? 'Finish recording and finalization before building a character.'
    : finalizingStartedAt !== null || finalizingStream !== null
      ? 'Wait for the current take to finish finalizing before building a character.'
      : undefined;
  const characterBuilderOpenBlockedReason =
    characterBuilderActivityBlockedReason ??
    (reviewLocked
      ? 'Download and release or discard the current take before building a character.'
      : undefined);
  const openCharacterBuilderOverlay = useCallback(
    () => openOverlay('character-builder'),
    [openOverlay],
  );
  const {
    launch: characterBuilderLaunch,
    discardPrompt: characterBuilderDiscardPrompt,
    launchError: characterBuilderLaunchError,
    openNewCharacter: launchNewCharacterBuilder,
    editCharacter: launchCharacterEditor,
    resolveDiscard: resolveCharacterBuilderDraftDiscard,
    dismissLaunchError: dismissCharacterBuilderLaunchError,
  } = useCharacterBuilderLaunchController({
    ...(characterBuilderActivityBlockedReason
      ? { blockedReason: characterBuilderActivityBlockedReason }
      : {}),
    onOpen: openCharacterBuilderOverlay,
  });
  const openCharacterBuilder = useCallback(() => {
    if (characterBuilderOpenBlockedReason) return;
    setCharacterBuilderDestination({ kind: 'studio' });
    launchNewCharacterBuilder();
  }, [characterBuilderOpenBlockedReason, launchNewCharacterBuilder]);
  const editCharacter = useCallback(
    (asset: Parameters<typeof launchCharacterEditor>[0]) => {
      if (characterBuilderOpenBlockedReason) return;
      setCharacterBuilderDestination({ kind: 'studio' });
      launchCharacterEditor(asset);
    },
    [characterBuilderOpenBlockedReason, launchCharacterEditor],
  );
  const createCharacterForExistingVideo = useCallback(
    (stepId: string) => {
      if (characterBuilderActivityBlockedReason || existingVideo.providerActive) return;
      const step = existingVideo.steps.find((candidate) => candidate.id === stepId);
      if (step?.modelId !== 'lucy-latest') return;
      setCharacterBuilderDestination({ kind: 'existing-video', stepId });
      launchNewCharacterBuilder();
    },
    [
      characterBuilderActivityBlockedReason,
      existingVideo.providerActive,
      existingVideo.steps,
      launchNewCharacterBuilder,
    ],
  );
  const openWorkshopOverlay = useCallback(() => openOverlay('workshop'), [openOverlay]);
  const handoff = useReferenceRecipeHandoff({
    repository,
    store: repositoryState.store,
    session,
    mediaLocked,
    recordingActive,
    sessionModeLocked,
    characterBuilderOpenBlockedReason,
    openWorkshopOverlay,
    closeOverlay,
  });
  const {
    activeRecipe,
    activeCharacter,
    activeCharacterName,
    activeRecipeLabel,
    libraryMode,
    workshopDraft,
    workshopDrafts,
    referenceUsePending,
    referenceUseFailureMessage,
    canContinueReferenceUseWithoutImage,
    shelfDirty,
    recipeInsertionBlocked,
    characterBuilderSaveBlockedReason,
  } = handoff.state;
  const {
    recordCommittedPrompt,
    changeLibraryMode,
    rememberWorkshopDraft,
    setShelfDirty,
    useRecipe: applyRecipeSelection,
    clearActiveCharacter,
    clearActiveRecipe,
    retryReferenceUse,
    continueReferenceUseWithoutImage,
    saveBuiltCharacter,
    openSavedWorkshop,
    applyWorkshopPrompt,
    saveWorkshopPrompt,
    openWorkshop,
  } = handoff.actions;
  const existingVideoCharacterSaveBlockedReason =
    characterBuilderActivityBlockedReason ??
    (shelfDirty
      ? 'Save or discard the unfinished Recipe Shelf changes before saving this character.'
      : undefined);
  const activeCharacterBuilderSaveBlockedReason =
    characterBuilderDestination.kind === 'existing-video'
      ? existingVideoCharacterSaveBlockedReason
      : characterBuilderSaveBlockedReason;
  const saveExistingVideoCharacter = useCallback(
    async (
      snapshot: CharacterSaveSnapshot,
      characterId: string,
      stage: CharacterSaveStage,
      progress: CharacterSaveProgress,
    ): Promise<void> => {
      if (existingVideoCharacterSaveBlockedReason) {
        throw new Error(existingVideoCharacterSaveBlockedReason);
      }
      if (characterBuilderDestination.kind !== 'existing-video') {
        throw new Error('The upload character destination is no longer available.');
      }
      const step = existingVideo.steps.find(
        (candidate) =>
          candidate.id === characterBuilderDestination.stepId &&
          candidate.modelId === 'lucy-latest',
      );
      if (!step) {
        throw new Error('The Character Swap step is no longer available.');
      }

      if (stage === 'intent') {
        persistCharacterSaveSnapshot(repository, snapshot, characterId);
        await progress.markCharacterPersisted();
      }

      const reference = snapshot.referenceImage
        ? await hydrateReferenceImage(snapshot.referenceImage.assetId, snapshot.referenceImage)
        : null;
      existingVideo.updateStep(step.id, {
        savedRecipeId: characterId,
        ...savedCharacterStepInput(snapshot.prompt, reference?.file ?? null),
      });
      await progress.markStudioPreloaded();
    },
    [
      characterBuilderDestination,
      existingVideo,
      existingVideoCharacterSaveBlockedReason,
      repository,
    ],
  );

  useLayoutEffect(() => {
    if (!focusMainOnMount) return;
    mainRef.current?.focus();
  }, [focusMainOnMount]);

  useLayoutEffect(() => {
    promptCommittedHandlerRef.current = recordCommittedPrompt;
    return () => {
      if (promptCommittedHandlerRef.current === recordCommittedPrompt) {
        promptCommittedHandlerRef.current = noopPromptCommitted;
      }
    };
  }, [recordCommittedPrompt]);

  useEffect(() => {
    if (!session.error || isStudioFormError(session.error)) return;
    closeOverlayIf(['recipe-dock', 'capture-settings']);
  }, [closeOverlayIf, session.error]);

  const clearSessionError = session.clearError;
  const dismissNotice = useCallback((id: string) => {
    setDismissedNotices((current) => new Set([...current, id]));
  }, []);
  const openCaptureSettingsForRecovery = useCallback(() => {
    clearSessionError();
    if (desktopStudioLayout) {
      focusDesktopCaptureSettings();
      return;
    }
    openOverlay('capture-settings');
  }, [clearSessionError, desktopStudioLayout, openOverlay]);

  const stageNotices = useMemo(
    () => [
      ...deriveStudioStageNotices({
        localCaptureAvailable: browser.mediaDevices && browser.secureContext,
        capabilityState,
        dismissedNoticeIds: dismissedNotices,
        characterBuilderLaunchError,
        sessionError: session.error,
        recordingError: recording.recordingError,
        sidecarError: recording.sidecar.state === 'error' ? recording.sidecar.error : null,
        onRetryProviderAvailability: retryProviderAvailability,
        onDismissCharacterBuilderLaunchError: dismissCharacterBuilderLaunchError,
        onOpenCaptureSettings: openCaptureSettingsForRecovery,
        onClearSessionError: clearSessionError,
        onDismissNotice: dismissNotice,
      }),
      ...deriveRecordingDurationNotices({
        lifecycle: recording.lifecycle,
        elapsedSeconds: recording.elapsedSeconds,
        automaticStopEvent: automaticRecordingStopEvent,
        playableTakeId: recording.presented?.id ?? null,
      }),
      ...deriveRealtimeSessionNotices(session.realtimeSessionTiming),
    ],
    [
      browser.mediaDevices,
      browser.secureContext,
      capabilityState,
      characterBuilderLaunchError,
      dismissCharacterBuilderLaunchError,
      dismissNotice,
      dismissedNotices,
      clearSessionError,
      openCaptureSettingsForRecovery,
      recording.recordingError,
      recording.elapsedSeconds,
      recording.lifecycle,
      recording.presented,
      recording.sidecar.error,
      recording.sidecar.state,
      retryProviderAvailability,
      session.error,
      session.realtimeSessionTiming,
      automaticRecordingStopEvent,
    ],
  );

  const closeCreativePanel = closeOverlay;

  const openDock = () => {
    if (recordingActive) return;
    openOverlay('recipe-dock');
  };

  const openCaptureSettings = () => {
    if (recordingActive) return;
    if (desktopStudioLayout) {
      focusDesktopCaptureSettings();
      return;
    }
    openOverlay('capture-settings');
  };

  const openCharacterSelector = () => openOverlay('character-selector');
  const openOutfitSelector = () => openOverlay('outfit-selector');

  const openLegacyProjects = () => openOverlay('legacy-projects');
  const openWardrobe = useCallback(
    (character: SavedCharacterPrompt) => {
      setWardrobeCharacterId(character.id);
      setWardrobeExistingVideoStepId(null);
      setWardrobeDirty(false);
      openOverlay('character-wardrobe');
    },
    [openOverlay],
  );
  const openWardrobeForExistingVideo = useCallback(
    (stepId: string, characterId: string) => {
      if (existingVideo.providerActive) return;
      const step = existingVideo.steps.find(
        (candidate) => candidate.id === stepId && candidate.modelId === 'lucy-latest',
      );
      const character = repository
        .getSnapshot()
        .store.savedCharacterPrompts.find((candidate) => candidate.id === characterId);
      if (!step || !character) return;
      setWardrobeCharacterId(character.id);
      setWardrobeExistingVideoStepId(stepId);
      setWardrobeDirty(false);
      openOverlay('character-wardrobe');
    },
    [existingVideo.providerActive, existingVideo.steps, openOverlay, repository],
  );
  const closeWardrobe = useCallback(() => {
    if (wardrobeDirty && !window.confirm('Discard the unfinished wardrobe variant?')) return;
    setWardrobeDirty(false);
    if (wardrobeExistingVideoStepId && existingVideo.selection) {
      setWardrobeExistingVideoStepId(null);
      openOverlay('video-upload');
      return;
    }
    closeOverlay();
  }, [
    closeOverlay,
    existingVideo.selection,
    openOverlay,
    wardrobeDirty,
    wardrobeExistingVideoStepId,
  ]);
  const finishWardrobeVariantForExistingVideo = useCallback(() => {
    if (!wardrobeExistingVideoStepId || !existingVideo.selection) return;
    setWardrobeDirty(false);
    setWardrobeExistingVideoStepId(null);
    openOverlay('video-upload');
  }, [existingVideo.selection, openOverlay, wardrobeExistingVideoStepId]);

  const creativePanel: AuxiliaryPanel =
    activeOverlay === 'workshop'
      ? 'workshop'
      : activeOverlay === 'recipe-shelf'
        ? 'shelf'
        : 'closed';
  const activeCreativeTool =
    activeOverlay === 'recipe-dock'
      ? 'dock'
      : activeOverlay === 'video-upload'
        ? 'edit-video'
        : activeOverlay === 'character-selector'
          ? 'character'
          : activeOverlay === 'outfit-selector' || activeOverlay === 'outfit-builder'
            ? 'outfit'
            : creativePanel === 'closed'
              ? null
              : creativePanel;
  const captureBlockedReason = reviewLocked
    ? REVIEW_LOCK_REASON
    : shelfDirty
      ? 'Save or discard Recipe Shelf changes before recording.'
      : undefined;
  const captureSettingsDisabledReason = reviewLocked
    ? REVIEW_LOCK_REASON
    : recordingActive
      ? 'Finish the current take before changing capture settings.'
      : aiSessionActive
        ? 'Stop AI before changing camera or microphone sources.'
        : undefined;
  const activeRecordingSource = recordingActive
    ? recording.activeSource
    : reviewLocked
      ? null
      : recordingSource;
  const currentExperienceLabel =
    activeCharacterName ??
    (session.draft.mode === 'lucy-vton-latest' && hasDraftContent(session.draft)
      ? activeRecipeLabel
        ? `Virtual Try-On · ${activeRecipeLabel}`
        : 'Virtual Try-On'
      : undefined);
  const currentExperienceImageAssetId =
    activeCharacter?.referenceImageAssetId ??
    persistedReferenceAssetId(session.draft.referenceImage);
  const effectiveRecordingMode = currentExperienceLabel ? session.draft.mode : recordingMode;
  const activeCharacterRecord = activeCharacter
    ? repositoryState.store.savedCharacterPrompts.find(
        (candidate) => candidate.id === activeCharacter.id,
      )
    : undefined;
  const characterRemovalBlockedReason = recordingActive
    ? 'Finish recording before changing the selected AI recipe.'
    : finalizingStartedAt !== null || finalizingStream !== null
      ? 'Wait for the current take to finish finalizing before changing the selected AI recipe.'
      : reviewLocked
        ? 'Release or discard the current take before changing the selected AI recipe.'
        : aiSessionActive
          ? 'Stop AI before changing the selected AI recipe.'
          : session.lifecycle === 'disconnected'
            ? 'Wait for the current session cleanup before changing the selected AI recipe.'
            : undefined;
  const unselectCharacter = useCallback(() => {
    if (!clearActiveCharacter()) return;
    closeOverlayIf(['character-selector']);
    window.requestAnimationFrame(() => characterSelectorRef.current?.focus());
  }, [clearActiveCharacter, closeOverlayIf]);
  const unselectAi = useCallback(() => {
    if (!clearActiveRecipe()) return;
    closeOverlayIf(['character-selector', 'outfit-selector', 'ai-preparation']);
    window.requestAnimationFrame(() => characterSelectorRef.current?.focus());
  }, [clearActiveRecipe, closeOverlayIf]);
  const openNewOutfitBuilder = useCallback(
    (saveAndSelect: boolean, destination: OutfitBuilderLaunch['destination']) => {
      if (characterBuilderOpenBlockedReason) return;
      setOutfitBuilderLaunch({ saveAsCopy: false, saveAndSelect, destination });
      updateOutfitBuilderDirty(false);
      openOverlay('outfit-builder');
    },
    [characterBuilderOpenBlockedReason, openOverlay, updateOutfitBuilderDirty],
  );
  const openOutfitEditor = useCallback(
    (outfit: SavedPrompt, saveAsCopy: boolean, destination: OutfitBuilderLaunch['destination']) => {
      if (characterBuilderOpenBlockedReason) return;
      setOutfitBuilderLaunch({ outfit, saveAsCopy, saveAndSelect: false, destination });
      updateOutfitBuilderDirty(false);
      openOverlay('outfit-builder');
    },
    [characterBuilderOpenBlockedReason, openOverlay, updateOutfitBuilderDirty],
  );
  const openOutfitCopy = useCallback(
    (outfit: SavedPrompt | RecentPrompt, destination: OutfitBuilderLaunch['destination']) => {
      if ('title' in outfit) {
        openOutfitEditor(outfit, true, destination);
        return;
      }
      openOutfitEditor(
        {
          id: outfit.id,
          title: 'Outfit',
          prompt: outfit.prompt,
          modelModeId: 'lucy-vton-latest',
          source: 'manual',
          referenceImageAssetId: outfit.referenceImageAssetId,
          vtonInputKind: outfit.vtonInputKind,
          enhancePrompt: outfit.enhancePrompt,
          tags: [],
          createdAt: outfit.usedAt,
          updatedAt: outfit.usedAt,
          lastUsedAt: outfit.usedAt,
          useCount: 1,
        },
        true,
        destination,
      );
    },
    [openOutfitEditor],
  );
  const closeOutfitBuilder = useCallback(() => {
    if (
      outfitBuilderDirtyRef.current &&
      !window.confirm('Discard the unfinished outfit changes? The draft cannot be recovered.')
    ) {
      return;
    }
    updateOutfitBuilderDirty(false);
    openOverlay(outfitBuilderLaunch.destination === 'shelf' ? 'recipe-shelf' : 'outfit-selector');
  }, [openOverlay, outfitBuilderLaunch.destination, updateOutfitBuilderDirty]);
  const selectSavedOutfit = useCallback(
    (outfit: SavedPrompt) => {
      updateOutfitBuilderDirty(false);
      applyRecipeSelection(savedPromptToRecipeSelection(outfit));
    },
    [applyRecipeSelection, updateOutfitBuilderDirty],
  );
  const startAdvancedModel = useCallback(() => {
    setRecordingForExistingVideo(false);
    return session.startModel();
  }, [session]);
  const advancedLiveSession = useMemo(
    () => ({ ...session, startModel: startAdvancedModel }),
    [session, startAdvancedModel],
  );
  const selectExperienceMode = (mode: StudioMode): boolean => {
    return (
      confirmModeReplacement(session.draft, mode, (message) => window.confirm(message)) &&
      session.selectMode(mode)
    );
  };
  const openSavedRecipesFor = (mode: ModelMode) => {
    if (
      mode === libraryMode &&
      shelfDirty &&
      !window.confirm('Discard the unsaved Recipe Shelf changes and open saved characters?')
    ) {
      return;
    }
    if (!changeLibraryMode(mode)) return;
    if (mode === 'lucy-latest') {
      nextRecipeShelfEntryIntentIdRef.current += 1;
      setRecipeShelfEntryIntent({
        id: nextRecipeShelfEntryIntentIdRef.current,
        category: 'characters',
      });
    }
    openOverlay('recipe-shelf');
  };
  const consumeRecipeShelfEntryIntent = useCallback((id: number) => {
    setRecipeShelfEntryIntent((current) => (current?.id === id ? null : current));
  }, []);
  const configureVirtualTryOn = () => {
    if (!selectExperienceMode('lucy-vton-latest')) return;
    openOverlay('recipe-dock');
  };
  const startPreparedAi = (mode: ModelMode) => {
    if (!selectExperienceMode(mode)) return;
    closeOverlay();
    void startAdvancedModel();
  };
  const discardTemporaryWork = useCallback(() => {
    adoptingExistingVideoRecordingRef.current = null;
    setRecordingForExistingVideo(false);
    existingVideo.reset(false);
    processing.cancel();
    recording.discard();
    setShelfDirty(false);
    updateOutfitBuilderDirty(false);
    setWardrobeDirty(false);
  }, [existingVideo, processing, recording, setShelfDirty, updateOutfitBuilderDirty]);
  const discardExistingVideoSelection = useCallback(() => {
    if (existingVideo.selection) existingVideo.reset(false);
  }, [existingVideo]);
  const finishExistingVideoSetup = useCallback(() => {
    existingVideo.showResult();
    openOverlay('take-review');
  }, [existingVideo, openOverlay]);
  const openExistingVideo = useCallback(() => {
    setRecordingForExistingVideo(false);
    openOverlay('video-upload');
  }, [openOverlay]);
  const openPlaybackEditor = useCallback(() => {
    if (!recording.presented || recordingActive) return;
    openExistingVideo();
  }, [openExistingVideo, recording.presented, recordingActive]);
  const startExistingVideoRecording = useCallback(() => {
    if (!browser.mediaRecorder || !browser.mediaDevices || !browser.secureContext) return;
    setRecordingForExistingVideo(true);
    closeOverlay();
    window.requestAnimationFrame(() => mainRef.current?.focus());
    void session.startLocal();
  }, [browser, closeOverlay, session]);
  const closeExistingVideo = useCallback(() => {
    if (existingVideo.providerActive) return;
    if (existingVideo.active) existingVideo.cancelBeforeAcceptance();
    closeOverlay();
  }, [closeOverlay, existingVideo]);
  const dismissCharacterBuilder = useCallback(() => {
    if (characterBuilderDestination.kind === 'existing-video' && existingVideo.selection) {
      openOverlay('video-upload');
      return;
    }
    closeOverlay();
  }, [characterBuilderDestination, closeOverlay, existingVideo.selection, openOverlay]);
  const creativeWorkspace = (
    <CreativeWorkspace
      repository={repository}
      state={{
        panel: creativePanel,
        activeTool: activeCreativeTool,
        showDesktopAiTools: desktopStudioLayout,
        activeCharacterLabel: activeCharacterName,
        activeOutfitLabel:
          session.draft.mode === 'lucy-vton-latest' && hasDraftContent(session.draft)
            ? (activeRecipeLabel ?? 'Configured VTO')
            : undefined,
        activeSessionMode: session.draft.mode,
        libraryMode,
        workshopDraft,
        workshopDrafts,
        recordingActive,
        sessionModeLocked,
        recipeInsertionBlocked,
        hasReferenceImage: Boolean(session.draft.referenceImage),
        referenceUsePending,
        referenceUseFailure: referenceUseFailureMessage
          ? {
              message: referenceUseFailureMessage,
              onRetry: retryReferenceUse,
              ...(canContinueReferenceUseWithoutImage
                ? { onContinueWithoutReference: continueReferenceUseWithoutImage }
                : {}),
            }
          : null,
        legacyProjectCount,
        activeRecipe,
        recipeShelfEntryIntent,
        hasPlaybackVideo: Boolean(recording.presented),
      }}
      refs={{
        workshopToggleRef,
        shelfToggleRef,
        dockToggleRef,
        editVideoToggleRef,
        characterToggleRef: characterSelectorRef,
        outfitToggleRef,
        legacyManagerToggleRef,
      }}
      actions={{
        onOpenDock: openDock,
        onOpenEditVideo: openPlaybackEditor,
        onOpenCharacter: openCharacterSelector,
        onOpenOutfit: openOutfitSelector,
        onOpenWorkshop: openWorkshop,
        onToggleShelf: () => toggleOverlay('recipe-shelf'),
        onOpenLegacyProjects: openLegacyProjects,
        onClose: closeCreativePanel,
        onLibraryModeChange: changeLibraryMode,
        onWorkshopDraftChange: rememberWorkshopDraft,
        onUseWorkshop: applyWorkshopPrompt,
        onSaveWorkshop: saveWorkshopPrompt,
        onShelfDirtyChange: setShelfDirty,
        onRecipeShelfEntryIntentConsumed: consumeRecipeShelfEntryIntent,
        onUseRecipe: applyRecipeSelection,
        onCreateCharacter: openCharacterBuilder,
        onEditCharacter: editCharacter,
        onOpenWardrobe: openWardrobe,
        onCreateOutfit: () => openNewOutfitBuilder(false, 'shelf'),
        onEditOutfit: (outfit) => openOutfitEditor(outfit, false, 'shelf'),
        onSaveOutfitCopy: (outfit) => openOutfitCopy(outfit, 'shelf'),
        onOpenSavedWorkshop: openSavedWorkshop,
      }}
    />
  );

  return (
    <div css={pageStyles(theme)}>
      <a href="#studio-main" css={skipLinkStyles(theme)}>
        Skip to studio
      </a>
      <div css={shellStyles(theme)}>
        <div css={headerRegionStyles()}>
          <StudioHeader
            availability={availability}
            browser={browser}
            capabilityState={capabilityState}
            characterSelectorRef={characterSelectorRef}
            showAiSelector={!desktopStudioLayout}
            selectorLabel="Select AI"
            {...(currentExperienceLabel ? { activeCharacterName: currentExperienceLabel } : {})}
            activeCharacterImageAssetId={currentExperienceImageAssetId}
            onOpenCharacterSelector={() => openOverlay('ai-preparation')}
            onClearCharacter={unselectAi}
            {...(characterRemovalBlockedReason
              ? { clearCharacterDisabledReason: characterRemovalBlockedReason }
              : {})}
          />
        </div>

        <main ref={mainRef} id="studio-main" tabIndex={-1} css={mainGridStyles()}>
          <div ref={fullscreenWorkspaceRef} css={stageColumnStyles(theme)}>
            <MediaStage
              presentation={stagePresentation}
              mode={session.draft.mode}
              lifecycle={session.lifecycle}
              recording={recording.lifecycle === 'recording'}
              recordingSeconds={recording.elapsedSeconds}
              aspectRatio={
                session.draft.mode === 'local'
                  ? session.capturePreferences.applied.aspectRatio
                  : '16:9'
              }
              realtimeSessionTiming={session.realtimeSessionTiming}
              idleAction={
                stagePresentation.kind === 'idle' && firstSuccessGuideVisible ? (
                  <aside
                    aria-label="First take guide"
                    data-first-success-guide=""
                    css={firstSuccessGuideStyles(theme)}
                  >
                    <strong data-guide-title>Create a video</strong>
                    <span data-guide-copy>
                      <span data-guide-primary-long>
                        <span data-guide-step-number aria-hidden="true">
                          1
                        </span>
                        <span>Record New Video or Upload Video → review</span>
                      </span>
                      <span data-guide-upload>
                        <span data-guide-step-number aria-hidden="true">
                          2
                        </span>
                        <span>Virtual Try On · Character Swap · Voice → Download</span>
                      </span>
                    </span>
                    <Button
                      size="small"
                      variant="quiet"
                      aria-label="Dismiss first take guide"
                      onClick={() => setFirstSuccessGuideVisible(false)}
                    >
                      <span data-guide-dismiss-long>Dismiss</span>
                      <span data-guide-dismiss-short aria-hidden="true">
                        ×
                      </span>
                    </Button>
                  </aside>
                ) : null
              }
              {...(currentExperienceLabel ? { experienceLabel: currentExperienceLabel } : {})}
              controls={({ visible }) => (
                <StudioSessionControlBar
                  session={session}
                  {...(currentExperienceLabel ? { experienceLabel: currentExperienceLabel } : {})}
                  experienceImageAssetId={currentExperienceImageAssetId}
                  recording={recording}
                  recordingMode={effectiveRecordingMode}
                  recordingSource={activeRecordingSource}
                  recordingSupported={browser.mediaRecorder}
                  {...(captureBlockedReason
                    ? { recordingBlockedReason: captureBlockedReason }
                    : {})}
                  reviewingTake={stagePresentation.kind === 'playback'}
                  visible={visible}
                  controlsLocked={reviewLocked || finalizingStartedAt !== null}
                  onStopRecording={finishTake}
                  onStartLocalRecording={startExistingVideoRecording}
                  onCloseTakeReview={closeTakeReview}
                  onDiscardTake={discardExistingVideoSelection}
                  onOpenVoiceTreatments={() => openOverlay('voice-treatments')}
                  onChooseAiExperience={() => openOverlay('ai-experience')}
                  onChangeExperience={() => openOverlay('ai-experience')}
                  onUploadVideo={openExistingVideo}
                  uploadButtonRef={uploadToggleRef}
                />
              )}
              notices={stageNotices}
              onPlaybackError={recording.repairPresentedObjectUrl}
              fullscreenTargetRef={fullscreenWorkspaceRef}
            />
            {creativeWorkspace}
            <RecordingControls
              recording={recording}
              source={activeRecordingSource}
              mode={effectiveRecordingMode}
              {...(!desktopStudioLayout ? { onOpenSettings: openCaptureSettings } : {})}
              desktopSettings={
                desktopStudioLayout ? (
                  <div
                    tabIndex={-1}
                    data-desktop-capture-settings=""
                    css={{
                      minWidth: 0,
                      minHeight: 0,
                      height: '100%',
                      overflow: 'hidden',
                      borderRadius: 'inherit',
                      '&:focus-visible': {
                        outline: `2px solid ${theme.colors.focus}`,
                        outlineOffset: '-2px',
                      },
                    }}
                  >
                    <CaptureSettingsPanel
                      controller={session.capturePreferences}
                      mode={session.draft.mode}
                      presentation="sidebar"
                      disabled={mediaLocked || aiSessionActive}
                      {...(captureSettingsDisabledReason
                        ? { disabledReason: captureSettingsDisabledReason }
                        : {})}
                    />
                  </div>
                ) : undefined
              }
            />
          </div>
        </main>

        <StudioExitGuard
          recordingOrFinalizing={
            recordingActive ||
            finalizingStartedAt !== null ||
            finalizingStream !== null ||
            existingVideo.providerActive
          }
          hasTemporaryTake={Boolean(recording.presented)}
          voiceProcessingActive={recording.processingState === 'processing'}
          shelfDirty={shelfDirty || outfitBuilderDirty || wardrobeDirty}
          onDiscardTemporaryWork={discardTemporaryWork}
        />

        <OverlayPanel
          open={activeOverlay === 'video-upload'}
          onClose={closeExistingVideo}
          title="Use existing video"
          description="Add a source, choose optional edits, then compare and download the result."
          placement="right"
          size="wide"
          bodyMode="scroll"
          closeDisabled={existingVideo.providerActive}
          closeOnBackdrop={!existingVideo.selection}
          returnFocusRef={recording.presented ? editVideoToggleRef : uploadToggleRef}
        >
          <ExistingVideoPanel
            key={existingVideo.selection?.metadata.selectedAt ?? 'empty-existing-video'}
            workflow={existingVideo}
            videoProcessingAvailable={Boolean(
              availability.videoProcessing?.characterSwap.available ||
              availability.videoProcessing?.virtualTryOn.available,
            )}
            {...(availability.videoProcessing
              ? { videoProcessingCapabilities: availability.videoProcessing }
              : {})}
            elevenLabsAvailable={availability.elevenLabs}
            elevenLabsModel={availability.elevenLabsModel}
            browserCapabilities={browser}
            savedRecipes={existingVideoSavedRecipes}
            onCreateCharacter={createCharacterForExistingVideo}
            onCreateWardrobeVariant={openWardrobeForExistingVideo}
            onFinish={finishExistingVideoSetup}
            recordingSupported={
              browser.mediaRecorder && browser.mediaDevices && browser.secureContext
            }
            onRecordVideo={startExistingVideoRecording}
          />
        </OverlayPanel>

        <AIPreparationChooser
          open={activeOverlay === 'ai-preparation'}
          returnFocusRef={characterSelectorRef}
          disabledReason={characterBuilderOpenBlockedReason}
          onClose={closeOverlay}
          onChooseCharacter={openCharacterSelector}
          onChooseOutfit={openOutfitSelector}
        />

        <OverlayPanel
          open={activeOverlay === 'outfit-selector'}
          onClose={closeOverlay}
          title="Outfit"
          description="Create an outfit, or select a saved or recently used Virtual Try-On recipe."
          placement="right"
          bodyMode="scroll"
          returnFocusRef={desktopStudioLayout ? outfitToggleRef : characterSelectorRef}
        >
          {activeOverlay === 'outfit-selector' ? (
            <OutfitSelector
              repository={repository}
              activeOutfitLabel={
                session.draft.mode === 'lucy-vton-latest' && hasDraftContent(session.draft)
                  ? (activeRecipeLabel ?? 'Configured VTO')
                  : undefined
              }
              onClear={unselectAi}
              disabledReason={
                recipeInsertionBlocked
                  ? 'Release the active media session before selecting another outfit.'
                  : characterBuilderOpenBlockedReason
              }
              onCreate={() => openNewOutfitBuilder(true, 'selector')}
              onEdit={(outfit) => openOutfitEditor(outfit, false, 'selector')}
              onSaveCopy={(outfit) => openOutfitEditor(outfit, true, 'selector')}
              onSelect={applyRecipeSelection}
            />
          ) : null}
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'outfit-builder'}
          onClose={closeOutfitBuilder}
          title={outfitBuilderLaunch.outfit ? 'Edit outfit' : 'Create a new outfit'}
          description="Choose Prompt or Reference image, then name and save the reusable outfit."
          placement="right"
          bodyMode="scroll"
          closeOnBackdrop={false}
          returnFocusRef={
            outfitBuilderLaunch.destination === 'shelf'
              ? shelfToggleRef
              : desktopStudioLayout
                ? outfitToggleRef
                : characterSelectorRef
          }
        >
          {activeOverlay === 'outfit-builder' ? (
            <OutfitBuilder
              key={`${outfitBuilderLaunch.outfit?.id ?? 'new'}:${outfitBuilderLaunch.saveAsCopy ? 'copy' : 'edit'}`}
              repository={repository}
              {...(outfitBuilderLaunch.outfit ? { initialOutfit: outfitBuilderLaunch.outfit } : {})}
              saveAsCopy={outfitBuilderLaunch.saveAsCopy}
              saveAndSelect={outfitBuilderLaunch.saveAndSelect}
              disabledReason={characterBuilderOpenBlockedReason}
              onDirtyChange={updateOutfitBuilderDirty}
              onCancel={closeOutfitBuilder}
              onSaved={(outfit) => {
                if (outfitBuilderLaunch.saveAndSelect) {
                  selectSavedOutfit(outfit);
                  return;
                }
                updateOutfitBuilderDirty(false);
                openOverlay(
                  outfitBuilderLaunch.destination === 'shelf' ? 'recipe-shelf' : 'outfit-selector',
                );
              }}
            />
          ) : null}
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'character-selector'}
          onClose={closeOverlay}
          title="Character"
          description="Choose the character shown in the studio controls, or create a new one."
          placement="right"
          bodyMode="contained"
          returnFocusRef={characterSelectorRef}
        >
          <div
            css={{
              display: 'grid',
              gap: theme.space.sm,
              alignContent: 'start',
              '& p': { margin: 0, color: theme.colors.textMuted },
            }}
          >
            <p>
              {activeCharacterName
                ? `${activeCharacterName} is currently selected.`
                : 'No saved character is selected.'}
            </p>
            {activeCharacterName ? (
              <>
                <Button
                  variant="secondary"
                  disabled={Boolean(characterBuilderOpenBlockedReason)}
                  title={characterBuilderOpenBlockedReason}
                  onClick={() => {
                    if (activeCharacterRecord) editCharacter(activeCharacterRecord);
                  }}
                >
                  Edit {activeCharacterName}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!activeCharacterRecord || Boolean(characterBuilderOpenBlockedReason)}
                  title={characterBuilderOpenBlockedReason}
                  onClick={() => {
                    if (activeCharacterRecord) openWardrobe(activeCharacterRecord);
                  }}
                >
                  Wardrobe
                </Button>
                <Button
                  variant="danger"
                  disabled={Boolean(characterRemovalBlockedReason)}
                  title={characterRemovalBlockedReason}
                  onClick={unselectCharacter}
                >
                  Unselect character
                </Button>
              </>
            ) : null}
            <Button
              variant="primary"
              disabled={Boolean(characterBuilderOpenBlockedReason)}
              title={characterBuilderOpenBlockedReason}
              onClick={openCharacterBuilder}
            >
              Create new character
            </Button>
            <Button
              variant="secondary"
              disabled={recordingActive}
              onClick={() => openSavedRecipesFor('lucy-latest')}
            >
              Choose saved character
            </Button>
          </div>
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'character-wardrobe' && Boolean(wardrobeCharacter)}
          onClose={closeWardrobe}
          title={wardrobeCharacter ? `${wardrobeCharacter.name} wardrobe` : 'Character wardrobe'}
          description="Browse the original and saved variants, or create a new version without changing the parent character."
          placement={desktopStudioLayout ? 'right' : 'fullscreen'}
          size="wide"
          bodyMode="contained"
          closeOnBackdrop={!wardrobeDirty}
          returnFocusRef={characterSelectorRef}
        >
          {wardrobeCharacter ? (
            <Suspense fallback={deferredPanelFallback}>
              <CharacterWardrobePanel
                repository={repository}
                store={repositoryState.store}
                character={wardrobeCharacter}
                addOutfitAvailable={Boolean(availability.wardrobeAddOutfitAvailable)}
                changeFeaturesAvailable={Boolean(availability.referenceImageEditAvailable)}
                useDisabled={recipeInsertionBlocked || referenceUsePending}
                onDirtyChange={setWardrobeDirty}
                onClose={closeWardrobe}
                {...(wardrobeExistingVideoStepId
                  ? { onSaved: finishWardrobeVariantForExistingVideo }
                  : {})}
                onUse={(selection: CharacterVersionSelection) => {
                  const resolved = resolveCharacterVersion(
                    repository.getSnapshot().store,
                    selection,
                  );
                  if (!resolved) return;
                  applyRecipeSelection({
                    origin: 'character-prompt',
                    prompt: resolved.prompt,
                    modelModeId: 'lucy-latest',
                    assetId: resolved.character.id,
                    characterName: resolved.displayLabel,
                    referenceImageAssetId: resolved.referenceImageAssetId,
                    ...(resolved.variant ? { savedCharacterVariantId: resolved.variant.id } : {}),
                    ...(resolved.character.builderDraft
                      ? { builderDraft: resolved.character.builderDraft }
                      : {}),
                  });
                }}
              />
            </Suspense>
          ) : null}
        </OverlayPanel>

        <AIExperienceChooser
          open={activeOverlay === 'ai-experience'}
          decartAvailable={availability.decart}
          capabilityState={capabilityState}
          {...(activeCharacterName ? { activeCharacterName } : {})}
          characterReady={
            Boolean(activeCharacterName) &&
            session.draft.mode === 'lucy-latest' &&
            hasDraftContent(session.draft)
          }
          virtualTryOnReady={
            session.draft.mode === 'lucy-vton-latest' && hasDraftContent(session.draft)
          }
          onClose={closeOverlay}
          onStartCharacter={() => startPreparedAi('lucy-latest')}
          onCreateCharacter={openCharacterBuilder}
          onChooseSavedCharacter={() => openSavedRecipesFor('lucy-latest')}
          onStartVirtualTryOn={() => startPreparedAi('lucy-vton-latest')}
          onConfigureVirtualTryOn={configureVirtualTryOn}
          onChooseSavedVirtualTryOn={() => openSavedRecipesFor('lucy-vton-latest')}
        />

        <OverlayPanel
          open={activeOverlay === 'recipe-dock'}
          onClose={closeOverlay}
          title="Recipe Dock"
          description="Prepare freely. Camera and provider work begin only from explicit actions."
          placement="right"
          bodyMode="contained"
          returnFocusRef={dockToggleRef}
        >
          <SessionComposer
            embedded
            session={advancedLiveSession}
            recording={mediaLocked}
            {...(activeCharacterName ? { activeCharacterName } : {})}
            {...(reviewLocked ? { lockReason: REVIEW_LOCK_REASON } : {})}
            onOpenWorkshop={openWorkshop}
          />
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'capture-settings' && !desktopStudioLayout}
          onClose={closeOverlay}
          title="Capture Settings"
          description="Choose session-only sources, video format, and a local capture target without starting media."
          placement="right"
          bodyMode="contained"
        >
          {!desktopStudioLayout ? (
            <CaptureSettingsPanel
              controller={session.capturePreferences}
              mode={session.draft.mode}
              disabled={mediaLocked || aiSessionActive}
              {...(captureSettingsDisabledReason
                ? { disabledReason: captureSettingsDisabledReason }
                : {})}
            />
          ) : null}
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'take-review' && Boolean(recording.presented)}
          onClose={closeOverlay}
          title="Latest Take"
          description="Playback stays on the stage while you review this temporary in-memory take."
          placement="bottom"
          size="wide"
          bodyMode="contained"
          returnFocusRef={recording.presented ? editVideoToggleRef : dockToggleRef}
        >
          <Suspense fallback={deferredPanelFallback}>
            <TakeDock
              view="take"
              recording={recording}
              processing={processing}
              elevenLabsAvailable={availability.elevenLabs}
              elevenLabsModel={availability.elevenLabsModel}
              browserCapabilities={browser}
              onCloseTake={closeOverlay}
              onDiscardTake={discardExistingVideoSelection}
              {...(existingVideo.selection ? { onEditVideo: openExistingVideo } : {})}
              onOpenVoiceTreatments={() => openOverlay('voice-treatments')}
            />
          </Suspense>
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'voice-treatments' && Boolean(recording.presented)}
          onClose={closeOverlay}
          title="Voice Treatments"
          description="Every treatment starts from the immutable original audio sidecar."
          headerEyebrow={
            <button
              type="button"
              css={{
                minHeight: '2.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                padding: 0,
                border: 0,
                color: theme.colors.accent,
                background: 'transparent',
                fontSize: theme.fontSizes.caption,
                fontWeight: 760,
                cursor: 'pointer',
              }}
              onClick={() => openOverlay('take-review')}
            >
              ‹ Back to take review
            </button>
          }
          placement="bottom"
          size="wide"
          height="tall"
          centered
          bodyMode="contained"
          returnFocusRef={recording.presented ? editVideoToggleRef : dockToggleRef}
        >
          <Suspense fallback={deferredPanelFallback}>
            <TakeDock
              view="voice"
              recording={recording}
              processing={processing}
              elevenLabsAvailable={availability.elevenLabs}
              elevenLabsModel={availability.elevenLabsModel}
              browserCapabilities={browser}
            />
          </Suspense>
        </OverlayPanel>

        {activeOverlay === 'character-builder' ? (
          <Suspense fallback={deferredPanelFallback}>
            <CharacterBuilderCoordinator
              open
              target={characterBuilderLaunch.target}
              {...(characterBuilderLaunch.initialValue
                ? { initialValue: characterBuilderLaunch.initialValue }
                : {})}
              returnFocusRef={
                characterBuilderDestination.kind === 'existing-video'
                  ? editVideoToggleRef
                  : characterSelectorRef
              }
              generationAvailable={Boolean(availability.referenceImages)}
              optimizationAvailable={Boolean(availability.referenceImageOptimizerAvailable)}
              editAvailable={Boolean(availability.referenceImageEditAvailable)}
              {...(availability.referenceImageProvider !== undefined
                ? { referenceImageProvider: availability.referenceImageProvider }
                : {})}
              {...(availability.referenceImageModel !== undefined
                ? { referenceImageModel: availability.referenceImageModel }
                : {})}
              {...(availability.referenceImageOptimizerModel !== undefined
                ? { referenceImageOptimizerModel: availability.referenceImageOptimizerModel }
                : {})}
              {...(activeCharacterBuilderSaveBlockedReason
                ? { saveBlockedReason: activeCharacterBuilderSaveBlockedReason }
                : {})}
              legacyRepository={legacyRepository}
              onSaveCharacter={
                characterBuilderDestination.kind === 'existing-video'
                  ? saveExistingVideoCharacter
                  : saveBuiltCharacter
              }
              onDismiss={dismissCharacterBuilder}
            />
          </Suspense>
        ) : null}

        <Suspense fallback={null}>
          <ConfirmationDialog
            open={characterBuilderDiscardPrompt !== null}
            title="Unfinished character draft"
            description={
              characterBuilderDiscardPrompt ??
              'An unfinished character draft exists. Continue and discard it?'
            }
            confirmLabel="Continue"
            cancelLabel="Cancel"
            danger
            onCancel={() => resolveCharacterBuilderDraftDiscard(false)}
            onConfirm={() => resolveCharacterBuilderDraftDiscard(true)}
          />
        </Suspense>

        <OverlayPanel
          open={activeOverlay === 'legacy-projects'}
          onClose={closeOverlay}
          title="Legacy Projects"
          description="Download or delete browser-local projects from the retired Guided experience."
          placement="fullscreen"
          size="wide"
          bodyMode="scroll"
          returnFocusRef={legacyManagerToggleRef}
        >
          <Suspense fallback={deferredPanelFallback}>
            <LegacyProjectManager
              repository={legacyRepository}
              storage={legacyStorage}
              onProjectCountChange={synchronizeLegacyProjectCount}
            />
          </Suspense>
        </OverlayPanel>
      </div>
    </div>
  );
};

export interface StudioAppProps {
  readonly focusMainOnMount?: boolean;
  readonly initialIntent?: 'upload';
}

export const StudioApp = ({ focusMainOnMount = false, initialIntent }: StudioAppProps) => (
  <StudioExperience
    focusMainOnMount={focusMainOnMount}
    {...(initialIntent ? { initialIntent } : {})}
  />
);
