import { useTheme } from '@emotion/react';
import { recordingStopOrder } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectBrowserCapabilities } from '../adapters/browser-media/browserMedia';
import {
  createCreativeAssetRepository,
  type RecipeSelection,
  type SavedCharacterPrompt,
} from '../features/creative-assets';
import { MediaStage } from '../features/live-stage';
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
import { OverlayPanel, StudioDesignProvider, Tabs } from '../ui';
import {
  dockColumnStyles,
  headerRegionStyles,
  mainGridStyles,
  pageStyles,
  recordingRailStyles,
  shellStyles,
  skipLinkStyles,
  stageColumnStyles,
  workbenchTrayStyles,
  workbenchStyles,
} from './StudioApp.styles';
import {
  CreativeWorkspace,
  DesktopCreativePanel,
  type AuxiliaryPanel,
  type ModelMode,
} from './CreativeWorkspace';
import { StudioHeader } from './StudioHeader';
import { canReplaceDirtyLibraryMode, shouldFinalizeForUnusableModelOutput } from './studioPolicies';
import { useProviderAvailability } from './useProviderAvailability';
import { useMediaQuery } from './useMediaQuery';

const StudioExperience = () => {
  const theme = useTheme();
  const repository = useMemo(() => createCreativeAssetRepository(), []);
  const browser = useMemo(() => detectBrowserCapabilities(), []);
  const {
    availability,
    state: capabilityState,
    retry: retryProviderAvailability,
  } = useProviderAvailability();
  const [panel, setPanel] = useState<AuxiliaryPanel>('closed');
  const [dockOpen, setDockOpen] = useState(false);
  const [takeOpen, setTakeOpen] = useState(false);
  const [captureSettingsOpen, setCaptureSettingsOpen] = useState(false);
  const [workbenchTool, setWorkbenchTool] = useState<'take' | 'voice'>('take');
  const [libraryMode, setLibraryMode] = useState<ModelMode>('lucy-2.5');
  const [workshopDraft, setWorkshopDraft] = useState<PromptBuilderDraft | undefined>();
  const [workshopDrafts, setWorkshopDrafts] = useState<
    Partial<Record<PromptIntent, PromptBuilderDraft>>
  >({});
  const [shelfDirty, setShelfDirty] = useState(false);
  const selectedSavedPrompt = useRef<string | undefined>(undefined);
  const selectedCharacterPrompt = useRef<string | undefined>(undefined);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);
  const dockToggleRef = useRef<HTMLButtonElement>(null);
  const takeToggleRef = useRef<HTMLButtonElement>(null);
  const compactLayout = useMediaQuery('(max-width: 63.99rem)');
  const mobileLayout = useMediaQuery('(max-width: 39.99rem), (max-height: 36rem)');
  const compactWorkbench = useMediaQuery('(max-width: 80rem), (max-height: 48rem)');
  const creativeOverlayLayout = compactLayout || compactWorkbench;

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
  const recording = useRecording({
    onAutomaticStop: ({ mode }) => {
      if (mode !== 'local') session.stopModel();
    },
  });
  const previousRecordingLifecycleRef = useRef(recording.lifecycle);
  const processing = useVoiceProcessing(recording);
  const recordingActive = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  const aiSessionActive = [
    'requesting-media',
    'requesting-token',
    'connecting',
    'connected',
    'generating',
    'reconnecting',
  ].includes(session.lifecycle);
  const sessionModeLocked =
    recordingActive ||
    Boolean(session.localStream) ||
    aiSessionActive ||
    session.lifecycle === 'ready' ||
    session.lifecycle === 'disconnected';
  const recipeInsertionBlocked =
    recordingActive || (sessionModeLocked && session.draft.mode !== libraryMode);
  const recordingSource = useRecordingSource(
    session.draft.mode,
    session.localStream,
    session.transformedVideoUsable ? session.remoteStream : null,
  );

  useEffect(() => {
    if (session.draft.mode !== 'local' && !shelfDirty) setLibraryMode(session.draft.mode);
  }, [session.draft.mode, shelfDirty]);

  useEffect(() => {
    const previous = previousRecordingLifecycleRef.current;
    previousRecordingLifecycleRef.current = recording.lifecycle;

    if (!mobileLayout || !recording.presented) {
      setTakeOpen(false);
      return;
    }

    if (recording.lifecycle === 'recorded' && previous !== 'recorded') {
      setDockOpen(false);
      setPanel('closed');
      setCaptureSettingsOpen(false);
      setWorkbenchTool('take');
      setTakeOpen(true);
    }
  }, [mobileLayout, recording.lifecycle, recording.presented]);

  useEffect(() => {
    if (panel === 'closed') return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(
          panel === 'workshop' ? 'character-workshop-title' : 'creative-inline-shelf-title',
        )
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [panel]);

  useEffect(() => {
    if (!recordingActive || panel === 'closed') return;
    if (panel === 'shelf' && shelfDirty) return;
    setPanel('closed');
  }, [panel, recordingActive, shelfDirty]);

  const closeCreativePanel = useCallback(
    (source: Exclude<AuxiliaryPanel, 'closed'>, replacementAlreadyConfirmed = false) => {
      if (
        source === 'shelf' &&
        shelfDirty &&
        !replacementAlreadyConfirmed &&
        !window.confirm('Close the Recipe Shelf and discard the unsaved form changes?')
      ) {
        return;
      }
      if (source === 'shelf') setShelfDirty(false);
      setPanel('closed');
      window.requestAnimationFrame(() => {
        (source === 'workshop' ? workshopToggleRef : shelfToggleRef).current?.focus();
      });
    },
    [shelfDirty],
  );

  useEffect(() => {
    if (creativeOverlayLayout || panel === 'closed') return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      closeCreativePanel(panel);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [closeCreativePanel, creativeOverlayLayout, panel]);

  const closeDock = useCallback(() => {
    setDockOpen(false);
  }, []);

  const closeCaptureSettings = useCallback(() => {
    if (
      session.capturePreferences.hasPendingChanges &&
      !window.confirm('Close capture settings and discard the unapplied changes?')
    ) {
      return;
    }
    session.capturePreferences.discardPending();
    setCaptureSettingsOpen(false);
  }, [session.capturePreferences]);

  const stopRecording = recording.stop;
  const stopModel = session.stopModel;
  const activeMode = session.draft.mode;
  const finishTake = useCallback(async () => {
    const stopOrder = recordingStopOrder(activeMode);
    await stopRecording();
    if (stopOrder.includes('disconnect-model')) stopModel();
  }, [activeMode, stopModel, stopRecording]);

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
    confirmModeReplacement(session.draft, mode, (message) => window.confirm(message)) &&
    session.selectMode(mode);

  const useRecipe = (selection: RecipeSelection) => {
    if (
      recordingActive ||
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
    closeCreativePanel('shelf', true);
  };

  const openSavedWorkshop = (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => {
    if (recordingActive) return;
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    selectedCharacterPrompt.current = asset.id;
    selectedSavedPrompt.current = undefined;
    rememberWorkshopDraft(draft);
    setShelfDirty(false);
    setPanel('workshop');
  };

  const applyWorkshopPrompt = (prompt: string, draft: PromptBuilderDraft) => {
    if (recordingActive) return;
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    session.updatePrompt(prompt);
    selectedSavedPrompt.current = undefined;
    selectedCharacterPrompt.current = undefined;
    rememberWorkshopDraft(draft);
    closeCreativePanel('workshop');
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
    if (
      panel === 'shelf' &&
      shelfDirty &&
      !window.confirm('Open the Character Workshop and discard the unsaved shelf form changes?')
    ) {
      return;
    }
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    setDockOpen(false);
    setTakeOpen(false);
    setCaptureSettingsOpen(false);
    setShelfDirty(false);
    setPanel('workshop');
  };

  const openDock = () => {
    if (recordingActive) return;
    if (panel === 'shelf' && shelfDirty) {
      if (!window.confirm('Open the Recipe Dock and discard the unsaved shelf form changes?')) {
        return;
      }
      setShelfDirty(false);
    }
    setTakeOpen(false);
    setCaptureSettingsOpen(false);
    setPanel('closed');
    setDockOpen(true);
  };

  const openTake = () => {
    if (!recording.presented || recordingActive) return;
    if (panel === 'shelf' && shelfDirty) {
      if (!window.confirm('Open the latest take and discard the unsaved shelf form changes?')) {
        return;
      }
      setShelfDirty(false);
    }
    setDockOpen(false);
    setPanel('closed');
    setCaptureSettingsOpen(false);
    setWorkbenchTool('take');
    setTakeOpen(mobileLayout);
    if (!mobileLayout) {
      window.requestAnimationFrame(() => document.getElementById('take-heading')?.focus());
    }
  };

  const openCaptureSettings = () => {
    if (recordingActive) return;
    setDockOpen(false);
    setTakeOpen(false);
    setPanel('closed');
    setCaptureSettingsOpen(true);
  };

  const hasWorkbench = Boolean(recording.presented);
  const desktopShelfOpen = !creativeOverlayLayout && !recordingActive && panel === 'shelf';
  const desktopWorkshopOpen = !creativeOverlayLayout && !recordingActive && panel === 'workshop';
  const hasInlineWorkbench = hasWorkbench && !mobileLayout && !desktopShelfOpen;
  const hasLowerPanel = hasInlineWorkbench || desktopShelfOpen;

  const renderDesktopCreativePanel = (activePanel: Exclude<AuxiliaryPanel, 'closed'>) => (
    <DesktopCreativePanel
      panel={activePanel}
      libraryMode={libraryMode}
      workshopDraft={workshopDraft}
      workshopDrafts={workshopDrafts}
      repository={repository}
      recordingActive={recordingActive}
      sessionModeLocked={sessionModeLocked}
      recipeInsertionBlocked={recipeInsertionBlocked}
      hasReferenceImage={Boolean(session.draft.image)}
      onClose={() => closeCreativePanel(activePanel)}
      onLibraryModeChange={changeLibraryMode}
      onWorkshopDraftChange={rememberWorkshopDraft}
      onUseWorkshop={(action) => applyWorkshopPrompt(action.prompt, action.draft)}
      onSaveWorkshop={saveWorkshopPrompt}
      onShelfDirtyChange={setShelfDirty}
      onUseRecipe={useRecipe}
      onOpenSavedWorkshop={openSavedWorkshop}
    />
  );

  const renderTakeWorkbenchTabs = (label: string) => (
    <div css={workbenchTrayStyles(theme)}>
      <Tabs
        label={label}
        value={workbenchTool}
        onChange={setWorkbenchTool}
        items={[
          {
            value: 'take',
            label: 'Latest Take',
            shortLabel: 'Take',
            content:
              workbenchTool === 'take' ? (
                <TakeDock
                  view="take"
                  recording={recording}
                  processing={processing}
                  elevenLabsAvailable={availability.elevenLabs}
                  browserCapabilities={browser}
                />
              ) : null,
          },
          {
            value: 'voice',
            label: 'Voice Treatment',
            shortLabel: 'Voice',
            content:
              workbenchTool === 'voice' ? (
                <TakeDock
                  view="voice"
                  recording={recording}
                  processing={processing}
                  elevenLabsAvailable={availability.elevenLabs}
                  browserCapabilities={browser}
                />
              ) : null,
          },
        ]}
      />
    </div>
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
            onRetry={retryProviderAvailability}
          />
        </div>

        <main
          id="studio-main"
          tabIndex={-1}
          css={mainGridStyles(theme, recordingActive, desktopWorkshopOpen)}
        >
          <div css={stageColumnStyles(theme, hasLowerPanel, recordingActive, desktopShelfOpen)}>
            <MediaStage
              stream={session.displayStream}
              mode={session.draft.mode}
              lifecycle={session.lifecycle}
              transformed={session.transformedVideoUsable}
              liveSeconds={session.liveSeconds}
              generationSeconds={session.generationSeconds}
              recording={recordingActive}
              recordingSeconds={recording.elapsedSeconds}
            />
            <RecordingControls
              recording={recording}
              source={recordingActive ? recording.activeSource : recordingSource}
              mode={session.draft.mode}
              modelOutputReady={session.transformedVideoUsable}
              supported={browser.mediaRecorder}
              {...(shelfDirty
                ? { blockedReason: 'Save or discard Recipe Shelf changes before recording.' }
                : {})}
              onOpenSettings={openCaptureSettings}
              onStop={finishTake}
            />
            {desktopShelfOpen ? (
              <div data-scroll-region="desktop-recipe-shelf" css={workbenchStyles(theme)}>
                {renderDesktopCreativePanel('shelf')}
              </div>
            ) : hasInlineWorkbench && !recordingActive ? (
              <div data-scroll-region="studio-workbench" css={workbenchStyles(theme)}>
                {compactWorkbench ? (
                  renderTakeWorkbenchTabs('Take workbench')
                ) : (
                  <TakeDock
                    recording={recording}
                    processing={processing}
                    elevenLabsAvailable={availability.elevenLabs}
                    browserCapabilities={browser}
                  />
                )}
              </div>
            ) : null}
          </div>
          {!compactLayout ? (
            recordingActive ? (
              <aside
                aria-label="Recipe Dock collapsed while recording"
                css={recordingRailStyles(theme)}
              >
                <span>REC</span>
              </aside>
            ) : desktopWorkshopOpen ? (
              <aside aria-label="Character Workshop" css={dockColumnStyles()}>
                {renderDesktopCreativePanel('workshop')}
              </aside>
            ) : (
              <aside aria-label="Recipe Dock" css={dockColumnStyles()}>
                <SessionComposer
                  session={session}
                  recording={recordingActive}
                  onOpenWorkshop={openWorkshop}
                />
              </aside>
            )
          ) : null}
        </main>

        <OverlayPanel
          open={compactLayout && dockOpen}
          onClose={closeDock}
          title="Recipe Dock"
          description="Prepare freely. Camera and provider work begin only from explicit actions."
          placement="right"
          returnFocusRef={dockToggleRef}
        >
          <SessionComposer
            embedded
            session={session}
            recording={recordingActive}
            onOpenWorkshop={openWorkshop}
          />
        </OverlayPanel>

        <OverlayPanel
          open={captureSettingsOpen}
          onClose={closeCaptureSettings}
          title="Capture Settings"
          description="Choose session-only sources and a local capture target without starting media."
          placement="right"
        >
          <CaptureSettingsPanel
            controller={session.capturePreferences}
            mode={session.draft.mode}
            disabled={recordingActive || aiSessionActive}
            {...(recordingActive
              ? { disabledReason: 'Finish the current take before changing capture settings.' }
              : aiSessionActive
                ? { disabledReason: 'Stop AI before changing camera or microphone sources.' }
                : {})}
            onApplied={() => setCaptureSettingsOpen(false)}
          />
        </OverlayPanel>

        <OverlayPanel
          open={mobileLayout && takeOpen && Boolean(recording.presented)}
          onClose={() => setTakeOpen(false)}
          title="Latest Take"
          description="Review, process, download, or discard this temporary in-memory recording."
          placement="bottom"
          returnFocusRef={takeToggleRef}
        >
          {renderTakeWorkbenchTabs('Take review tools')}
        </OverlayPanel>

        <CreativeWorkspace
          panel={panel}
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
          onToggleShelf={() => {
            if (panel === 'shelf') closeCreativePanel('shelf');
            else {
              setDockOpen(false);
              setTakeOpen(false);
              setCaptureSettingsOpen(false);
              setPanel('shelf');
            }
          }}
          onClose={closeCreativePanel}
          onLibraryModeChange={changeLibraryMode}
          onWorkshopDraftChange={rememberWorkshopDraft}
          onUseWorkshop={(action) => applyWorkshopPrompt(action.prompt, action.draft)}
          onSaveWorkshop={saveWorkshopPrompt}
          onShelfDirtyChange={setShelfDirty}
          onUseRecipe={useRecipe}
          onOpenSavedWorkshop={openSavedWorkshop}
          renderPanelInOverlay={creativeOverlayLayout}
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
