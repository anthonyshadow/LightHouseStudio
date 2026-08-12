import { useTheme } from '@emotion/react';
import { VIDEO_RESULT_MAX_BYTES, type SavedVideoSummary } from '@studio/contracts';
import { getVideoEditOutputGeometry, resolveCharacterVersion } from '@studio/domain';
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
import { useLocation, useNavigate } from 'react-router';
import { ApiClientError, apiFetch, hydrateReferenceImage } from '../adapters/api-client/apiClient';
import { readBoundedBlob } from '../adapters/api-client/readBoundedBlob';
import { savedVideoContentUrl } from '../adapters/api-client/savedVideosApi';
import { detectBrowserCapabilities } from '../adapters/browser-media/browserMedia';
import { useAuth } from '../application/auth/AuthProvider';
import { RemoteStateProvider } from '../application/remote-state/RemoteStateProvider';
import { APP_PATHS, isProjectsPath, projectIdFromPath } from '../app/paths';
import type { PromptCommittedHandler } from '../application/types';
import type {
  CharacterSaveProgress,
  CharacterSaveSnapshot,
} from '../features/character-builder/characterBuilderControllerSupport';
import type { CharacterSaveStage } from '../features/character-builder/characterBuilderPersistence';
import { persistCharacterSaveSnapshot } from '../features/character-builder/persistCharacterSaveSnapshot';
import { createCreativeAssetRepository } from '../features/creative-assets/repository';
import { useCreativeLibraryCloudSync } from '../features/creative-assets/useCreativeLibraryCloudSync';
import {
  CREATIVE_ASSET_STORAGE_KEY,
  WARDROBE_CREATIVE_ASSET_STORAGE_KEY,
} from '../features/creative-assets/types';
import type { RecipeShelfEntryIntent } from '../features/creative-assets/RecipeShelf.types';
import { savedPromptToRecipeSelection } from '../features/creative-assets/recipeSelection';
import type {
  CharacterVersionSelection,
  RecentPrompt,
  SavedCharacterPrompt,
  SavedCharacterVariant,
  SavedPrompt,
} from '../features/creative-assets/types';
import { useCreativeAssetSelector } from '../features/creative-assets/useCreativeAssetRepository';
import type { ExistingVideoSavedRecipe } from '../features/existing-video/ExistingVideoRecipeChooser';
import {
  savedCharacterStepInput,
  useExistingVideoWorkflow,
} from '../features/existing-video/useExistingVideoWorkflow';
import { MediaStage } from '../features/live-stage';
import { isVideoEditBusy } from '../features/video-editor/types';
import { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import {
  confirmModeReplacement,
  hasDraftContent,
  SessionComposer,
  type StudioMode,
} from '../features/media-session';
import { isModelSessionActive } from '../features/media-session/sessionComposerModel';
import { persistedReferenceAssetId } from '../features/media-session/types';
import { CaptureSettingsPanel, RecordingControls } from '../features/recording';
import type { RecordingArtifact } from '../features/recording/types';
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
import {
  CreativeWorkspace,
  type AuxiliaryPanel,
  type CreativeWorkspaceState,
  type ModelMode,
} from './CreativeWorkspace';
import { AIExperienceChooser } from './AIExperienceChooser';
import { StudioExitGuard } from './StudioExitGuard';
import { StudioHeader } from './StudioHeader';
import { StudioCharacterSelectorOverlay } from './StudioCharacterSelectorOverlay';
import { StudioSessionControlBar } from './StudioSessionControlBar';
import { StudioTakeOverlays } from './StudioTakeOverlays';
import {
  deriveRecordingDurationNotices,
  deriveRealtimeSessionNotices,
  deriveStudioStageNotices,
  isStudioFormError,
} from './studioStageNotices';
import { useCharacterBuilderLaunchController } from './useCharacterBuilderLaunchController';
import { useProviderAvailability } from './useProviderAvailability';
import { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import { useTakeReviewFlow } from './useTakeReviewFlow';
import { useDesktopStudioLayout } from './useDesktopStudioLayout';
import { useStudioOverlayController, type ActiveOverlay } from './useStudioOverlayController';
import { SaveVideoDialog } from '../features/saved-videos/SaveVideoDialog';
import {
  defaultSavedVideoName,
  useSaveVideo,
  type SavedVideoCharacterAttribution,
} from '../features/saved-videos/useSaveVideo';
import { SessionCleanupCoordinator } from '../orchestration/lifecycle/SessionCleanupCoordinator';
import {
  currentBrowserPersistenceScope,
  environmentScopedPersistenceName,
  legacyPersistenceNamesForScope,
} from '../persistence/environmentScope';

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
const CharacterWardrobePanel = lazy(() =>
  import('../features/character-wardrobe/CharacterWardrobePanel').then((module) => ({
    default: module.CharacterWardrobePanel,
  })),
);
const ExistingVideoPanel = lazy(() =>
  import('../features/existing-video/ExistingVideoPanel').then((module) => ({
    default: module.ExistingVideoPanel,
  })),
);
const OutfitBuilder = lazy(() =>
  import('../features/creative-assets/OutfitBuilder').then((module) => ({
    default: module.OutfitBuilder,
  })),
);
const OutfitSelector = lazy(() =>
  import('../features/creative-assets/OutfitSelector').then((module) => ({
    default: module.OutfitSelector,
  })),
);
const SavedCharacterLibrary = lazy(() =>
  import('../features/account-library/SavedCreativeLibrary').then((module) => ({
    default: module.SavedCharacterLibrary,
  })),
);
const SavedOutfitLibrary = lazy(() =>
  import('../features/account-library/SavedCreativeLibrary').then((module) => ({
    default: module.SavedOutfitLibrary,
  })),
);
const VideoGallery = lazy(() =>
  import('../features/video-gallery/VideoGallery').then((module) => ({
    default: module.VideoGallery,
  })),
);
const VideoEditWorkspace = lazy(() =>
  import('../features/video-editor/VideoEditWorkspace').then((module) => ({
    default: module.VideoEditWorkspace,
  })),
);
const ProjectRouteSurface = lazy(() =>
  import('../features/projects/ProjectRouteSurface').then((module) => ({
    default: module.ProjectRouteSurface,
  })),
);

const deferredPanelFallback = <p role="status">Loading studio tool…</p>;

const REVIEW_LOCK_REASON =
  'Save and release or discard the temporary take before starting or changing media.';

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

type CharacterBuilderDestination =
  Readonly<{ kind: 'studio' }> | Readonly<{ kind: 'existing-video'; stepId: string }>;

type OutfitBuilderLaunch = Readonly<{
  outfit?: SavedPrompt;
  saveAsCopy: boolean;
  saveAndSelect: boolean;
  destination: 'selector' | 'shelf' | 'library';
}>;

type PendingVideoSave =
  | Readonly<{
      intent: 'presented';
      artifact: RecordingArtifact;
      source: { readonly videoId: string; readonly versionId: string } | undefined;
      character: SavedVideoCharacterAttribution | null;
    }>
  | Readonly<{
      intent: 'video-edit-replacement';
      artifact: RecordingArtifact;
    }>;

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
  const projectContextActive = projectIdFromPath(location.pathname) !== null;
  const fullscreenWorkspaceRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const desktopStudioLayout = useDesktopStudioLayout();
  const browserPersistenceScope = currentBrowserPersistenceScope();
  const repository = useMemo(
    () =>
      createCreativeAssetRepository({
        storageKey: environmentScopedPersistenceName(
          CREATIVE_ASSET_STORAGE_KEY,
          auth.session!.user.id,
          browserPersistenceScope,
        ),
        legacyStorageKeys: legacyPersistenceNamesForScope(
          [
            `${WARDROBE_CREATIVE_ASSET_STORAGE_KEY}.${auth.session!.user.id}`,
            CREATIVE_ASSET_STORAGE_KEY,
            WARDROBE_CREATIVE_ASSET_STORAGE_KEY,
          ],
          browserPersistenceScope,
        ),
        ownerUserId: auth.session!.user.id,
      }),
    [auth.session, browserPersistenceScope],
  );
  useEffect(() => () => repository.close?.(), [repository]);
  useCreativeLibraryCloudSync(repository, {
    initializeEmptyRemoteFromLocal: browserPersistenceScope === 'production',
  });
  const sessionCleanup = useMemo(() => new SessionCleanupCoordinator(), []);
  const [logoutPromptOpen, setLogoutPromptOpen] = useState(false);
  const [logoutBlockedOpen, setLogoutBlockedOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const repositoryStore = useCreativeAssetSelector(repository, (state) => state.store);
  const existingVideoSavedRecipes = useMemo<readonly ExistingVideoSavedRecipe[]>(() => {
    const variantsByCharacter = new Map<string, SavedCharacterVariant[]>();
    for (const variant of repositoryStore.savedCharacterVariants) {
      const variants = variantsByCharacter.get(variant.parentCharacterId) ?? [];
      variants.push(variant);
      variantsByCharacter.set(variant.parentCharacterId, variants);
    }
    return [
      ...repositoryStore.savedPrompts.map((recipe) => ({
        id: recipe.id,
        label: recipe.title,
        modelId: recipe.modelModeId,
        prompt: recipe.prompt,
        referenceImageAssetId: recipe.referenceImageAssetId,
        vtonInputKind: recipe.vtonInputKind,
        enhancePrompt: recipe.enhancePrompt,
      })),
      ...repositoryStore.savedCharacterPrompts.flatMap((character) => [
        {
          id: character.id,
          label: `${character.name} · Original`,
          modelId: 'lucy-latest' as const,
          prompt: character.prompt,
          referenceImageAssetId: character.referenceImageAssetId,
          vtonInputKind: null,
          enhancePrompt: false,
          savedCharacterPromptId: character.id,
          characterName: character.name,
          originalCharacterVersion: true,
          defaultVoice: character.defaultVoice,
        },
        ...(variantsByCharacter.get(character.id) ?? []).map((variant) => ({
          id: variant.id,
          label: `${character.name} · ${variant.title}`,
          modelId: 'lucy-latest' as const,
          prompt: character.prompt,
          referenceImageAssetId: variant.referenceImageAssetId,
          vtonInputKind: null,
          enhancePrompt: false,
          savedCharacterPromptId: character.id,
          savedCharacterVariantId: variant.id,
          characterName: character.name,
          characterVariantName: variant.title,
          originalCharacterVersion: false,
          defaultVoice: character.defaultVoice,
        })),
      ]),
    ];
  }, [repositoryStore]);
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
      void repository.recordSuccessfulPrompt({
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
  const browser = useMemo(() => detectBrowserCapabilities(), []);
  const {
    availability,
    state: capabilityState,
    retry: retryProviderAvailability,
  } = useProviderAvailability();
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
  const [videoEditDiscardPromptOpen, setVideoEditDiscardPromptOpen] = useState(false);
  const [pendingVideoSave, setPendingVideoSave] = useState<PendingVideoSave | null>(null);
  const galleryEditRequestedRef = useRef(false);
  const gallerySourceLoadControllerRef = useRef<AbortController | null>(null);
  const [loadedSavedSource, setLoadedSavedSource] = useState<{
    readonly videoId: string;
    readonly currentVersionId: string;
    readonly artifactId: string;
    readonly characterName: string | null;
    readonly characterVariantName: string | null;
  } | null>(null);
  const wardrobeCharacter = wardrobeCharacterId
    ? (repositoryStore.savedCharacterPrompts.find((item) => item.id === wardrobeCharacterId) ??
      null)
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
  const activeLoadedSavedSource =
    !loadedSavedSource ||
    !recording.original ||
    recording.original.id === loadedSavedSource.artifactId ||
    recording.original.parentArtifactId === loadedSavedSource.artifactId
      ? loadedSavedSource
      : null;
  const existingVideo = useExistingVideoWorkflow({
    recording,
    processing,
    publishUploadedVideo,
    onSubmissionAccepted: recordAcceptedBatchStep,
    ...(availability.videoProcessing
      ? { videoProcessingCapabilities: availability.videoProcessing }
      : {}),
  });
  const videoEditor = useVideoEditSession();
  const videoEditing = videoEditor.phase !== 'closed';
  const comparedExistingVideoArtifact =
    existingVideo.comparison === 'original'
      ? recording.original
      : (recording.processed ?? recording.visual);
  let stagePresentation = takeStagePresentation;
  if (videoEditing && videoEditor.source && takeStagePresentation.kind === 'playback') {
    stagePresentation = {
      ...takeStagePresentation,
      artifact: videoEditor.source.artifact,
      controlsLocked: false,
    };
  } else if (
    activeOverlay === 'video-upload' &&
    existingVideo.selection !== null &&
    takeStagePresentation.kind === 'playback' &&
    comparedExistingVideoArtifact
  ) {
    stagePresentation = { ...takeStagePresentation, artifact: comparedExistingVideoArtifact };
  }
  const videoEditPreview = useMemo(
    () =>
      videoEditing && videoEditor.source
        ? {
            spec: videoEditor.draft,
            sourceWidth: videoEditor.source.metadata.width,
            sourceHeight: videoEditor.source.metadata.height,
            activeTool: videoEditor.activeTool,
            showingBefore: videoEditor.showingBefore,
            playheadMs: videoEditor.playheadMs,
            onPlayheadChange: videoEditor.setPlayheadMs,
            onCropStart: videoEditor.beginTransaction,
            onCropChange: videoEditor.previewSpec,
            onCropCommit: videoEditor.commitTransaction,
          }
        : null,
    [
      videoEditing,
      videoEditor.source,
      videoEditor.draft,
      videoEditor.activeTool,
      videoEditor.showingBefore,
      videoEditor.playheadMs,
      videoEditor.setPlayheadMs,
      videoEditor.beginTransaction,
      videoEditor.previewSpec,
      videoEditor.commitTransaction,
    ],
  );
  const editedStageGeometry =
    videoEditing && videoEditor.source
      ? getVideoEditOutputGeometry(
          {
            width: videoEditor.source.metadata.width,
            height: videoEditor.source.metadata.height,
            durationMs: videoEditor.source.metadata.durationMs,
          },
          videoEditor.draft,
        )
      : null;
  const playbackWidth = editedStageGeometry?.width ?? recording.metadata?.width;
  const playbackHeight = editedStageGeometry?.height ?? recording.metadata?.height;
  let stageAspectRatio: '16:9' | '9:16';
  if (stagePresentation.kind === 'playback' && playbackWidth && playbackHeight) {
    stageAspectRatio = playbackHeight > playbackWidth ? '9:16' : '16:9';
  } else if (session.draft.mode === 'local') {
    stageAspectRatio = session.capturePreferences.applied.aspectRatio;
  } else {
    stageAspectRatio = '16:9';
  }

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
      ? 'Save and release or discard the current take before building a character.'
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
    copyCharacter: launchCharacterCopy,
    resolveDiscard: resolveCharacterBuilderDraftDiscard,
    dismissLaunchError: dismissCharacterBuilderLaunchError,
  } = useCharacterBuilderLaunchController({
    ownerUserId: auth.session!.user.id,
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
  const copyCharacter = useCallback(
    (asset: Parameters<typeof launchCharacterCopy>[0]) => {
      if (characterBuilderOpenBlockedReason) return;
      setCharacterBuilderDestination({ kind: 'studio' });
      launchCharacterCopy(asset);
    },
    [characterBuilderOpenBlockedReason, launchCharacterCopy],
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
    store: repositoryStore,
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
        await persistCharacterSaveSnapshot(repository, snapshot, characterId);
        await progress.markCharacterPersisted();
      }

      const reference = snapshot.referenceImage
        ? await hydrateReferenceImage(snapshot.referenceImage.assetId, snapshot.referenceImage)
        : null;
      existingVideo.updateStep(step.id, {
        savedRecipeId: characterId,
        characterName: snapshot.name,
        characterVariantName: null,
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

  const creativePanel = creativePanelForOverlay(activeOverlay);
  const activeCreativeTool = creativeToolForOverlay(activeOverlay, creativePanel, videoEditing);
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
    ? repositoryStore.savedCharacterPrompts.find((candidate) => candidate.id === activeCharacter.id)
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
    if (outfitBuilderLaunch.destination === 'library') {
      closeOverlay();
      void navigate(APP_PATHS.outfits);
      return;
    }
    openOverlay(outfitBuilderLaunch.destination === 'shelf' ? 'recipe-shelf' : 'outfit-selector');
  }, [
    closeOverlay,
    navigate,
    openOverlay,
    outfitBuilderLaunch.destination,
    updateOutfitBuilderDirty,
  ]);
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
  const discardLocalTemporaryWork = useCallback(() => {
    gallerySourceLoadControllerRef.current?.abort('discard');
    gallerySourceLoadControllerRef.current = null;
    galleryEditRequestedRef.current = false;
    adoptingExistingVideoRecordingRef.current = null;
    setRecordingForExistingVideo(false);
    processing.cancel();
    recording.discard();
    setShelfDirty(false);
    updateOutfitBuilderDirty(false);
    setWardrobeDirty(false);
    setPendingVideoSave(null);
    videoEditor.close();
    savedVideoSave.reset();
  }, [processing, recording, savedVideoSave, setShelfDirty, updateOutfitBuilderDirty, videoEditor]);
  const discardTemporaryWork = useCallback(() => {
    existingVideo.reset(false);
    discardLocalTemporaryWork();
  }, [discardLocalTemporaryWork, existingVideo]);
  useEffect(
    () =>
      sessionCleanup.register('studio-temporary-state', 'cancel-operations', async () => {
        const cleanup = existingVideo.cleanup();
        discardLocalTemporaryWork();
        await cleanup;
      }),
    [discardLocalTemporaryWork, existingVideo, sessionCleanup],
  );
  useEffect(
    () =>
      sessionCleanup.register('studio-media-session', 'release-media', async () => {
        await session.stopCamera();
      }),
    [session, sessionCleanup],
  );
  const logoutHasDiscardableWork =
    Boolean(recording.presented) ||
    recording.processingState === 'processing' ||
    shelfDirty ||
    outfitBuilderDirty ||
    wardrobeDirty ||
    videoEditor.dirty;
  const logoutHasActiveWork =
    recordingActive ||
    finalizingStartedAt !== null ||
    finalizingStream !== null ||
    existingVideo.providerActive ||
    isVideoEditBusy(videoEditor.phase);
  const completeLogout = useCallback(async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutPromptOpen(false);
    try {
      await sessionCleanup.run();
      await auth.logout();
      void navigate(APP_PATHS.entry, { replace: true });
    } finally {
      setLogoutBusy(false);
    }
  }, [auth, logoutBusy, navigate, sessionCleanup]);
  const requestLogout = useCallback(() => {
    if (logoutHasActiveWork) {
      setLogoutBlockedOpen(true);
      return;
    }
    if (logoutHasDiscardableWork) {
      setLogoutPromptOpen(true);
      return;
    }
    void completeLogout();
  }, [completeLogout, logoutHasActiveWork, logoutHasDiscardableWork]);
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
  const openVideoAdjust = useCallback(() => {
    const sourceArtifact = comparedExistingVideoArtifact ?? recording.presented;
    const metadata = existingVideo.currentMetadata;
    if (!sourceArtifact || !metadata || recordingActive || existingVideo.providerActive) return;
    closeOverlay();
    videoEditor.begin({ artifact: sourceArtifact, metadata });
    window.requestAnimationFrame(() => mainRef.current?.focus());
  }, [
    closeOverlay,
    comparedExistingVideoArtifact,
    existingVideo.currentMetadata,
    existingVideo.providerActive,
    recording.presented,
    recordingActive,
    videoEditor,
  ]);
  const useSavedVideo = useCallback(
    async (video: SavedVideoSummary, intent: 'play' | 'edit') => {
      if (recordingActive || existingVideo.providerActive) return;
      gallerySourceLoadControllerRef.current?.abort('replaced');
      const controller = new AbortController();
      gallerySourceLoadControllerRef.current = controller;
      try {
        const response = await apiFetch(savedVideoContentUrl(video.id), {
          cache: 'no-store',
          headers: { Accept: video.currentVersion.mimeType },
          signal: controller.signal,
        });
        const blob = await readBoundedBlob(response, {
          maximumBytes: VIDEO_RESULT_MAX_BYTES,
          signal: controller.signal,
          acceptsContentType: (contentType) => contentType === video.currentVersion.mimeType,
          createError: (failure) =>
            new ApiClientError(
              failure === 'too-large'
                ? 'The saved video exceeded the app-owned 300 MB safety limit.'
                : 'The saved video response was empty or invalid.',
              502,
              failure === 'too-large' ? 'result_too_large' : 'result_invalid',
            ),
          abortMessage: 'Saved video loading was cancelled.',
        });
        controller.signal.throwIfAborted();
        const file = new File([blob], video.currentVersion.filename, {
          type: video.currentVersion.mimeType,
          lastModified: new Date(video.currentVersion.createdAt).getTime(),
        });
        galleryEditRequestedRef.current = intent === 'edit';
        void navigate(APP_PATHS.studio, { replace: true });
        openOverlay('video-upload');
        const artifact = await existingVideo.selectFile(file);
        if (artifact && !controller.signal.aborted) {
          setLoadedSavedSource({
            videoId: video.id,
            currentVersionId: video.currentVersion.id,
            artifactId: artifact.id,
            characterName: video.currentVersion.characterName,
            characterVariantName: video.currentVersion.characterVariantName,
          });
        }
      } finally {
        if (gallerySourceLoadControllerRef.current === controller) {
          gallerySourceLoadControllerRef.current = null;
        }
      }
    },
    [existingVideo, navigate, openOverlay, recordingActive],
  );
  useEffect(() => {
    if (
      !galleryEditRequestedRef.current ||
      existingVideo.phase !== 'ready' ||
      !existingVideo.selection
    )
      return;
    galleryEditRequestedRef.current = false;
    openVideoAdjust();
  }, [existingVideo.phase, existingVideo.selection, openVideoAdjust]);
  const completedCharacterAttribution = useMemo(() => {
    if (existingVideo.completedStepCount < 1) return { applied: false, value: null } as const;
    const step = existingVideo.steps[existingVideo.completedStepCount - 1];
    if (step?.modelId !== 'lucy-latest') return { applied: false, value: null } as const;
    const recipe = step.savedRecipeId
      ? existingVideoSavedRecipes.find((candidate) => candidate.id === step.savedRecipeId)
      : undefined;
    return {
      applied: true,
      value:
        step.characterName || recipe?.characterName
          ? {
              characterName: step.characterName ?? recipe!.characterName!,
              characterVariantName:
                step.characterVariantName ?? recipe?.characterVariantName ?? null,
            }
          : null,
    } as const;
  }, [existingVideo.completedStepCount, existingVideo.steps, existingVideoSavedRecipes]);
  const activeCharacterVariantName =
    activeRecipe?.origin === 'character-prompt' && activeRecipe.variantId
      ? (repositoryStore.savedCharacterVariants.find(
          (variant) =>
            variant.id === activeRecipe.variantId &&
            variant.parentCharacterId === activeRecipe.assetId,
        )?.title ?? null)
      : null;
  const recordingCharacterAttribution = useMemo(
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
  const presentedVideoCharacter = useMemo(
    () =>
      recording.presented?.characterName
        ? {
            characterName: recording.presented.characterName,
            characterVariantName: recording.presented.characterVariantName ?? null,
          }
        : completedCharacterAttribution.applied
          ? completedCharacterAttribution.value
          : recording.presented?.sourceModeId === 'lucy-latest'
            ? recordingCharacterAttribution
            : activeLoadedSavedSource?.characterName
              ? {
                  characterName: activeLoadedSavedSource.characterName,
                  characterVariantName: activeLoadedSavedSource.characterVariantName,
                }
              : null,
    [
      activeLoadedSavedSource,
      completedCharacterAttribution,
      recording.presented,
      recordingCharacterAttribution,
    ],
  );
  const replaceLoadedSavedVideo = useCallback(async () => {
    const artifact = recording.presented;
    if (!artifact || !activeLoadedSavedSource || artifact.id === activeLoadedSavedSource.artifactId)
      return;
    if (
      !window.confirm(
        'Replace the current gallery version with this result? The previous version remains recoverable.',
      )
    ) {
      return;
    }
    const video = await savedVideoSave.replace(
      artifact,
      activeLoadedSavedSource,
      undefined,
      presentedVideoCharacter,
    );
    if (video) {
      setLoadedSavedSource((current) =>
        current?.videoId === video.id
          ? {
              ...current,
              currentVersionId: video.currentVersion.id,
              characterName: video.currentVersion.characterName,
              characterVariantName: video.currentVersion.characterVariantName,
            }
          : current,
      );
    }
  }, [activeLoadedSavedSource, presentedVideoCharacter, recording.presented, savedVideoSave]);
  const requestSavePresentedVideo = useCallback(() => {
    const artifact = recording.presented;
    if (!artifact) return;
    setPendingVideoSave({
      intent: 'presented',
      artifact,
      source: activeLoadedSavedSource
        ? {
            videoId: activeLoadedSavedSource.videoId,
            versionId: activeLoadedSavedSource.currentVersionId,
          }
        : undefined,
      character: presentedVideoCharacter,
    });
  }, [activeLoadedSavedSource, presentedVideoCharacter, recording.presented]);
  const returnFromVideoEditor = useCallback(() => {
    videoEditor.close();
    setVideoEditDiscardPromptOpen(false);
    openOverlay('video-upload');
    window.requestAnimationFrame(() => editVideoToggleRef.current?.focus());
  }, [openOverlay, videoEditor]);
  const requestVideoEditDiscard = useCallback(() => {
    if (isVideoEditBusy(videoEditor.phase)) return;
    if (!videoEditor.dirty) {
      returnFromVideoEditor();
      return;
    }
    setVideoEditDiscardPromptOpen(true);
  }, [returnFromVideoEditor, videoEditor.dirty, videoEditor.phase]);
  const commitVideoEdit = useCallback(
    async (saveCurrent: boolean, name?: string) => {
      const source = videoEditor.source;
      const candidate = videoEditor.candidate;
      if (!source || !candidate || videoEditor.phase !== 'awaiting-replacement') return;
      videoEditor.beginCommit();
      try {
        if (saveCurrent) {
          const saved = await savedVideoSave.save(
            source.artifact,
            name,
            activeLoadedSavedSource
              ? {
                  videoId: activeLoadedSavedSource.videoId,
                  versionId: activeLoadedSavedSource.currentVersionId,
                }
              : undefined,
            presentedVideoCharacter,
          );
          if (!saved) {
            videoEditor.failCommit(
              'The current video could not be saved, so it was not replaced. Your source remains unchanged.',
            );
            return;
          }
        }
        const validated = candidate.validated;
        const artifactId = `video-${crypto.randomUUID()}`;
        const artifact = recording.replaceSource({
          blob: validated.file,
          artifactMetadata: {
            id: artifactId,
            name: `Edited video · ${validated.metadata.selectedAt} · ${artifactId.slice(-8)}`,
            createdAt: validated.metadata.selectedAt,
            kind: 'edited',
            parentArtifactId: source.artifact.id,
            characterName:
              source.artifact.characterName ?? presentedVideoCharacter?.characterName ?? null,
            characterVariantName:
              source.artifact.characterVariantName ??
              presentedVideoCharacter?.characterVariantName ??
              null,
            mimeType: validated.mimeType,
            filename: validated.file.name,
            sourceModeId: 'local',
            startedAt: validated.metadata.selectedAt,
            durationMs: validated.metadata.durationMs,
          },
          takeMetadata: validated.metadata,
          audioSidecar: validated.audioSidecar,
        });
        existingVideo.replaceSource(validated, artifact);
        videoEditor.completeCommit(artifact.id);
        videoEditor.close();
        openOverlay('video-upload');
      } catch {
        videoEditor.failCommit(
          'The edited video passed rendering but could not replace the current source. The current video remains unchanged.',
        );
      }
    },
    [
      activeLoadedSavedSource,
      existingVideo,
      openOverlay,
      presentedVideoCharacter,
      recording,
      savedVideoSave,
      videoEditor,
    ],
  );
  const requestSaveAndCommitVideoEdit = useCallback(() => {
    const source = videoEditor.source;
    if (!source || !videoEditor.candidate || videoEditor.phase !== 'awaiting-replacement') return;
    setPendingVideoSave({
      intent: 'video-edit-replacement',
      artifact: source.artifact,
    });
  }, [videoEditor]);
  const confirmPendingVideoSave = useCallback(
    (name?: string) => {
      const pending = pendingVideoSave;
      if (!pending) return;
      setPendingVideoSave(null);
      if (pending.intent === 'video-edit-replacement') {
        void commitVideoEdit(true, name);
        return;
      }
      void savedVideoSave.save(pending.artifact, name, pending.source, pending.character);
    },
    [commitVideoEdit, pendingVideoSave, savedVideoSave],
  );
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
        <div css={headerRegionStyles(theme)}>
          <StudioHeader
            availability={availability}
            browser={browser}
            capabilityState={capabilityState}
            user={auth.session!.user}
            accountBusy={logoutBusy}
            activeDestination={projectRouteActive ? 'projects' : 'studio'}
            projectContextActive={projectContextActive}
            onOpenStudio={() => void navigate(APP_PATHS.studio)}
            onOpenProjects={() => void navigate(APP_PATHS.projects)}
            onOpenVideos={() => void navigate(APP_PATHS.videos)}
            onOpenCharacters={() => void navigate(APP_PATHS.characters)}
            onOpenOutfits={() => void navigate(APP_PATHS.outfits)}
            onLogout={requestLogout}
          />
        </div>

        <main ref={mainRef} id="studio-main" tabIndex={-1} css={mainGridStyles()}>
          <div
            ref={fullscreenWorkspaceRef}
            hidden={projectRouteActive}
            css={stageColumnStyles(theme)}
            data-video-edit-active={videoEditing ? 'true' : 'false'}
          >
            <MediaStage
              presentation={stagePresentation}
              mode={session.draft.mode}
              lifecycle={session.lifecycle}
              recording={recording.lifecycle === 'recording'}
              recordingSeconds={recording.elapsedSeconds}
              aspectRatio={stageAspectRatio}
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
                        <span>Virtual Try On · Character Swap · Voice → Save</span>
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
              {...(!videoEditing
                ? {
                    controls: ({ visible }: { visible: boolean }) => (
                      <StudioSessionControlBar
                        session={session}
                        {...(currentExperienceLabel
                          ? { experienceLabel: currentExperienceLabel }
                          : {})}
                        experienceImageAssetId={currentExperienceImageAssetId}
                        recording={recording}
                        recordingMode={effectiveRecordingMode}
                        recordingCharacterAttribution={recordingCharacterAttribution}
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
                        {...(recording.presented ? { onSaveVideo: requestSavePresentedVideo } : {})}
                        saveVideoState={savedVideoSave.state}
                        {...(activeLoadedSavedSource &&
                        recording.presented?.id !== activeLoadedSavedSource.artifactId
                          ? { onReplaceSavedVideo: () => void replaceLoadedSavedVideo() }
                          : {})}
                      />
                    ),
                  }
                : {})}
              notices={stageNotices}
              onPlaybackError={recording.repairPresentedObjectUrl}
              fullscreenTargetRef={fullscreenWorkspaceRef}
              {...(videoEditPreview ? { editPreview: videoEditPreview } : {})}
            />
            {videoEditing ? (
              <Suspense fallback={deferredPanelFallback}>
                <VideoEditWorkspace
                  session={videoEditor}
                  onRequestDiscard={requestVideoEditDiscard}
                />
              </Suspense>
            ) : (
              <>
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
              </>
            )}
          </div>
          {projectRouteActive ? (
            <Suspense fallback={<p role="status">Loading Projects workspace…</p>}>
              <ProjectRouteSurface />
            </Suspense>
          ) : null}
        </main>

        <StudioExitGuard
          recordingOrFinalizing={
            recordingActive ||
            finalizingStartedAt !== null ||
            finalizingStream !== null ||
            existingVideo.providerActive
          }
          videoRenderingActive={isVideoEditBusy(videoEditor.phase)}
          hasTemporaryTake={Boolean(recording.presented)}
          voiceProcessingActive={recording.processingState === 'processing'}
          shelfDirty={shelfDirty || outfitBuilderDirty || wardrobeDirty || videoEditor.dirty}
          onDiscardTemporaryWork={discardTemporaryWork}
        />

        {pendingVideoSave ? (
          <SaveVideoDialog
            fallbackName={defaultSavedVideoName(pendingVideoSave.artifact)}
            onCancel={() => setPendingVideoSave(null)}
            onSave={confirmPendingVideoSave}
          />
        ) : null}

        <Suspense fallback={null}>
          <ConfirmationDialog
            open={logoutPromptOpen}
            title="Log out and discard temporary work?"
            description="Logging out stops local media and discards the current temporary take, active Voice work, unsaved video edits, and unsaved library changes. Saved account items remain available."
            confirmLabel={logoutBusy ? 'Logging out…' : 'Log out and discard'}
            cancelLabel="Stay in Studio"
            danger
            busy={logoutBusy}
            returnFocusRef={mainRef}
            onCancel={() => setLogoutPromptOpen(false)}
            onConfirm={() => void completeLogout()}
          />
          <OverlayPanel
            open={logoutBlockedOpen}
            onClose={() => setLogoutBlockedOpen(false)}
            title="Finish active work before logging out"
            description="Stop recording, wait for finalization or provider processing, or cancel the active video render before logging out."
            placement="bottom"
            size="standard"
            returnFocusRef={mainRef}
            footer={
              <Button variant="primary" onClick={() => setLogoutBlockedOpen(false)}>
                Return to Studio
              </Button>
            }
          >
            <p>Lightframe will not abandon active media work during logout.</p>
          </OverlayPanel>
          <ConfirmationDialog
            open={videoEditDiscardPromptOpen}
            title="Discard video edits?"
            description="Your current video stays unchanged. All trim, crop, rotation, lighting, and filter changes in this edit session will be discarded."
            confirmLabel="Discard edits"
            cancelLabel="Keep editing"
            danger
            returnFocusRef={mainRef}
            onCancel={() => setVideoEditDiscardPromptOpen(false)}
            onConfirm={returnFromVideoEditor}
          />
          <ConfirmationDialog
            open={videoEditor.phase === 'awaiting-replacement'}
            title="Replace the current video?"
            description="The validated edit will become the new immutable source for Voice and later video tools. You can save the current source to Saved Videos first."
            confirmLabel="Replace and Save"
            cancelLabel="Cancel"
            busy={videoEditor.phase === 'committing'}
            secondaryAction={{
              label: 'Replace Without Saving',
              onAction: () => void commitVideoEdit(false),
            }}
            returnFocusRef={mainRef}
            onCancel={videoEditor.resumeEditing}
            onConfirm={requestSaveAndCommitVideoEdit}
          />
        </Suspense>

        <OverlayPanel
          open={location.pathname === APP_PATHS.videos}
          onClose={() => void navigate(APP_PATHS.studio)}
          title="Saved Videos"
          description="Preview, load, edit, download, rename, or remove account videos. Downloads are available only from this gallery."
          placement="fullscreen"
          size="wide"
          bodyMode="scroll"
          returnFocusRef={mainRef}
        >
          {location.pathname === APP_PATHS.videos ? (
            <Suspense fallback={deferredPanelFallback}>
              <VideoGallery onUse={useSavedVideo} />
            </Suspense>
          ) : null}
        </OverlayPanel>

        <OverlayPanel
          open={location.pathname === APP_PATHS.characters}
          onClose={() => void navigate(APP_PATHS.studio)}
          title="Saved Characters"
          description="Manage your Lucy 2.5 cast and their wardrobe."
          headerActions={
            <div css={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                onClick={() => {
                  void navigate(APP_PATHS.studio);
                  openCharacterBuilder();
                }}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  css={{ width: '1.1rem', height: '1.1rem' }}
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Create new character
              </Button>
            </div>
          }
          placement="fullscreen"
          size="wide"
          bodyMode="scroll"
          initialFocus="heading"
          returnFocusRef={mainRef}
        >
          {location.pathname === APP_PATHS.characters ? (
            <Suspense fallback={deferredPanelFallback}>
              <SavedCharacterLibrary
                items={repositoryStore.savedCharacterPrompts}
                repository={repository}
                onCreateFrom={(character) => {
                  void navigate(APP_PATHS.studio);
                  copyCharacter(character);
                }}
                onOpenWardrobe={(character) => {
                  void navigate(APP_PATHS.studio);
                  openWardrobe(character);
                }}
                onUse={(character) => {
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
              />
            </Suspense>
          ) : null}
        </OverlayPanel>

        <OverlayPanel
          open={location.pathname === APP_PATHS.outfits}
          onClose={() => void navigate(APP_PATHS.studio)}
          title="Saved Outfits"
          description="Choose a saved Virtual Try-On outfit for Studio or remove it from your library."
          placement="fullscreen"
          size="wide"
          bodyMode="scroll"
          returnFocusRef={mainRef}
        >
          {location.pathname === APP_PATHS.outfits ? (
            <Suspense fallback={deferredPanelFallback}>
              <SavedOutfitLibrary
                items={repositoryStore.savedPrompts.filter(
                  (item) => item.modelModeId === 'lucy-vton-latest',
                )}
                repository={repository}
                onCreate={() => {
                  void navigate(APP_PATHS.studio);
                  openNewOutfitBuilder(false, 'library');
                }}
                onUse={(outfit) => {
                  selectSavedOutfit(outfit);
                  void navigate(APP_PATHS.studio);
                }}
              />
            </Suspense>
          ) : null}
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'video-upload'}
          onClose={closeExistingVideo}
          title="Use existing video"
          description="Add a source, choose optional edits, then compare and save the result."
          placement="right"
          size="workspace"
          bodyMode="contained"
          closeDisabled={existingVideo.providerActive}
          closeOnBackdrop={!existingVideo.selection}
          returnFocusRef={recording.presented ? editVideoToggleRef : uploadToggleRef}
        >
          <Suspense fallback={deferredPanelFallback}>
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
              {...(recording.presented ? { onSaveVideo: requestSavePresentedVideo } : {})}
              saveVideoState={savedVideoSave.state}
              onAdjustVideo={openVideoAdjust}
              recordingSupported={
                browser.mediaRecorder && browser.mediaDevices && browser.secureContext
              }
              onRecordVideo={startExistingVideoRecording}
            />
          </Suspense>
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'outfit-selector'}
          onClose={closeOverlay}
          title="Outfit"
          description="Create an outfit, or select a saved or recently used Virtual Try-On recipe."
          placement="right"
          bodyMode="scroll"
          returnFocusRef={desktopStudioLayout ? outfitToggleRef : shelfToggleRef}
        >
          {activeOverlay === 'outfit-selector' ? (
            <Suspense fallback={deferredPanelFallback}>
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
            </Suspense>
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
                : shelfToggleRef
          }
        >
          {activeOverlay === 'outfit-builder' ? (
            <Suspense fallback={deferredPanelFallback}>
              <OutfitBuilder
                key={`${outfitBuilderLaunch.outfit?.id ?? 'new'}:${outfitBuilderLaunch.saveAsCopy ? 'copy' : 'edit'}`}
                repository={repository}
                {...(outfitBuilderLaunch.outfit
                  ? { initialOutfit: outfitBuilderLaunch.outfit }
                  : {})}
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
                  if (outfitBuilderLaunch.destination === 'library') {
                    closeOverlay();
                    void navigate(APP_PATHS.outfits);
                    return;
                  }
                  openOverlay(
                    outfitBuilderLaunch.destination === 'shelf'
                      ? 'recipe-shelf'
                      : 'outfit-selector',
                  );
                }}
              />
            </Suspense>
          ) : null}
        </OverlayPanel>

        <StudioCharacterSelectorOverlay
          open={activeOverlay === 'character-selector'}
          returnFocusRef={desktopStudioLayout ? characterSelectorRef : shelfToggleRef}
          activeCharacterName={activeCharacterName}
          activeCharacter={activeCharacterRecord}
          editBlockedReason={characterBuilderOpenBlockedReason}
          removalBlockedReason={characterRemovalBlockedReason}
          recordingActive={recordingActive}
          onClose={closeOverlay}
          onEdit={editCharacter}
          onOpenWardrobe={openWardrobe}
          onUnselect={unselectCharacter}
          onCreate={openCharacterBuilder}
          onChooseSaved={() => openSavedRecipesFor('lucy-latest')}
        />

        <OverlayPanel
          open={activeOverlay === 'character-wardrobe' && Boolean(wardrobeCharacter)}
          onClose={closeWardrobe}
          title={wardrobeCharacter ? `${wardrobeCharacter.name} wardrobe` : 'Character wardrobe'}
          description="Browse the original and saved variants, or create a new version without changing the parent character."
          placement={desktopStudioLayout ? 'right' : 'fullscreen'}
          size="wide"
          bodyMode="contained"
          closeOnBackdrop={!wardrobeDirty}
          returnFocusRef={desktopStudioLayout ? characterSelectorRef : shelfToggleRef}
        >
          {wardrobeCharacter ? (
            <Suspense fallback={deferredPanelFallback}>
              <CharacterWardrobePanel
                repository={repository}
                store={repositoryStore}
                character={wardrobeCharacter}
                addOutfitAvailable={Boolean(availability.wardrobeAddOutfitAvailable)}
                changeFeaturesAvailable={Boolean(availability.referenceImageEditAvailable)}
                elevenLabsAvailable={availability.elevenLabs}
                savedOutfits={repositoryStore.savedPrompts.filter(
                  (outfit) => outfit.modelModeId === 'lucy-vton-latest',
                )}
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

        <StudioTakeOverlays
          activeOverlay={activeOverlay}
          recording={recording}
          processing={processing}
          elevenLabsAvailable={availability.elevenLabs}
          elevenLabsModel={availability.elevenLabsModel}
          browserCapabilities={browser}
          editVideoToggleRef={editVideoToggleRef}
          dockToggleRef={dockToggleRef}
          onClose={closeOverlay}
          onDiscardTake={discardExistingVideoSelection}
          {...(existingVideo.selection ? { onEditVideo: openExistingVideo } : {})}
          onOpenVoiceTreatments={() => openOverlay('voice-treatments')}
          onBackToTakeReview={() => openOverlay('take-review')}
          {...(recording.presented ? { onSaveVideo: requestSavePresentedVideo } : {})}
          saveVideoState={savedVideoSave.state}
          {...(activeLoadedSavedSource &&
          recording.presented?.id !== activeLoadedSavedSource.artifactId
            ? { onReplaceSavedVideo: () => void replaceLoadedSavedVideo() }
            : {})}
        />

        {activeOverlay === 'character-builder' ? (
          <Suspense fallback={deferredPanelFallback}>
            <CharacterBuilderCoordinator
              open
              ownerUserId={auth.session!.user.id}
              target={characterBuilderLaunch.target}
              {...(characterBuilderLaunch.initialValue
                ? { initialValue: characterBuilderLaunch.initialValue }
                : {})}
              returnFocusRef={
                characterBuilderDestination.kind === 'existing-video'
                  ? editVideoToggleRef
                  : desktopStudioLayout
                    ? characterSelectorRef
                    : shelfToggleRef
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
