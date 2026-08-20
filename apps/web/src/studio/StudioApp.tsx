import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { hydrateReferenceImage } from '../adapters/api-client/apiClient';
import { useAuth } from '../application/auth/AuthProvider';
import type { ExistingVideoCharacterPort } from '../app/shell/studioHandoff';
import type { StudioRuntimeRegistry } from '../app/shell/studioRuntimeWork';
import type { ShellServices } from '../app/shell/useShellServices';
import { APP_PATHS } from '../app/paths';
import type { PromptCommittedHandler } from '../application/types';
import {
  savedCharacterStepInput,
  useExistingVideoWorkflow,
} from '../features/existing-video/useExistingVideoWorkflow';
import { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import { useProjectWorkingMediaController } from '../features/projects/useProjectWorkingMediaController';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import { useProjectCreativeSessionAdapter } from '../features/projects/useProjectCreativeSessionAdapter';
import {
  ProjectCreativeCheckpointPanel,
  PROJECT_PROVIDER_START_BLOCKED_REASON,
} from '../features/projects/ProjectCreativeCheckpointPanel';
import { hasDraftContent } from '../features/media-session';
import { persistedReferenceAssetId } from '../features/media-session/types';
import { useStudioSession } from '../orchestration/session';
import { ReferenceUseFailureNotice } from './ReferenceUseFailureNotice';
import { CreativeWorkspace, type CreativeWorkspaceState } from './CreativeWorkspace';
import { StudioExitGuard } from './StudioExitGuard';
import { isStudioFormError } from './studioStageNotices';
import { deriveStudioContextualNotices } from './studioContextualNotices';
import { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import { useTakeReviewFlow } from './useTakeReviewFlow';
import type { ActiveOverlay } from './useStudioOverlayController';
import { useStudioProjectBridge } from './useStudioProjectBridge';
import { useStudioSavedVideoController } from './useStudioSavedVideoController';
import { StudioLifecycleDialogs } from './StudioLifecycleDialogs';
import { StudioWorkspace } from './StudioWorkspace';
import { StudioToolOverlays } from './StudioToolOverlays';
import { currentExperienceLabel as resolveCurrentExperienceLabel } from './studioActivityPolicy';
import { useStudioStageModel } from './useStudioStageModel';
import { useStudioActivityModel } from './useStudioActivityModel';
import { useStudioCharacterAttribution } from './useStudioCharacterAttribution';
import { useStudioLiveExperience } from './useStudioLiveExperience';
import { useStudioRecordingLaunch } from './useStudioRecordingLaunch';
import { useStudioSessionLifecycle } from './useStudioSessionLifecycle';
import { useDirectSavedVideoRoute } from './useDirectSavedVideoRoute';
import { useProjectVideoAttachment } from './useProjectVideoAttachment';
import { useProjectVideoCreationContext } from './useProjectVideoCreationContext';
import { useSaveVideo } from '../features/saved-videos/useSaveVideo';

const noopPromptCommitted: PromptCommittedHandler = () => undefined;

const creativeToolForOverlay = (
  overlay: ActiveOverlay,
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
      return null;
  }
};

const focusDesktopCaptureSettings = () => {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[data-desktop-capture-settings]')?.focus();
  });
};

export interface StudioAppProps {
  /** Everything the shell owns and the runtime borrows: route, nav, library, overlays, refs. */
  readonly services: ShellServices;
  /** The shell's teardown coordinator and status channel. */
  readonly runtimeRegistry: StudioRuntimeRegistry;
  readonly sessionEnding: boolean;
}

/**
 * The Studio's live-media runtime: capture, take review, uploads, local editing, and the stage they
 * all share. It belongs to the routes that own live media and is torn down on the way out of them,
 * so nothing here may hold state another surface needs — that lives in the shell.
 */
export const StudioApp = ({ services, runtimeRegistry, sessionEnding }: StudioAppProps) => {
  const {
    route,
    nav,
    desktopStudioLayout,
    browser,
    provider,
    creative,
    overlay,
    outfit,
    character,
    openVideoUpload,
    confirmation,
    handoff: studioHandoff,
    projectProcessing,
    reportProjectSession,
    mainRef,
    characterSelectorRef,
    outfitToggleRef,
    editVideoToggleRef,
  } = services;
  // Runtime-local: nothing outside the capture graph reads these.
  const uploadToggleRef = useRef<HTMLButtonElement>(null);
  const fullscreenWorkspaceRef = useRef<HTMLDivElement>(null);
  // The docked desktop panel rests collapsed so the stage and the two primary actions own the
  // surface. Runtime-local: capture settings mean nothing on a route without live media.
  const [captureSettingsExpanded, setCaptureSettingsExpanded] = useState(false);
  const captureSettingsFocusRequestRef = useRef(false);
  const {
    creationIntent,
    queryCreationIntent,
    requestedCreationProjectId,
    validCreationProjectId,
    directVideoId,
    routeOriginProjectId,
    activeProjectId,
    projectContextActive,
  } = route;
  const {
    repository,
    store: repositoryStore,
    existingVideoSavedRecipes,
    recordAcceptedBatchStep,
  } = creative;
  const {
    active: activeOverlay,
    open: openOverlay,
    close: closeOverlay,
    closeIf: closeOverlayIf,
  } = overlay;

  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { availability, state: capabilityState, retry: retryProviderAvailability } = provider;
  const savedVideoSave = useSaveVideo(Boolean(availability.directSavedVideoUploadAvailable));

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
    // Router state carried the intent in; drop it so Back cannot re-open the upload panel.
    if (location.state !== null) {
      void navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [creationIntent, location.pathname, location.search, location.state, navigate, openOverlay]);

  useEffect(() => {
    if (desktopStudioLayout) closeOverlayIf(['capture-settings']);
  }, [closeOverlayIf, desktopStudioLayout]);
  const promptCommittedHandlerRef = useRef<PromptCommittedHandler>(noopPromptCommitted);
  const focusStudio = useCallback(() => {
    window.requestAnimationFrame(() => mainRef.current?.focus());
  }, [mainRef]);
  const closeTakeReview = useCallback(() => {
    closeOverlay();
    focusStudio();
  }, [closeOverlay, focusStudio]);
  const handlePromptCommitted = useCallback<PromptCommittedHandler>(
    (...args) => promptCommittedHandlerRef.current(...args),
    [],
  );
  const session = useStudioSession({
    availability,
    ownerUserId: auth.session!.user.id,
    onPromptCommitted: handlePromptCommitted,
  });
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
  // Both consumers: the bridge scopes it to this Project for the runtime's own use, and the shell
  // keeps the one active slot that logout, expiry and Project processing read.
  const reportBridgeSession = project.handleSession;
  const handleProjectSession = useCallback(
    (session: ProjectSessionPort | null) => {
      reportBridgeSession(session);
      reportProjectSession(session);
    },
    [reportBridgeSession, reportProjectSession],
  );
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
    finalizing,
    creativeConfigurationMediaLocked,
    creativeConfigurationSessionModeLocked,
    characterBuilderActivityBlockedReason,
    characterBuilderOpenBlockedReason,
    characterRemovalBlockedReason,
    creativeToolBlockedReasons,
    captureBlockedReason,
    captureSettingsDisabledReason,
  } = useStudioActivityModel({
    session,
    takeReview,
    creativeConfigurationIsDurable: projectContextActive,
  });

  const liveExperience = useStudioLiveExperience({
    availability,
    projectContextActive,
    session,
    openOverlay,
    closeOverlay,
    confirmation,
    onClearExistingVideoIntent: clearExistingVideoIntent,
  });

  const handoff = useReferenceRecipeHandoff({
    repository,
    store: repositoryStore,
    session,
    mediaLocked: creativeConfigurationMediaLocked,
    sessionModeLocked: creativeConfigurationSessionModeLocked,
    characterBuilderOpenBlockedReason,
    closeOverlay,
    confirmation,
  });
  const {
    activeRecipe,
    activeCharacter,
    activeCharacterName,
    activeRecipeLabel,
    referenceUseFailureMessage,
    canContinueReferenceUseWithoutImage,
    characterBuilderSaveBlockedReason,
  } = handoff.state;
  const {
    recordCommittedPrompt,
    useRecipe: applyRecipeSelection,
    clearActiveCharacter,
    clearActiveRecipe,
    retryReferenceUse,
    continueReferenceUseWithoutImage,
    saveBuiltCharacter,
  } = handoff.actions;
  const projectCreative = useProjectCreativeSessionAdapter({
    projectId: activeProjectId,
    projectSession: activeProjectSession,
    studioSession: session,
    handoff,
    repository,
    store: repositoryStore,
    existingVideo,
  });

  useLayoutEffect(() => {
    promptCommittedHandlerRef.current = recordCommittedPrompt;
    return () => {
      if (promptCommittedHandlerRef.current === recordCommittedPrompt) {
        promptCommittedHandlerRef.current = noopPromptCommitted;
      }
    };
  }, [recordCommittedPrompt]);

  // A non-form session error is reported as a stage notice, so the capture panel steps aside to
  // keep that notice reachable. AI Settings deliberately stays open: it owns Start/Apply/Reset, so
  // it is the surface the disconnect recovery copy points at, and mode switching is locked while
  // local media is live — closing it would strand a disconnected session with no way back.
  useEffect(() => {
    if (!session.error || isStudioFormError(session.error)) return;
    closeOverlayIf(['capture-settings']);
  }, [closeOverlayIf, session.error]);

  // Focus follows the panel becoming focusable, not the request: a collapsed panel is inside a
  // `hidden` subtree, so recovery has to expand it first and focus it once React has committed.
  useEffect(() => {
    if (!captureSettingsExpanded || !captureSettingsFocusRequestRef.current) return;
    captureSettingsFocusRequestRef.current = false;
    focusDesktopCaptureSettings();
  }, [captureSettingsExpanded]);
  const openDesktopCaptureSettings = useCallback(() => {
    if (captureSettingsExpanded) {
      focusDesktopCaptureSettings();
      return;
    }
    captureSettingsFocusRequestRef.current = true;
    setCaptureSettingsExpanded(true);
  }, [captureSettingsExpanded]);
  const toggleCaptureSettings = useCallback(
    () => setCaptureSettingsExpanded((expanded) => !expanded),
    [],
  );

  const clearSessionError = session.clearError;
  const openCaptureSettingsForRecovery = useCallback(() => {
    clearSessionError();
    if (desktopStudioLayout) {
      openDesktopCaptureSettings();
      return;
    }
    openOverlay('capture-settings');
  }, [clearSessionError, desktopStudioLayout, openDesktopCaptureSettings, openOverlay]);

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

  const openCaptureSettings = () => {
    if (recordingActive) return;
    if (desktopStudioLayout) {
      openDesktopCaptureSettings();
      return;
    }
    openOverlay('capture-settings');
  };

  const openCharacterSelector = useCallback(() => openOverlay('character-selector'), [openOverlay]);
  const openSavedCharacters = useCallback(() => openOverlay('saved-characters'), [openOverlay]);
  const openOutfitSelector = useCallback(() => openOverlay('outfit-selector'), [openOverlay]);

  const activeCreativeTool = creativeToolForOverlay(activeOverlay, videoEditing);
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
  }, [characterSelectorRef, clearActiveCharacter, closeOverlayIf, desktopStudioLayout, mainRef]);
  const unselectAi = useCallback(() => {
    if (!clearActiveRecipe()) return;
    closeOverlayIf(['character-selector', 'outfit-selector']);
    window.requestAnimationFrame(() =>
      (desktopStudioLayout ? characterSelectorRef.current : mainRef.current)?.focus(),
    );
  }, [characterSelectorRef, clearActiveRecipe, closeOverlayIf, desktopStudioLayout, mainRef]);
  const openTakeReview = useCallback(() => openOverlay('take-review'), [openOverlay]);
  const focusEditVideo = useCallback(() => {
    window.requestAnimationFrame(() => editVideoToggleRef.current?.focus());
  }, [editVideoToggleRef]);
  const savedVideo = useStudioSavedVideoController({
    existingVideo,
    recording,
    recordingActive,
    comparedExistingVideoArtifact,
    videoEditor,
    saveController: savedVideoSave,
    savedRecipes: existingVideoSavedRecipes,
    recordingCharacterAttribution,
    navigateToStudio: nav.openStudio,
    confirmation,
    openVideoUpload,
    openTakeReview,
    closeOverlay,
    focusStudio,
    focusEditVideo,
  });
  // Published for the surfaces that outlive this runtime. Registered in a layout effect so a
  // selection made on the route that mounted us is applied before first paint, and withdrawn on
  // unmount so the shell holds a selection instead of calling into a torn-down session.
  const { registerPorts } = studioHandoff;
  const selectVoiceForSource = useCallback(
    (voiceId: string, voiceName: string) => {
      if (existingVideo.selection === null) existingVideo.preselectVoice(voiceId, voiceName);
      else existingVideo.selectVoice(voiceId, voiceName);
    },
    [existingVideo],
  );
  const existingVideoCharacter = useMemo<ExistingVideoCharacterPort>(
    () => ({
      providerActive: existingVideo.providerActive,
      hasSelection: existingVideo.selection !== null,
      isCharacterSwapStep: (stepId) =>
        existingVideo.steps.some(
          (candidate) => candidate.id === stepId && candidate.modelId === 'lucy-latest',
        ),
      applyCharacterToStep: async (stepId, snapshot, characterId) => {
        const reference = snapshot.referenceImage
          ? await hydrateReferenceImage(snapshot.referenceImage.assetId, snapshot.referenceImage)
          : null;
        existingVideo.updateStep(stepId, {
          savedRecipeId: characterId,
          characterName: snapshot.name,
          characterVariantName: null,
          ...savedCharacterStepInput(snapshot.prompt, reference?.file ?? null),
        });
      },
    }),
    [existingVideo],
  );
  useLayoutEffect(() => {
    registerPorts({
      applyRecipe: applyRecipeSelection,
      selectVoice: selectVoiceForSource,
      existingVideoCharacter,
      useSavedVideo: (video, intent) => savedVideo.useSavedVideo(video, intent),
      checkpointProjectCreative: () => projectCreative.checkpoint(),
      saveStudioCharacter: saveBuiltCharacter,
    });
    return () => registerPorts(null);
  }, [
    applyRecipeSelection,
    existingVideoCharacter,
    projectCreative,
    registerPorts,
    saveBuiltCharacter,
    savedVideo,
    selectVoiceForSource,
  ]);

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
  const creativeLocks = useMemo(
    () => ({
      characterActivity: characterBuilderActivityBlockedReason,
      characterOpen: characterBuilderOpenBlockedReason,
      characterRemoval: characterRemovalBlockedReason,
      characterSave: characterBuilderSaveBlockedReason,
    }),
    [
      characterBuilderActivityBlockedReason,
      characterBuilderOpenBlockedReason,
      characterBuilderSaveBlockedReason,
      characterRemovalBlockedReason,
    ],
  );
  const { discardTemporaryWork, work } = useStudioSessionLifecycle({
    registry: runtimeRegistry,
    creativeLocks,
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
      if (kind === 'prompt' || kind === 'recipe' || kind === 'reference') {
        openOverlay('ai-settings');
        return;
      }
      openCharacterSelector();
    },
    [openCharacterSelector, openOutfitSelector, openOverlay, openPlaybackEditor],
  );
  const creativeWorkspace = (
    <>
      <CreativeWorkspace
        state={{
          activeTool: activeCreativeTool,
          showDesktopAiTools: desktopStudioLayout,
          liveToolsAvailableDuringPlayback: projectContextActive,
          activeCharacterLabel: activeCharacterName,
          activeOutfitLabel:
            session.draft.mode === 'lucy-vton-latest' && hasDraftContent(session.draft)
              ? (activeRecipeLabel ?? 'Configured VTO')
              : undefined,
          recordingActive,
          hasPlaybackVideo: Boolean(recording.presented),
          editVideoBlockedReason: creativeToolBlockedReasons.editVideo,
          liveToolBlockedReason: creativeToolBlockedReasons.liveTools,
        }}
        refs={{
          editVideoToggleRef,
          characterToggleRef: characterSelectorRef,
          outfitToggleRef,
        }}
        actions={{
          onOpenEditVideo: openPlaybackEditor,
          onOpenCharacter: openCharacterSelector,
          onOpenOutfit: openOutfitSelector,
        }}
      />
      <ReferenceUseFailureNotice
        failure={
          referenceUseFailureMessage
            ? {
                message: referenceUseFailureMessage,
                onRetry: retryReferenceUse,
                ...(canContinueReferenceUseWithoutImage
                  ? { onContinueWithoutReference: continueReferenceUseWithoutImage }
                  : {}),
              }
            : null
        }
      />
    </>
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
    <>
      <StudioWorkspace
        refs={{ fullscreen: fullscreenWorkspaceRef, uploadToggle: uploadToggleRef }}
        route={{ projectContextActive, projectRecordingAvailable }}
        controllers={{ session, takeReview, videoEditor, savedVideo, project, projectProcessing }}
        environment={{
          browser,
          desktopLayout: desktopStudioLayout,
          captureSettingsExpanded,
          ownerUserId: auth.session!.user.id,
          creativeStore: repositoryStore,
          onCreateProjectCharacter: character.openNewForProject,
          onCreateProjectOutfit: outfit.openNewForProject,
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
        activity={{ captureBlockedReason, captureSettingsDisabledReason, aiSessionActive }}
        onProjectSessionChange={handleProjectSession}
        creativeWorkspace={creativeWorkspace}
        projectCreativeCheckpoint={projectCreativeCheckpoint}
        saveVideoState={savedVideoSave.state}
        actions={{
          startLocalRecording,
          closeTakeReview,
          discardExistingVideoSelection,
          openVoiceTreatments: () => openOverlay('voice-treatments'),
          openAiExperience: liveExperience.openLiveAiExperience,
          openExistingVideo,
          openCaptureSettings,
          toggleCaptureSettings,
          startProjectRecording,
        }}
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
        savedVideo={savedVideo}
        videoEditor={videoEditor}
        projectWorkingMedia={projectContextActive ? projectWorkingMedia : null}
        saveSuccessSuppressed={contextualProjectId !== null}
        onOpenSavedVideosLibrary={nav.openVideos}
        onCreateAnotherVideo={() => {
          discardTemporaryWork();
          focusStudio();
        }}
      />

      <StudioToolOverlays
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
        onConfigureVirtualTryOn={() => void liveExperience.configureVirtualTryOn()}
        onStartPreparedAi={(mode) => void liveExperience.startPreparedAi(mode)}
        onUnselectCharacter={unselectCharacter}
        onUnselectAi={unselectAi}
      />
    </>
  );
};
