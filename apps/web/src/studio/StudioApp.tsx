import { useTheme } from '@emotion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { detectBrowserCapabilities } from '../adapters/browser-media/browserMedia';
import { useAuth } from '../application/auth/AuthProvider';
import { RemoteStateProvider } from '../application/remote-state/RemoteStateProvider';
import { APP_PATHS, isCampaignsPath, isProjectsPath, projectIdFromPath } from '../app/paths';
import type { PromptCommittedHandler } from '../application/types';
import type { RecipeShelfEntryIntent } from '../features/creative-assets/RecipeShelf.types';
import { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import { isVideoEditBusy } from '../features/video-editor/types';
import { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import { useProjectWorkingMediaController } from '../features/projects/useProjectWorkingMediaController';
import { useProjectCreativeSessionAdapter } from '../features/projects/useProjectCreativeSessionAdapter';
import { useProjectProcessingController } from '../features/projects/useProjectProcessingController';
import {
  ProjectCreativeCheckpointPanel,
  PROJECT_PROVIDER_START_BLOCKED_REASON,
} from '../features/projects/ProjectCreativeCheckpointPanel';
import {
  confirmModeReplacement,
  hasDraftContent,
  type StudioMode,
} from '../features/media-session';
import { isModelSessionActive } from '../features/media-session/sessionComposerModel';
import { persistedReferenceAssetId } from '../features/media-session/types';
import { useStudioSession } from '../orchestration/session';
import { headerRegionStyles, pageStyles, shellStyles, skipLinkStyles } from './StudioApp.styles';
import {
  CreativeWorkspace,
  type AuxiliaryPanel,
  type CreativeWorkspaceState,
  type ModelMode,
} from './CreativeWorkspace';
import { StudioExitGuard } from './StudioExitGuard';
import { StudioHeader } from './StudioHeader';
import { isStudioFormError } from './studioStageNotices';
import { useProviderAvailability } from './useProviderAvailability';
import { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import { useTakeReviewFlow } from './useTakeReviewFlow';
import { useDesktopStudioLayout } from './useDesktopStudioLayout';
import { useStudioOverlayController, type ActiveOverlay } from './useStudioOverlayController';
import { useStudioLogoutController } from './useStudioLogoutController';
import { useStudioProjectBridge } from './useStudioProjectBridge';
import { useStudioSavedVideoController } from './useStudioSavedVideoController';
import { StudioLibraryOverlays } from './StudioLibraryOverlays';
import { StudioLifecycleDialogs } from './StudioLifecycleDialogs';
import { StudioWorkspace } from './StudioWorkspace';
import { useStudioOutfitWorkflow } from './useStudioOutfitWorkflow';
import { useStudioCharacterWorkflow } from './useStudioCharacterWorkflow';
import { StudioToolOverlays } from './StudioToolOverlays';
import {
  captureBlockedReason as resolveCaptureBlockedReason,
  captureSettingsDisabledReason as resolveCaptureSettingsDisabledReason,
  characterBuilderBlockedReasons,
  characterRemovalBlockedReason as resolveCharacterRemovalBlockedReason,
  currentExperienceLabel as resolveCurrentExperienceLabel,
} from './studioActivityPolicy';
import { useStudioCreativeRepository } from './useStudioCreativeRepository';
import { useStudioStageModel } from './useStudioStageModel';
import {
  useSaveVideo,
  type SavedVideoCharacterAttribution,
} from '../features/saved-videos/useSaveVideo';

const noopPromptCommitted: PromptCommittedHandler = () => undefined;

const creativePanelForOverlay = (overlay: ActiveOverlay): AuxiliaryPanel => {
  if (overlay === 'workshop') return 'workshop';
  if (overlay === 'recipe-shelf') return 'shelf';
  return 'closed';
};

const creativeToolForOverlay = (
  overlay: ActiveOverlay,
  panel: AuxiliaryPanel,
  videoEditing: boolean,
): CreativeWorkspaceState['activeTool'] => {
  if (videoEditing) return 'edit-video';
  switch (overlay) {
    case 'recipe-dock':
      return 'dock';
    case 'video-upload':
      return 'edit-video';
    case 'character-selector':
      return 'character';
    case 'outfit-selector':
    case 'outfit-builder':
      return 'outfit';
    default:
      return panel === 'closed' ? null : panel;
  }
};

const focusDesktopCaptureSettings = () => {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[data-desktop-capture-settings]')?.focus();
  });
};

interface StudioExperienceProps {
  focusMainOnMount: boolean;
  initialIntent?: 'upload';
}

const StudioExperience = ({ focusMainOnMount, initialIntent }: StudioExperienceProps) => {
  const theme = useTheme();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const projectRouteActive = isProjectsPath(location.pathname);
  const campaignRouteActive = isCampaignsPath(location.pathname);
  const organizationRouteActive = projectRouteActive || campaignRouteActive;
  const activeProjectId = projectIdFromPath(location.pathname);
  const projectContextActive = activeProjectId !== null;
  const fullscreenWorkspaceRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const desktopStudioLayout = useDesktopStudioLayout();
  const {
    repository,
    store: repositoryStore,
    existingVideoSavedRecipes,
    recordAcceptedBatchStep,
  } = useStudioCreativeRepository(auth.session!.user.id);
  const browser = useMemo(() => detectBrowserCapabilities(), []);
  const provider = useProviderAvailability();
  const { availability, state: capabilityState, retry: retryProviderAvailability } = provider;
  const savedVideoSave = useSaveVideo(Boolean(availability.directSavedVideoUploadAvailable));
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
  const [firstSuccessGuideVisible, setFirstSuccessGuideVisible] = useState(true);
  const [recordingForExistingVideo, setRecordingForExistingVideo] = useState(false);
  const adoptingExistingVideoRecordingRef = useRef<string | null>(null);
  const [recipeShelfEntryIntent, setRecipeShelfEntryIntent] =
    useState<RecipeShelfEntryIntent | null>(null);
  const nextRecipeShelfEntryIntentIdRef = useRef(0);
  const promptCommittedHandlerRef = useRef<PromptCommittedHandler>(noopPromptCommitted);
  const characterSelectorRef = useRef<HTMLButtonElement>(null);
  const outfitToggleRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);
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

  const takeReview = useTakeReviewFlow({
    session,
    onReviewCleared: handleReviewCleared,
  });
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
    publishUploadedVideo,
    publishValidatedVideo,
  } = takeReview;
  const project = useStudioProjectBridge({
    projectId: activeProjectId,
    recordingLifecycle: recording.lifecycle,
    recordingOriginal: recording.original,
    presentSource: publishUploadedVideo,
    clearSource: recording.discard,
  });
  const activeProjectSourceActivity = project.sourceActivity;
  const activeProjectWorkingMediaActivity = project.workingMediaActivity;
  const activeProjectSession = project.session;
  const existingVideo = useExistingVideoWorkflow({
    recording,
    processing,
    publishUploadedVideo: publishValidatedVideo,
    onSubmissionAccepted: recordAcceptedBatchStep,
    ...(availability.videoProcessing
      ? { videoProcessingCapabilities: availability.videoProcessing }
      : {}),
  });
  const videoEditor = useVideoEditSession();
  const projectWorkingMedia = useProjectWorkingMediaController(
    activeProjectId,
    activeProjectSession,
    videoEditor,
  );
  useEffect(() => {
    const artifact = recording.original;
    if (
      !recordingForExistingVideo ||
      !artifact ||
      existingVideo.selection ||
      takeReview.stagePresentation.kind !== 'playback' ||
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
    takeReview.stagePresentation.kind,
  ]);

  const aiSessionActive = isModelSessionActive(session);
  const sessionModeLocked = mediaLocked || aiSessionActive || session.lifecycle === 'disconnected';
  const creativeConfigurationMediaLocked = projectContextActive ? recordingActive : mediaLocked;
  const creativeConfigurationSessionModeLocked = projectContextActive
    ? recordingActive || aiSessionActive || session.lifecycle === 'disconnected'
    : sessionModeLocked;
  const finalizing = finalizingStartedAt !== null || finalizingStream !== null;
  const characterBuilderBlocked = characterBuilderBlockedReasons({
    recordingActive,
    finalizing,
    reviewLocked,
  });
  const characterBuilderActivityBlockedReason = characterBuilderBlocked.activity;
  const characterBuilderOpenBlockedReason = characterBuilderBlocked.open;
  const openWorkshopOverlay = useCallback(() => openOverlay('workshop'), [openOverlay]);
  const handoff = useReferenceRecipeHandoff({
    repository,
    store: repositoryStore,
    session,
    mediaLocked: creativeConfigurationMediaLocked,
    recordingActive,
    sessionModeLocked: creativeConfigurationSessionModeLocked,
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
  const openOutfitLibrary = useCallback(() => {
    void navigate(APP_PATHS.outfits);
  }, [navigate]);
  const outfit = useStudioOutfitWorkflow({
    blockedReason: characterBuilderOpenBlockedReason,
    openOverlay,
    closeOverlay,
    onOpenLibrary: openOutfitLibrary,
    applySavedOutfit: applyRecipeSelection,
  });
  const character = useStudioCharacterWorkflow({
    ownerUserId: auth.session!.user.id,
    repository,
    store: repositoryStore,
    existingVideo,
    activityBlockedReason: characterBuilderActivityBlockedReason,
    openBlockedReason: characterBuilderOpenBlockedReason,
    studioSaveBlockedReason: characterBuilderSaveBlockedReason,
    shelfDirty,
    saveStudioCharacter: saveBuiltCharacter,
    openOverlay,
    closeOverlay,
  });
  const projectCreative = useProjectCreativeSessionAdapter({
    projectId: activeProjectId,
    projectSession: activeProjectSession,
    studioSession: session,
    handoff,
    repository,
    store: repositoryStore,
    existingVideo,
  });
  const projectProcessing = useProjectProcessingController({
    projectId: activeProjectId,
    session: activeProjectSession,
    checkpointCreative: projectCreative.checkpoint,
  });

  useLayoutEffect(() => {
    if (!focusMainOnMount) return;
    mainRef.current?.focus();
  }, [focusMainOnMount, location.key]);

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
  const openCaptureSettingsForRecovery = useCallback(() => {
    clearSessionError();
    if (desktopStudioLayout) {
      focusDesktopCaptureSettings();
      return;
    }
    openOverlay('capture-settings');
  }, [clearSessionError, desktopStudioLayout, openOverlay]);

  const stage = useStudioStageModel({
    activeOverlay,
    session,
    takeReview,
    existingVideo,
    videoEditor,
    browser,
    capabilityState,
    characterBuilderLaunchError: character.launchError,
    onRetryProviderAvailability: retryProviderAvailability,
    onDismissCharacterBuilderLaunchError: character.dismissLaunchError,
    onOpenCaptureSettings: openCaptureSettingsForRecovery,
  });
  const {
    videoEditing,
    comparedExistingVideoArtifact,
    stagePresentation,
    videoEditPreview,
    stageAspectRatio,
    stageNotices,
  } = stage;

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

  const openCharacterSelector = useCallback(() => openOverlay('character-selector'), [openOverlay]);
  const openOutfitSelector = useCallback(() => openOverlay('outfit-selector'), [openOverlay]);

  const creativePanel = creativePanelForOverlay(activeOverlay);
  const activeCreativeTool = creativeToolForOverlay(activeOverlay, creativePanel, videoEditing);
  const captureBlockedReason = resolveCaptureBlockedReason({ reviewLocked, shelfDirty });
  const captureSettingsDisabledReason = resolveCaptureSettingsDisabledReason({
    reviewLocked,
    recordingActive,
    aiSessionActive,
  });
  const activeRecordingSource = recordingActive
    ? recording.activeSource
    : reviewLocked
      ? null
      : recordingSource;
  const currentExperienceLabel = resolveCurrentExperienceLabel({
    activeCharacterName,
    activeRecipeLabel,
    mode: session.draft.mode,
    hasDraft: hasDraftContent(session.draft),
  });
  const currentExperienceImageAssetId =
    activeCharacter?.referenceImageAssetId ??
    persistedReferenceAssetId(session.draft.referenceImage);
  const effectiveRecordingMode = currentExperienceLabel ? session.draft.mode : recordingMode;
  const startProjectRecording = useCallback(() => {
    if (
      activeProjectId === null ||
      activeProjectSourceActivity?.accepted ||
      activeProjectSourceActivity?.busy ||
      !browser.mediaRecorder ||
      !browser.mediaDevices ||
      !browser.secureContext
    ) {
      return;
    }
    setRecordingForExistingVideo(false);
    closeOverlay();
    recording.discard();
    window.requestAnimationFrame(() => mainRef.current?.focus());
    void session.startLocal();
  }, [activeProjectId, activeProjectSourceActivity, browser, closeOverlay, recording, session]);
  const activeCharacterRecord = activeCharacter
    ? repositoryStore.savedCharacterPrompts.find((candidate) => candidate.id === activeCharacter.id)
    : undefined;
  const characterRemovalBlockedReason = resolveCharacterRemovalBlockedReason({
    recordingActive,
    finalizing,
    reviewLocked,
    aiSessionActive,
    sessionDisconnected: session.lifecycle === 'disconnected',
  });
  const unselectCharacter = useCallback(() => {
    if (!clearActiveCharacter()) return;
    closeOverlayIf(['character-selector']);
    window.requestAnimationFrame(() =>
      (desktopStudioLayout ? characterSelectorRef : shelfToggleRef).current?.focus(),
    );
  }, [clearActiveCharacter, closeOverlayIf, desktopStudioLayout]);
  const unselectAi = useCallback(() => {
    if (!clearActiveRecipe()) return;
    closeOverlayIf(['character-selector', 'outfit-selector']);
    window.requestAnimationFrame(() =>
      (desktopStudioLayout ? characterSelectorRef : shelfToggleRef).current?.focus(),
    );
  }, [clearActiveRecipe, closeOverlayIf, desktopStudioLayout]);
  const startAdvancedModel = useCallback(() => {
    if (projectContextActive) return Promise.resolve();
    setRecordingForExistingVideo(false);
    return session.startModel();
  }, [projectContextActive, session]);
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
    if (projectContextActive) return;
    if (!selectExperienceMode(mode)) return;
    closeOverlay();
    void startAdvancedModel();
  };
  const activeCharacterVariantName =
    activeRecipe?.origin === 'character-prompt' && activeRecipe.variantId
      ? (repositoryStore.savedCharacterVariants.find(
          (variant) =>
            variant.id === activeRecipe.variantId &&
            variant.parentCharacterId === activeRecipe.assetId,
        )?.title ?? null)
      : null;
  const recordingCharacterAttribution = useMemo<SavedVideoCharacterAttribution | null>(
    () =>
      session.draft.mode === 'lucy-latest' && (activeCharacterRecord?.name ?? activeCharacterName)
        ? {
            characterName: activeCharacterRecord?.name ?? activeCharacterName!,
            characterVariantName: activeCharacterVariantName,
          }
        : null,
    [
      activeCharacterName,
      activeCharacterRecord?.name,
      activeCharacterVariantName,
      session.draft.mode,
    ],
  );
  const openExistingVideo = useCallback(() => {
    setRecordingForExistingVideo(false);
    openOverlay('video-upload');
  }, [openOverlay]);
  const navigateToStudio = useCallback(() => {
    void navigate(APP_PATHS.studio, { replace: true });
  }, [navigate]);
  const openVideoUpload = useCallback(() => openOverlay('video-upload'), [openOverlay]);
  const focusStudio = useCallback(() => {
    window.requestAnimationFrame(() => mainRef.current?.focus());
  }, []);
  const focusEditVideo = useCallback(() => {
    window.requestAnimationFrame(() => editVideoToggleRef.current?.focus());
  }, []);
  const savedVideo = useStudioSavedVideoController({
    existingVideo,
    recording,
    recordingActive,
    comparedExistingVideoArtifact,
    videoEditor,
    saveController: savedVideoSave,
    savedRecipes: existingVideoSavedRecipes,
    recordingCharacterAttribution,
    navigateToStudio,
    openVideoUpload,
    closeOverlay,
    focusStudio,
    focusEditVideo,
  });
  const updateOutfitDirty = outfit.updateDirty;
  const discardWardrobeDirty = character.discardWardrobeDirty;
  const discardSavedVideoWork = savedVideo.discardWork;
  const discardLocalTemporaryWork = useCallback(() => {
    adoptingExistingVideoRecordingRef.current = null;
    setRecordingForExistingVideo(false);
    processing.cancel();
    recording.discard();
    setShelfDirty(false);
    updateOutfitDirty(false);
    discardWardrobeDirty();
    discardSavedVideoWork();
    closeOverlay();
  }, [
    closeOverlay,
    processing,
    recording,
    discardSavedVideoWork,
    discardWardrobeDirty,
    setShelfDirty,
    updateOutfitDirty,
  ]);
  const discardTemporaryWork = useCallback(() => {
    existingVideo.reset(false);
    discardLocalTemporaryWork();
  }, [discardLocalTemporaryWork, existingVideo]);
  const logoutHasTemporaryWork =
    Boolean(recording.presented) ||
    recording.processingState === 'processing' ||
    shelfDirty ||
    outfit.dirty ||
    character.wardrobeDirty ||
    videoEditor.dirty ||
    (activeProjectSourceActivity?.busy ?? false);
  const logoutHasActiveWork =
    recordingActive ||
    finalizingStartedAt !== null ||
    finalizingStream !== null ||
    existingVideo.providerActive ||
    isVideoEditBusy(videoEditor.phase) ||
    projectWorkingMedia.busy ||
    (activeProjectWorkingMediaActivity?.busy ?? false);
  const cleanupTemporaryState = useCallback(async () => {
    const cleanup = existingVideo.cleanup();
    discardLocalTemporaryWork();
    await cleanup;
  }, [discardLocalTemporaryWork, existingVideo]);
  const releaseMedia = useCallback(async () => {
    await session.stopCamera();
  }, [session]);
  const handleLoggedOut = useCallback(() => {
    void navigate(APP_PATHS.entry, { replace: true });
  }, [navigate]);
  const logout = useStudioLogoutController({
    projectSourceActivity: activeProjectSourceActivity,
    projectSession: activeProjectSession,
    hasTemporaryWork: logoutHasTemporaryWork,
    hasActiveWork: logoutHasActiveWork,
    cleanupTemporaryState,
    releaseMedia,
    logout: auth.logout,
    onLoggedOut: handleLoggedOut,
  });
  const discardExistingVideoSelection = useCallback(() => {
    if (existingVideo.selection) existingVideo.reset(false);
  }, [existingVideo]);
  const finishExistingVideoSetup = useCallback(() => {
    existingVideo.showResult();
    openOverlay('take-review');
  }, [existingVideo, openOverlay]);
  const openPlaybackEditor = useCallback(() => {
    if (!recording.presented || recordingActive) return;
    if (projectContextActive && !existingVideo.selection) {
      setRecordingForExistingVideo(true);
      return;
    }
    openExistingVideo();
  }, [
    existingVideo.selection,
    openExistingVideo,
    projectContextActive,
    recording.presented,
    recordingActive,
  ]);
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
  const chooseAnotherProjectResource = useCallback(
    (
      kind:
        'character' | 'character-variant' | 'outfit' | 'voice' | 'prompt' | 'recipe' | 'reference',
    ) => {
      if (kind === 'outfit') {
        openOutfitSelector();
        return;
      }
      if (kind === 'voice') {
        openPlaybackEditor();
        return;
      }
      if (kind === 'prompt' || kind === 'recipe') {
        openOverlay('recipe-shelf');
        return;
      }
      if (kind === 'reference') {
        openOverlay('recipe-dock');
        return;
      }
      openCharacterSelector();
    },
    [openCharacterSelector, openOutfitSelector, openOverlay, openPlaybackEditor],
  );
  const creativeWorkspace = (
    <CreativeWorkspace
      repository={repository}
      state={{
        panel: creativePanel,
        activeTool: activeCreativeTool,
        showDesktopAiTools: desktopStudioLayout,
        projectMode: projectContextActive,
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
      }}
      actions={{
        onOpenDock: openDock,
        onOpenEditVideo: openPlaybackEditor,
        onOpenCharacter: openCharacterSelector,
        onOpenOutfit: openOutfitSelector,
        onOpenWorkshop: openWorkshop,
        onToggleShelf: () => toggleOverlay('recipe-shelf'),
        onClose: closeCreativePanel,
        onLibraryModeChange: changeLibraryMode,
        onWorkshopDraftChange: rememberWorkshopDraft,
        onUseWorkshop: applyWorkshopPrompt,
        onSaveWorkshop: (action) => void saveWorkshopPrompt(action),
        onShelfDirtyChange: setShelfDirty,
        onRecipeShelfEntryIntentConsumed: consumeRecipeShelfEntryIntent,
        onUseRecipe: applyRecipeSelection,
        onCreateCharacter: character.openNew,
        onEditCharacter: character.edit,
        onOpenWardrobe: character.openWardrobe,
        onCreateOutfit: () => outfit.openNew(false, 'shelf'),
        onEditOutfit: (savedOutfit) => outfit.openEditor(savedOutfit, false, 'shelf'),
        onSaveOutfitCopy: (savedOutfit) => outfit.openCopy(savedOutfit, 'shelf'),
        onOpenSavedWorkshop: openSavedWorkshop,
      }}
    />
  );
  const projectCreativeCheckpoint = projectContextActive ? (
    <ProjectCreativeCheckpointPanel
      controller={projectCreative}
      workingMedia={projectWorkingMedia}
      onChooseAnother={chooseAnotherProjectResource}
    />
  ) : null;
  const projectRecordingAvailable =
    activeProjectId !== null &&
    activeProjectSourceActivity !== null &&
    !activeProjectSourceActivity.accepted &&
    !activeProjectSourceActivity.busy;

  return (
    <div css={pageStyles(theme)}>
      <a href="#studio-main" css={skipLinkStyles(theme)}>
        Skip to studio
      </a>
      <div css={shellStyles(theme)}>
        <div css={headerRegionStyles(theme)}>
          <StudioHeader
            availability={availability}
            browser={browser}
            capabilityState={capabilityState}
            user={auth.session!.user}
            accountBusy={logout.busy || logout.preparing}
            activeDestination={
              campaignRouteActive
                ? 'campaigns'
                : projectRouteActive
                  ? 'projects'
                  : location.pathname === APP_PATHS.videos
                    ? 'videos'
                    : location.pathname === APP_PATHS.characters
                      ? 'characters'
                      : location.pathname === APP_PATHS.outfits
                        ? 'outfits'
                        : 'studio'
            }
            projectContextActive={projectContextActive}
            onOpenStudio={() => void navigate(APP_PATHS.studio)}
            onOpenProjects={() => void navigate(APP_PATHS.projects)}
            onOpenCampaigns={() => void navigate(APP_PATHS.campaigns)}
            onOpenVideos={() => void navigate(APP_PATHS.videos)}
            onOpenCharacters={() => void navigate(APP_PATHS.characters)}
            onOpenOutfits={() => void navigate(APP_PATHS.outfits)}
            onLogout={() => void logout.request()}
          />
        </div>

        <StudioWorkspace
          refs={{
            main: mainRef,
            fullscreen: fullscreenWorkspaceRef,
            uploadToggle: uploadToggleRef,
          }}
          route={{
            organizationActive: organizationRouteActive,
            projectContextActive,
            projectActive: projectRouteActive,
            campaignActive: campaignRouteActive,
            projectRecordingAvailable,
          }}
          guide={{
            visible: firstSuccessGuideVisible,
            dismiss: () => setFirstSuccessGuideVisible(false),
          }}
          controllers={{
            session,
            takeReview,
            videoEditor,
            savedVideo,
            project,
            projectProcessing,
          }}
          environment={{
            browser,
            desktopLayout: desktopStudioLayout,
            ownerUserId: auth.session!.user.id,
          }}
          stage={{
            presentation: stagePresentation,
            aspectRatio: stageAspectRatio,
            notices: stageNotices,
            editPreview: videoEditPreview,
            experienceLabel: currentExperienceLabel,
            experienceImageAssetId: currentExperienceImageAssetId,
            recordingMode: effectiveRecordingMode,
            recordingCharacterAttribution,
            recordingSource: activeRecordingSource,
          }}
          activity={{
            captureBlockedReason,
            captureSettingsDisabledReason,
            aiSessionActive,
          }}
          creativeWorkspace={creativeWorkspace}
          projectCreativeCheckpoint={projectCreativeCheckpoint}
          saveVideoState={savedVideoSave.state}
          actions={{
            startExistingVideoRecording,
            closeTakeReview,
            discardExistingVideoSelection,
            openVoiceTreatments: () => openOverlay('voice-treatments'),
            openAiExperience: () => openOverlay('ai-experience'),
            openExistingVideo,
            openCaptureSettings,
            startProjectRecording,
          }}
        />

        <StudioExitGuard
          recordingOrFinalizing={
            recordingActive ||
            finalizingStartedAt !== null ||
            finalizingStream !== null ||
            existingVideo.providerActive
          }
          videoRenderingActive={
            isVideoEditBusy(videoEditor.phase) ||
            projectWorkingMedia.busy ||
            (activeProjectWorkingMediaActivity?.busy ?? false)
          }
          hasTemporaryTake={Boolean(recording.presented)}
          voiceProcessingActive={recording.processingState === 'processing'}
          shelfDirty={shelfDirty || outfit.dirty || character.wardrobeDirty || videoEditor.dirty}
          projectContextDirty={
            projectContextActive &&
            (shelfDirty || outfit.dirty || character.wardrobeDirty || videoEditor.dirty)
          }
          projectSourceActivity={activeProjectSourceActivity}
          projectSession={activeProjectSession}
          onDiscardTemporaryWork={discardTemporaryWork}
        />

        <StudioLifecycleDialogs
          mainRef={mainRef}
          logout={logout}
          savedVideo={savedVideo}
          videoEditor={videoEditor}
          projectContextActive={projectContextActive}
          projectWorkingMedia={projectWorkingMedia}
        />

        <StudioLibraryOverlays
          pathname={location.pathname}
          mainRef={mainRef}
          repository={repository}
          store={repositoryStore}
          onNavigate={(path) => void navigate(path)}
          onUseVideo={savedVideo.useSavedVideo}
          onCreateCharacter={() => {
            void navigate(APP_PATHS.studio);
            character.openNew();
          }}
          onCopyCharacter={(savedCharacter) => {
            void navigate(APP_PATHS.studio);
            character.copy(savedCharacter);
          }}
          onOpenWardrobe={(savedCharacter) => {
            void navigate(APP_PATHS.studio);
            character.openWardrobe(savedCharacter);
          }}
          onUseCharacter={(character) => {
            applyRecipeSelection({
              origin: 'character-prompt',
              prompt: character.prompt,
              modelModeId: 'lucy-latest',
              assetId: character.id,
              characterName: character.name,
              referenceImageAssetId: character.referenceImageAssetId,
              ...(character.builderDraft ? { builderDraft: character.builderDraft } : {}),
            });
            void navigate(APP_PATHS.studio);
          }}
          onCreateOutfit={() => {
            void navigate(APP_PATHS.studio);
            outfit.openNew(false, 'library');
          }}
          onUseOutfit={(savedOutfit) => {
            outfit.selectSaved(savedOutfit);
            void navigate(APP_PATHS.studio);
          }}
        />

        <StudioToolOverlays
          ownerUserId={auth.session!.user.id}
          activeOverlay={activeOverlay}
          desktopStudioLayout={desktopStudioLayout}
          repository={repository}
          store={repositoryStore}
          provider={provider}
          browser={browser}
          session={session}
          advancedLiveSession={advancedLiveSession}
          takeReview={takeReview}
          existingVideo={existingVideo}
          {...(projectContextActive ? { projectProcessing } : {})}
          savedVideo={savedVideo}
          saveVideoState={savedVideoSave.state}
          savedRecipes={existingVideoSavedRecipes}
          handoff={handoff}
          character={character}
          outfit={outfit}
          activeCharacterRecord={activeCharacterRecord}
          characterOpenBlockedReason={characterBuilderOpenBlockedReason}
          characterRemovalBlockedReason={characterRemovalBlockedReason}
          aiSessionActive={aiSessionActive}
          captureSettingsDisabledReason={captureSettingsDisabledReason}
          {...(projectContextActive
            ? { providerStartBlockedReason: PROJECT_PROVIDER_START_BLOCKED_REASON }
            : {})}
          characterSelectorRef={characterSelectorRef}
          outfitToggleRef={outfitToggleRef}
          shelfToggleRef={shelfToggleRef}
          dockToggleRef={dockToggleRef}
          editVideoToggleRef={editVideoToggleRef}
          uploadToggleRef={uploadToggleRef}
          onOpenOverlay={openOverlay}
          onCloseOverlay={closeOverlay}
          onCloseExistingVideo={closeExistingVideo}
          onFinishExistingVideo={finishExistingVideoSetup}
          onStartExistingVideoRecording={startExistingVideoRecording}
          onDiscardExistingVideoSelection={discardExistingVideoSelection}
          onOpenExistingVideo={openExistingVideo}
          onOpenSavedRecipesFor={openSavedRecipesFor}
          onConfigureVirtualTryOn={configureVirtualTryOn}
          onStartPreparedAi={startPreparedAi}
          onUnselectCharacter={unselectCharacter}
          onUnselectAi={unselectAi}
        />
      </div>
    </div>
  );
};

export interface StudioAppProps {
  readonly focusMainOnMount?: boolean;
  readonly initialIntent?: 'upload';
}

export const StudioApp = ({ focusMainOnMount = false, initialIntent }: StudioAppProps) => (
  <RemoteStateProvider>
    <StudioExperience
      focusMainOnMount={focusMainOnMount}
      {...(initialIntent ? { initialIntent } : {})}
    />
  </RemoteStateProvider>
);
