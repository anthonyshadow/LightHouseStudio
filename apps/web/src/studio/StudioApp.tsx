import { useTheme } from '@emotion/react';
import { projectIdSchema } from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useRouteBack } from '../app/useRouteBack';
import { ApiClientError } from '../adapters/api-client/apiClient';
import { getSavedVideo } from '../adapters/api-client/savedVideosApi';
import { detectBrowserCapabilities } from '../adapters/browser-media/browserMedia';
import { useAuth } from '../application/auth/AuthProvider';
import { RemoteStateProvider } from '../application/remote-state/RemoteStateProvider';
import {
  APP_PATHS,
  campaignPath,
  isAssetsPath,
  isCampaignsPath,
  isProjectWorkspacePath,
  isProjectsPath,
  projectIdFromPath,
  projectPath,
  projectWorkspacePath,
  studioCreatePath,
  studioVideoIdFromPath,
} from '../app/paths';
import type { ModelMode, PromptCommittedHandler } from '../application/types';
import { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import { isVideoEditBusy } from '../features/video-editor/types';
import { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import { useProjectWorkingMediaController } from '../features/projects/useProjectWorkingMediaController';
import { useProjectCreativeSessionAdapter } from '../features/projects/useProjectCreativeSessionAdapter';
import { useProjectProcessingController } from '../features/projects/useProjectProcessingController';
import { attachProjectAsset, getProject } from '../features/projects/projectsApi';
import { projectAssetQueryKeys } from '../features/projects/useProjectAssetsController';
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
import type { StageNotice } from '../features/live-stage';
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

type ProjectVideoCreationContext =
  | Readonly<{ status: 'none' }>
  | Readonly<{ status: 'checking'; projectId: string }>
  | Readonly<{ status: 'ready'; projectId: string }>;

type DirectVideoLoadState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'loading'; videoId: string }>
  | Readonly<{ status: 'ready'; videoId: string }>
  | Readonly<{ status: 'error'; videoId: string; message: string }>;

type DirectVideoLoadResult =
  | Readonly<{ status: 'ready'; requestKey: string }>
  | Readonly<{ status: 'error'; requestKey: string; message: string }>;

type ProjectVideoAttachmentState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'attaching'; projectId: string; videoId: string }>
  | Readonly<{ status: 'error'; projectId: string; videoId: string; message: string }>;

const safeDirectVideoLoadMessage = (error: unknown): string =>
  error instanceof ApiClientError && [403, 404, 410].includes(error.status)
    ? 'This Saved Video is unavailable or has been removed.'
    : 'The Saved Video could not be loaded safely. Your Assets are unchanged.';

const StudioExperience = ({ focusMainOnMount, initialIntent }: StudioExperienceProps) => {
  const theme = useTheme();
  const auth = useAuth();
  const navigate = useNavigate();
  const goBack = useRouteBack();
  const location = useLocation();
  const queryClient = useQueryClient();
  const createQuery = useMemo(
    () => (location.pathname === APP_PATHS.create ? new URLSearchParams(location.search) : null),
    [location.pathname, location.search],
  );
  const queryCreationIntent =
    createQuery?.get('intent') === 'record' || createQuery?.get('intent') === 'upload'
      ? (createQuery.get('intent') as 'record' | 'upload')
      : null;
  const creationIntent = queryCreationIntent ?? initialIntent ?? null;
  const requestedCreationProjectId = createQuery?.get('projectId') ?? null;
  const parsedCreationProjectId = requestedCreationProjectId
    ? projectIdSchema.safeParse(requestedCreationProjectId)
    : null;
  const validCreationProjectId = parsedCreationProjectId?.success
    ? parsedCreationProjectId.data
    : null;
  const directVideoId = studioVideoIdFromPath(location.pathname);
  const routeOriginProjectId = useMemo(() => {
    const state = location.state as { readonly fromProjectId?: unknown } | null;
    const parsed = projectIdSchema.safeParse(state?.fromProjectId);
    return parsed.success ? parsed.data : null;
  }, [location.state]);
  const projectRouteActive = isProjectsPath(location.pathname);
  const campaignRouteActive = isCampaignsPath(location.pathname);
  const dashboardRouteActive = location.pathname === APP_PATHS.dashboard;
  const assetsRouteActive = isAssetsPath(location.pathname);
  const liveRouteActive = location.pathname === APP_PATHS.live;
  const projectWorkspaceActive = isProjectWorkspacePath(location.pathname);
  const projectOverviewActive = projectRouteActive && !projectWorkspaceActive;
  const organizationRouteActive =
    dashboardRouteActive ||
    assetsRouteActive ||
    liveRouteActive ||
    projectOverviewActive ||
    campaignRouteActive;
  const activeProjectId = projectIdFromPath(location.pathname);
  const projectContextActive = projectWorkspaceActive && activeProjectId !== null;
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
  const realtimeBetaEnabled = availability.realtimeBetaEnabled === true;
  const realtimeProviderConfigured = availability.realtimeProviderConfigured ?? availability.decart;
  const realtimeLiveEnabled =
    realtimeBetaEnabled && realtimeProviderConfigured && availability.decart;
  const savedVideoSave = useSaveVideo(Boolean(availability.directSavedVideoUploadAvailable));
  const {
    active: activeOverlay,
    open: openOverlay,
    close: closeOverlay,
    closeIf: closeOverlayIf,
  } = useStudioOverlayController(creationIntent === 'upload' ? 'video-upload' : null);

  const creationContextRequestKey =
    location.pathname === APP_PATHS.create && validCreationProjectId !== null
      ? `${location.key}:${validCreationProjectId}`
      : null;
  const [verifiedProjectVideoCreation, setVerifiedProjectVideoCreation] = useState<{
    readonly requestKey: string;
    readonly projectId: string;
  } | null>(null);
  const projectVideoCreationContext: ProjectVideoCreationContext =
    creationContextRequestKey === null || validCreationProjectId === null
      ? { status: 'none' }
      : verifiedProjectVideoCreation?.requestKey === creationContextRequestKey
        ? { status: 'ready', projectId: validCreationProjectId }
        : { status: 'checking', projectId: validCreationProjectId };
  const directVideoRequestKey = directVideoId === null ? null : `${location.key}:${directVideoId}`;
  const [directVideoLoadResult, setDirectVideoLoadResult] = useState<DirectVideoLoadResult | null>(
    null,
  );
  const directVideoLoad = useMemo<DirectVideoLoadState>(
    () =>
      directVideoId === null || directVideoRequestKey === null
        ? { status: 'idle' }
        : directVideoLoadResult?.requestKey !== directVideoRequestKey
          ? { status: 'loading', videoId: directVideoId }
          : directVideoLoadResult.status === 'ready'
            ? { status: 'ready', videoId: directVideoId }
            : {
                status: 'error',
                videoId: directVideoId,
                message: directVideoLoadResult.message,
              },
    [directVideoId, directVideoLoadResult, directVideoRequestKey],
  );
  const [projectVideoAttachment, setProjectVideoAttachment] = useState<ProjectVideoAttachmentState>(
    { status: 'idle' },
  );
  const [projectVideoAttachmentRetry, setProjectVideoAttachmentRetry] = useState(0);

  useEffect(() => {
    if (location.pathname !== APP_PATHS.create || requestedCreationProjectId === null) {
      return;
    }
    if (validCreationProjectId === null) {
      void navigate(
        studioCreatePath(queryCreationIntent ? { intent: queryCreationIntent } : undefined),
        {
          replace: true,
          state: null,
        },
      );
      return;
    }
    const projectId = validCreationProjectId;
    const requestKey = creationContextRequestKey;
    if (requestKey === null) return;
    const controller = new AbortController();
    void getProject(projectId, controller.signal)
      .then((current) => {
        if (controller.signal.aborted) return;
        if (current.project.status !== 'archived' && current.project.status !== 'deleted') {
          setVerifiedProjectVideoCreation({ requestKey, projectId });
          return;
        }
        void navigate(
          studioCreatePath(queryCreationIntent ? { intent: queryCreationIntent } : undefined),
          { replace: true, state: null },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        void navigate(
          studioCreatePath(queryCreationIntent ? { intent: queryCreationIntent } : undefined),
          { replace: true, state: null },
        );
      });
    return () => controller.abort('creation-context-changed');
  }, [
    creationContextRequestKey,
    location.pathname,
    navigate,
    queryCreationIntent,
    requestedCreationProjectId,
    validCreationProjectId,
  ]);

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
    if (!liveRouteActive || capabilityState !== 'ready' || !realtimeLiveEnabled) return;
    openOverlay('ai-experience');
    void navigate(APP_PATHS.create, { replace: true, state: null });
  }, [capabilityState, liveRouteActive, navigate, openOverlay, realtimeLiveEnabled]);

  useEffect(() => {
    if (desktopStudioLayout) closeOverlayIf(['capture-settings']);
  }, [closeOverlayIf, desktopStudioLayout]);
  const [firstSuccessGuideVisible, setFirstSuccessGuideVisible] = useState(false);
  const [recordingForExistingVideo, setRecordingForExistingVideo] = useState(false);
  const adoptingExistingVideoRecordingRef = useRef<string | null>(null);
  const promptCommittedHandlerRef = useRef<PromptCommittedHandler>(noopPromptCommitted);
  const characterSelectorRef = useRef<HTMLButtonElement>(null);
  const outfitToggleRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const editVideoToggleRef = useRef<HTMLButtonElement>(null);
  const uploadToggleRef = useRef<HTMLButtonElement>(null);
  const closeTakeReview = useCallback(() => {
    closeOverlay();
    window.requestAnimationFrame(() => mainRef.current?.focus());
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
  const openLiveAiExperience = useCallback(() => {
    if (!realtimeLiveEnabled) return;
    openOverlay('ai-experience');
  }, [openOverlay, realtimeLiveEnabled]);

  const creativePanel = creativePanelForOverlay(activeOverlay);
  const activeCreativeTool = creativeToolForOverlay(activeOverlay, creativePanel, videoEditing);
  const captureBlockedReason = resolveCaptureBlockedReason({ reviewLocked });
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
    void navigate(projectWorkspacePath(activeProjectId));
    window.requestAnimationFrame(() => mainRef.current?.focus());
    void session.startLocal();
  }, [
    activeProjectId,
    activeProjectSourceActivity,
    browser,
    closeOverlay,
    navigate,
    recording,
    session,
  ]);
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
  const startAdvancedModel = useCallback(() => {
    if (projectContextActive || !realtimeLiveEnabled) return Promise.resolve();
    setRecordingForExistingVideo(false);
    return session.startModel();
  }, [projectContextActive, realtimeLiveEnabled, session]);
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
  const configureVirtualTryOn = () => {
    if (!realtimeLiveEnabled) return;
    if (!selectExperienceMode('lucy-vton-latest')) return;
    openOverlay('ai-settings');
  };
  const startPreparedAi = (mode: ModelMode) => {
    if (projectContextActive || !realtimeLiveEnabled) return;
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
    void navigate(APP_PATHS.create, { replace: true });
  }, [navigate]);
  const openVideoUpload = useCallback(() => openOverlay('video-upload'), [openOverlay]);
  const openTakeReview = useCallback(() => openOverlay('take-review'), [openOverlay]);
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
    openTakeReview,
    closeOverlay,
    focusStudio,
    focusEditVideo,
  });
  const loadSavedVideoRoute = savedVideo.loadSavedVideoRoute;
  const discardSavedVideoWork = savedVideo.discardWork;
  const directVideoActionsRef = useRef({
    load: loadSavedVideoRoute,
    reset: () => {
      discardSavedVideoWork();
      existingVideo.reset(true);
      closeOverlay();
    },
  });
  useLayoutEffect(() => {
    directVideoActionsRef.current = {
      load: loadSavedVideoRoute,
      reset: () => {
        discardSavedVideoWork();
        existingVideo.reset(true);
        closeOverlay();
      },
    };
  }, [closeOverlay, discardSavedVideoWork, existingVideo, loadSavedVideoRoute]);

  useEffect(() => {
    if (directVideoId === null || directVideoRequestKey === null) return;
    const controller = new AbortController();
    const requestKey = directVideoRequestKey;
    directVideoActionsRef.current.reset();
    void getSavedVideo(directVideoId, controller.signal)
      .then((detail) => directVideoActionsRef.current.load(detail, controller.signal))
      .then(() => {
        if (!controller.signal.aborted) {
          setDirectVideoLoadResult({ status: 'ready', requestKey });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDirectVideoLoadResult({
            status: 'error',
            requestKey,
            message: safeDirectVideoLoadMessage(error),
          });
        }
      });
    return () => controller.abort('saved-video-route-changed');
  }, [directVideoId, directVideoRequestKey]);

  const contextualProjectId =
    projectVideoCreationContext.status === 'ready' ? projectVideoCreationContext.projectId : null;
  const newlySavedVideoId =
    savedVideoSave.state.status === 'saved' ? savedVideoSave.state.video.id : null;
  const projectVideoAttachmentAttemptRef = useRef<string | null>(null);
  useEffect(() => {
    if (contextualProjectId === null || newlySavedVideoId === null) return;
    const attemptKey = `${contextualProjectId}:${newlySavedVideoId}:${projectVideoAttachmentRetry}`;
    if (projectVideoAttachmentAttemptRef.current === attemptKey) return;
    projectVideoAttachmentAttemptRef.current = attemptKey;
    const controller = new AbortController();
    setProjectVideoAttachment({
      status: 'attaching',
      projectId: contextualProjectId,
      videoId: newlySavedVideoId,
    });
    void attachProjectAsset(
      contextualProjectId,
      { kind: 'video', resourceId: newlySavedVideoId },
      controller.signal,
    )
      .then(async () => {
        if (controller.signal.aborted) return;
        await queryClient.invalidateQueries({
          queryKey: projectAssetQueryKeys.project(contextualProjectId),
        });
        if (!controller.signal.aborted) {
          setProjectVideoAttachment({ status: 'idle' });
          void navigate(projectPath(contextualProjectId), { replace: true });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setProjectVideoAttachment({
            status: 'error',
            projectId: contextualProjectId,
            videoId: newlySavedVideoId,
            message:
              'The Video was saved to Assets, but its Project association could not be completed.',
          });
        }
      });
    return () => controller.abort('project-video-context-changed');
  }, [contextualProjectId, navigate, newlySavedVideoId, projectVideoAttachmentRetry, queryClient]);
  const contextualStageNotices = useMemo<readonly StageNotice[]>(() => {
    const notices: StageNotice[] = [];
    if (directVideoLoad.status === 'loading') {
      notices.push({
        id: 'saved-video-route-loading',
        severity: 'info',
        title: 'Loading Saved Video',
        message: 'Validating the current Version before opening review.',
        priority: 250,
      });
    } else if (directVideoLoad.status === 'error') {
      notices.push({
        id: 'saved-video-route-error',
        severity: 'error',
        title: 'Saved Video unavailable',
        message: directVideoLoad.message,
        priority: 500,
        action: {
          label: routeOriginProjectId ? 'Back to Project' : 'Back to Assets',
          onAction: () =>
            goBack(routeOriginProjectId ? projectPath(routeOriginProjectId) : APP_PATHS.videos),
        },
      });
    }
    if (projectVideoAttachment.status === 'attaching') {
      notices.push({
        id: 'project-video-attachment',
        severity: 'info',
        title: 'Video saved',
        message: 'Attaching it to the Project…',
        priority: 350,
      });
    } else if (projectVideoAttachment.status === 'error') {
      notices.push({
        id: 'project-video-attachment',
        severity: 'error',
        title: 'Project attachment needs attention',
        message: projectVideoAttachment.message,
        priority: 550,
        action: {
          label: 'Retry attachment',
          onAction: () => setProjectVideoAttachmentRetry((current) => current + 1),
        },
      });
    }
    return notices;
  }, [directVideoLoad, goBack, projectVideoAttachment, routeOriginProjectId]);
  const effectiveStageNotices = useMemo(
    () => [...stageNotices, ...contextualStageNotices],
    [contextualStageNotices, stageNotices],
  );
  const updateOutfitDirty = outfit.updateDirty;
  const discardWardrobeDirty = character.discardWardrobeDirty;
  const discardLocalTemporaryWork = useCallback(() => {
    adoptingExistingVideoRecordingRef.current = null;
    setRecordingForExistingVideo(false);
    processing.cancel();
    recording.discard();
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
    updateOutfitDirty,
  ]);
  const discardTemporaryWork = useCallback(() => {
    existingVideo.reset(false);
    discardLocalTemporaryWork();
  }, [discardLocalTemporaryWork, existingVideo]);
  const logoutHasTemporaryWork =
    Boolean(recording.presented) ||
    recording.processingState === 'processing' ||
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
  const startLocalRecording = useCallback(() => {
    if (!browser.mediaRecorder || !browser.mediaDevices || !browser.secureContext) return;
    setRecordingForExistingVideo(false);
    closeOverlay();
    window.requestAnimationFrame(() => mainRef.current?.focus());
    void session.startLocal();
  }, [browser, closeOverlay, session]);
  const handledRecordIntentRef = useRef<string | null>(null);
  useEffect(() => {
    if (location.pathname !== APP_PATHS.create || creationIntent !== 'record') return;
    const intentKey = `${location.pathname}${location.search}`;
    if (handledRecordIntentRef.current === intentKey) return;
    handledRecordIntentRef.current = intentKey;
    startLocalRecording();
  }, [creationIntent, location.pathname, location.search, startLocalRecording]);
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
    <div
      css={pageStyles(theme)}
      data-organization-route={organizationRouteActive ? 'true' : undefined}
    >
      <a href="#studio-main" css={skipLinkStyles(theme)}>
        Skip to studio
      </a>
      <div css={shellStyles(theme, organizationRouteActive)}>
        <div css={headerRegionStyles(theme, organizationRouteActive)}>
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
            organizationRouteActive={organizationRouteActive}
            onOpenDashboard={() => void navigate(APP_PATHS.dashboard)}
            onOpenStudio={() => void navigate(APP_PATHS.create)}
            onOpenProjects={() => void navigate(APP_PATHS.projects)}
            onOpenCampaigns={() => void navigate(APP_PATHS.campaigns)}
            onOpenAssets={() => void navigate(APP_PATHS.assets)}
            onCreateProject={() =>
              void navigate(APP_PATHS.projects, { state: { createIntent: 'project' } })
            }
            onCreateCampaign={() =>
              void navigate(APP_PATHS.campaigns, { state: { createIntent: 'campaign' } })
            }
            onCreateAsset={(trigger) => {
              quickCreateTriggerRef.current = trigger;
              setAssetCreationLauncherOpen(true);
            }}
            onOpenLive={() => void navigate(APP_PATHS.live)}
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
            onCreateVideo: () => void navigate(APP_PATHS.create),
            onCreateProject: () =>
              void navigate(APP_PATHS.projects, { state: { createIntent: 'project' } }),
            onCreateCampaign: () =>
              void navigate(APP_PATHS.campaigns, { state: { createIntent: 'campaign' } }),
            onOpenAssets: () => void navigate(APP_PATHS.assets),
            onOpenProjects: () => void navigate(APP_PATHS.projects),
            onOpenCampaigns: () => void navigate(APP_PATHS.campaigns),
            onOpenProject: (projectId) => void navigate(projectPath(projectId)),
            onOpenCampaign: (campaignId) => void navigate(campaignPath(campaignId)),
            onOpenVideos: () => void navigate(APP_PATHS.videos),
          }}
          assets={{
            creativeStore: repositoryStore,
            characterCount: repositoryStore.savedCharacterPrompts.length,
            outfitCount: repositoryStore.savedPrompts.filter(
              (item) => item.modelModeId === 'lucy-vton-latest',
            ).length,
            onOpen: (destination) => {
              const paths = {
                videos: APP_PATHS.videos,
                characters: APP_PATHS.characters,
                outfits: APP_PATHS.outfits,
                voices: APP_PATHS.voices,
              } as const;
              void navigate(paths[destination]);
            },
            onUploadVideo: () =>
              void navigate(APP_PATHS.create, { state: { creationIntent: 'upload' } }),
            onCreateProjectCharacter: character.openNewForProject,
            onCreateProjectOutfit: outfit.openNewForProject,
          }}
          liveBeta={{
            capabilityState,
            betaEnabled: realtimeBetaEnabled,
            providerConfigured: realtimeProviderConfigured,
            onOpenStudio: () => void navigate(APP_PATHS.create),
            onOpenDashboard: () => goBack(APP_PATHS.dashboard),
          }}
          saveVideoState={savedVideoSave.state}
          actions={{
            startLocalRecording,
            closeTakeReview,
            discardExistingVideoSelection,
            openVoiceTreatments: () => openOverlay('voice-treatments'),
            openAiExperience: openLiveAiExperience,
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
            void navigate(
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
            void navigate(APP_PATHS.create);
            character.openNew();
          }}
          onCreateOutfit={(projectId) => {
            setAssetCreationLauncherOpen(false);
            if (projectId) {
              outfit.openNewForProject(projectId);
              return;
            }
            void navigate(APP_PATHS.create);
            outfit.openNew(false, 'library');
          }}
          onOpenVoiceLibrary={() => void navigate(APP_PATHS.voices)}
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
          creativeWorkDirty={outfit.dirty || character.wardrobeDirty || videoEditor.dirty}
          projectContextDirty={
            projectContextActive && (outfit.dirty || character.wardrobeDirty || videoEditor.dirty)
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
            void navigate(APP_PATHS.create);
            character.openNew();
          }}
          onCopyCharacter={(savedCharacter) => {
            void navigate(APP_PATHS.create);
            character.copy(savedCharacter);
          }}
          onOpenWardrobe={(savedCharacter) => {
            void navigate(APP_PATHS.create);
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
            void navigate(APP_PATHS.create);
          }}
          onCreateOutfit={() => {
            void navigate(APP_PATHS.create);
            outfit.openNew(false, 'library');
          }}
          onUseOutfit={(savedOutfit) => {
            outfit.selectSaved(savedOutfit);
            void navigate(APP_PATHS.create);
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
