import { useTheme } from '@emotion/react';
import { useRef, useState, type DragEvent } from 'react';
import { hydrateReferenceImage } from '../../adapters/api-client/apiClient';
import { validateReferenceImage } from '../../adapters/browser-media/imageValidation';
import { Button, ConfirmationDialog, StatusNotice, Surface } from '../../ui';
import { ExistingVideoActionBar } from './ExistingVideoActionBar';
import {
  dropActionStyles,
  dropZoneStyles,
  editorColumnStyles,
  panelStackStyles,
  processingStyles,
  resultStyles,
  sectionHeadingStyles,
  sourceColumnStyles,
  workspaceStyles,
  appliedSummaryStyles,
} from './ExistingVideoPanel.styles';
import { ExistingVideoPhaseIndicator } from './ExistingVideoPhaseIndicator';
import type { ExistingVideoSavedRecipe } from './ExistingVideoRecipeChooser';
import { ExistingVideoSourceCard } from './ExistingVideoSourceCard';
import { ExistingVideoToolCards } from './ExistingVideoToolCards';
import {
  existingVideoEditorPhase,
  toolForStep,
  visualToolLabel,
  type ExistingVideoToolId,
} from './existingVideoPresentation';
import { ExistingVideoVisualEditor, type RecentOutfit } from './ExistingVideoVisualEditor';
import { ExistingVideoVoiceEditor } from './ExistingVideoVoiceEditor';
import type { ExistingVideoStep, ExistingVideoWorkflow } from './useExistingVideoWorkflow';

type ExistingVideoPanelProps = {
  readonly workflow: ExistingVideoWorkflow;
  readonly videoProcessingAvailable: boolean;
  readonly elevenLabsAvailable?: boolean;
  readonly elevenLabsModel?: string | null;
  readonly onFinish: () => void;
  readonly savedRecipes?: readonly ExistingVideoSavedRecipe[];
  readonly onCreateCharacter?: (stepId: string) => void;
  readonly recordingSupported?: boolean;
  readonly onRecordVideo?: () => void;
};

const initialActiveTool = (workflow: ExistingVideoWorkflow): ExistingVideoToolId | null =>
  toolForStep(workflow.steps[0]) ?? (workflow.voiceSelection ? 'voice' : null);

export const ExistingVideoPanel = ({
  workflow,
  videoProcessingAvailable,
  elevenLabsAvailable = false,
  elevenLabsModel = null,
  onFinish,
  savedRecipes = [],
  onCreateCharacter,
  recordingSupported = false,
  onRecordVideo,
}: ExistingVideoPanelProps) => {
  const theme = useTheme();
  const pickerRef = useRef<HTMLInputElement>(null);
  const replacementPickerAuthorizedRef = useRef(false);
  const replaceButtonRef = useRef<HTMLButtonElement>(null);
  const discardButtonRef = useRef<HTMLButtonElement>(null);
  const [activeTool, setActiveTool] = useState<ExistingVideoToolId | null>(() =>
    initialActiveTool(workflow),
  );
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recentOutfits, setRecentOutfits] = useState<readonly RecentOutfit[]>([]);
  const [replaceConfirmationOpen, setReplaceConfirmationOpen] = useState(false);
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [pendingDroppedFile, setPendingDroppedFile] = useState<File | null>(null);
  const structureLocked = workflow.acceptedSubmission || workflow.active;
  const recipeLocked =
    workflow.active ||
    (workflow.acceptedSubmission && !(workflow.phase === 'error' && workflow.retryJob));
  const selected = workflow.selection;

  const selectFile = (file: File) => {
    setReferenceError(null);
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

  const chooseReference = async (step: ExistingVideoStep, file: File) => {
    const validation = await validateReferenceImage(file, step.modelId);
    if (validation.blockingError) {
      setReferenceError(validation.blockingError);
      return;
    }
    setReferenceError(null);
    workflow.updateStep(step.id, { referenceImage: file });
    if (step.modelId === 'lucy-vton-latest') {
      setRecentOutfits((current) => [
        { id: crypto.randomUUID(), file },
        ...current.filter((item) => item.file !== file),
      ]);
    }
  };

  const applySavedRecipe = async (step: ExistingVideoStep, recipeId: string) => {
    const recipe = savedRecipes.find(
      (candidate) => candidate.id === recipeId && candidate.modelId === step.modelId,
    );
    if (!recipe) return;
    setRecipeLoading(true);
    setReferenceError(null);
    try {
      const referenceImage = recipe.referenceImageAssetId
        ? await hydrateReferenceImage(recipe.referenceImageAssetId)
        : null;
      workflow.updateStep(step.id, {
        savedRecipeId: recipe.id,
        prompt: recipe.prompt,
        referenceImage: referenceImage?.file ?? null,
        ...(step.modelId === 'lucy-vton-latest'
          ? { inputKind: 'saved-outfit' as const, enhancePrompt: false }
          : {}),
      });
    } catch {
      setReferenceError(
        'The saved recipe text is still available, but its reference image could not be loaded.',
      );
      workflow.updateStep(step.id, {
        savedRecipeId: recipe.id,
        prompt: recipe.prompt,
        referenceImage: null,
        ...(step.modelId === 'lucy-vton-latest'
          ? { inputKind: 'saved-outfit' as const, enhancePrompt: false }
          : {}),
      });
    } finally {
      setRecipeLoading(false);
    }
  };

  const selectTool = (tool: ExistingVideoToolId) => {
    if (tool === 'character') workflow.addStep('lucy-latest');
    if (tool === 'vton') workflow.addStep('lucy-vton-latest');
    setActiveTool(tool);
    window.requestAnimationFrame(() => {
      document.getElementById('existing-video-active-configuration')?.focus();
    });
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
    setReferenceError(null);
    setRecentOutfits([]);
    setActiveTool(null);
    workflow.reset(true);
  };

  if (!selected) {
    return (
      <div css={panelStackStyles(theme)}>
        {workflow.message ? (
          <StatusNotice tone="danger" role="alert">
            {workflow.message}
          </StatusNotice>
        ) : null}
        <div
          css={dropZoneStyles(theme)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={receiveDrop}
        >
          <div>
            <h2>{workflow.phase === 'validating' ? 'Checking your video…' : 'Add a video'}</h2>
            <p>
              Upload from this device or record with the local camera. Nothing is sent to a provider
              until you deliberately apply an AI edit.
            </p>
          </div>
          <input
            ref={pickerRef}
            hidden
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            disabled={workflow.phase === 'validating'}
            onChange={(event) => {
              chooseFiles(event.currentTarget.files);
              event.currentTarget.value = '';
            }}
          />
          <div css={dropActionStyles(theme)}>
            <Button
              variant="primary"
              busy={workflow.phase === 'validating'}
              onClick={() => pickerRef.current?.click()}
            >
              Upload from device
            </Button>
            {onRecordVideo ? (
              <Button variant="secondary" disabled={!recordingSupported} onClick={onRecordVideo}>
                Record a local video
              </Button>
            ) : null}
            {workflow.phase === 'validating' ? (
              <Button variant="quiet" onClick={workflow.cancelBeforeAcceptance}>
                Cancel check
              </Button>
            ) : null}
          </div>
          <span>MP4/H.264, MOV/H.264, or WebM/VP8 · 16:9 or 9:16 · up to 5 minutes</span>
          <span>Drag and drop a video anywhere in this area</span>
        </div>
      </div>
    );
  }

  const metadata = selected.metadata;
  const currentPhase = existingVideoEditorPhase(workflow);
  const activeStep = workflow.steps[0];

  return (
    <div css={panelStackStyles(theme)}>
      <ExistingVideoPhaseIndicator current={currentPhase} />

      <div css={workspaceStyles(theme)}>
        <div css={sourceColumnStyles(theme)}>
          <ExistingVideoSourceCard
            workflow={workflow}
            locked={structureLocked}
            onRequestReplace={requestReplace}
            onRequestDiscard={() => setDiscardConfirmationOpen(true)}
            replaceButtonRef={replaceButtonRef}
            discardButtonRef={discardButtonRef}
          />
        </div>

        <div css={editorColumnStyles(theme)}>
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
            </StatusNotice>
          ) : null}
          {workflow.phase === 'error' && workflow.acceptedSubmission && workflow.retryJob ? (
            <StatusNotice tone="warning">
              Decart accepted the original recipe. Changes below are saved for a possible later
              submission; resuming checks the accepted job without submitting those changes.
            </StatusNotice>
          ) : null}

          {workflow.phase === 'complete' ? (
            <section css={resultStyles(theme)} aria-labelledby="existing-video-result-heading">
              <div>
                <h2 id="existing-video-result-heading">Your result is ready</h2>
                <p>
                  Compare Original and Result beside this summary. Download the healthy result,
                  continue editing either version, or start over from the original source.
                </p>
              </div>
              <div css={appliedSummaryStyles(theme)} aria-label="Applied edits">
                {activeStep ? <span>{visualToolLabel(activeStep)}</span> : null}
                {workflow.voiceSelection ? (
                  <span>Voice · {workflow.voiceSelection.voiceName}</span>
                ) : null}
                {!activeStep && !workflow.voiceSelection ? <span>No AI edits</span> : null}
              </div>
            </section>
          ) : (
            <>
              <header css={sectionHeadingStyles(theme)}>
                <h2>Choose your edits</h2>
                <p>
                  Visual edits are optional and mutually exclusive. Voice can be used alone or
                  applied after the selected visual edit.
                </p>
              </header>

              <ExistingVideoToolCards
                workflow={workflow}
                activeTool={activeTool}
                locked={structureLocked}
                onSelect={selectTool}
              />

              {workflow.active ? (
                <section
                  css={processingStyles(theme)}
                  aria-labelledby="existing-video-processing-heading"
                >
                  <span data-processing-mark aria-hidden="true">
                    ···
                  </span>
                  <div>
                    <h2 id="existing-video-processing-heading">
                      {workflow.operation?.title ?? 'Preparing your video…'}
                    </h2>
                    <p>
                      {workflow.operation?.detail ?? 'The last healthy video remains available.'}
                    </p>
                    <p>
                      Elapsed {Math.round(workflow.elapsedSeconds)}s. Progress percentages are not
                      estimated.
                    </p>
                  </div>
                </section>
              ) : (
                <div id="existing-video-active-configuration" tabIndex={-1}>
                  {activeTool === 'character' && activeStep?.modelId === 'lucy-latest' ? (
                    <ExistingVideoVisualEditor
                      step={activeStep}
                      savedRecipes={savedRecipes}
                      recentOutfits={recentOutfits}
                      structureLocked={structureLocked}
                      recipeLocked={recipeLocked}
                      recipeLoading={recipeLoading}
                      onApplySavedRecipe={(step, recipeId) => void applySavedRecipe(step, recipeId)}
                      onChooseReference={(step, file) => void chooseReference(step, file)}
                      {...(onCreateCharacter ? { onCreateCharacter } : {})}
                      onUpdate={workflow.updateStep}
                      onSetVtonInputKind={workflow.setVtonInputKind}
                      onClear={clearVisualStep}
                      onClearReferenceError={() => setReferenceError(null)}
                    />
                  ) : null}
                  {activeTool === 'vton' && activeStep?.modelId === 'lucy-vton-latest' ? (
                    <ExistingVideoVisualEditor
                      step={activeStep}
                      savedRecipes={savedRecipes}
                      recentOutfits={recentOutfits}
                      structureLocked={structureLocked}
                      recipeLocked={recipeLocked}
                      recipeLoading={recipeLoading}
                      onApplySavedRecipe={(step, recipeId) => void applySavedRecipe(step, recipeId)}
                      onChooseReference={(step, file) => void chooseReference(step, file)}
                      onUpdate={workflow.updateStep}
                      onSetVtonInputKind={workflow.setVtonInputKind}
                      onClear={clearVisualStep}
                      onClearReferenceError={() => setReferenceError(null)}
                    />
                  ) : null}
                  {activeTool === 'voice' ? (
                    <ExistingVideoVoiceEditor
                      workflow={workflow}
                      durationMs={metadata.durationMs}
                      elevenLabsAvailable={elevenLabsAvailable}
                      elevenLabsModel={elevenLabsModel}
                      locked={structureLocked}
                    />
                  ) : null}
                  {!activeTool ? (
                    <Surface tone="soft" padding="compact">
                      <p>
                        Choose a tool to configure an edit, or continue directly to review and
                        download the unchanged video.
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
        onFinish={onFinish}
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

      <ConfirmationDialog
        open={replaceConfirmationOpen}
        title="Replace source video?"
        description="A valid replacement clears the current edit setup and generated result. If validation fails, this video remains available."
        confirmLabel="Choose replacement"
        cancelLabel="Keep current video"
        returnFocusRef={replaceButtonRef}
        onCancel={() => {
          setReplaceConfirmationOpen(false);
          setPendingDroppedFile(null);
          replacementPickerAuthorizedRef.current = false;
        }}
        onConfirm={confirmReplace}
      />
      <ConfirmationDialog
        open={discardConfirmationOpen}
        title="Discard this video?"
        description="The source, edit setup, and generated result are temporary and cannot be recovered after this tab releases them."
        confirmLabel="Discard video"
        cancelLabel="Keep video"
        danger
        returnFocusRef={discardButtonRef}
        onCancel={() => setDiscardConfirmationOpen(false)}
        onConfirm={confirmDiscard}
      />
    </div>
  );
};
