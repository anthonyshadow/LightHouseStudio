import { useTheme } from '@emotion/react';
import type { RefObject } from 'react';
import { Button } from '../../ui';
import { formatBytes, formatDuration } from '../recording';
import {
  comparisonStyles,
  metadataStyles,
  sourceCardStyles,
  sourceDetailsStyles,
  sourceFactsStyles,
  sourceHeadingStyles,
  sourceManagementStyles,
  sourceAdjustStyles,
  sourceAdjustStatusStyles,
} from './ExistingVideoPanel.styles';
import { ExistingVideoSourcePreview } from './ExistingVideoSourcePreview';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

const orientation = (width: number, height: number): string =>
  width === height ? 'Square' : width > height ? 'Landscape' : 'Portrait';

export const ExistingVideoSourceCard = ({
  workflow,
  locked,
  onAdjust,
  onRequestReplace,
  onRequestDiscard,
  replaceButtonRef,
  discardButtonRef,
}: {
  readonly workflow: ExistingVideoWorkflow;
  readonly locked: boolean;
  readonly onAdjust?: () => void;
  readonly onRequestReplace: () => void;
  readonly onRequestDiscard: () => void;
  readonly replaceButtonRef?: RefObject<HTMLButtonElement | null>;
  readonly discardButtonRef?: RefObject<HTMLButtonElement | null>;
}) => {
  const theme = useTheme();
  const selected = workflow.selection;
  if (!selected) return null;

  const metadata = workflow.currentMetadata ?? selected.metadata;
  const artifact =
    workflow.comparison === 'result' ? (workflow.result ?? workflow.original) : workflow.original;
  const displayName =
    workflow.comparison === 'result' && workflow.result
      ? (workflow.result.name ?? workflow.result.filename)
      : metadata.displayName;

  return (
    <section css={sourceCardStyles(theme)} aria-labelledby="existing-video-source-heading">
      <ExistingVideoSourcePreview artifact={artifact} displayName={displayName} />

      <header css={sourceHeadingStyles(theme)}>
        <div>
          <h2 id="existing-video-source-heading">Current video</h2>
          <p title={displayName}>{displayName}</p>
        </div>
        <span>{workflow.original?.kind === 'recorded' ? 'Recorded' : 'Uploaded'}</span>
      </header>

      {workflow.result ? (
        <div css={comparisonStyles(theme)} role="group" aria-label="Compare original and result">
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
      ) : null}

      <div css={sourceFactsStyles(theme)} aria-label="Video summary">
        <span>{formatDuration(metadata.durationMs / 1_000)}</span>
        <span>
          {metadata.width} × {metadata.height}
        </span>
        <span>{formatBytes(metadata.sizeBytes)}</span>
        <span>{metadata.hasAudio ? 'Audio available' : 'No audio'}</span>
      </div>

      {workflow.phase !== 'complete' && onAdjust ? (
        <button
          type="button"
          css={sourceAdjustStyles(theme)}
          aria-label="Adjust video"
          disabled={locked}
          onClick={onAdjust}
        >
          <span>
            <strong>Adjust video</strong>
            <small>Trim, crop, rotate, relight, or filter on this device.</small>
          </span>
          <span css={sourceAdjustStatusStyles(theme)}>Local</span>
        </button>
      ) : null}

      {workflow.phase !== 'complete' && !locked ? (
        <div css={sourceManagementStyles(theme)} aria-label="Source management">
          <Button
            ref={replaceButtonRef}
            variant="secondary"
            aria-label="Replace source video"
            onClick={onRequestReplace}
          >
            Replace
          </Button>
          <Button
            ref={discardButtonRef}
            variant="danger"
            aria-label="Discard source video"
            onClick={onRequestDiscard}
          >
            Discard
          </Button>
        </div>
      ) : null}

      <details css={sourceDetailsStyles(theme)}>
        <summary>Technical details</summary>
        <dl css={metadataStyles(theme)}>
          <div>
            <dt>File</dt>
            <dd title={displayName}>{displayName}</dd>
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
            <dd>{orientation(metadata.width, metadata.height)}</dd>
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
      </details>
    </section>
  );
};
