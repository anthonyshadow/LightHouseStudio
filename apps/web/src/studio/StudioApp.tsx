import { useTheme } from '@emotion/react';
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
import { useCreativeAssetRepository } from '../features/creative-assets/useCreativeAssetRepository';
import { ExistingVideoPanel } from '../features/existing-video/ExistingVideoPanel';
import { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
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

const deferredPanelFallback = <p role="status">Loading studio tool…</p>;

const REVIEW_LOCK_REASON =
  'Download and release or discard the temporary take before starting or changing media.';

const noopPromptCommitted: PromptCommittedHandler = () => undefined;

type CharacterBuilderDestination =
  Readonly<{ kind: 'studio' }> | Readonly<{ kind: 'existing-video'; stepId: string }>;

interface StudioExperienceProps {
  focusMainOnMount: boolean;
  initialIntent?: 'upload';
}

const StudioExperience = ({ focusMainOnMount, initialIntent }: StudioExperienceProps) => {
  const theme = useTheme();
  const fullscreenWorkspaceRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const repository = useMemo(() => createCreativeAssetRepository(), []);
  const repositoryState = useCreativeAssetRepository(repository);
  const existingVideoSavedRecipes = useMemo(
    () => [
      ...repositoryState.store.savedPrompts.map((recipe) => ({
        id: recipe.id,
        label: recipe.title,
        modelId: recipe.modelModeId,
        prompt: recipe.prompt,
        referenceImageAssetId: recipe.referenceImageAssetId,
      })),
      ...repositoryState.store.savedCharacterPrompts.map((character) => ({
        id: character.id,
        label: character.name,
        modelId: 'lucy-latest' as const,
        prompt: character.prompt,
        referenceImageAssetId: character.referenceImageAssetId,
      })),
    ],
    [repositoryState.store],
  );
  const recordAcceptedBatchStep = useCallback(
    (step: { readonly modelId: ModelMode; readonly prompt: string }) => {
      if (!step.prompt.trim()) return;
      repository.recordSuccessfulPrompt({
        prompt: step.prompt,
        modelModeId: step.modelId,
      });
    },
    [repository],
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
  const [dismissedNotices, setDismissedNotices] = useState<ReadonlySet<string>>(new Set());
  const [firstSuccessGuideVisible, setFirstSuccessGuideVisible] = useState(true);
  const [recordingForExistingVideo, setRecordingForExistingVideo] = useState(false);
  const adoptingExistingVideoRecordingRef = useRef<string | null>(null);
  const [recipeShelfEntryIntent, setRecipeShelfEntryIntent] =
    useState<RecipeShelfEntryIntent | null>(null);
  const [characterBuilderDestination, setCharacterBuilderDestination] =
    useState<CharacterBuilderDestination>({ kind: 'studio' });
  const nextRecipeShelfEntryIntentIdRef = useRef(0);
  const promptCommittedHandlerRef = useRef<PromptCommittedHandler>(noopPromptCommitted);
  const characterSelectorRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);
  const legacyManagerToggleRef = useRef<HTMLButtonElement>(null);
  const dockToggleRef = useRef<HTMLButtonElement>(null);
  const takeToggleRef = useRef<HTMLButtonElement>(null);
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
    shelfDirty,
    recipeInsertionBlocked,
    characterBuilderSaveBlockedReason,
  } = handoff.state;
  const {
    recordCommittedPrompt,
    changeLibraryMode,
    rememberWorkshopDraft,
    setShelfDirty,
    useRecipe,
    clearActiveCharacter,
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
        throw new Error('The Swap Character step is no longer available.');
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
        prompt: snapshot.prompt,
        referenceImage: reference?.file ?? null,
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
    openOverlay('capture-settings');
  }, [clearSessionError, openOverlay]);

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

  const openTake = () => {
    if (!recording.presented || recordingActive) return;
    openOverlay('take-review');
  };

  const openCaptureSettings = () => {
    if (recordingActive) return;
    openOverlay('capture-settings');
  };

  const openCharacterSelector = () => openOverlay('character-selector');

  const openLegacyProjects = () => openOverlay('legacy-projects');

  const creativePanel: AuxiliaryPanel =
    activeOverlay === 'workshop'
      ? 'workshop'
      : activeOverlay === 'recipe-shelf'
        ? 'shelf'
        : 'closed';
  const activeCreativeTool =
    activeOverlay === 'recipe-dock'
      ? 'dock'
      : activeOverlay === 'take-review' || activeOverlay === 'voice-treatments'
        ? 'take'
        : creativePanel === 'closed'
          ? null
          : creativePanel;
  const captureBlockedReason = reviewLocked
    ? REVIEW_LOCK_REASON
    : shelfDirty
      ? 'Save or discard Recipe Shelf changes before recording.'
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
    ? 'Finish recording before removing the selected character.'
    : finalizingStartedAt !== null || finalizingStream !== null
      ? 'Wait for the current take to finish finalizing before removing the selected character.'
      : reviewLocked
        ? 'Release or discard the current take before removing the selected character.'
        : aiSessionActive
          ? 'Stop AI before removing the selected character.'
          : session.lifecycle === 'disconnected'
            ? 'Wait for the current session cleanup before removing the selected character.'
            : undefined;
  const unselectCharacter = useCallback(() => {
    if (!clearActiveCharacter()) return;
    closeOverlayIf(['character-selector']);
    window.requestAnimationFrame(() => characterSelectorRef.current?.focus());
  }, [clearActiveCharacter, closeOverlayIf]);
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
    void session.startModel();
  };
  const discardTemporaryWork = useCallback(() => {
    adoptingExistingVideoRecordingRef.current = null;
    setRecordingForExistingVideo(false);
    existingVideo.reset(false);
    processing.cancel();
    recording.discard();
    setShelfDirty(false);
  }, [existingVideo, processing, recording, setShelfDirty]);
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
              onContinueWithoutReference: continueReferenceUseWithoutImage,
            }
          : null,
        legacyProjectCount,
        activeRecipe,
        recipeShelfEntryIntent,
        hasTake: Boolean(recording.presented),
      }}
      refs={{
        workshopToggleRef,
        shelfToggleRef,
        dockToggleRef,
        takeToggleRef,
        legacyManagerToggleRef,
      }}
      actions={{
        onOpenDock: openDock,
        onOpenTake: openTake,
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
        onUseRecipe: useRecipe,
        onCreateCharacter: openCharacterBuilder,
        onEditCharacter: editCharacter,
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
            {...(activeCharacterName ? { activeCharacterName } : {})}
            activeCharacterImageAssetId={activeCharacter?.referenceImageAssetId}
            onOpenCharacterSelector={openCharacterSelector}
            onClearCharacter={unselectCharacter}
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
              realtimeSessionTiming={session.realtimeSessionTiming}
              idleAction={
                stagePresentation.kind === 'idle' && firstSuccessGuideVisible ? (
                  <aside aria-label="First take guide" css={firstSuccessGuideStyles(theme)}>
                    <strong>Start here</strong>
                    <span data-guide-copy>
                      <span>
                        Start camera → choose Character → Record → optional Voice → Download
                      </span>
                      <span data-guide-upload>
                        Upload → optional visual processing → optional Voice → Download
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
                  onCloseTakeReview={closeTakeReview}
                  onDiscardTake={discardExistingVideoSelection}
                  onOpenVoiceTreatments={() => openOverlay('voice-treatments')}
                  onChooseAiExperience={() => openOverlay('ai-experience')}
                  onChangeExperience={() => openOverlay('ai-experience')}
                  onUploadVideo={openExistingVideo}
                  {...(existingVideo.selection ? { onEditVideo: openExistingVideo } : {})}
                  uploadButtonRef={uploadToggleRef}
                />
              )}
              notices={stageNotices}
              fullscreenTargetRef={fullscreenWorkspaceRef}
            />
            {creativeWorkspace}
            <RecordingControls
              recording={recording}
              source={activeRecordingSource}
              mode={effectiveRecordingMode}
              onOpenSettings={openCaptureSettings}
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
          shelfDirty={shelfDirty}
          onDiscardTemporaryWork={discardTemporaryWork}
        />

        <OverlayPanel
          open={activeOverlay === 'video-upload'}
          onClose={closeExistingVideo}
          title="Upload existing video"
          description="Preview locally, then optionally run either Swap Character or Virtual Try On."
          placement="right"
          size="wide"
          bodyMode="scroll"
          closeDisabled={existingVideo.providerActive}
          closeOnBackdrop={!existingVideo.selection}
          returnFocusRef={uploadToggleRef}
        >
          <ExistingVideoPanel
            key={existingVideo.selection?.metadata.selectedAt ?? 'empty-existing-video'}
            workflow={existingVideo}
            videoProcessingAvailable={Boolean(availability.videoProcessing)}
            elevenLabsAvailable={availability.elevenLabs}
            elevenLabsModel={availability.elevenLabsModel}
            savedRecipes={existingVideoSavedRecipes}
            onCreateCharacter={createCharacterForExistingVideo}
            onFinish={finishExistingVideoSetup}
            recordingSupported={
              browser.mediaRecorder && browser.mediaDevices && browser.secureContext
            }
            onRecordVideo={startExistingVideoRecording}
          />
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
            session={session}
            recording={mediaLocked}
            {...(activeCharacterName ? { activeCharacterName } : {})}
            {...(reviewLocked ? { lockReason: REVIEW_LOCK_REASON } : {})}
            onOpenWorkshop={openWorkshop}
          />
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'capture-settings'}
          onClose={closeOverlay}
          title="Capture Settings"
          description="Choose session-only sources and a local capture target without starting media."
          placement="right"
          bodyMode="contained"
        >
          <CaptureSettingsPanel
            controller={session.capturePreferences}
            mode={session.draft.mode}
            disabled={mediaLocked || aiSessionActive}
            {...(reviewLocked
              ? { disabledReason: REVIEW_LOCK_REASON }
              : recordingActive
                ? { disabledReason: 'Finish the current take before changing capture settings.' }
                : aiSessionActive
                  ? { disabledReason: 'Stop AI before changing camera or microphone sources.' }
                  : {})}
          />
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'take-review' && Boolean(recording.presented)}
          onClose={closeOverlay}
          title="Latest Take"
          description="Playback stays on the stage while you review this temporary in-memory take."
          placement="bottom"
          size="wide"
          bodyMode="contained"
          returnFocusRef={recording.presented ? takeToggleRef : dockToggleRef}
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
          description="Every treatment starts from the immutable original audio."
          placement="bottom"
          size="wide"
          bodyMode="contained"
          returnFocusRef={recording.presented ? takeToggleRef : dockToggleRef}
        >
          <Suspense fallback={deferredPanelFallback}>
            <TakeDock
              view="voice"
              recording={recording}
              processing={processing}
              elevenLabsAvailable={availability.elevenLabs}
              elevenLabsModel={availability.elevenLabsModel}
              browserCapabilities={browser}
              onBackToTake={() => openOverlay('take-review')}
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
                  ? uploadToggleRef
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
