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
import type { PromptBuilderDraft, SavePromptWorkshopAction } from '../features/prompt-authoring';
import { hasSameRecordingTracks, RecordingControls } from '../features/recording';
import { TakeDock } from '../features/take-review';
import { useRecording, useRecordingSource } from '../orchestration/recording';
import { useStudioSession } from '../orchestration/session';
import { useVoiceProcessing } from '../orchestration/voice-processing';
import { StudioDesignProvider } from '../ui';
import {
  dockColumnStyles,
  footerStyles,
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
  const [libraryMode, setLibraryMode] = useState<ModelMode>('lucy-2.5');
  const [workshopDraft, setWorkshopDraft] = useState<PromptBuilderDraft | undefined>();
  const [shelfDirty, setShelfDirty] = useState(false);
  const selectedSavedPrompt = useRef<string | undefined>(undefined);
  const selectedCharacterPrompt = useRef<string | undefined>(undefined);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);

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
  const processing = useVoiceProcessing(recording);
  const recordingActive = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  const sessionModeLocked =
    recordingActive ||
    Boolean(session.localStream) ||
    [
      'requesting-media',
      'ready',
      'requesting-token',
      'connecting',
      'connected',
      'generating',
      'reconnecting',
      'disconnected',
    ].includes(session.lifecycle);
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
    if (panel === 'closed') return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(panel === 'workshop' ? 'character-workshop-title' : 'recipe-shelf-title')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [panel]);

  const closeCreativePanel = (
    source: Exclude<AuxiliaryPanel, 'closed'>,
    replacementAlreadyConfirmed = false,
  ) => {
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
  };

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
    if (selection.builderDraft) setWorkshopDraft(selection.builderDraft);
    closeCreativePanel('shelf', true);
  };

  const openSavedWorkshop = (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => {
    if (recordingActive) return;
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    selectedCharacterPrompt.current = asset.id;
    selectedSavedPrompt.current = undefined;
    setWorkshopDraft(draft);
    setShelfDirty(false);
    setPanel('workshop');
  };

  const applyWorkshopPrompt = (prompt: string, draft: PromptBuilderDraft) => {
    if (recordingActive) return;
    if (session.draft.mode !== 'lucy-2.5' && !selectModeWithDraftProtection('lucy-2.5')) return;
    session.updatePrompt(prompt);
    selectedSavedPrompt.current = undefined;
    selectedCharacterPrompt.current = undefined;
    setWorkshopDraft(draft);
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
    setShelfDirty(false);
    setPanel('workshop');
  };

  return (
    <div css={pageStyles(theme)}>
      <a href="#studio-main" css={skipLinkStyles(theme)}>
        Skip to studio
      </a>
      <div css={shellStyles()}>
        <StudioHeader
          availability={availability}
          browser={browser}
          capabilityState={capabilityState}
          onRetry={retryProviderAvailability}
        />

        <main id="studio-main" tabIndex={-1} css={mainGridStyles(theme)}>
          <div css={stageColumnStyles(theme)}>
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
              onStop={finishTake}
            />
          </div>
          <div css={dockColumnStyles(theme)}>
            <SessionComposer
              session={session}
              recording={recordingActive}
              onOpenWorkshop={openWorkshop}
            />
          </div>
        </main>

        <CreativeWorkspace
          panel={panel}
          activeSessionMode={session.draft.mode}
          libraryMode={libraryMode}
          workshopDraft={workshopDraft}
          repository={repository}
          recordingActive={recordingActive}
          sessionModeLocked={sessionModeLocked}
          recipeInsertionBlocked={recipeInsertionBlocked}
          hasReferenceImage={Boolean(session.draft.image)}
          workshopToggleRef={workshopToggleRef}
          shelfToggleRef={shelfToggleRef}
          onOpenWorkshop={openWorkshop}
          onToggleShelf={() => {
            if (panel === 'shelf') closeCreativePanel('shelf');
            else setPanel('shelf');
          }}
          onClose={closeCreativePanel}
          onLibraryModeChange={changeLibraryMode}
          onWorkshopDraftChange={setWorkshopDraft}
          onUseWorkshop={(action) => applyWorkshopPrompt(action.prompt, action.draft)}
          onSaveWorkshop={saveWorkshopPrompt}
          onShelfDirtyChange={setShelfDirty}
          onUseRecipe={useRecipe}
          onOpenSavedWorkshop={openSavedWorkshop}
        >
          <TakeDock
            recording={recording}
            processing={processing}
            elevenLabsAvailable={availability.elevenLabs}
            browserCapabilities={browser}
          />
        </CreativeWorkspace>

        <footer css={footerStyles(theme)}>
          <span>
            Prompts persist only in this browser profile. Images and takes stay in temporary memory.
          </span>
          <span>
            Provider work starts only from explicit AI Start/Apply or voice
            browse/preview/import/Apply actions.
          </span>
        </footer>
      </div>
    </div>
  );
};

export const StudioApp = () => (
  <StudioDesignProvider>
    <StudioExperience />
  </StudioDesignProvider>
);
