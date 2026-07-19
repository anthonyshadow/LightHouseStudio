import { useTheme } from '@emotion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectBrowserCapabilities } from '../adapters/browser-media/browserMedia';
import {
  createCreativeAssetRepository,
  type RecipeSelection,
  type SavedCharacterPrompt,
} from '../features/creative-assets';
import { MediaStage, type StageNotice, type StagePresentation } from '../features/live-stage';
import {
  SessionComposer,
  confirmModeReplacement,
  type StudioMode,
} from '../features/media-session';
import type {
  PromptBuilderDraft,
  PromptIntent,
  SavePromptWorkshopAction,
} from '../features/prompt-authoring';
import {
  CaptureSettingsPanel,
  hasSameRecordingTracks,
  RecordingControls,
} from '../features/recording';
import { TakeDock } from '../features/take-review';
import { useRecording, useRecordingSource } from '../orchestration/recording';
import { useStudioSession } from '../orchestration/session';
import { useVoiceProcessing } from '../orchestration/voice-processing';
import { OverlayPanel, StudioDesignProvider } from '../ui';
import {
  headerRegionStyles,
  mainGridStyles,
  pageStyles,
  shellStyles,
  skipLinkStyles,
  stageColumnStyles,
} from './StudioApp.styles';
import { CreativeWorkspace, type AuxiliaryPanel, type ModelMode } from './CreativeWorkspace';
import { StudioHeader } from './StudioHeader';
import { canReplaceDirtyLibraryMode, shouldFinalizeForUnusableModelOutput } from './studioPolicies';
import { useProviderAvailability } from './useProviderAvailability';

type ActiveOverlay =
  | 'recipe-dock'
  | 'capture-settings'
  | 'take-review'
  | 'voice-treatments'
  | 'workshop'
  | 'recipe-shelf'
  | null;

const REVIEW_LOCK_REASON =
  'Download and close or discard the recorded take before starting or changing media.';

const FORM_ERROR_CODES = new Set(['model-input-required', 'apply-failed']);

const StudioExperience = () => {
  const theme = useTheme();
  const repository = useMemo(() => createCreativeAssetRepository(), []);
  const browser = useMemo(() => detectBrowserCapabilities(), []);
  const {
    availability,
    state: capabilityState,
    retry: retryProviderAvailability,
  } = useProviderAvailability();
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>(null);
  const [libraryMode, setLibraryMode] = useState<ModelMode>('lucy-2.5');
  const [workshopDraft, setWorkshopDraft] = useState<PromptBuilderDraft | undefined>();
  const [workshopDrafts, setWorkshopDrafts] = useState<
    Partial<Record<PromptIntent, PromptBuilderDraft>>
  >({});
  const [shelfDirty, setShelfDirty] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [finalizingStream, setFinalizingStream] = useState<MediaStream | null>(null);
  const [finalizingStartedAt, setFinalizingStartedAt] = useState<number | null>(null);
  const [dismissedNotices, setDismissedNotices] = useState<ReadonlySet<string>>(new Set());
  const finishPromiseRef = useRef<Promise<void> | null>(null);
  const selectedSavedPrompt = useRef<string | undefined>(undefined);
  const selectedCharacterPrompt = useRef<string | undefined>(undefined);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);
  const dockToggleRef = useRef<HTMLButtonElement>(null);
  const takeToggleRef = useRef<HTMLButtonElement>(null);

  const rememberWorkshopDraft = useCallback((draft: PromptBuilderDraft) => {
    setWorkshopDraft(draft);
    setWorkshopDrafts((current) => ({ ...current, [draft.intent]: draft }));
  }, []);

  const recordCommittedPrompt = useCallback(
    (mode: ModelMode, prompt: string) => {
      repository.recordSuccessfulPrompt({
        prompt,
        modelModeId: mode,
        ...(selectedSavedPrompt.current ? { savedPromptId: selectedSavedPrompt.current } : {}),
        ...(selectedCharacterPrompt.current
          ? { savedCharacterPromptId: selectedCharacterPrompt.current }
          : {}),
      });
    },
    [repository],
  );

  const session = useStudioSession({ availability, onPromptCommitted: recordCommittedPrompt });
  const automaticDisplayStream = session.displayStream;
  const automaticReviewRelease = session.releaseForRecordedReview;
  const handleAutomaticRecordingStop = useCallback(() => {
    setFinalizingStream((current) => current ?? automaticDisplayStream);
    setFinalizingStartedAt((current) => current ?? Date.now());
    void automaticReviewRelease().then(() => {
      setFinalizingStream(null);
      setReviewReady(true);
    });
  }, [automaticDisplayStream, automaticReviewRelease]);
  const recording = useRecording({ onAutomaticStop: handleAutomaticRecordingStop });
  const processing = useVoiceProcessing(recording);
  const recordingActive = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  const reviewLocked = Boolean(recording.presented);
  const mediaLocked = recordingActive || reviewLocked;
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
  const recipeInsertionBlocked =
    mediaLocked || (sessionModeLocked && session.draft.mode !== libraryMode);
  const recordingSource = useRecordingSource(
    session.draft.mode,
    session.localStream,
    session.transformedVideoUsable ? session.remoteStream : null,
  );

  useEffect(() => {
    if (session.draft.mode !== 'local' && !shelfDirty) setLibraryMode(session.draft.mode);
  }, [session.draft.mode, shelfDirty]);

  useEffect(() => {
    if (recording.lifecycle !== 'recorded' || !recording.presented || !reviewReady) return;
    setFinalizingStartedAt(null);
    setFinalizingStream(null);
    setActiveOverlay((current) => current ?? 'take-review');
  }, [recording.lifecycle, recording.presented, reviewReady]);

  useEffect(() => {
    if (recording.presented) return;
    setReviewReady(false);
    if (recording.lifecycle !== 'stopping') {
      setFinalizingStartedAt(null);
      setFinalizingStream(null);
    }
    setActiveOverlay((current) =>
      current === 'take-review' || current === 'voice-treatments' ? null : current,
    );
  }, [recording.lifecycle, recording.presented]);

  useEffect(() => {
    if (!session.error || FORM_ERROR_CODES.has(session.error.code)) return;
    setActiveOverlay((current) =>
      current === 'recipe-dock' || current === 'capture-settings' ? null : current,
    );
  }, [session.error]);

  const stopRecording = recording.stop;
  const releaseForRecordedReview = session.releaseForRecordedReview;
  const currentDisplayStream = session.displayStream;
  const finishTake = useCallback((): Promise<void> => {
    if (finishPromiseRef.current) return finishPromiseRef.current;

    setFinalizingStream(currentDisplayStream);
    setFinalizingStartedAt(Date.now());
    setReviewReady(false);

    const finishPromise = (async () => {
      let artifact = null;
      try {
        artifact = await stopRecording();
      } finally {
        await releaseForRecordedReview();
        setFinalizingStream(null);
      }

      if (artifact) {
        setReviewReady(true);
        setActiveOverlay('take-review');
      } else {
        setReviewReady(false);
        setFinalizingStartedAt(null);
      }
    })().finally(() => {
      finishPromiseRef.current = null;
    });

    finishPromiseRef.current = finishPromise;
    return finishPromise;
  }, [currentDisplayStream, releaseForRecordedReview, stopRecording]);

  useEffect(() => {
    if (
      !shouldFinalizeForUnusableModelOutput(
        recording.lifecycle,
        session.draft.mode,
        session.transformedVideoUsable,
      )
    )
      return;
    void finishTake();
  }, [finishTake, recording.lifecycle, session.draft.mode, session.transformedVideoUsable]);

  useEffect(() => {
    if (
      recording.lifecycle === 'recording' &&
      !hasSameRecordingTracks(recording.activeSource, recordingSource)
    ) {
      void finishTake();
    }
  }, [finishTake, recording.activeSource, recording.lifecycle, recordingSource]);

  const stagePresentation = useMemo<StagePresentation>(() => {
    if (reviewReady && recording.presented) {
      return {
        kind: 'playback',
        artifact: recording.presented,
        controlsLocked: recording.processingState === 'processing',
      };
    }
    if (recording.lifecycle === 'stopping' || finalizingStartedAt !== null) {
      return {
        kind: 'finalizing',
        retainedStream: finalizingStream ?? session.displayStream,
        startedAt: finalizingStartedAt ?? 0,
      };
    }
    if (session.displayStream) {
      const provider = session.draft.mode !== 'local' && session.transformedVideoUsable;
      return {
        kind: 'live',
        stream: session.displayStream,
        origin: provider ? 'provider' : 'local',
        mirrored: !provider,
      };
    }
    return { kind: 'idle', mode: session.draft.mode };
  }, [
    finalizingStartedAt,
    finalizingStream,
    recording.lifecycle,
    recording.presented,
    recording.processingState,
    reviewReady,
    session.displayStream,
    session.draft.mode,
    session.transformedVideoUsable,
  ]);

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
        'constraints-unavailable',
      ].includes(session.error.code);
      notices.push({
        id: `session-${session.error.code}`,
        severity: 'error',
        title: session.error.message,
        message: session.error.recovery ?? 'Review the setup and try again.',
        priority: 900,
        action: deviceError
          ? { label: 'Capture settings', onAction: () => setActiveOverlay('capture-settings') }
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
  ]);

  const changeLibraryMode = (mode: ModelMode) => {
    if (mode === libraryMode) return;
    if (
      !canReplaceDirtyLibraryMode(shelfDirty, () =>
        window.confirm('Switch recipe models and discard the unsaved shelf form changes?'),
      )
    ) {
      return;
    }
    setShelfDirty(false);
    setLibraryMode(mode);
  };

  const selectModeWithDraftProtection = (mode: StudioMode): boolean =>
    !mediaLocked &&
    confirmModeReplacement(session.draft, mode, (message) => window.confirm(message)) &&
    session.selectMode(mode);

  const closeCreativePanel = useCallback(() => setActiveOverlay(null), []);

  const useRecipe = (selection: RecipeSelection) => {
    if (
      mediaLocked ||
      (session.draft.mode !== selection.modelModeId &&
        !selectModeWithDraftProtection(selection.modelModeId))
    )
      return;
    session.updatePrompt(selection.prompt);
    selectedSavedPrompt.current =
      selection.origin === 'saved-prompt' ? selection.assetId : undefined;
    selectedCharacterPrompt.current =
      selection.origin === 'character-prompt' ? selection.assetId : undefined;
    if (selection.builderDraft) rememberWorkshopDraft(selection.builderDraft);
    setActiveOverlay(null);
  };

  const openSavedWorkshop = (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => {
    if (recordingActive) return;
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    selectedCharacterPrompt.current = asset.id;
    selectedSavedPrompt.current = undefined;
    rememberWorkshopDraft(draft);
    setActiveOverlay('workshop');
  };

  const applyWorkshopPrompt = (prompt: string, draft: PromptBuilderDraft) => {
    if (mediaLocked) return;
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    session.updatePrompt(prompt);
    selectedSavedPrompt.current = undefined;
    selectedCharacterPrompt.current = undefined;
    rememberWorkshopDraft(draft);
    setActiveOverlay(null);
  };

  const saveWorkshopPrompt = (action: SavePromptWorkshopAction) => {
    const needsReference =
      action.draft.intent === 'character-transform' && action.draft.matchReference;
    repository.createSavedCharacterPrompt({
      name: action.name,
      prompt: action.prompt,
      source: 'generator',
      promptIntent: action.draft.intent,
      builderDraft: action.draft,
      referenceImageStatus: session.draft.image
        ? 'session-portrait-not-saved'
        : needsReference
          ? 'portrait-required-not-saved'
          : 'prompt-only',
    });
  };

  const openWorkshop = () => {
    if (recordingActive) return;
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    setActiveOverlay('workshop');
  };

  const openDock = () => {
    if (recordingActive) return;
    setActiveOverlay('recipe-dock');
  };

  const openTake = () => {
    if (!recording.presented || recordingActive) return;
    setActiveOverlay('take-review');
  };

  const openCaptureSettings = () => {
    if (recordingActive) return;
    setActiveOverlay('capture-settings');
  };

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
          onClose={() => setActiveOverlay(null)}
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
            {...(reviewLocked ? { lockReason: REVIEW_LOCK_REASON } : {})}
            onOpenWorkshop={openWorkshop}
          />
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'capture-settings'}
          onClose={() => setActiveOverlay(null)}
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
            onApplied={() => setActiveOverlay(null)}
          />
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'take-review' && Boolean(recording.presented)}
          onClose={() => setActiveOverlay(null)}
          title="Latest Take"
          description="Playback stays on the stage while you review this temporary in-memory recording."
          placement="bottom"
          size="wide"
          bodyMode="contained"
          returnFocusRef={recording.presented ? takeToggleRef : dockToggleRef}
        >
          <TakeDock
            view="take"
            recording={recording}
            processing={processing}
            elevenLabsAvailable={availability.elevenLabs}
            browserCapabilities={browser}
            onCloseTake={() => setActiveOverlay(null)}
            onOpenVoiceTreatments={() => setActiveOverlay('voice-treatments')}
          />
        </OverlayPanel>

        <OverlayPanel
          open={activeOverlay === 'voice-treatments' && Boolean(recording.presented)}
          onClose={() => setActiveOverlay(null)}
          title="Voice Treatments"
          description="Every treatment starts from the immutable original audio."
          placement="bottom"
          size="wide"
          bodyMode="contained"
          returnFocusRef={recording.presented ? takeToggleRef : dockToggleRef}
        >
          <TakeDock
            view="voice"
            recording={recording}
            processing={processing}
            elevenLabsAvailable={availability.elevenLabs}
            browserCapabilities={browser}
            onBackToTake={() => setActiveOverlay('take-review')}
          />
        </OverlayPanel>

        <CreativeWorkspace
          panel={creativePanel}
          activeSessionMode={session.draft.mode}
          libraryMode={libraryMode}
          workshopDraft={workshopDraft}
          workshopDrafts={workshopDrafts}
          repository={repository}
          recordingActive={recordingActive}
          sessionModeLocked={sessionModeLocked}
          recipeInsertionBlocked={recipeInsertionBlocked}
          hasReferenceImage={Boolean(session.draft.image)}
          workshopToggleRef={workshopToggleRef}
          shelfToggleRef={shelfToggleRef}
          dockToggleRef={dockToggleRef}
          takeToggleRef={takeToggleRef}
          hasTake={Boolean(recording.presented)}
          onOpenDock={openDock}
          onOpenTake={openTake}
          onOpenWorkshop={openWorkshop}
          onToggleShelf={() =>
            setActiveOverlay((current) => (current === 'recipe-shelf' ? null : 'recipe-shelf'))
          }
          onClose={closeCreativePanel}
          onLibraryModeChange={changeLibraryMode}
          onWorkshopDraftChange={rememberWorkshopDraft}
          onUseWorkshop={(action) => applyWorkshopPrompt(action.prompt, action.draft)}
          onSaveWorkshop={saveWorkshopPrompt}
          onShelfDirtyChange={setShelfDirty}
          onUseRecipe={useRecipe}
          onOpenSavedWorkshop={openSavedWorkshop}
        />
      </div>
    </div>
  );
};

export const StudioApp = () => (
  <StudioDesignProvider>
    <StudioExperience />
  </StudioDesignProvider>
);
