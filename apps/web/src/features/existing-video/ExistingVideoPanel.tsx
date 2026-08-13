/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- The named desktop editor scroller must be keyboard-focusable. */
import { useTheme } from '@emotion/react';
import type { CapabilitiesResponse } from '@studio/contracts';
import { useRef, useState, type DragEvent } from 'react';
import { Button, StatusNotice, Surface } from '../../ui';
import { ExistingVideoActionBar } from './ExistingVideoActionBar';
import {
  ExistingVideoConfirmationDialogs,
  type PendingVisualSwitch,
} from './ExistingVideoConfirmationDialogs';
import {
  activeConfigurationStyles,
  editorColumnStyles,
  panelStackStyles,
  recoveryActionStyles,
  sectionHeadingStyles,
  sourceColumnStyles,
  workspaceStyles,
} from './ExistingVideoPanel.styles';
import {
  ExistingVideoProcessingStatus,
  ExistingVideoResultSummary,
  ExistingVideoUploadChooser,
} from './ExistingVideoPanelSections';
import { ExistingVideoPhaseIndicator } from './ExistingVideoPhaseIndicator';
import type { ExistingVideoSavedRecipe } from './ExistingVideoRecipeChooser';
import { ExistingVideoSourceCard } from './ExistingVideoSourceCard';
import { ExistingVideoToolCards } from './ExistingVideoToolCards';
import {
  existingVideoEditorPhase,
  toolForStep,
  visualStepHasSettings,
  type ExistingVideoToolId,
  type ExistingVideoVisualToolId,
} from './existingVideoPresentation';
import { ExistingVideoVisualEditor } from './ExistingVideoVisualEditor';
import { ExistingVideoVoiceEditor } from './ExistingVideoVoiceEditor';
import {
  capabilityForExistingVideoStep,
  type ExistingVideoWorkflow,
} from './useExistingVideoWorkflow';
import { useExistingVideoRecipeHydration } from './useExistingVideoRecipeHydration';
import { useRecentExistingVideoOutfits } from './useRecentExistingVideoOutfits';
import type { SaveVideoState } from '../saved-videos/useSaveVideo';
import type { VoiceBrowserCapabilities } from '../voice-effects/voiceCapabilities';

type ExistingVideoPanelProps = {
  readonly workflow: ExistingVideoWorkflow;
  readonly videoProcessingAvailable: boolean;
  readonly videoProcessingCapabilities?: CapabilitiesResponse['videoProcessing'];
  readonly elevenLabsAvailable?: boolean;
  readonly elevenLabsModel?: string | null;
  readonly browserCapabilities?: VoiceBrowserCapabilities;
  readonly onFinish: () => void;
  readonly onSaveVideo?: () => void;
  readonly saveVideoState?: SaveVideoState;
  readonly savedRecipes?: readonly ExistingVideoSavedRecipe[];
  readonly onCreateCharacter?: (stepId: string) => void;
  readonly onCreateWardrobeVariant?: (stepId: string, characterId: string) => void;
  readonly recordingSupported?: boolean;
  readonly onRecordVideo?: () => void;
  readonly onAdjustVideo?: () => void;
};

const initialActiveTool = (workflow: ExistingVideoWorkflow): ExistingVideoToolId | null =>
  toolForStep(workflow.steps[0]) ?? (workflow.voiceSelection ? 'voice' : null);

export const ExistingVideoPanel = ({
  workflow,
  videoProcessingAvailable,
  videoProcessingCapabilities,
  elevenLabsAvailable = false,
  elevenLabsModel = null,
  browserCapabilities,
  onFinish,
  onSaveVideo,
  saveVideoState,
  savedRecipes = [],
  onCreateCharacter,
  onCreateWardrobeVariant,
  recordingSupported = false,
  onRecordVideo,
  onAdjustVideo,
}: ExistingVideoPanelProps) => {
  const theme = useTheme();
  const visualCapabilities: CapabilitiesResponse['videoProcessing'] =
    videoProcessingCapabilities ?? {
      characterSwap: {
        available: videoProcessingAvailable,
        inputPreparation: 'none',
        referencePolicy: 'optional',
        promptInput: 'editable',
        promptEnhancement: true,
        terminalFailureRelease: 'automatic',
        outputResolutions: ['720p'],
      },
      virtualTryOn: {
        available: videoProcessingAvailable,
        inputPreparation: 'none',
        referencePolicy: 'optional',
        promptInput: 'editable',
        promptEnhancement: true,
        terminalFailureRelease: 'automatic',
        outputResolutions: ['720p'],
      },
    };
  const pickerRef = useRef<HTMLInputElement>(null);
  const replacementPickerAuthorizedRef = useRef(false);
  const replaceButtonRef = useRef<HTMLButtonElement>(null);
  const discardButtonRef = useRef<HTMLButtonElement>(null);
  const visualSwitchInvokerRef = useRef<HTMLButtonElement>(null);
  const [activeTool, setActiveTool] = useState<ExistingVideoToolId | null>(() =>
    initialActiveTool(workflow),
  );
  const [replaceConfirmationOpen, setReplaceConfirmationOpen] = useState(false);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [pendingVisualSwitch, setPendingVisualSwitch] = useState<PendingVisualSwitch | null>(null);
  const [visualSwitchConfirmationOpen, setVisualSwitchConfirmationOpen] = useState(false);
  const [pendingDroppedFile, setPendingDroppedFile] = useState<File | null>(null);
  const structureLocked = workflow.acceptedSubmission || workflow.active;
  const recipeLocked =
    workflow.active ||
    (workflow.acceptedSubmission && !(workflow.phase === 'error' && workflow.retryJob));
  const selected = workflow.selection;
  const {
    applySavedRecipe,
    chooseReference,
    clearReferenceRecovery,
    continueWithoutReference,
    missingVtonReference,
    recipeLoading,
    referenceError,
    removeMissingOutfit,
    retryMissingReference,
  } = useExistingVideoRecipeHydration({ workflow, savedRecipes, visualCapabilities });
  const { clearRecentOutfits, recentOutfits } = useRecentExistingVideoOutfits(workflow);

  const selectFile = (file: File) => {
    clearReferenceRecovery();
    setActiveTool(null);
    void workflow.selectFile(file);
  };

  const chooseFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (replacementPickerAuthorizedRef.current) {
      replacementPickerAuthorizedRef.current = false;
      selectFile(file);
      return;
    }
    if (selected) {
      setPendingDroppedFile(file);
      setReplaceConfirmationOpen(true);
      return;
    }
    selectFile(file);
  };

  const receiveDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (structureLocked) return;
    chooseFiles(event.dataTransfer.files);
  };

  const focusActiveConfiguration = () => {
    window.requestAnimationFrame(() => {
      const configuration = document.getElementById('existing-video-active-configuration');
      if (!configuration) return;
      configuration.focus({ preventScroll: true });
      const { top } = configuration.getBoundingClientRect();
      const visibleBottom = window.innerHeight - Math.min(160, window.innerHeight * 0.25);
      if ((top < 0 || top > visibleBottom) && typeof configuration.scrollIntoView === 'function') {
        configuration.scrollIntoView({ block: 'start' });
      }
    });
  };

  const activateVisualTool = (tool: ExistingVideoVisualToolId) => {
    const selected = workflow.addStep(tool === 'character' ? 'lucy-latest' : 'lucy-vton-latest');
    if (!selected) return;
    clearReferenceRecovery();
    setActiveTool(tool);
    focusActiveConfiguration();
  };

  const selectTool = (tool: ExistingVideoToolId, trigger: HTMLButtonElement) => {
    if (tool === 'voice') {
      setActiveTool(tool);
      focusActiveConfiguration();
      return;
    }

    const currentStep = workflow.steps[0];
    const currentVisualTool = toolForStep(currentStep);
    if (
      currentStep &&
      currentVisualTool &&
      currentVisualTool !== tool &&
      visualStepHasSettings(currentStep)
    ) {
      visualSwitchInvokerRef.current = trigger;
      setPendingVisualSwitch({ from: currentVisualTool, to: tool });
      setVisualSwitchConfirmationOpen(true);
      return;
    }

    activateVisualTool(tool);
  };

  const clearVisualStep = (stepId: string) => {
    workflow.removeStep(stepId);
    setActiveTool(null);
  };

  const requestReplace = () => {
    setPendingDroppedFile(null);
    setReplaceConfirmationOpen(true);
  };

  const confirmReplace = () => {
    const droppedFile = pendingDroppedFile;
    setReplaceConfirmationOpen(false);
    setPendingDroppedFile(null);
    if (droppedFile) {
      selectFile(droppedFile);
      return;
    }
    replacementPickerAuthorizedRef.current = true;
    window.requestAnimationFrame(() => pickerRef.current?.click());
  };

  const confirmDiscard = () => {
    setDiscardConfirmationOpen(false);
    clearReferenceRecovery();
    clearRecentOutfits();
    setActiveTool(null);
    workflow.reset(true);
  };

  if (!selected) {
    return (
      <div css={panelStackStyles(theme)} data-scroll-region="existing-video-flow">
        {workflow.message ? (
          <StatusNotice tone="danger" role="alert">
            {workflow.message}
          </StatusNotice>
        ) : null}
        <ExistingVideoUploadChooser
          phase={workflow.phase}
          pickerRef={pickerRef}
          recordingSupported={recordingSupported}
          onChooseFiles={chooseFiles}
          onDrop={receiveDrop}
          {...(onRecordVideo ? { onRecordVideo } : {})}
          onCancel={workflow.cancelBeforeAcceptance}
        />
      </div>
    );
  }

  const metadata = workflow.currentMetadata ?? selected.metadata;
  const currentPhase = existingVideoEditorPhase(workflow);
  const activeStep = workflow.steps[0];
  const activeVisualCapability = activeStep
    ? capabilityForExistingVideoStep(activeStep, visualCapabilities)
    : null;

  return (
    <div css={panelStackStyles(theme)} data-scroll-region="existing-video-flow">
      <ExistingVideoPhaseIndicator current={currentPhase} />

      <div css={workspaceStyles(theme)}>
        <div css={sourceColumnStyles(theme)}>
          <ExistingVideoSourceCard
            workflow={workflow}
            locked={structureLocked}
            {...(onAdjustVideo ? { onAdjust: onAdjustVideo } : {})}
            onRequestReplace={requestReplace}
            onRequestDiscard={() => setDiscardConfirmationOpen(true)}
            replaceButtonRef={replaceButtonRef}
            discardButtonRef={discardButtonRef}
          />
        </div>

        <div
          css={editorColumnStyles(theme)}
          data-scroll-region="existing-video-editor"
          role="region"
          aria-label="Choose edits and configure"
          tabIndex={0}
        >
          {workflow.message ? (
            <StatusNotice
              tone={
                workflow.phase === 'error'
                  ? 'danger'
                  : workflow.phase === 'complete'
                    ? 'success'
                    : 'neutral'
              }
              role={workflow.phase === 'error' ? 'alert' : 'status'}
            >
              {workflow.message}
            </StatusNotice>
          ) : null}
          {referenceError ? (
            <StatusNotice tone="danger" role="alert">
              {referenceError}
              {missingVtonReference ? (
                <div css={recoveryActionStyles(theme)}>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={recipeLoading}
                    onClick={retryMissingReference}
                  >
                    Retry image
                  </Button>
                  {missingVtonReference.recipe.prompt.trim() ? (
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={recipeLoading}
                      onClick={continueWithoutReference}
                    >
                      Continue without reference
                    </Button>
                  ) : null}
                  <Button
                    size="small"
                    variant="quiet"
                    disabled={recipeLoading}
                    onClick={removeMissingOutfit}
                  >
                    Remove outfit
                  </Button>
                </div>
              ) : null}
            </StatusNotice>
          ) : null}
          {workflow.phase === 'error' && workflow.acceptedSubmission && workflow.retryJob ? (
            <StatusNotice tone="warning">
              Visual processing accepted the original recipe. Changes below are saved for a possible
              later submission; resuming checks the accepted job without submitting those changes.
            </StatusNotice>
          ) : null}

          {workflow.phase === 'complete' ? (
            <ExistingVideoResultSummary
              activeStep={activeStep}
              voiceSelection={workflow.voiceSelection}
            />
          ) : (
            <>
              <header css={sectionHeadingStyles(theme)}>
                <h2>Choose your edits</h2>
                <p>
                  Choose one visual edit: Character Swap or Virtual Try On. Voice is independent, so
                  you can add it to either visual edit or use it on its own.
                </p>
              </header>

              <ExistingVideoToolCards
                workflow={workflow}
                activeTool={activeTool}
                locked={structureLocked}
                characterSwapAvailable={visualCapabilities.characterSwap.available}
                virtualTryOnAvailable={visualCapabilities.virtualTryOn.available}
                onSelect={selectTool}
              />

              {workflow.active ? (
                <ExistingVideoProcessingStatus
                  operation={workflow.operation}
                  elapsedSeconds={workflow.elapsedSeconds}
                />
              ) : (
                <div
                  id="existing-video-active-configuration"
                  css={activeConfigurationStyles()}
                  tabIndex={-1}
                >
                  {activeStep?.modelId === 'lucy-latest' ? (
                    <div hidden={activeTool !== 'character'}>
                      <ExistingVideoVisualEditor
                        step={activeStep}
                        savedRecipes={savedRecipes.filter(
                          (recipe) =>
                            activeVisualCapability?.promptInput !== 'server-default' ||
                            recipe.modelId !== 'lucy-latest' ||
                            recipe.referenceImageAssetId !== null,
                        )}
                        recentOutfits={recentOutfits}
                        structureLocked={structureLocked}
                        recipeLocked={recipeLocked}
                        recipeLoading={recipeLoading}
                        referenceRequired={activeVisualCapability?.referencePolicy === 'required'}
                        promptEnhancementSupported={
                          activeVisualCapability?.promptEnhancement ?? false
                        }
                        promptInput={activeVisualCapability?.promptInput ?? 'editable'}
                        outputResolutions={activeVisualCapability?.outputResolutions ?? ['720p']}
                        providerOptions={visualCapabilities.characterSwap.providers ?? []}
                        onApplySavedRecipe={(step, recipeId) =>
                          void applySavedRecipe(step, recipeId)
                        }
                        onChooseReference={(step, file) => void chooseReference(step, file)}
                        {...(onCreateCharacter ? { onCreateCharacter } : {})}
                        {...(onCreateWardrobeVariant ? { onCreateWardrobeVariant } : {})}
                        onUpdate={workflow.updateStep}
                        onSetVtonInputKind={workflow.setVtonInputKind}
                        onClear={clearVisualStep}
                        onClearReferenceError={clearReferenceRecovery}
                      />
                    </div>
                  ) : null}
                  {activeStep?.modelId === 'lucy-vton-latest' ? (
                    <div hidden={activeTool !== 'vton'}>
                      <ExistingVideoVisualEditor
                        step={activeStep}
                        savedRecipes={savedRecipes}
                        recentOutfits={recentOutfits}
                        structureLocked={structureLocked}
                        recipeLocked={recipeLocked}
                        recipeLoading={recipeLoading}
                        referenceRequired={false}
                        promptEnhancementSupported={
                          visualCapabilities.virtualTryOn.promptEnhancement
                        }
                        promptInput={visualCapabilities.virtualTryOn.promptInput}
                        onApplySavedRecipe={(step, recipeId) =>
                          void applySavedRecipe(step, recipeId)
                        }
                        onChooseReference={(step, file) => void chooseReference(step, file)}
                        onUpdate={workflow.updateStep}
                        onSetVtonInputKind={workflow.setVtonInputKind}
                        onClear={clearVisualStep}
                        onClearReferenceError={clearReferenceRecovery}
                      />
                    </div>
                  ) : null}
                  {workflow.voiceAvailable ? (
                    <div hidden={activeTool !== 'voice'}>
                      <ExistingVideoVoiceEditor
                        workflow={workflow}
                        durationMs={metadata.durationMs}
                        elevenLabsAvailable={elevenLabsAvailable}
                        elevenLabsModel={elevenLabsModel}
                        locked={structureLocked}
                        {...(browserCapabilities ? { browserCapabilities } : {})}
                      />
                    </div>
                  ) : null}
                  {!activeTool ? (
                    <Surface tone="soft" padding="compact">
                      <p>
                        Choose a tool to configure an edit, or continue directly to review and save
                        the unchanged video.
                      </p>
                    </Surface>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ExistingVideoActionBar
        workflow={workflow}
        videoProcessingAvailable={videoProcessingAvailable}
        {...(activeStep
          ? {
              activeVisualCapability: activeVisualCapability!,
            }
          : {})}
        onFinish={onFinish}
        {...(onSaveVideo ? { onSaveVideo } : {})}
        {...(saveVideoState ? { saveVideoState } : {})}
        onEditSelected={() => {
          setActiveTool(null);
          workflow.editSelected();
        }}
        onStartOver={() => {
          setActiveTool(null);
          workflow.startOver();
        }}
        onRequestDiscard={() => setDiscardConfirmationOpen(true)}
        discardButtonRef={discardButtonRef}
      />

      <input
        ref={pickerRef}
        hidden
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        onChange={(event) => {
          chooseFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      <ExistingVideoConfirmationDialogs
        pendingVisualSwitch={pendingVisualSwitch}
        visualSwitchOpen={visualSwitchConfirmationOpen}
        visualSwitchInvokerRef={visualSwitchInvokerRef}
        replaceOpen={replaceConfirmationOpen}
        replaceButtonRef={replaceButtonRef}
        discardOpen={discardConfirmationOpen}
        discardButtonRef={discardButtonRef}
        onCancelVisualSwitch={() => setVisualSwitchConfirmationOpen(false)}
        onConfirmVisualSwitch={() => {
          const pending = pendingVisualSwitch;
          setVisualSwitchConfirmationOpen(false);
          if (pending) activateVisualTool(pending.to);
        }}
        onCancelReplace={() => {
          setReplaceConfirmationOpen(false);
          setPendingDroppedFile(null);
          replacementPickerAuthorizedRef.current = false;
        }}
        onConfirmReplace={confirmReplace}
        onCancelDiscard={() => setDiscardConfirmationOpen(false)}
        onConfirmDiscard={confirmDiscard}
      />
    </div>
  );
};
