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
import { createCreativeAssetRepository } from '../features/creative-assets/repository';
import type { RecipeShelfEntryIntent } from '../features/creative-assets/RecipeShelf.types';
import { useCreativeAssetRepository } from '../features/creative-assets/useCreativeAssetRepository';
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
import { Button, OverlayPanel, StudioDesignProvider } from '../ui';
import {
  headerRegionStyles,
  mainGridStyles,
  pageStyles,
  shellStyles,
  skipLinkStyles,
  stageColumnStyles,
} from './StudioApp.styles';
import { CreativeWorkspace, type AuxiliaryPanel, type ModelMode } from './CreativeWorkspace';
import { AIExperienceChooser } from './AIExperienceChooser';
import { StudioHeader } from './StudioHeader';
import { StudioSessionControlBar } from './StudioSessionControlBar';
import { resolveLegacyEntry, type StudioInitialOverlay } from './routeResolution';
import { deriveStudioStageNotices, isStudioFormError } from './studioStageNotices';
import { useCharacterBuilderLaunchController } from './useCharacterBuilderLaunchController';
import { useLegacyProjectAvailability } from './useLegacyProjectAvailability';
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
  'Download and close or discard the recorded take before starting or changing media.';

const noopPromptCommitted: PromptCommittedHandler = () => undefined;

interface StudioExperienceProps {
  initialOverlay: StudioInitialOverlay;
}

const StudioExperience = ({ initialOverlay }: StudioExperienceProps) => {
  const theme = useTheme();
  const repository = useMemo(() => createCreativeAssetRepository(), []);
  const repositoryState = useCreativeAssetRepository(repository);
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
  } = useStudioOverlayController(
    initialOverlay?.kind === 'legacy-projects' ? 'legacy-projects' : null,
  );
  const [dismissedNotices, setDismissedNotices] = useState<ReadonlySet<string>>(new Set());
  const [recipeShelfEntryIntent, setRecipeShelfEntryIntent] =
    useState<RecipeShelfEntryIntent | null>(null);
  const nextRecipeShelfEntryIntentIdRef = useRef(0);
  const promptCommittedHandlerRef = useRef<PromptCommittedHandler>(noopPromptCommitted);
  const characterSelectorRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);
  const legacyManagerToggleRef = useRef<HTMLButtonElement>(null);
  const dockToggleRef = useRef<HTMLButtonElement>(null);
  const takeToggleRef = useRef<HTMLButtonElement>(null);
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
    recordingSource,
    finalizingStartedAt,
    finalizingStream,
    finishTake,
    stagePresentation,
  } = useTakeReviewFlow({
    session,
    onReviewCleared: handleReviewCleared,
  });
  const aiSessionActive = isModelSessionActive(session);
  const sessionModeLocked = mediaLocked || aiSessionActive || session.lifecycle === 'disconnected';
  const characterBuilderOpenBlockedReason = recordingActive
    ? 'Finish recording and finalization before building a character.'
    : finalizingStartedAt !== null || finalizingStream !== null
      ? 'Wait for the current take to finish finalizing before building a character.'
      : reviewLocked
        ? 'Download and close or discard the current take before building a character.'
        : undefined;
  const openCharacterBuilderOverlay = useCallback(
    () => openOverlay('character-builder'),
    [openOverlay],
  );
  const {
    launch: characterBuilderLaunch,
    discardPrompt: characterBuilderDiscardPrompt,
    launchError: characterBuilderLaunchError,
    openNewCharacter: openCharacterBuilder,
    editCharacter,
    resolveDiscard: resolveCharacterBuilderDraftDiscard,
    dismissLaunchError: dismissCharacterBuilderLaunchError,
  } = useCharacterBuilderLaunchController({
    ...(characterBuilderOpenBlockedReason
      ? { blockedReason: characterBuilderOpenBlockedReason }
      : {}),
    onOpen: openCharacterBuilderOverlay,
  });
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
    () =>
      deriveStudioStageNotices({
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
      recording.sidecar.error,
      recording.sidecar.state,
      retryProviderAvailability,
      session.error,
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
    (session.draft.mode === 'lucy-vton-3' && hasDraftContent(session.draft)
      ? activeRecipeLabel
        ? `Virtual Try-On · ${activeRecipeLabel}`
        : 'Virtual Try-On'
      : undefined);
  const currentExperienceImageAssetId =
    activeCharacter?.referenceImageAssetId ??
    persistedReferenceAssetId(session.draft.referenceImage);
  const activeCharacterRecord = activeCharacter
    ? repositoryState.store.savedCharacterPrompts.find(
        (candidate) => candidate.id === activeCharacter.id,
      )
    : undefined;
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
    if (mode === 'lucy-2.5') {
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
    if (!selectExperienceMode('lucy-vton-3')) return;
    openOverlay('recipe-dock');
  };
  const startPreparedAi = (mode: ModelMode) => {
    if (!selectExperienceMode(mode)) return;
    closeOverlay();
    void session.startModel();
  };

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
          />
        </div>

        <main id="studio-main" tabIndex={-1} css={mainGridStyles()}>
          <div css={stageColumnStyles(theme)}>
            <MediaStage
              presentation={stagePresentation}
              mode={session.draft.mode}
              lifecycle={session.lifecycle}
              recording={recording.lifecycle === 'recording'}
              recordingSeconds={recording.elapsedSeconds}
              {...(currentExperienceLabel ? { experienceLabel: currentExperienceLabel } : {})}
              controls={({ visible }) => (
                <StudioSessionControlBar
                  session={session}
                  {...(currentExperienceLabel ? { experienceLabel: currentExperienceLabel } : {})}
                  experienceImageAssetId={currentExperienceImageAssetId}
                  recording={recording}
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
                  onOpenVoiceTreatments={() => openOverlay('voice-treatments')}
                  onChooseAiExperience={() => openOverlay('ai-experience')}
                  onChangeExperience={() => openOverlay('ai-experience')}
                />
              )}
              notices={stageNotices}
            />
            <RecordingControls
              recording={recording}
              source={activeRecordingSource}
              mode={session.draft.mode}
              onOpenSettings={openCaptureSettings}
            />
          </div>
        </main>

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
              onClick={() => openSavedRecipesFor('lucy-2.5')}
            >
              Choose saved character
            </Button>
          </div>
        </OverlayPanel>

        <AIExperienceChooser
          open={activeOverlay === 'ai-experience'}
          {...(activeCharacterName ? { activeCharacterName } : {})}
          characterReady={
            Boolean(activeCharacterName) &&
            session.draft.mode === 'lucy-2.5' &&
            hasDraftContent(session.draft)
          }
          virtualTryOnReady={session.draft.mode === 'lucy-vton-3' && hasDraftContent(session.draft)}
          onClose={closeOverlay}
          onStartCharacter={() => startPreparedAi('lucy-2.5')}
          onCreateCharacter={openCharacterBuilder}
          onChooseSavedCharacter={() => openSavedRecipesFor('lucy-2.5')}
          onStartVirtualTryOn={() => startPreparedAi('lucy-vton-3')}
          onConfigureVirtualTryOn={configureVirtualTryOn}
          onChooseSavedVirtualTryOn={() => openSavedRecipesFor('lucy-vton-3')}
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
              target={characterBuilderLaunch.target}
              {...(characterBuilderLaunch.initialValue
                ? { initialValue: characterBuilderLaunch.initialValue }
                : {})}
              returnFocusRef={characterSelectorRef}
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
              focusProjectId={initialOverlay?.focusProjectId ?? null}
              onProjectCountChange={synchronizeLegacyProjectCount}
            />
          </Suspense>
        </OverlayPanel>

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
      </div>
    </div>
  );
};

const RoutedStudioExperience = () => {
  const [entry] = useState(() => {
    const resolution = resolveLegacyEntry(window.location);
    if (resolution.shouldReplace) {
      window.history.replaceState(window.history.state, '', resolution.canonicalPath);
    }
    return resolution;
  });
  return <StudioExperience initialOverlay={entry.initialOverlay} />;
};

export const StudioApp = () => (
  <StudioDesignProvider>
    <RoutedStudioExperience />
  </StudioDesignProvider>
);
