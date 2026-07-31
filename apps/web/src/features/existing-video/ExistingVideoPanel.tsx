import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useRef, useState, type DragEvent } from 'react';
import { validateReferenceImage } from '../../adapters/browser-media/imageValidation';
import { hydrateReferenceImage } from '../../adapters/api-client/apiClient';
import { Button, StatusNotice, Surface } from '../../ui';
import { formatBytes, formatDuration } from '../recording';
import {
  ExistingVideoRecipeChooser,
  type ExistingVideoSavedRecipe,
} from './ExistingVideoRecipeChooser';
import { ExistingVideoReferenceField } from './ExistingVideoReferenceField';
import { ExistingVideoSourcePreview } from './ExistingVideoSourcePreview';
import type { ExistingVideoStep, ExistingVideoWorkflow } from './useExistingVideoWorkflow';

type ExistingVideoPanelProps = {
  readonly workflow: ExistingVideoWorkflow;
  readonly videoProcessingAvailable: boolean;
  readonly onFinish: () => void;
  readonly savedRecipes?: readonly ExistingVideoSavedRecipe[];
  readonly onCreateCharacter?: (stepId: string) => void;
};

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

const sourceOverviewStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
  alignItems: 'start',
  '@media (min-width: 64rem)': {
    gridTemplateColumns: 'minmax(18rem, 1.35fr) minmax(16rem, 1fr)',
  },
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
  '& > *': { minHeight: '2.75rem' },
});

const resultActionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  alignItems: 'stretch',
  '& > *': {
    flex: '1 1 9rem',
    minWidth: 0,
    minHeight: '2.85rem',
  },
  '@media (max-width: 32rem)': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& > *': { width: '100%' },
  },
});

const downloadButtonStyles = (theme: Theme): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.7rem 1rem',
  border: '1px solid transparent',
  borderRadius: theme.radii.medium,
  color: theme.colors.onAccent,
  background: `linear-gradient(135deg, ${theme.colors.accentStrong}, ${theme.colors.accent})`,
  boxShadow: theme.shadows.soft,
  fontWeight: 720,
  lineHeight: 1.1,
  textDecoration: 'none',
  WebkitTapHighlightColor: 'transparent',
  '&:hover': { transform: 'translateY(-1px)' },
  '&:active': { transform: 'translateY(0)' },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
});

const visualPlanHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'end',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  '& > div:first-of-type': { minWidth: 'min(100%, 18rem)', flex: '1 1 22rem' },
  '& > div:last-of-type': { flex: '0 1 auto' },
  '@media (max-width: 32rem)': {
    alignItems: 'stretch',
    '& > div:last-of-type': {
      width: '100%',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr)',
      '& > button': { width: '100%' },
    },
  },
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
  step.modelId === 'lucy-2.5' ? 'Swap Character' : 'Virtual Try On';

const stepHeading = (step: ExistingVideoStep): string =>
  step.modelId === 'lucy-2.5' ? 'Swap Character (Lucy 2.5)' : 'Virtual Try On';

const Orientation = ({ width, height }: { width: number; height: number }) =>
  width > height ? 'Landscape 16:9' : 'Portrait 9:16';

export const ExistingVideoPanel = ({
  workflow,
  videoProcessingAvailable,
  onFinish,
  savedRecipes = [],
  onCreateCharacter,
}: ExistingVideoPanelProps) => {
  const theme = useTheme();
  const pickerRef = useRef<HTMLInputElement>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const structureLocked = workflow.acceptedSubmission || workflow.active;
  const recipeLocked =
    workflow.active ||
    (workflow.acceptedSubmission && !(workflow.phase === 'error' && workflow.retryJob));
  const selected = workflow.selection;

  const chooseFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void workflow.selectFile(file);
  };

  const discardVideo = () => {
    if (
      !window.confirm(
        'Discard this uploaded video and its results? They cannot be recovered after this tab releases them.',
      )
    ) {
      return;
    }
    setReferenceError(null);
    workflow.reset(true);
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
      });
    } catch {
      setReferenceError(
        'The saved recipe text is still available, but its reference image could not be loaded.',
      );
      workflow.updateStep(step.id, {
        savedRecipeId: recipe.id,
        prompt: recipe.prompt,
        referenceImage: null,
      });
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

  return (
    <div css={panelStyles(theme)}>
      <header>
        <h2>Uploaded source</h2>
        <p>
          The source, recipes, and results stay in this tab. Refreshing or closing it loses the
          workflow.
        </p>
      </header>

      <div css={sourceOverviewStyles(theme)}>
        <ExistingVideoSourcePreview file={selected.file} displayName={metadata.displayName} />
        <div css={panelStyles(theme)}>
          <h3>Source details</h3>
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
                {metadata.container.toUpperCase()} ·{' '}
                {metadata.videoCodec === 'avc' ? 'H.264' : 'VP8'}
              </dd>
            </div>
            <div>
              <dt>Audio</dt>
              <dd>{metadata.hasAudio ? (metadata.audioCodec ?? 'Present') : 'None'}</dd>
            </div>
          </dl>
        </div>
      </div>

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
      {workflow.phase === 'error' && workflow.acceptedSubmission && workflow.retryJob ? (
        <StatusNotice tone="warning">
          Decart already accepted this exact submission. You can edit the recipe fields below for a
          possible later submission, but <strong>Resume accepted job</strong> checks and downloads
          the original accepted recipe without submitting or changing it.
        </StatusNotice>
      ) : null}

      {workflow.phase !== 'complete' ? (
        <>
          <section css={panelStyles(theme)} aria-labelledby="visual-plan-heading">
            <div css={visualPlanHeaderStyles(theme)}>
              <div>
                <h2 id="visual-plan-heading">Visual plan</h2>
                <p>
                  Choose Swap Character or Virtual Try On. Switch freely before submission; only the
                  active transformation is used and it creates one Decart submission.
                </p>
              </div>
              <div css={rowStyles(theme)} role="group" aria-label="Visual transformation">
                <Button
                  variant={workflow.steps[0]?.modelId === 'lucy-2.5' ? 'primary' : 'secondary'}
                  aria-pressed={workflow.steps[0]?.modelId === 'lucy-2.5'}
                  disabled={structureLocked}
                  onClick={() => workflow.addStep('lucy-2.5')}
                >
                  Swap Character
                </Button>
                <Button
                  variant={workflow.steps[0]?.modelId === 'lucy-vton-3' ? 'primary' : 'secondary'}
                  aria-pressed={workflow.steps[0]?.modelId === 'lucy-vton-3'}
                  disabled={structureLocked}
                  onClick={() => workflow.addStep('lucy-vton-3')}
                >
                  Virtual Try On
                </Button>
              </div>
            </div>

            {workflow.steps.map((step) => (
              <article key={step.id} css={stepStyles(theme)}>
                <header>
                  <h3>{stepHeading(step)}</h3>
                  <span>1 Decart submission</span>
                </header>
                {step.modelId === 'lucy-vton-3' ? (
                  <StatusNotice tone="warning">
                    VTO is beta. Confirm you have rights and consent for the person and garment
                    media before submitting it to Decart.
                  </StatusNotice>
                ) : (
                  <p>Confirm you have rights and consent for submitted media before continuing.</p>
                )}
                <ExistingVideoRecipeChooser
                  modelId={step.modelId}
                  recipes={savedRecipes.filter((recipe) => recipe.modelId === step.modelId)}
                  selectedRecipeId={step.savedRecipeId}
                  disabled={recipeLocked}
                  loading={recipeLoading}
                  onChoose={(recipeId) => void applySavedRecipe(step, recipeId)}
                  {...(step.modelId === 'lucy-2.5' && onCreateCharacter
                    ? { onCreateCharacter: () => onCreateCharacter(step.id) }
                    : {})}
                />
                <label>
                  Prompt
                  <textarea
                    value={step.prompt}
                    maxLength={1_200}
                    disabled={recipeLocked}
                    placeholder={
                      step.modelId === 'lucy-2.5'
                        ? 'Describe the character or visual edit'
                        : 'Describe the garment and desired fit'
                    }
                    onChange={(event) =>
                      workflow.updateStep(step.id, {
                        savedRecipeId: null,
                        prompt: event.currentTarget.value,
                      })
                    }
                  />
                  <span>{step.prompt.length}/1,200</span>
                </label>
                <ExistingVideoReferenceField
                  modelId={step.modelId}
                  file={step.referenceImage}
                  disabled={recipeLocked}
                  onSelectFile={(file) => {
                    workflow.updateStep(step.id, { savedRecipeId: null });
                    void chooseReference(step, file);
                  }}
                  onRemove={() => {
                    setReferenceError(null);
                    workflow.updateStep(step.id, {
                      savedRecipeId: null,
                      referenceImage: null,
                    });
                  }}
                />
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={step.enhancePrompt}
                      disabled={recipeLocked}
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
                    variant="danger"
                    disabled={structureLocked}
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
                  : `1 planned Decart submission: ${modelLabel(workflow.steps[0]!)}.`}
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
                      structureLocked ||
                      !videoProcessingAvailable ||
                      workflow.steps.some(
                        (step) => !step.prompt.trim() && step.referenceImage === null,
                      )
                    }
                    onClick={() => void workflow.submitStep(workflow.completedStepCount)}
                  >
                    Start · 1 Decart submission
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
                <Button
                  variant="danger"
                  disabled={structureLocked}
                  onClick={() => workflow.reset(true)}
                >
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
          Resume accepted job · no new submission
        </Button>
      ) : null}

      {workflow.phase === 'complete' ? (
        <div css={panelStyles(theme)}>
          <h2>Result ready</h2>
          <p>
            Compare the uploaded original with the generated result on the shared stage. Download
            saves the result; Start over keeps the original uploaded.
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
          <div css={resultActionStyles(theme)}>
            {workflow.result ? (
              <a
                href={workflow.result.objectUrl}
                download={workflow.result.filename}
                css={downloadButtonStyles(theme)}
                onClick={workflow.downloadResult}
              >
                Download
              </a>
            ) : null}
            <Button variant="secondary" onClick={workflow.startOver}>
              Start over
            </Button>
            <Button variant="danger" onClick={discardVideo}>
              Discard video
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
