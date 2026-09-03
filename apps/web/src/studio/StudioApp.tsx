import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
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
import { VIDEO_TRANSFORM_INCOMPATIBLE_REASON } from '../features/existing-video/videoTransformLabels';
import { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import { useProjectWorkingMediaController } from '../features/projects/useProjectWorkingMediaController';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import { useProjectCreativeSessionAdapter } from '../features/projects/useProjectCreativeSessionAdapter';
import { PROJECT_PROVIDER_START_BLOCKED_REASON } from '../features/projects/projectProcessingPresentation';
import { PROJECT_VOICE_UNAVAILABLE_REASON } from '../features/projects/projectVoiceCopy';
import type {
  ProjectCreateOperationId,
  ProjectCreateRuntime,
} from '../features/projects/ProjectRouteSurface';
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
import {
  deriveOwnedMediaAcquisitionNotices,
  useOwnedMediaAcquisition,
} from './useOwnedMediaAcquisition';
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
    case 'voice-selector':
      return 'voice';
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
    voiceToggleRef,
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
  const location = useLocation();
  const { availability, state: capabilityState, retry: retryProviderAvailability } = provider;
  const savedVideoSave = useSaveVideo(Boolean(availability.directSavedVideoUploadAvailable));

  const contextualProjectId = useProjectVideoCreationContext({
    pathname: location.pathname,
    locationKey: location.key,
    creationIntent,
    requestedCreationProjectId,
    validCreationProjectId,
  });

  useEffect(() => {
    if (creationIntent !== 'upload' || location.pathname !== APP_PATHS.create) return;
    openOverlay('video-upload');
  }, [creationIntent, location.pathname, openOverlay]);

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
    publishStageSource,
    publishValidatedVideo,
  } = takeReview;
  const project = useStudioProjectBridge({
    projectId: activeProjectId,
    recordingLifecycle: recording.lifecycle,
    recordingOriginal: recording.original,
    presentSource: publishStageSource,
    clearSource: recording.discard,
  });
  const mediaAcquisition = useOwnedMediaAcquisition({ recording });
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
    launchingOperation,
    launchedOperation,
    clearCreateLaunch,
  } = useStudioRecordingLaunch({
    browser,
    session,
    recording,
    recordingActive,
    stagePresentationKind: takeReview.stagePresentation.kind,
    existingVideo,
    creationIntent,
    activeProjectId,
    projectSourceActivity: activeProjectSourceActivity,
    acquireOwnedMedia: mediaAcquisition.acquire,
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
  const openVoiceSelector = useCallback(() => openOverlay('voice-selector'), [openOverlay]);

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
    window.requestAnimationFrame(() => characterSelectorRef.current?.focus());
  }, [characterSelectorRef, clearActiveCharacter, closeOverlayIf]);
  const unselectAi = useCallback(() => {
    if (!clearActiveRecipe()) return;
    closeOverlayIf(['character-selector', 'outfit-selector']);
    window.requestAnimationFrame(() => characterSelectorRef.current?.focus());
  }, [characterSelectorRef, clearActiveRecipe, closeOverlayIf]);
  const openTakeReview = useCallback(() => openOverlay('take-review'), [openOverlay]);
  // A Create launch opens the editor from the inspector column, so focus must come back to the card
  // that was pressed rather than to the stage rail on the other side of the layout. Every other way
  // in clears it, or closing a rail-opened editor would jump to a card nobody touched.
  const createLaunchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [createLaunchActive, setCreateLaunchActive] = useState(false);
  const focusEditVideo = useCallback(() => {
    window.requestAnimationFrame(() =>
      (createLaunchTriggerRef.current ?? editVideoToggleRef.current)?.focus(),
    );
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
  /*
   * Spends the "Edit video" launch. It lives here rather than in the launch hook because only
   * this controller can open the editor, and only once it has been rebuilt around the new media —
   * so this is also where the launch ends, in the same act as the dispatch it pays for.
   *
   * Read off the launch itself rather than mirrored into a ref here. A ref could not be reset by
   * the hook, so a launch the operator abandoned — a cancelled acquisition, a refused adoption, a
   * change of Project — stayed armed and opened this editor unbidden at the next ready video; and
   * because a ref is not reactive, pressing "Edit video" with a video already in hand changed
   * nothing this effect could see, so it never fired at all.
   */
  const { openVideoAdjust } = savedVideo;
  useEffect(() => {
    if (
      launchedOperation !== 'adjust' ||
      !existingVideo.selection ||
      existingVideo.phase !== 'ready'
    ) {
      return;
    }
    clearCreateLaunch();
    // A workspace launch never travelled through the "Use existing video" chooser, so leaving the
    // editor must not open it either — the operator goes back to the workspace they pressed.
    openVideoAdjust({ returnTo: 'workspace' });
  }, [
    clearCreateLaunch,
    existingVideo.phase,
    existingVideo.selection,
    launchedOperation,
    openVideoAdjust,
  ]);
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
        savedVideoLoadFailure: savedVideo.loadFailure,
        pendingVoiceName: existingVideoPendingVoiceName,
        projectVideoAttachment,
        routeOriginProjectId,
        onLeaveUnavailableVideo: nav.goBackTo,
        onDismissSavedVideoLoadFailure: savedVideo.dismissLoadFailure,
        onRetryProjectVideoAttachment: retryProjectVideoAttachment,
      }),
    [
      directVideoLoad,
      existingVideoPendingVoiceName,
      nav,
      projectVideoAttachment,
      retryProjectVideoAttachment,
      routeOriginProjectId,
      savedVideo.dismissLoadFailure,
      savedVideo.loadFailure,
    ],
  );
  const cancelMediaAcquisition = mediaAcquisition.cancel;
  const dismissMediaAcquisitionError = mediaAcquisition.dismissError;
  const acquireMedia = mediaAcquisition.acquire;
  const mediaAcquisitionNotices = useMemo(
    () =>
      deriveOwnedMediaAcquisitionNotices(mediaAcquisition.state, {
        onCancel: () => {
          cancelMediaAcquisition();
          clearExistingVideoIntent();
        },
        onRetry: () => void acquireMedia(),
        onDismissError: () => {
          dismissMediaAcquisitionError();
          clearExistingVideoIntent();
        },
      }),
    [
      acquireMedia,
      cancelMediaAcquisition,
      clearExistingVideoIntent,
      dismissMediaAcquisitionError,
      mediaAcquisition.state,
    ],
  );
  const effectiveStageNotices = useMemo(
    () => [...stageNotices, ...contextualStageNotices, ...mediaAcquisitionNotices],
    [contextualStageNotices, mediaAcquisitionNotices, stageNotices],
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
  const openEditorFromRail = useCallback(() => {
    createLaunchTriggerRef.current = null;
    setCreateLaunchActive(false);
    // Inside a Project the rail opens the editor directly on the current cut — the same dispatch
    // the Create card makes — instead of detouring through the "Use existing video" chooser. It
    // names itself as the rail so the Create cards do not report a press made somewhere else.
    openPlaybackEditor(projectContextActive ? 'adjust' : undefined, 'rail');
  }, [openPlaybackEditor, projectContextActive]);
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
        // The voice chooser lives inside the existing-video panel, not the editor: adopt the cut
        // if it is not held yet, then open that panel.
        openPlaybackEditor(undefined, 'rail');
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
          liveToolsAvailableDuringPlayback: projectContextActive,
          activeCharacterLabel: activeCharacterName,
          activeOutfitLabel:
            session.draft.mode === 'lucy-vton-latest' && hasDraftContent(session.draft)
              ? (activeRecipeLabel ?? 'Configured VTO')
              : undefined,
          ...(existingVideo.voiceSelection
            ? { activeVoiceLabel: existingVideo.voiceSelection.voiceName }
            : {}),
          // A Project refuses any voice outright: setting one would disable the visual Start with
          // no explanation on this rail. Said here, at the point of choice, rather than after.
          ...(projectContextActive ? { voiceBlockedReason: PROJECT_VOICE_UNAVAILABLE_REASON } : {}),
          recordingActive,
          hasPlaybackVideo: Boolean(recording.presented),
          editVideoBlockedReason: creativeToolBlockedReasons.editVideo,
          liveToolBlockedReason: creativeToolBlockedReasons.liveTools,
        }}
        refs={{
          editVideoToggleRef,
          characterToggleRef: characterSelectorRef,
          outfitToggleRef,
          voiceToggleRef,
        }}
        actions={{
          onOpenEditVideo: openEditorFromRail,
          onOpenCharacter: openCharacterSelector,
          onOpenOutfit: openOutfitSelector,
          onOpenVoice: openVoiceSelector,
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
  const handleCreateLaunch = useCallback(
    (operation: ProjectCreateOperationId, trigger: HTMLButtonElement) => {
      createLaunchTriggerRef.current = trigger;
      setCreateLaunchActive(true);
      // No checkpoint here on purpose. The selection is already on its way to the Project through
      // the ordinary autosave, and the editor's prefill is reactive — it configures the step when
      // the revision lands. Forcing a write first re-presented the stage artifact underneath the
      // media acquisition this launch had just started, and the editor never opened.
      openPlaybackEditor(operation);
    },
    [openPlaybackEditor],
  );
  const projectCreateRuntime = useMemo<ProjectCreateRuntime | null>(
    () =>
      projectContextActive
        ? {
            creative: projectCreative,
            workingMedia: projectWorkingMedia,
            onLaunch: handleCreateLaunch,
            onChooseAnother: chooseAnotherProjectResource,
            // Spent by the launch hook the moment the editor holds the video, so this is the whole
            // truth about whether a launch is still in flight.
            launchingOperation,
            characterSwapAvailable: availability.videoProcessing?.characterSwap.available ?? false,
            virtualTryOnAvailable: availability.videoProcessing?.virtualTryOn.available ?? false,
            visualIncompatibilityReason: existingVideo.visualProviderCompatibility.compatible
              ? null
              : (existingVideo.visualProviderCompatibility.reason ??
                VIDEO_TRANSFORM_INCOMPATIBLE_REASON),
            editorBlockedReason: creativeToolBlockedReasons.editVideo,
          }
        : null,
    [
      availability.videoProcessing,
      chooseAnotherProjectResource,
      creativeToolBlockedReasons.editVideo,
      existingVideo.visualProviderCompatibility,
      handleCreateLaunch,
      launchingOperation,
      projectContextActive,
      projectCreative,
      projectWorkingMedia,
    ],
  );
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
          mediaPersistence: availability.mediaPersistence,
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
        projectCreateRuntime={projectCreateRuntime}
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
        hasUnsavedTake={work.hasTemporaryTake && savedVideo.presentedHasUnsavedChanges}
        voiceProcessingActive={work.voiceProcessingActive}
        creativeWorkDirty={work.creativeWorkDirty}
        // The two halves meet only here: the workflow knows a provider produced these bytes, the
        // saved-video controller knows they have not been written down anywhere.
        unsavedProviderResult={
          existingVideo.providerResultHeld && savedVideo.presentedHasUnsavedChanges
        }
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
        voiceToggleRef={voiceToggleRef}
        editVideoToggleRef={editVideoToggleRef}
        uploadToggleRef={uploadToggleRef}
        {...(createLaunchActive ? { launchTriggerRef: createLaunchTriggerRef } : {})}
        onOpenOverlay={openOverlay}
        onCloseOverlay={closeOverlay}
        onCloseExistingVideo={closeExistingVideo}
        onFinishExistingVideo={finishExistingVideoSetup}
        onStartExistingVideoRecording={startExistingVideoRecording}
        onDiscardExistingVideoSelection={discardExistingVideoSelection}
        onEditVideo={openEditorFromRail}
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
