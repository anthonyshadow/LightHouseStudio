import { useTheme } from '@emotion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { detectBrowserCapabilities } from '../adapters/browser-media/browserMedia';
import { useAuth } from '../application/auth/AuthProvider';
import { RemoteStateProvider } from '../application/remote-state/RemoteStateProvider';
import { APP_PATHS, studioCreatePath } from '../app/paths';
import type { PromptCommittedHandler } from '../application/types';
import { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import { useProjectWorkingMediaController } from '../features/projects/useProjectWorkingMediaController';
import { useProjectCreativeSessionAdapter } from '../features/projects/useProjectCreativeSessionAdapter';
import { useProjectProcessingController } from '../features/projects/useProjectProcessingController';
import {
  ProjectCreativeCheckpointPanel,
  PROJECT_PROVIDER_START_BLOCKED_REASON,
} from '../features/projects/ProjectCreativeCheckpointPanel';
import { hasDraftContent } from '../features/media-session';
import { persistedReferenceAssetId } from '../features/media-session/types';
import { useStudioSession } from '../orchestration/session';
import { headerRegionStyles, pageStyles, shellStyles, skipLinkStyles } from './StudioApp.styles';
import {
  CreativeWorkspace,
  type AuxiliaryPanel,
  type CreativeWorkspaceState,
} from './CreativeWorkspace';
import { StudioExitGuard } from './StudioExitGuard';
import { StudioHeader } from './StudioHeader';
import { AssetCreationLauncher } from './AssetCreationLauncher';
import { isStudioFormError } from './studioStageNotices';
import { deriveStudioContextualNotices } from './studioContextualNotices';
import { useProviderAvailability } from './useProviderAvailability';
import { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import { useTakeReviewFlow } from './useTakeReviewFlow';
import { useDesktopStudioLayout } from './useDesktopStudioLayout';
import { useStudioOverlayController, type ActiveOverlay } from './useStudioOverlayController';
import { useStudioProjectBridge } from './useStudioProjectBridge';
import { useStudioSavedVideoController } from './useStudioSavedVideoController';
import { StudioLibraryOverlays } from './StudioLibraryOverlays';
import { StudioLifecycleDialogs } from './StudioLifecycleDialogs';
import { StudioWorkspace } from './StudioWorkspace';
import { useStudioOutfitWorkflow } from './useStudioOutfitWorkflow';
import { useStudioCharacterWorkflow } from './useStudioCharacterWorkflow';
import { StudioToolOverlays } from './StudioToolOverlays';
import { currentExperienceLabel as resolveCurrentExperienceLabel } from './studioActivityPolicy';
import { useStudioCreativeRepository } from './useStudioCreativeRepository';
import { useStudioStageModel } from './useStudioStageModel';
import { useStudioActivityModel } from './useStudioActivityModel';
import { useStudioCharacterAttribution } from './useStudioCharacterAttribution';
import { useStudioLibraryHandoff } from './useStudioLibraryHandoff';
import { useStudioLiveExperience } from './useStudioLiveExperience';
import { useStudioNavigationActions } from './useStudioNavigationActions';
import { useStudioRecordingLaunch } from './useStudioRecordingLaunch';
import { useStudioRouteContext } from './useStudioRouteContext';
import { useStudioSessionLifecycle } from './useStudioSessionLifecycle';
import { useDirectSavedVideoRoute } from './useDirectSavedVideoRoute';
import { useProjectVideoAttachment } from './useProjectVideoAttachment';
import { useProjectVideoCreationContext } from './useProjectVideoCreationContext';
import { useSaveVideo } from '../features/saved-videos/useSaveVideo';

const noopPromptCommitted: PromptCommittedHandler = () => undefined;

const creativePanelForOverlay = (overlay: ActiveOverlay): AuxiliaryPanel => {
  if (overlay === 'workshop') return 'workshop';
  return 'closed';
};

const creativeToolForOverlay = (
  overlay: ActiveOverlay,
  panel: AuxiliaryPanel,
  videoEditing: boolean,
): CreativeWorkspaceState['activeTool'] => {
  if (videoEditing) return 'edit-video';
  switch (overlay) {
    case 'video-upload':
      return 'edit-video';
    case 'character-selector':
    case 'saved-characters':
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
  const nav = useStudioNavigationActions();
  const {
    creationIntent,
    queryCreationIntent,
    requestedCreationProjectId,
    validCreationProjectId,
    directVideoId,
    routeOriginProjectId,
    activeProjectId,
    projectRouteActive,
    campaignRouteActive,
    dashboardRouteActive,
    assetsRouteActive,
    liveRouteActive,
    projectOverviewActive,
    organizationRouteActive,
    projectContextActive,
  } = useStudioRouteContext(initialIntent);
  const fullscreenWorkspaceRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const quickCreateTriggerRef = useRef<HTMLElement>(null);
  const [assetCreationLauncherOpen, setAssetCreationLauncherOpen] = useState(false);
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
  } = useStudioOverlayController(creationIntent === 'upload' ? 'video-upload' : null);

  const contextualProjectId = useProjectVideoCreationContext({
    pathname: location.pathname,
    locationKey: location.key,
    queryCreationIntent,
    requestedCreationProjectId,
    validCreationProjectId,
  });

  useEffect(() => {
    if (creationIntent !== 'upload' || location.pathname !== APP_PATHS.create) return;
    openOverlay('video-upload');
    if (initialIntent === 'upload' && location.state !== null) {
      void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [
    creationIntent,
    initialIntent,
    location.pathname,
    location.search,
    location.state,
    navigate,
    openOverlay,
  ]);

  useEffect(() => {
    if (desktopStudioLayout) closeOverlayIf(['capture-settings']);
  }, [closeOverlayIf, desktopStudioLayout]);
  const [firstSuccessGuideVisible, setFirstSuccessGuideVisible] = useState(false);
  const promptCommittedHandlerRef = useRef<PromptCommittedHandler>(noopPromptCommitted);
  const characterSelectorRef = useRef<HTMLButtonElement>(null);
  const outfitToggleRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const editVideoToggleRef = useRef<HTMLButtonElement>(null);
  const uploadToggleRef = useRef<HTMLButtonElement>(null);
  const focusStudio = useCallback(() => {
    window.requestAnimationFrame(() => mainRef.current?.focus());
  }, []);
  const closeTakeReview = useCallback(() => {
    closeOverlay();
    focusStudio();
  }, [closeOverlay, focusStudio]);
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
    recordingMode,
    recordingSource,
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
    ...(activeProjectId !== null
      ? {
          standaloneVisualSubmissionBlockedReason:
            'Project visual processing must start through the recoverable Project command.',
        }
      : {}),
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
  const {
    startLocalRecording,
    startExistingVideoRecording,
    startProjectRecording,
    openPlaybackEditor,
    openExistingVideo,
    clearExistingVideoIntent,
    discardPendingAdoption,
  } = useStudioRecordingLaunch({
    browser,
    session,
    recording,
    recordingActive,
    stagePresentationKind: takeReview.stagePresentation.kind,
    existingVideo,
    creationIntent,
    projectContextActive,
    activeProjectId,
    projectSourceActivity: activeProjectSourceActivity,
    openOverlay,
    closeOverlay,
    focusMain: focusStudio,
  });

  const {
    aiSessionActive,
    sessionModeLocked,
    finalizing,
    creativeConfigurationMediaLocked,
    creativeConfigurationSessionModeLocked,
    characterBuilderActivityBlockedReason,
    characterBuilderOpenBlockedReason,
    characterRemovalBlockedReason,
    captureBlockedReason,
    captureSettingsDisabledReason,
  } = useStudioActivityModel({ session, takeReview, projectContextActive });

  const liveExperience = useStudioLiveExperience({
    availability,
    capabilityState,
    liveRouteActive,
    projectContextActive,
    session,
    openOverlay,
    closeOverlay,
    onClearExistingVideoIntent: clearExistingVideoIntent,
  });

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
    workshopDraft,
    workshopDrafts,
    referenceUsePending,
    referenceUseFailureMessage,
    canContinueReferenceUseWithoutImage,
    characterBuilderSaveBlockedReason,
  } = handoff.state;
  const {
    recordCommittedPrompt,
    rememberWorkshopDraft,
    useRecipe: applyRecipeSelection,
    clearActiveCharacter,
    clearActiveRecipe,
    retryReferenceUse,
    continueReferenceUseWithoutImage,
    saveBuiltCharacter,
    applyWorkshopPrompt,
    saveWorkshopPrompt,
    openWorkshop,
  } = handoff.actions;
  const outfit = useStudioOutfitWorkflow({
    blockedReason: characterBuilderOpenBlockedReason,
    openOverlay,
    closeOverlay,
    onOpenLibrary: nav.openOutfits,
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
    closeOverlayIf(['ai-settings', 'capture-settings']);
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

  const openCaptureSettings = () => {
    if (recordingActive) return;
    if (desktopStudioLayout) {
      focusDesktopCaptureSettings();
      return;
    }
    openOverlay('capture-settings');
  };

  const openCharacterSelector = useCallback(() => openOverlay('character-selector'), [openOverlay]);
  const openSavedCharacters = useCallback(() => openOverlay('saved-characters'), [openOverlay]);
  const openOutfitSelector = useCallback(() => openOverlay('outfit-selector'), [openOverlay]);

  const creativePanel = creativePanelForOverlay(activeOverlay);
  const activeCreativeTool = creativeToolForOverlay(activeOverlay, creativePanel, videoEditing);
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
  const { activeCharacterRecord, recordingCharacterAttribution } = useStudioCharacterAttribution({
    activeCharacter,
    activeCharacterName,
    activeRecipe,
    store: repositoryStore,
    sessionMode: session.draft.mode,
  });
  const unselectCharacter = useCallback(() => {
    if (!clearActiveCharacter()) return;
    closeOverlayIf(['character-selector']);
    window.requestAnimationFrame(() =>
      (desktopStudioLayout ? characterSelectorRef.current : mainRef.current)?.focus(),
    );
  }, [clearActiveCharacter, closeOverlayIf, desktopStudioLayout]);
  const unselectAi = useCallback(() => {
    if (!clearActiveRecipe()) return;
    closeOverlayIf(['character-selector', 'outfit-selector']);
    window.requestAnimationFrame(() =>
      (desktopStudioLayout ? characterSelectorRef.current : mainRef.current)?.focus(),
    );
  }, [clearActiveRecipe, closeOverlayIf, desktopStudioLayout]);
  const openVideoUpload = useCallback(() => openOverlay('video-upload'), [openOverlay]);
  const openTakeReview = useCallback(() => openOverlay('take-review'), [openOverlay]);
  const libraryHandoff = useStudioLibraryHandoff({
    nav,
    character,
    outfit,
    existingVideo,
    applyRecipeSelection,
    openVideoUpload,
  });
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
    navigateToStudio: nav.replaceWithStudio,
    openVideoUpload,
    openTakeReview,
    closeOverlay,
    focusStudio,
    focusEditVideo,
  });
  const discardSavedVideoWork = savedVideo.discardWork;
  const resetDirectSavedVideoWork = useCallback(() => {
    discardSavedVideoWork();
    existingVideo.reset(true);
    closeOverlay();
  }, [closeOverlay, discardSavedVideoWork, existingVideo]);
  const directVideoLoad = useDirectSavedVideoRoute({
    videoId: directVideoId,
    locationKey: location.key,
    load: savedVideo.loadSavedVideoRoute,
    reset: resetDirectSavedVideoWork,
  });

  const newlySavedVideoId =
    savedVideoSave.state.status === 'saved' ? savedVideoSave.state.video.id : null;
  const { state: projectVideoAttachment, retry: retryProjectVideoAttachment } =
    useProjectVideoAttachment({
      projectId: contextualProjectId,
      savedVideoId: newlySavedVideoId,
    });
  const existingVideoPendingVoiceName = existingVideo.pendingVoiceSelection?.voiceName ?? null;
  const contextualStageNotices = useMemo(
    () =>
      deriveStudioContextualNotices({
        directVideoLoad,
        pendingVoiceName: existingVideoPendingVoiceName,
        projectVideoAttachment,
        routeOriginProjectId,
        onLeaveUnavailableVideo: nav.goBackTo,
        onRetryProjectVideoAttachment: retryProjectVideoAttachment,
      }),
    [
      directVideoLoad,
      existingVideoPendingVoiceName,
      nav,
      projectVideoAttachment,
      retryProjectVideoAttachment,
      routeOriginProjectId,
    ],
  );
  const effectiveStageNotices = useMemo(
    () => [...stageNotices, ...contextualStageNotices],
    [contextualStageNotices, stageNotices],
  );
  const { logout, sessionExpiry, sessionEnding, discardTemporaryWork, work } =
    useStudioSessionLifecycle({
      auth,
      session,
      recording,
      processing,
      recordingActive,
      finalizing,
      existingVideo,
      videoEditor,
      outfit,
      character,
      projectWorkingMedia,
      projectSourceActivity: activeProjectSourceActivity,
      projectWorkingMediaActivity: activeProjectWorkingMediaActivity,
      projectSession: activeProjectSession,
      discardSavedVideoWork,
      discardPendingAdoption,
      closeOverlay,
    });
  const discardExistingVideoSelection = useCallback(() => {
    if (existingVideo.selection) existingVideo.reset(false);
  }, [existingVideo]);
  const finishExistingVideoSetup = useCallback(() => {
    existingVideo.showResult();
    openOverlay('take-review');
  }, [existingVideo, openOverlay]);
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
        openWorkshopOverlay();
        return;
      }
      if (kind === 'reference') {
        openOverlay('ai-settings');
        return;
      }
      openCharacterSelector();
    },
    [
      openCharacterSelector,
      openOutfitSelector,
      openOverlay,
      openPlaybackEditor,
      openWorkshopOverlay,
    ],
  );
  const creativeWorkspace = (
    <CreativeWorkspace
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
        workshopDraft,
        workshopDrafts,
        recordingActive,
        sessionModeLocked,
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
        hasPlaybackVideo: Boolean(recording.presented),
      }}
      refs={{
        workshopToggleRef,
        editVideoToggleRef,
        characterToggleRef: characterSelectorRef,
        outfitToggleRef,
      }}
      actions={{
        onOpenEditVideo: openPlaybackEditor,
        onOpenCharacter: openCharacterSelector,
        onOpenOutfit: openOutfitSelector,
        onOpenWorkshop: openWorkshop,
        onClose: closeCreativePanel,
        onWorkshopDraftChange: rememberWorkshopDraft,
        onUseWorkshop: applyWorkshopPrompt,
        onSaveWorkshop: (action) => void saveWorkshopPrompt(action),
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
      <div css={shellStyles()}>
        <div css={headerRegionStyles(theme)}>
          <StudioHeader
            availability={availability}
            browser={browser}
            capabilityState={capabilityState}
            user={auth.session!.user}
            accountBusy={logout.busy || logout.preparing}
            activeDestination={
              dashboardRouteActive
                ? 'dashboard'
                : campaignRouteActive
                  ? 'campaigns'
                  : projectRouteActive
                    ? 'projects'
                    : assetsRouteActive
                      ? 'assets'
                      : 'studio'
            }
            onOpenDashboard={nav.openDashboard}
            onOpenStudio={nav.openStudio}
            onOpenProjects={nav.openProjects}
            onOpenCampaigns={nav.openCampaigns}
            onOpenAssets={nav.openAssets}
            onCreateProject={nav.createProject}
            onCreateCampaign={nav.createCampaign}
            onCreateAsset={(trigger) => {
              quickCreateTriggerRef.current = trigger;
              setAssetCreationLauncherOpen(true);
            }}
            onOpenLive={nav.openLive}
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
            dashboardActive: dashboardRouteActive,
            assetsActive: assetsRouteActive,
            liveUnavailableActive: liveRouteActive,
            projectContextActive,
            projectActive: projectRouteActive,
            projectOverviewActive,
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
            notices: effectiveStageNotices,
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
          dashboard={{
            displayName: auth.session!.user.displayName,
            onCreateVideo: nav.openStudio,
            onCreateProject: nav.createProject,
            onCreateCampaign: nav.createCampaign,
            onOpenAssets: nav.openAssets,
            onOpenProjects: nav.openProjects,
            onOpenCampaigns: nav.openCampaigns,
            onOpenProject: nav.openProject,
            onOpenCampaign: nav.openCampaign,
            onOpenVideos: nav.openVideos,
          }}
          assets={{
            creativeStore: repositoryStore,
            characterCount: repositoryStore.savedCharacterPrompts.length,
            outfitCount: repositoryStore.savedPrompts.filter(
              (item) => item.modelModeId === 'lucy-vton-latest',
            ).length,
            onOpen: nav.openAssetLibrary,
            onUploadVideo: nav.uploadVideo,
            onCreateProjectCharacter: character.openNewForProject,
            onCreateProjectOutfit: outfit.openNewForProject,
          }}
          liveBeta={{
            capabilityState,
            betaEnabled: liveExperience.betaEnabled,
            providerConfigured: liveExperience.providerConfigured,
            onOpenStudio: nav.openStudio,
            onOpenDashboard: nav.backToDashboard,
          }}
          saveVideoState={savedVideoSave.state}
          actions={{
            startLocalRecording,
            closeTakeReview,
            discardExistingVideoSelection,
            openVoiceTreatments: () => openOverlay('voice-treatments'),
            openAiExperience: liveExperience.openLiveAiExperience,
            openExistingVideo,
            openCaptureSettings,
            startProjectRecording,
          }}
        />

        <AssetCreationLauncher
          open={assetCreationLauncherOpen}
          projectId={projectRouteActive ? activeProjectId : null}
          returnFocusRef={quickCreateTriggerRef}
          onClose={() => setAssetCreationLauncherOpen(false)}
          onCreateVideo={(intent, projectId) => {
            setAssetCreationLauncherOpen(false);
            nav.navigateTo(
              studioCreatePath({
                ...(intent === 'new' ? {} : { intent }),
                ...(projectId ? { projectId } : {}),
              }),
            );
          }}
          onCreateCharacter={(projectId) => {
            setAssetCreationLauncherOpen(false);
            if (projectId) {
              character.openNewForProject(projectId);
              return;
            }
            nav.openStudio();
            character.openNew();
          }}
          onCreateOutfit={(projectId) => {
            setAssetCreationLauncherOpen(false);
            if (projectId) {
              outfit.openNewForProject(projectId);
              return;
            }
            nav.openStudio();
            outfit.openNew(false, 'library');
          }}
          onOpenVoiceLibrary={nav.openVoices}
        />

        <StudioExitGuard
          recordingOrFinalizing={work.recordingOrFinalizing}
          videoRenderingActive={work.videoRenderingActive}
          hasTemporaryTake={work.hasTemporaryTake}
          voiceProcessingActive={work.voiceProcessingActive}
          creativeWorkDirty={work.creativeWorkDirty}
          projectContextDirty={projectContextActive && work.creativeWorkDirty}
          projectSourceActivity={activeProjectSourceActivity}
          projectSession={activeProjectSession}
          sessionEnding={sessionEnding}
          onDiscardTemporaryWork={discardTemporaryWork}
        />

        <StudioLifecycleDialogs
          mainRef={mainRef}
          logout={logout}
          sessionExpiry={sessionExpiry}
          savedVideo={savedVideo}
          videoEditor={videoEditor}
          projectContextActive={projectContextActive}
          projectWorkingMedia={projectWorkingMedia}
          saveSuccessSuppressed={contextualProjectId !== null}
          onOpenSavedVideosLibrary={nav.openVideos}
          onCreateAnotherVideo={() => {
            discardTemporaryWork();
            focusStudio();
          }}
        />

        <StudioLibraryOverlays
          pathname={location.pathname}
          mainRef={mainRef}
          repository={repository}
          store={repositoryStore}
          onNavigate={nav.navigateTo}
          onUseVideo={savedVideo.useSavedVideo}
          onCreateCharacter={libraryHandoff.createCharacter}
          onCopyCharacter={libraryHandoff.copyCharacter}
          onOpenWardrobe={libraryHandoff.openWardrobe}
          onUseCharacter={libraryHandoff.useCharacter}
          onCreateOutfit={libraryHandoff.createOutfit}
          onUseOutfit={libraryHandoff.useOutfit}
          voiceLibraryUnavailableReason={
            availability.elevenLabs
              ? null
              : 'Saving, removing, and using voices needs a configured ElevenLabs provider. Browsing and previewing stay available.'
          }
          onUseVoice={libraryHandoff.useVoice}
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
          advancedLiveSession={liveExperience.advancedLiveSession}
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
          mainRef={mainRef}
          characterSelectorRef={characterSelectorRef}
          outfitToggleRef={outfitToggleRef}
          editVideoToggleRef={editVideoToggleRef}
          uploadToggleRef={uploadToggleRef}
          onOpenOverlay={openOverlay}
          onCloseOverlay={closeOverlay}
          onCloseExistingVideo={closeExistingVideo}
          onFinishExistingVideo={finishExistingVideoSetup}
          onStartExistingVideoRecording={startExistingVideoRecording}
          onDiscardExistingVideoSelection={discardExistingVideoSelection}
          onOpenExistingVideo={openExistingVideo}
          onOpenSavedCharacters={openSavedCharacters}
          onOpenSavedOutfits={openOutfitSelector}
          onOpenSavedVideosLibrary={nav.openVideos}
          onConfigureVirtualTryOn={liveExperience.configureVirtualTryOn}
          onStartPreparedAi={liveExperience.startPreparedAi}
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
