import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { ReferenceImageAsset } from '@studio/contracts';
import { Button, ReferenceImagePreview, StatusNotice } from '../../ui';

export type ReferenceGenerationState = {
  status: 'idle' | 'generating' | 'restoring' | 'error';
  error: string | null;
  errorKind?: 'generation' | 'restore';
};

export type WorkshopReferenceImage = ReferenceImageAsset & {
  /** In-memory only; helps stale detection immediately after generation. */
  generatedFromPrompt?: string;
};

export interface ReferenceImageGeneratorProps {
  prompt: string;
  available: boolean;
  disabled: boolean;
  generateDisabled: boolean;
  stale: boolean;
  referenceImage: WorkshopReferenceImage | null;
  generation: ReferenceGenerationState;
  onGenerate(prompt: string): void;
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

export const ReferenceImageGenerator = ({
  prompt,
  available,
  disabled,
  generateDisabled,
  stale,
  referenceImage,
  generation,
  onGenerate,
  onDetach,
  onRetryRestore,
}: ReferenceImageGeneratorProps) => {
  const theme = useTheme();
  const busy = generation.status === 'generating' || generation.status === 'restoring';

  return (
    <section aria-label="Character reference image" css={generatorStyles(theme)}>
      <p css={copyStyles(theme)}>
        Preview the character and use the image as a Lucy 2.5 reference.
      </p>

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
                disabled={disabled || generateDisabled || busy}
                onClick={() => onGenerate(prompt)}
              >
                Regenerate
              </Button>
              <Button
                size="small"
                variant="quiet"
                disabled={disabled || busy}
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
          disabled={disabled || generateDisabled || !available || !prompt}
          title={
            !available
              ? 'Reference generation requires an available OpenAI image capability.'
              : undefined
          }
          onClick={() => onGenerate(prompt)}
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
