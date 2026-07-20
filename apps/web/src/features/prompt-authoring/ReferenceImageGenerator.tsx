import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type {
  CharacterReferenceBackground,
  CharacterReferenceExpression,
  CharacterReferenceFraming,
  CharacterReferenceOrientation,
  CharacterReferenceRenderingMode,
  ReferenceImageAsset,
} from '@studio/contracts';
import { REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH } from '@studio/contracts';
import {
  Button,
  ReferenceImagePreview,
  SelectField,
  StatusNotice,
  TextAreaField,
  TextField,
} from '../../ui';
import { isCustomBackgroundMissing, type WorkshopReferenceOptions } from './referenceOptimization';

export type ReferenceGenerationState = {
  status: 'idle' | 'generating' | 'restoring' | 'error';
  error: string | null;
  errorKind?: 'generation' | 'restore';
};

export type WorkshopReferenceImage = ReferenceImageAsset & {
  /** In-memory only; helps stale detection immediately after generation. */
  generatedFromPrompt?: string;
};

export type ReferenceOptimizationStatus = 'idle' | 'optimizing' | 'ready' | 'error';

export interface ReferencePromptOptimizationView {
  enabled: boolean;
  options: WorkshopReferenceOptions;
  status: ReferenceOptimizationStatus;
  stale: boolean;
  optimizedImagePrompt: string;
  lucy25CharacterPrompt: string;
  warnings: readonly string[];
  model: string | null;
  version: string | null;
  manuallyEdited: boolean;
  error: string | null;
}

export interface ReferenceImageGeneratorProps {
  prompt: string;
  available: boolean;
  disabled: boolean;
  generateDisabled: boolean;
  stale: boolean;
  referenceImage: WorkshopReferenceImage | null;
  generation: ReferenceGenerationState;
  optimization: ReferencePromptOptimizationView;
  onOptimizationEnabledChange(enabled: boolean): void;
  onReferenceOptionsChange(options: WorkshopReferenceOptions): void;
  onOptimize(): void;
  onOptimizedImagePromptChange(prompt: string): void;
  onGenerate(): void;
  onDetach(): void;
  onRetryRestore?: (() => void) | undefined;
}

const generatorStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  paddingBlockStart: theme.space.sm,
  borderBlockStart: `1px solid ${theme.colors.border}`,
});

const copyStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
  lineHeight: 1.45,
});

const optimizationPanelStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
});

const toggleStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: theme.space.sm,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
  lineHeight: 1.45,
  cursor: 'pointer',
  '& input': {
    flex: '0 0 auto',
    width: '1.1rem',
    height: '1.1rem',
    marginTop: '0.1rem',
    accentColor: theme.colors.accent,
  },
  '& span': { minWidth: 0, overflowWrap: 'anywhere' },
  '& strong': { display: 'block', color: theme.colors.text },
});

const optionsGridStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  '@container (min-width: 38rem)': {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
});

const optimizationMetaStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  color: theme.colors.textFaint,
  fontFamily: theme.type.mono,
  fontSize: theme.fontSizes.caption,
});

const warningListStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  paddingInlineStart: theme.space.lg,
  display: 'grid',
  gap: theme.space.xxs,
});

const previewRowStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(7rem, 11rem) minmax(0, 1fr)',
  alignItems: 'start',
  gap: theme.space.sm,
});

const previewCopyStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.xs,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
  '& strong': { color: theme.colors.text },
});

const skeletonStyles = (theme: Theme): CSSObject => ({
  width: 'min(100%, 11rem)',
  aspectRatio: '1',
  display: 'grid',
  placeItems: 'center',
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  background: `linear-gradient(110deg, ${theme.colors.surfaceSoft}, ${theme.colors.canvasRaised}, ${theme.colors.surfaceSoft})`,
  textAlign: 'center',
  fontSize: theme.fontSizes.caption,
});

const actionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: theme.space.xs,
});

const optimizationActionLabel = (
  status: ReferenceOptimizationStatus,
  hasOptimization: boolean,
): string => {
  if (status === 'error') return 'Retry';
  return hasOptimization ? 'Re-optimize' : 'Optimize prompt';
};

export const ReferenceImageGenerator = ({
  prompt,
  available,
  disabled,
  generateDisabled,
  stale,
  referenceImage,
  generation,
  optimization,
  onOptimizationEnabledChange,
  onReferenceOptionsChange,
  onOptimize,
  onOptimizedImagePromptChange,
  onGenerate,
  onDetach,
  onRetryRestore,
}: ReferenceImageGeneratorProps) => {
  const theme = useTheme();
  const busy = generation.status === 'generating' || generation.status === 'restoring';
  const optimizing = optimization.status === 'optimizing';
  const optimizedPromptEmpty =
    optimization.enabled &&
    optimization.status === 'ready' &&
    !optimization.stale &&
    !optimization.optimizedImagePrompt.trim();
  const customBackgroundMissing = isCustomBackgroundMissing(optimization.options);
  const optimizerMustRecover = optimization.enabled && optimization.status === 'error';
  const generationBlocked =
    disabled ||
    generateDisabled ||
    busy ||
    optimizing ||
    optimizerMustRecover ||
    optimizedPromptEmpty ||
    customBackgroundMissing;
  const hasOptimization = Boolean(optimization.model && optimization.version);
  const changeReferenceOption = <K extends keyof WorkshopReferenceOptions>(
    key: K,
    value: WorkshopReferenceOptions[K],
  ): void => {
    onReferenceOptionsChange({ ...optimization.options, [key]: value });
  };

  return (
    <section aria-label="Character reference image" css={generatorStyles(theme)}>
      <p css={copyStyles(theme)}>
        Preview the character and use the image as a Lucy 2.5 reference. Full body is the default
        whenever the character's anatomy permits it.
      </p>

      <div css={optimizationPanelStyles(theme)}>
        <label css={toggleStyles(theme)}>
          <input
            type="checkbox"
            aria-label="Optimize prompt with GPT"
            checked={optimization.enabled}
            disabled={disabled || busy || optimizing}
            onChange={(event) => onOptimizationEnabledChange(event.currentTarget.checked)}
          />
          <span>
            <strong>Optimize prompt with GPT</strong>
            Enabled by default. Disable it explicitly to generate from the original recipe.
          </span>
        </label>

        <div css={optionsGridStyles(theme)}>
          <SelectField
            label="Target Lucy framing"
            value={optimization.options.framing}
            disabled={disabled || busy || optimizing}
            onChange={(event) =>
              changeReferenceOption(
                'framing',
                event.currentTarget.value as CharacterReferenceFraming,
              )
            }
          >
            <option value="head_and_shoulders">Webcam portrait / head and shoulders</option>
            <option value="waist_up">Waist up</option>
            <option value="full_body">Full body (default)</option>
          </SelectField>
          <SelectField
            label="Orientation"
            value={optimization.options.orientation}
            disabled={disabled || busy || optimizing}
            onChange={(event) =>
              changeReferenceOption(
                'orientation',
                event.currentTarget.value as CharacterReferenceOrientation,
              )
            }
          >
            <option value="auto">Auto from target stream</option>
            <option value="portrait_9_16">Portrait 9:16</option>
            <option value="landscape_16_9">Landscape 16:9</option>
            <option value="square">Square reference</option>
          </SelectField>
          <SelectField
            label="Rendering"
            value={optimization.options.renderingMode}
            disabled={disabled || busy || optimizing}
            onChange={(event) =>
              changeReferenceOption(
                'renderingMode',
                event.currentTarget.value as CharacterReferenceRenderingMode,
              )
            }
          >
            <option value="photorealistic">Photorealistic</option>
            <option value="faithful_source_style">Faithful source style</option>
          </SelectField>
          <SelectField
            label="Reference expression"
            value={optimization.options.expression}
            disabled={disabled || busy || optimizing}
            onChange={(event) =>
              changeReferenceOption(
                'expression',
                event.currentTarget.value as CharacterReferenceExpression,
              )
            }
          >
            <option value="neutral">Neutral</option>
            <option value="subtle_friendly">Subtle friendly expression</option>
          </SelectField>
          <SelectField
            label="Background"
            value={optimization.options.background}
            disabled={disabled || busy || optimizing}
            onChange={(event) =>
              changeReferenceOption(
                'background',
                event.currentTarget.value as CharacterReferenceBackground,
              )
            }
          >
            <option value="neutral_gray">Neutral gray</option>
            <option value="off_white">Off-white</option>
            <option value="plain_custom">Custom plain background</option>
          </SelectField>
          {optimization.options.background === 'plain_custom' ? (
            <TextField
              label="Custom plain background"
              value={optimization.options.customBackground ?? ''}
              maxLength={200}
              disabled={disabled || busy || optimizing}
              error={
                customBackgroundMissing
                  ? 'Provide a short plain background description.'
                  : undefined
              }
              placeholder="e.g. muted slate blue"
              onChange={(event) =>
                changeReferenceOption('customBackground', event.currentTarget.value)
              }
            />
          ) : null}
        </div>

        {optimization.enabled ? (
          <>
            <div css={actionsStyles(theme)}>
              <Button
                size="small"
                variant="secondary"
                busy={optimizing}
                disabled={disabled || generateDisabled || busy}
                onClick={onOptimize}
              >
                {optimizationActionLabel(optimization.status, hasOptimization)}
              </Button>
              {optimizing ? (
                <span role="status" css={copyStyles(theme)}>
                  Optimizing the reference prompt…
                </span>
              ) : null}
            </div>

            {hasOptimization ? (
              <>
                <div css={optimizationMetaStyles(theme)} aria-label="Optimizer details">
                  <span>{optimization.model}</span>
                  <span>{optimization.version}</span>
                  {optimization.manuallyEdited ? <span>Manually edited</span> : null}
                </div>
                <TextAreaField
                  label="Optimized reference-image prompt"
                  value={optimization.optimizedImagePrompt}
                  disabled={disabled || busy || optimizing}
                  maxLength={REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH}
                  error={
                    optimizedPromptEmpty ? 'The optimized prompt must contain text.' : undefined
                  }
                  hint={
                    optimization.stale
                      ? 'The original recipe or reference settings changed. Generate will re-optimize first.'
                      : 'You can edit this prompt before generation; your edit will be used exactly.'
                  }
                  onChange={(event) => onOptimizedImagePromptChange(event.currentTarget.value)}
                />
                <TextAreaField
                  label="Lucy 2.5 character prompt"
                  value={optimization.lucy25CharacterPrompt}
                  readOnly
                  hint="Saved with the reference for the Lucy 2.5 character-replacement flow."
                />
              </>
            ) : null}

            {optimization.stale && hasOptimization ? (
              <StatusNotice tone="warning" role="status">
                Optimization is out of date for the current recipe or reference settings.
              </StatusNotice>
            ) : null}

            {optimization.warnings.length > 0 ? (
              <StatusNotice tone="warning" title="Optimizer guidance" role="status">
                <ul css={warningListStyles(theme)}>
                  {optimization.warnings.map((warning, index) => (
                    <li key={`${index}-${warning}`}>{warning}</li>
                  ))}
                </ul>
              </StatusNotice>
            ) : null}

            {optimization.status === 'error' && optimization.error ? (
              <StatusNotice tone="danger" title="Prompt optimization failed" role="alert">
                {optimization.error}
              </StatusNotice>
            ) : null}
          </>
        ) : (
          <StatusNotice tone="warning" role="status">
            GPT optimization is off. Generate will use the original recipe only because you disabled
            optimization explicitly.
          </StatusNotice>
        )}
      </div>

      {referenceImage ? (
        <div css={previewRowStyles(theme)}>
          <ReferenceImagePreview
            assetId={referenceImage.assetId}
            alt="Generated front-facing character reference"
            size="panel"
          />
          <div css={previewCopyStyles(theme)} aria-live="polite">
            <strong>Reference image attached</strong>
            <span>
              {referenceImage.width}×{referenceImage.height} · local immutable asset
            </span>
            {generation.status === 'generating' ? (
              <span role="status">
                Creating a new character reference… The current one stays attached.
              </span>
            ) : null}
            <div css={actionsStyles(theme)}>
              <Button
                size="small"
                variant="secondary"
                busy={generation.status === 'generating'}
                disabled={generationBlocked || !available}
                onClick={onGenerate}
              >
                Regenerate
              </Button>
              <Button
                size="small"
                variant="quiet"
                disabled={disabled || busy || optimizing}
                aria-label="Detach generated reference image"
                onClick={onDetach}
              >
                Detach
              </Button>
            </div>
          </div>
        </div>
      ) : generation.status === 'generating' || generation.status === 'restoring' ? (
        <div css={skeletonStyles(theme)} role="status" aria-live="polite">
          {generation.status === 'generating'
            ? 'Creating character reference…'
            : 'Restoring character reference…'}
        </div>
      ) : (
        <Button
          variant="secondary"
          disabled={generationBlocked || !available || !prompt}
          title={
            !available
              ? 'Reference generation requires an available OpenAI image capability.'
              : undefined
          }
          onClick={onGenerate}
        >
          Generate reference image
        </Button>
      )}

      {stale && referenceImage ? (
        <StatusNotice tone="warning" role="status">
          Prompt changed — regenerate the reference image for a closer match.
        </StatusNotice>
      ) : null}

      {generation.status === 'error' && generation.error ? (
        <StatusNotice tone="danger" title="Reference image was not changed" role="alert">
          {generation.error}
          {generation.errorKind === 'restore' && onRetryRestore ? (
            <div css={[actionsStyles(theme), { marginBlockStart: theme.space.xs }]}>
              <Button size="small" variant="secondary" onClick={onRetryRestore}>
                Retry
              </Button>
              <Button size="small" variant="quiet" onClick={onDetach}>
                Continue without reference
              </Button>
            </div>
          ) : null}
        </StatusNotice>
      ) : null}
    </section>
  );
};
