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
import { detectBrowserCapabilities } from '../adapters/browser-media/browserMedia';
import { optimizeCharacterReferencePrompt } from '../adapters/api-client/apiClient';
import { createCreativeAssetRepository } from '../features/creative-assets/repository';
import { useCreativeAssetRepository } from '../features/creative-assets/useCreativeAssetRepository';
import { createLocalProjectRepository } from '../features/guided-flow/projectRepository';
import type { ProjectStorageState } from '../features/guided-flow/types';
import { MediaStage, type StageNotice } from '../features/live-stage';
import { SessionComposer } from '../features/media-session';
import { CaptureSettingsPanel, RecordingControls } from '../features/recording';
import { useStrictModeSafeDisposable } from '../orchestration/lifecycle/useStrictModeSafeDisposable';
import { useStudioSession } from '../orchestration/session';
import { OverlayPanel, StudioDesignProvider } from '../ui';
import {
  headerRegionStyles,
  mainGridStyles,
  pageStyles,
  shellStyles,
  skipLinkStyles,
  stageColumnStyles,
} from './StudioApp.styles';
import { CreativeWorkspace, type AuxiliaryPanel } from './CreativeWorkspace';
import { StudioHeader } from './StudioHeader';
import { resolveLegacyEntry, type StudioInitialOverlay } from './routeResolution';
import { createNoopStudioTelemetry } from './telemetry';
import { useProviderAvailability } from './useProviderAvailability';
import {
  useReferenceRecipeHandoff,
  type PromptCommittedHandler,
} from './useReferenceRecipeHandoff';
import { useTakeReviewFlow } from './useTakeReviewFlow';
import { useStudioOverlayController } from './useStudioOverlayController';

const CharacterBuilderCoordinator = lazy(() =>
  import('../features/character-builder/CharacterBuilderCoordinator').then((module) => ({
    default: module.CharacterBuilderCoordinator,
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
  'Download and close or discard the recorded take before starting or changing media.';

const FORM_ERROR_CODES = new Set(['model-input-required', 'apply-failed']);
const noopPromptCommitted: PromptCommittedHandler = () => undefined;

interface StudioExperienceProps {
  initialOverlay: StudioInitialOverlay;
}

const StudioExperience = ({ initialOverlay }: StudioExperienceProps) => {
  const theme = useTheme();
  const repository = useMemo(() => createCreativeAssetRepository(), []);
  const repositoryState = useCreativeAssetRepository(repository);
  const legacyRepository = useStrictModeSafeDisposable(
    useMemo(() => createLocalProjectRepository(), []),
  );
  const browser = useMemo(() => detectBrowserCapabilities(), []);
  const {
    availability,
    state: capabilityState,
    retry: retryProviderAvailability,
  } = useProviderAvailability();
  const {
    active: activeOverlay,
    open: openOverlay,
    openIfEmpty: openOverlayIfEmpty,
    close: closeOverlay,
    closeIf: closeOverlayIf,
    toggle: toggleOverlay,
  } = useStudioOverlayController(
    initialOverlay?.kind === 'legacy-projects' ? 'legacy-projects' : null,
  );
  const [legacyStorage, setLegacyStorage] = useState<ProjectStorageState>(() =>
    legacyRepository.getStorageState(),
  );
  const [legacyProjectCount, setLegacyProjectCount] = useState(0);
  const [dismissedNotices, setDismissedNotices] = useState<ReadonlySet<string>>(new Set());
  const promptCommittedHandlerRef = useRef<PromptCommittedHandler>(noopPromptCommitted);
  const characterBuilderButtonRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);
  const legacyManagerToggleRef = useRef<HTMLButtonElement>(null);
  const dockToggleRef = useRef<HTMLButtonElement>(null);
  const takeToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    void legacyRepository.initialize().then((storage) => {
      if (!active) return;
      setLegacyStorage(storage);
      void legacyRepository.list().then((projects) => {
        if (active) setLegacyProjectCount(projects.length);
      });
    });
    return () => {
      active = false;
    };
  }, [legacyRepository]);

  const handlePromptCommitted = useCallback<PromptCommittedHandler>(
    (...args) => promptCommittedHandlerRef.current(...args),
    [],
  );
  const session = useStudioSession({ availability, onPromptCommitted: handlePromptCommitted });
  const handleReviewAvailable = useCallback(
    () => openOverlayIfEmpty('take-review'),
    [openOverlayIfEmpty],
  );
  const handleReviewPublished = useCallback(() => openOverlay('take-review'), [openOverlay]);
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
    recordingSource,
    finalizingStartedAt,
    finalizingStream,
    finishTake,
    stagePresentation,
  } = useTakeReviewFlow({
    session,
    onReviewAvailable: handleReviewAvailable,
    onReviewPublished: handleReviewPublished,
    onReviewCleared: handleReviewCleared,
  });
  const aiSessionActive = [
    'requesting-media',
    'requesting-token',
    'connecting',
    'connected',
    'generating',
    'reconnecting',
  ].includes(session.lifecycle);
  const sessionModeLocked =
    mediaLocked ||
    Boolean(session.localStream) ||
    aiSessionActive ||
    session.lifecycle === 'ready' ||
    session.lifecycle === 'disconnected';
  const characterBuilderOpenBlockedReason = recordingActive
    ? 'Finish recording and finalization before building a character.'
    : finalizingStartedAt !== null || finalizingStream !== null
      ? 'Wait for the current take to finish finalizing before building a character.'
      : reviewLocked
        ? 'Download and close or discard the current take before building a character.'
        : undefined;
  const openWorkshopOverlay = useCallback(() => openOverlay('workshop'), [openOverlay]);
  const handoff = useReferenceRecipeHandoff({
    repository,
    store: repositoryState.store,
    session,
    referenceImagesAvailable: Boolean(availability.referenceImages),
    mediaLocked,
    recordingActive,
    sessionModeLocked,
    characterBuilderOpenBlockedReason,
    openWorkshopOverlay,
    closeOverlay,
  });
  const {
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
  } = handoff.state;
  const {
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
  } = handoff.actions;

  useLayoutEffect(() => {
    promptCommittedHandlerRef.current = recordCommittedPrompt;
    return () => {
      if (promptCommittedHandlerRef.current === recordCommittedPrompt) {
        promptCommittedHandlerRef.current = noopPromptCommitted;
      }
    };
  }, [recordCommittedPrompt]);

  useEffect(() => {
    if (!session.error || FORM_ERROR_CODES.has(session.error.code)) return;
    closeOverlayIf(['recipe-dock', 'capture-settings']);
  }, [closeOverlayIf, session.error]);

  const dismissNotice = useCallback((id: string) => {
    setDismissedNotices((current) => new Set([...current, id]));
  }, []);

  const stageNotices = useMemo<readonly StageNotice[]>(() => {
    const notices: StageNotice[] = [];
    const localCaptureAvailable = browser.mediaDevices && browser.secureContext;

    if (!localCaptureAvailable) {
      notices.push({
        id: 'local-capture-unavailable',
        severity: 'error',
        title: 'Camera capture needs a secure supported browser',
        message:
          'Open the studio on localhost or HTTPS in a current browser with camera and microphone APIs.',
        priority: 950,
      });
    }

    if (capabilityState === 'error' && !dismissedNotices.has('provider-broker')) {
      notices.push({
        id: 'provider-broker',
        severity: 'warning',
        title: 'Integration broker is unreachable',
        message: 'Local preparation still works, but provider availability could not be checked.',
        action: { label: 'Retry check', onAction: retryProviderAvailability },
        onDismiss: () => dismissNotice('provider-broker'),
      });
    }

    if (session.error && !FORM_ERROR_CODES.has(session.error.code)) {
      const deviceError = [
        'permission-denied',
        'device-missing',
        'device-busy',
        'media-unavailable',
      ].includes(session.error.code);
      notices.push({
        id: `session-${session.error.code}`,
        severity: 'error',
        title: session.error.message,
        message: session.error.recovery ?? 'Review the setup and try again.',
        priority: 900,
        action: deviceError
          ? { label: 'Capture settings', onAction: () => openOverlay('capture-settings') }
          : { label: 'Dismiss', onAction: session.clearError },
        onDismiss: session.clearError,
      });
    }

    if (recording.recordingError) {
      notices.push({
        id: 'recording-error',
        severity: 'error',
        title: 'Recording stopped',
        message: recording.recordingError,
        priority: 1_000,
      });
    }

    if (
      recording.sidecar.state === 'error' &&
      recording.sidecar.error &&
      !dismissedNotices.has('recording-sidecar')
    ) {
      notices.push({
        id: 'recording-sidecar',
        severity: 'warning',
        title: 'Video preserved without separate voice audio',
        message: recording.sidecar.error,
        onDismiss: () => dismissNotice('recording-sidecar'),
      });
    }

    return notices;
  }, [
    browser.mediaDevices,
    browser.secureContext,
    capabilityState,
    dismissNotice,
    dismissedNotices,
    recording.recordingError,
    recording.sidecar.error,
    recording.sidecar.state,
    retryProviderAvailability,
    session.clearError,
    session.error,
    openOverlay,
  ]);

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

  const openCharacterBuilder = () => {
    if (characterBuilderOpenBlockedReason) return;
    openOverlay('character-builder');
  };

  const openLegacyProjects = () => openOverlay('legacy-projects');

  const creativePanel: AuxiliaryPanel =
    activeOverlay === 'workshop'
      ? 'workshop'
      : activeOverlay === 'recipe-shelf'
        ? 'shelf'
        : 'closed';
  const captureBlockedReason = reviewLocked
    ? REVIEW_LOCK_REASON
    : shelfDirty
      ? 'Save or discard Recipe Shelf changes before recording.'
      : undefined;

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
            characterBuilderButtonRef={characterBuilderButtonRef}
            {...(characterBuilderOpenBlockedReason
              ? { characterBuilderDisabledReason: characterBuilderOpenBlockedReason }
              : {})}
            onBuildCharacter={openCharacterBuilder}
          />
        </div>

        <main id="studio-main" tabIndex={-1} css={mainGridStyles()}>
          <div css={stageColumnStyles(theme)}>
            <MediaStage
              presentation={stagePresentation}
              mode={session.draft.mode}
              lifecycle={session.lifecycle}
              liveSeconds={session.liveSeconds}
              generationSeconds={session.generationSeconds}
              recording={recording.lifecycle === 'recording'}
              recordingSeconds={recording.elapsedSeconds}
              notices={stageNotices}
            />
            <RecordingControls
              recording={recording}
              source={
                recordingActive ? recording.activeSource : reviewLocked ? null : recordingSource
              }
              mode={session.draft.mode}
              modelOutputReady={session.transformedVideoUsable}
              supported={browser.mediaRecorder}
              {...(captureBlockedReason ? { blockedReason: captureBlockedReason } : {})}
              onOpenSettings={openCaptureSettings}
              onStop={finishTake}
            />
          </div>
        </main>

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
            onApplied={closeOverlay}
          />
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'take-review' && Boolean(recording.presented)}
          onClose={closeOverlay}
          title="Latest Take"
          description="Playback stays on the stage while you review this temporary in-memory recording."
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
              browserCapabilities={browser}
              onCloseTake={closeOverlay}
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
              browserCapabilities={browser}
              onBackToTake={() => openOverlay('take-review')}
            />
          </Suspense>
        </OverlayPanel>

        {activeOverlay === 'character-builder' ? (
          <Suspense fallback={deferredPanelFallback}>
            <CharacterBuilderCoordinator
              open
              returnFocusRef={characterBuilderButtonRef}
              generationAvailable={Boolean(
                availability.referenceImages && availability.referenceImageOptimizerAvailable,
              )}
              editAvailable={Boolean(availability.referenceImageEditAvailable)}
              {...(characterBuilderSaveBlockedReason
                ? { saveBlockedReason: characterBuilderSaveBlockedReason }
                : {})}
              legacyRepository={legacyRepository}
              onSaveCharacter={saveBuiltCharacter}
              onDismiss={closeOverlay}
            />
          </Suspense>
        ) : null}

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
              focusProjectId={initialOverlay?.focusProjectId ?? null}
              onProjectCountChange={(count) => {
                setLegacyProjectCount(count);
                setLegacyStorage(legacyRepository.getStorageState());
              }}
            />
          </Suspense>
        </OverlayPanel>

        <CreativeWorkspace
          repository={repository}
          state={{
            panel: creativePanel,
            activeSessionMode: session.draft.mode,
            libraryMode,
            workshopDraft,
            workshopDrafts,
            recordingActive,
            sessionModeLocked,
            recipeInsertionBlocked,
            hasReferenceImage: Boolean(session.draft.referenceImage),
            workshopReferenceImage,
            referenceGeneration,
            referenceImagesAvailable: Boolean(availability.referenceImages),
            referenceImageModel: availability.referenceImageModel ?? null,
            optimizerModel: availability.referenceImageOptimizerModel ?? null,
            optimizerVersion: availability.referenceImageOptimizerVersion ?? null,
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
            onOptimizeReference: optimizeCharacterReferencePrompt,
            onGenerateReference: generateWorkshopReference,
            onDetachReference: detachWorkshopReference,
            ...(referenceGeneration.status === 'error' &&
            referenceGeneration.errorKind === 'restore'
              ? { onRetryReferenceRestore: retryWorkshopReferenceRestore }
              : {}),
            onShelfDirtyChange: setShelfDirty,
            onUseRecipe: useRecipe,
            onOpenSavedWorkshop: openSavedWorkshop,
          }}
        />
      </div>
    </div>
  );
};

const RoutedStudioExperience = () => {
  const telemetry = useMemo(() => createNoopStudioTelemetry(), []);
  const viewedTrackedRef = useRef(false);
  const [entry] = useState(() => {
    const resolution = resolveLegacyEntry(window.location);
    if (resolution.shouldReplace) {
      window.history.replaceState(window.history.state, '', resolution.canonicalPath);
    }
    return resolution;
  });
  useEffect(() => {
    if (viewedTrackedRef.current) return;
    viewedTrackedRef.current = true;
    telemetry.track({
      type: 'studio-viewed',
      canonicalPath: '/',
      canonicalizedLegacyEntry: entry.shouldReplace,
      initialOverlay: entry.initialOverlay?.kind ?? null,
      timestamp: new Date().toISOString(),
    });
  }, [entry, telemetry]);
  return <StudioExperience initialOverlay={entry.initialOverlay} />;
};

export const StudioApp = () => (
  <StudioDesignProvider>
    <RoutedStudioExperience />
  </StudioDesignProvider>
);
