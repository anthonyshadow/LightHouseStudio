import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useRef, useState, type DragEvent } from 'react';
import {
  REFERENCE_IMAGE_ACCEPT,
  validateReferenceImage,
} from '../../adapters/browser-media/imageValidation';
import { hydrateReferenceImage } from '../../adapters/api-client/apiClient';
import { Button, StatusNotice, Surface } from '../../ui';
import { formatBytes, formatDuration } from '../recording';
import type { ExistingVideoStep, ExistingVideoWorkflow } from './useExistingVideoWorkflow';

type ExistingVideoPanelProps = {
  readonly workflow: ExistingVideoWorkflow;
  readonly videoProcessingAvailable: boolean;
  readonly onFinish: () => void;
  readonly savedRecipes?: readonly ExistingVideoSavedRecipe[];
};

export type ExistingVideoSavedRecipe = Readonly<{
  id: string;
  label: string;
  modelId: ExistingVideoStep['modelId'];
  prompt: string;
  referenceImageAssetId: string | null;
}>;

const panelStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  alignContent: 'start',
  minWidth: 0,
  '& h2, & h3, & p': { margin: 0 },
});

const dropZoneStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  placeItems: 'center',
  minHeight: '10rem',
  padding: theme.space.lg,
  border: `1px dashed ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  textAlign: 'center',
  '& p': { color: theme.colors.textMuted },
});

const metadataStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(8.5rem, 1fr))',
  gap: theme.space.xs,
  margin: 0,
  '& div': {
    minWidth: 0,
    padding: theme.space.xs,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.small,
    background: theme.colors.surfaceStrong,
  },
  '& dt': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    fontWeight: 760,
  },
  '& dd': {
    margin: `${theme.space.xxs} 0 0`,
    overflowWrap: 'anywhere',
    fontSize: theme.fontSizes.caption,
  },
});

const rowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  alignItems: 'stretch',
  '& > button': { minHeight: '2.75rem' },
});

const stepStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surface,
  '& header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  '& textarea': {
    width: '100%',
    minHeight: '6rem',
    resize: 'vertical',
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.small,
    color: theme.colors.text,
    background: theme.colors.surfaceStrong,
    font: 'inherit',
  },
  '& label': { display: 'grid', gap: theme.space.xxs },
  '& input[type="checkbox"]': { width: '1.2rem', height: '1.2rem' },
});

const modelLabel = (step: ExistingVideoStep): string =>
  step.modelId === 'lucy-2.5' ? 'Lucy 2.5' : 'Virtual Try-On';

const Orientation = ({ width, height }: { width: number; height: number }) =>
  width > height ? 'Landscape 16:9' : 'Portrait 9:16';

export const ExistingVideoPanel = ({
  workflow,
  videoProcessingAvailable,
  onFinish,
  savedRecipes = [],
}: ExistingVideoPanelProps) => {
  const theme = useTheme();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const locked = workflow.acceptedSubmission || workflow.active;
  const selected = workflow.selection;

  const chooseFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void workflow.selectFile(file);
  };

  const receiveDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (locked) return;
    chooseFiles(event.dataTransfer.files);
  };

  const chooseReference = async (step: ExistingVideoStep, file: File | undefined) => {
    if (!file) {
      workflow.updateStep(step.id, { referenceImage: null });
      return;
    }
    const validation = await validateReferenceImage(file, step.modelId);
    if (validation.blockingError) {
      setReferenceError(validation.blockingError);
      return;
    }
    setReferenceError(null);
    workflow.updateStep(step.id, { referenceImage: file });
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
        prompt: recipe.prompt,
        referenceImage: referenceImage?.file ?? null,
      });
    } catch {
      setReferenceError(
        'The saved recipe text is still available, but its reference image could not be loaded.',
      );
      workflow.updateStep(step.id, { prompt: recipe.prompt, referenceImage: null });
    } finally {
      setRecipeLoading(false);
    }
  };

  if (!selected) {
    return (
      <div css={panelStyles(theme)}>
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
            <h2>
              {workflow.phase === 'validating' ? 'Checking video…' : 'Choose an existing video'}
            </h2>
            <p>MP4/H.264, MOV/H.264, or WebM/VP8 · 16:9 or 9:16 · up to 5 minutes</p>
          </div>
          <input
            ref={pickerRef}
            hidden
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            disabled={workflow.phase === 'validating'}
            onChange={(event) => chooseFiles(event.currentTarget.files)}
          />
          <Button
            variant="primary"
            busy={workflow.phase === 'validating'}
            onClick={() => pickerRef.current?.click()}
          >
            Select video
          </Button>
          <span>or drop it here</span>
        </div>
      </div>
    );
  }

  const metadata = selected.metadata;
  const currentStep = workflow.steps[workflow.completedStepCount];

  return (
    <div css={panelStyles(theme)}>
      <header>
        <h2>Uploaded source</h2>
        <p>
          The source, recipes, and results stay in this tab. Refreshing or closing it loses the
          workflow.
        </p>
      </header>

      <dl css={metadataStyles(theme)}>
        <div>
          <dt>File</dt>
          <dd title={metadata.displayName}>{metadata.displayName}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(metadata.sizeBytes)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(metadata.durationMs / 1_000)}</dd>
        </div>
        <div>
          <dt>Resolution</dt>
          <dd>
            {metadata.width} × {metadata.height}
          </dd>
        </div>
        <div>
          <dt>Orientation</dt>
          <dd>
            <Orientation width={metadata.width} height={metadata.height} />
          </dd>
        </div>
        <div>
          <dt>Video</dt>
          <dd>
            {metadata.container.toUpperCase()} · {metadata.videoCodec === 'avc' ? 'H.264' : 'VP8'}
          </dd>
        </div>
        <div>
          <dt>Audio</dt>
          <dd>{metadata.hasAudio ? (metadata.audioCodec ?? 'Present') : 'None'}</dd>
        </div>
      </dl>

      {workflow.message ? (
        <StatusNotice tone={workflow.phase === 'error' ? 'danger' : 'neutral'} role="status">
          {workflow.message}
        </StatusNotice>
      ) : null}
      {referenceError ? (
        <StatusNotice tone="danger" role="alert">
          {referenceError}
        </StatusNotice>
      ) : null}

      {workflow.phase === 'checkpoint' ? (
        <Surface tone="soft" padding="compact">
          <div css={panelStyles(theme)}>
            <h2>Review the intermediate result</h2>
            <p>
              {modelLabel(workflow.steps[workflow.completedStepCount - 1]!)} is complete. The
              remaining {currentStep ? modelLabel(currentStep) : 'step'} will create 1 additional
              Decart submission only after Continue.
            </p>
            <div css={rowStyles(theme)} role="group" aria-label="Compare source and result">
              <Button
                variant={workflow.comparison === 'original' ? 'primary' : 'secondary'}
                aria-pressed={workflow.comparison === 'original'}
                onClick={workflow.showOriginal}
              >
                Original
              </Button>
              <Button
                variant={workflow.comparison === 'result' ? 'primary' : 'secondary'}
                aria-pressed={workflow.comparison === 'result'}
                onClick={workflow.showResult}
              >
                Result
              </Button>
            </div>
            <div css={rowStyles(theme)}>
              <Button
                variant="primary"
                onClick={() => void workflow.submitStep(workflow.completedStepCount)}
              >
                Continue · 1 Decart submission
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  workflow.finishAtCheckpoint();
                  onFinish();
                }}
              >
                Finish here
              </Button>
            </div>
          </div>
        </Surface>
      ) : null}

      {workflow.phase !== 'checkpoint' && workflow.phase !== 'complete' ? (
        <>
          <section css={panelStyles(theme)} aria-labelledby="visual-plan-heading">
            <div>
              <h2 id="visual-plan-heading">Visual plan</h2>
              <p>
                Choose zero, one, or two ordered steps. Each step appears at most once and each
                creates one Decart submission.
              </p>
            </div>
            <div css={rowStyles(theme)}>
              <Button
                variant="secondary"
                disabled={locked || workflow.steps.some((step) => step.modelId === 'lucy-2.5')}
                onClick={() => workflow.addStep('lucy-2.5')}
              >
                Add Lucy
              </Button>
              <Button
                variant="secondary"
                disabled={locked || workflow.steps.some((step) => step.modelId === 'lucy-vton-3')}
                onClick={() => workflow.addStep('lucy-vton-3')}
              >
                Add VTO
              </Button>
            </div>

            {workflow.steps.map((step, index) => (
              <article key={step.id} css={stepStyles(theme)}>
                <header>
                  <h3>
                    {index + 1}. {modelLabel(step)}
                  </h3>
                  <span>{index + 1} Decart submission</span>
                </header>
                {step.modelId === 'lucy-vton-3' ? (
                  <StatusNotice tone="warning">
                    VTO is beta. Confirm you have rights and consent for the person and garment
                    media before submitting it to Decart.
                  </StatusNotice>
                ) : (
                  <p>Confirm you have rights and consent for submitted media before continuing.</p>
                )}
                <label>
                  Recipe Shelf
                  <select
                    defaultValue=""
                    disabled={
                      locked ||
                      recipeLoading ||
                      !savedRecipes.some((recipe) => recipe.modelId === step.modelId)
                    }
                    css={{
                      minHeight: '2.75rem',
                      paddingInline: theme.space.sm,
                      border: `1px solid ${theme.colors.borderStrong}`,
                      borderRadius: theme.radii.small,
                      color: theme.colors.text,
                      background: theme.colors.surfaceStrong,
                    }}
                    onChange={(event) => {
                      void applySavedRecipe(step, event.currentTarget.value);
                      event.currentTarget.value = '';
                    }}
                  >
                    <option value="">
                      {savedRecipes.some((recipe) => recipe.modelId === step.modelId)
                        ? 'Apply a saved recipe…'
                        : 'No saved recipes for this model'}
                    </option>
                    {savedRecipes
                      .filter((recipe) => recipe.modelId === step.modelId)
                      .map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>
                          {recipe.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Prompt
                  <textarea
                    value={step.prompt}
                    maxLength={1_200}
                    disabled={locked}
                    placeholder={
                      step.modelId === 'lucy-2.5'
                        ? 'Describe the character or visual edit'
                        : 'Describe the garment and desired fit'
                    }
                    onChange={(event) =>
                      workflow.updateStep(step.id, { prompt: event.currentTarget.value })
                    }
                  />
                  <span>{step.prompt.length}/1,200</span>
                </label>
                <label>
                  Reference image (JPEG, PNG, or WebP)
                  <input
                    type="file"
                    accept={REFERENCE_IMAGE_ACCEPT}
                    disabled={locked}
                    onChange={(event) => void chooseReference(step, event.currentTarget.files?.[0])}
                  />
                </label>
                {step.referenceImage ? (
                  <span title={step.referenceImage.name}>
                    Selected reference: {step.referenceImage.name}
                  </span>
                ) : null}
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={step.enhancePrompt}
                      disabled={locked}
                      onChange={(event) =>
                        workflow.updateStep(step.id, {
                          enhancePrompt: event.currentTarget.checked,
                        })
                      }
                    />{' '}
                    Enhance prompt
                  </span>
                </label>
                <div css={rowStyles(theme)}>
                  <Button
                    variant="quiet"
                    disabled={locked || index === 0}
                    onClick={() => workflow.moveStep(index, -1)}
                  >
                    Move up
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={locked || index === workflow.steps.length - 1}
                    onClick={() => workflow.moveStep(index, 1)}
                  >
                    Move down
                  </Button>
                  <Button
                    variant="danger"
                    disabled={locked}
                    onClick={() => workflow.removeStep(step.id)}
                  >
                    Remove
                  </Button>
                </div>
              </article>
            ))}
          </section>

          <Surface tone="soft" padding="compact">
            <div css={panelStyles(theme)}>
              <h2>Review transfer</h2>
              <p>
                {workflow.steps.length === 0
                  ? 'No provider transfer. Keep the uploaded video local and continue to Voice or Download.'
                  : `${workflow.steps.length} planned Decart submission${workflow.steps.length === 1 ? '' : 's'} in this order: ${workflow.steps.map(modelLabel).join(' → ')}.`}
              </p>
              {!videoProcessingAvailable && workflow.steps.length > 0 ? (
                <StatusNotice tone="warning">
                  Decart batch processing is unavailable. Local preview and Download still work.
                </StatusNotice>
              ) : null}
              {workflow.status ? (
                <p role="status" aria-live="polite">
                  Stage: {workflow.status.status} · elapsed {Math.round(workflow.elapsedSeconds)}s.
                  Progress percentages are not estimated.
                </p>
              ) : null}
              <div css={rowStyles(theme)}>
                {workflow.steps.length === 0 ? (
                  <Button variant="primary" onClick={onFinish}>
                    Continue locally
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    busy={workflow.active}
                    disabled={
                      locked ||
                      !videoProcessingAvailable ||
                      workflow.steps.some(
                        (step) => !step.prompt.trim() && step.referenceImage === null,
                      )
                    }
                    onClick={() => void workflow.submitStep(workflow.completedStepCount)}
                  >
                    Start first · {workflow.steps.length} planned submission
                    {workflow.steps.length === 1 ? '' : 's'}
                  </Button>
                )}
                {!workflow.acceptedSubmission ? (
                  <Button
                    variant="secondary"
                    disabled={workflow.phase === 'validating'}
                    onClick={() => {
                      if (workflow.active) workflow.cancelBeforeAcceptance();
                      else pickerRef.current?.click();
                    }}
                  >
                    {workflow.active ? 'Cancel upload' : 'Replace video'}
                  </Button>
                ) : null}
                <Button variant="danger" disabled={locked} onClick={() => workflow.reset(true)}>
                  Remove
                </Button>
              </div>
              <input
                ref={pickerRef}
                hidden
                type="file"
                accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                onChange={(event) => chooseFiles(event.currentTarget.files)}
              />
            </div>
          </Surface>
        </>
      ) : null}

      {workflow.pendingVisual ? (
        <Button variant="secondary" onClick={() => void workflow.retryFinalization()}>
          Retry local audio restoration
        </Button>
      ) : null}
      {workflow.retryJob ? (
        <Button variant="primary" onClick={() => void workflow.retryExistingJob()}>
          Retry existing job status or download
        </Button>
      ) : null}

      {workflow.phase === 'complete' ? (
        <div css={panelStyles(theme)}>
          <h2>Result ready</h2>
          <p>
            The latest visual result is on the shared stage. Add optional Voice from the take
            review, restore Original voice at any time, or Download.
          </p>
          <div css={rowStyles(theme)} role="group" aria-label="Compare source and result">
            <Button
              variant={workflow.comparison === 'original' ? 'primary' : 'secondary'}
              aria-pressed={workflow.comparison === 'original'}
              onClick={workflow.showOriginal}
            >
              Original
            </Button>
            <Button
              variant={workflow.comparison === 'result' ? 'primary' : 'secondary'}
              aria-pressed={workflow.comparison === 'result'}
              onClick={workflow.showResult}
            >
              Result
            </Button>
          </div>
          <Button variant="primary" onClick={onFinish}>
            Review Voice and Download
          </Button>
        </div>
      ) : null}
    </div>
  );
};
