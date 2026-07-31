import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useRef, useState, type DragEvent } from 'react';
import { validateReferenceImage } from '../../adapters/browser-media/imageValidation';
import { hydrateReferenceImage } from '../../adapters/api-client/apiClient';
import { Button, StatusNotice, Surface } from '../../ui';
import { formatBytes, formatDuration } from '../recording';
import { VoiceLibrary } from '../voice-effects/VoiceLibrary';
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
  readonly elevenLabsAvailable?: boolean;
  readonly elevenLabsModel?: string | null;
  readonly onFinish: () => void;
  readonly savedRecipes?: readonly ExistingVideoSavedRecipe[];
  readonly onCreateCharacter?: (stepId: string) => void;
  readonly recordingSupported?: boolean;
  readonly onRecordVideo?: () => void;
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
  '& select, & input[type="url"]': {
    width: '100%',
    minHeight: '2.75rem',
    padding: theme.space.xs,
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
  step.modelId === 'lucy-latest' ? 'Character Swap' : 'Virtual Try On';

const stepHeading = (step: ExistingVideoStep): string =>
  step.modelId === 'lucy-latest' ? 'Character Swap (Lucy 2.5)' : 'Virtual Try On';

const stepIsComplete = (step: ExistingVideoStep): boolean => {
  if (step.modelId === 'lucy-latest') {
    return Boolean(step.prompt.trim() || step.referenceImage);
  }
  if (step.inputKind === 'prompt') return Boolean(step.prompt.trim());
  if (step.inputKind === 'reference-image') return step.referenceImage !== null;
  return Boolean(step.savedRecipeId || step.referenceImage || step.prompt.trim());
};

const Orientation = ({ width, height }: { width: number; height: number }) =>
  width > height ? 'Landscape 16:9' : 'Portrait 9:16';

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
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [voiceChooserOpen, setVoiceChooserOpen] = useState(false);
  const [recentOutfits, setRecentOutfits] = useState<
    readonly Readonly<{ id: string; file: File }>[]
  >([]);
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
    setRecentOutfits([]);
    setVoiceChooserOpen(false);
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
          <div css={rowStyles(theme)}>
            <Button
              variant="primary"
              busy={workflow.phase === 'validating'}
              onClick={() => pickerRef.current?.click()}
            >
              Select video
            </Button>
            {onRecordVideo ? (
              <Button variant="secondary" disabled={!recordingSupported} onClick={onRecordVideo}>
                Record a local video
              </Button>
            ) : null}
          </div>
          <span>or drop it here</span>
        </div>
      </div>
    );
  }

  const metadata = selected.metadata;
  const voiceSourceAvailable = workflow.voiceAvailable;

  return (
    <div css={panelStyles(theme)}>
      <header>
        <h2>{workflow.original?.kind === 'recorded' ? 'Recorded source' : 'Uploaded source'}</h2>
        <p>
          Review this source, then apply optional AI edits. The source, recipes, and results stay in
          this tab; refreshing or closing it loses the workflow.
        </p>
      </header>

      <div css={sourceOverviewStyles(theme)}>
        <ExistingVideoSourcePreview
          artifact={workflow.comparison === 'result' ? workflow.result : workflow.original}
          displayName={
            workflow.comparison === 'result' && workflow.result
              ? (workflow.result.name ?? workflow.result.filename)
              : metadata.displayName
          }
        />
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

      {workflow.result ? (
        <div css={rowStyles(theme)} role="group" aria-label="Compare and edit video">
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
          {!workflow.active ? (
            <Button variant="secondary" onClick={workflow.editSelected}>
              Edit {workflow.comparison === 'original' ? 'original' : 'result'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {workflow.message ? (
        <StatusNotice tone={workflow.phase === 'error' ? 'danger' : 'neutral'} role="status">
          {workflow.message}
        </StatusNotice>
      ) : null}
      {workflow.active && workflow.operation ? (
        <StatusNotice tone="neutral" role="status" title={workflow.operation.title}>
          {workflow.operation.detail}
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
                  Choose Character Swap or Virtual Try On. Switch freely before submission; only the
                  active transformation is used and it creates one Decart submission.
                </p>
              </div>
              <div css={rowStyles(theme)} role="group" aria-label="Visual transformation">
                <Button
                  variant={workflow.steps[0]?.modelId === 'lucy-latest' ? 'primary' : 'secondary'}
                  aria-pressed={workflow.steps[0]?.modelId === 'lucy-latest'}
                  disabled={structureLocked}
                  onClick={() => workflow.addStep('lucy-latest')}
                >
                  Character Swap
                </Button>
                <Button
                  variant={
                    workflow.steps[0]?.modelId === 'lucy-vton-latest' ? 'primary' : 'secondary'
                  }
                  aria-pressed={workflow.steps[0]?.modelId === 'lucy-vton-latest'}
                  disabled={structureLocked}
                  onClick={() => workflow.addStep('lucy-vton-latest')}
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
                {step.modelId === 'lucy-vton-latest' ? (
                  <>
                    <p>
                      For the controlled pilot, use media you have rights and consent to submit. One
                      clearly visible garment on a plain background works best; results do not
                      predict fit, sizing, or purchase accuracy.
                    </p>
                    <div css={rowStyles(theme)} role="group" aria-label="Outfit input type">
                      {(
                        [
                          ['saved-outfit', 'Saved or recent outfit'],
                          ['reference-image', 'Reference image'],
                          ['prompt', 'Prompt'],
                        ] as const
                      ).map(([kind, label]) => (
                        <Button
                          key={kind}
                          variant={step.inputKind === kind ? 'primary' : 'secondary'}
                          aria-pressed={step.inputKind === kind}
                          disabled={recipeLocked}
                          onClick={() => workflow.setVtonInputKind(step.id, kind)}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    {step.inputKind === 'saved-outfit' ? (
                      <label>
                        Saved or recently uploaded outfit
                        <select
                          value={
                            step.savedRecipeId
                              ? `saved:${step.savedRecipeId}`
                              : recentOutfits.find((item) => item.file === step.referenceImage)
                                ? `recent:${recentOutfits.find((item) => item.file === step.referenceImage)!.id}`
                                : ''
                          }
                          disabled={recipeLocked || recipeLoading}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            if (value.startsWith('saved:')) {
                              void applySavedRecipe(step, value.slice(6));
                              return;
                            }
                            const recent = recentOutfits.find(
                              (item) => `recent:${item.id}` === value,
                            );
                            if (recent) {
                              workflow.updateStep(step.id, {
                                savedRecipeId: null,
                                prompt: '',
                                enhancePrompt: false,
                                referenceImage: recent.file,
                              });
                            }
                          }}
                        >
                          <option value="">Choose an outfit</option>
                          {savedRecipes
                            .filter((recipe) => recipe.modelId === 'lucy-vton-latest')
                            .map((recipe) => (
                              <option key={recipe.id} value={`saved:${recipe.id}`}>
                                {recipe.label}
                              </option>
                            ))}
                          {recentOutfits.map((outfit) => (
                            <option key={outfit.id} value={`recent:${outfit.id}`}>
                              Recent · {outfit.file.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p>
                      Confirm you have rights and consent for submitted media before continuing.
                    </p>
                    <ExistingVideoRecipeChooser
                      modelId={step.modelId}
                      recipes={savedRecipes.filter((recipe) => recipe.modelId === step.modelId)}
                      selectedRecipeId={step.savedRecipeId}
                      disabled={recipeLocked}
                      loading={recipeLoading}
                      onChoose={(recipeId) => void applySavedRecipe(step, recipeId)}
                      {...(onCreateCharacter
                        ? { onCreateCharacter: () => onCreateCharacter(step.id) }
                        : {})}
                    />
                  </>
                )}
                {step.modelId === 'lucy-latest' || step.inputKind === 'prompt' ? (
                  <>
                    <label>
                      Prompt
                      <textarea
                        value={step.prompt}
                        maxLength={1_200}
                        disabled={recipeLocked}
                        placeholder={
                          step.modelId === 'lucy-latest'
                            ? 'Describe the character or visual edit'
                            : 'Describe the garment and desired appearance'
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
                  </>
                ) : null}
                {step.modelId === 'lucy-latest' || step.inputKind === 'reference-image' ? (
                  <ExistingVideoReferenceField
                    modelId={step.modelId}
                    file={step.referenceImage}
                    disabled={recipeLocked}
                    allowUrlImport={step.modelId === 'lucy-vton-latest'}
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
                ) : null}
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

          <section css={panelStyles(theme)} aria-labelledby="voice-plan-heading">
            <div css={visualPlanHeaderStyles(theme)}>
              <div>
                <h2 id="voice-plan-heading">Voice</h2>
                <p>
                  Optional. The saved ElevenLabs library loads only when you open it. Combined edits
                  always finish the visual change before applying the selected voice.
                </p>
              </div>
              <div css={rowStyles(theme)}>
                <Button
                  variant={workflow.voiceSelection ? 'primary' : 'secondary'}
                  aria-expanded={voiceChooserOpen}
                  disabled={!voiceSourceAvailable || structureLocked}
                  onClick={() => setVoiceChooserOpen((open) => !open)}
                >
                  {workflow.voiceSelection ? 'Change selected voice' : 'Add voice change'}
                </Button>
                {workflow.voiceSelection ? (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      workflow.clearVoice();
                      setVoiceChooserOpen(false);
                    }}
                  >
                    No voice change
                  </Button>
                ) : null}
              </div>
            </div>
            {!voiceSourceAvailable ? (
              <StatusNotice tone="neutral">
                Voice change is unavailable because the immutable source has no usable audio
                sidecar.
              </StatusNotice>
            ) : null}
            {workflow.voiceSelection ? (
              <StatusNotice tone="neutral">
                Selected voice: <strong>{workflow.voiceSelection.voiceName}</strong>. Selection
                alone does not upload audio.
              </StatusNotice>
            ) : null}
            {voiceChooserOpen ? (
              elevenLabsAvailable ? (
                <VoiceLibrary
                  mode="select"
                  disabled={structureLocked}
                  clipDurationLabel={formatDuration(metadata.durationMs / 1_000)}
                  modelId={elevenLabsModel}
                  onApply={(voice) => {
                    workflow.selectVoice(voice.voiceId, voice.name);
                    setVoiceChooserOpen(false);
                  }}
                />
              ) : (
                <StatusNotice tone="warning">
                  ElevenLabs is unavailable. Configure it before selecting a saved voice.
                </StatusNotice>
              )
            ) : null}
          </section>

          <Surface tone="soft" padding="compact">
            <div css={panelStyles(theme)}>
              <h2>Review transfer</h2>
              <p>
                {workflow.steps.length > 0 && workflow.voiceSelection
                  ? `1 Decart submission (${modelLabel(workflow.steps[0]!)}) followed by 1 ElevenLabs conversion (${workflow.voiceSelection.voiceName}).`
                  : workflow.steps.length > 0
                    ? `1 planned Decart submission: ${modelLabel(workflow.steps[0]!)}.`
                    : workflow.voiceSelection
                      ? `1 planned ElevenLabs conversion: ${workflow.voiceSelection.voiceName}.`
                      : 'No provider transfer. Keep the video local and continue to review.'}
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
                {workflow.steps.length === 0 && !workflow.voiceSelection ? (
                  <Button variant="primary" onClick={onFinish}>
                    Continue locally
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    busy={workflow.active}
                    disabled={
                      structureLocked ||
                      (workflow.steps.length > 0 && !videoProcessingAvailable) ||
                      workflow.steps.some((step) => !stepIsComplete(step))
                    }
                    onClick={() => void workflow.submitPlan()}
                  >
                    {workflow.steps.length > 0 && workflow.voiceSelection
                      ? 'Start visual, then voice'
                      : workflow.steps.length > 0
                        ? 'Start · 1 Decart submission'
                        : 'Start · 1 ElevenLabs conversion'}
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
                  onClick={() => {
                    setRecentOutfits([]);
                    setVoiceChooserOpen(false);
                    workflow.reset(true);
                  }}
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
            Compare the original source with the generated result on the shared stage. Download
            saves the result; Start over keeps the original source.
          </p>
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
