import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { SavedVideoDetail } from '@studio/contracts';
import type { ProjectExportSpecification } from '@studio/domain';
import { downloadSavedVideoUrl } from '../../adapters/api-client/savedVideosApi';
import { Button, LinkButton, StatusNotice } from '../../ui';
import { ExportPlacementProgress, exportPlacementLabel } from '../export-placements';
import { useSavedVideoPlacementDownload } from './useSavedVideoPlacementDownload';

const actionRowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.xs,
  '@media (max-width: 34rem)': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& > *': { width: '100%' },
  },
});

export interface SavedVideoSuccessActionsProps {
  readonly video: SavedVideoDetail;
  /**
   * The placement recorded for this save, when one was chosen. Absent or null, Download is the
   * unchanged server-served anchor and nothing is rendered.
   */
  readonly exportSpecification?: ProjectExportSpecification | null;
  readonly onOpenInAssets: () => void;
  readonly onCreateAnother?: (() => void) | undefined;
  readonly createAnotherLabel?: string;
}

export const SavedVideoSuccessActions = ({
  video,
  exportSpecification = null,
  onOpenInAssets,
  onCreateAnother,
  createAnotherLabel = 'Create another',
}: SavedVideoSuccessActionsProps) => {
  const theme = useTheme();
  // Three of this component's four call sites pass no specification at all, and the capability is
  // only ever shown beside one, so those three do not make the browser measure it.
  const { render, failure, download } = useSavedVideoPlacementDownload(
    exportSpecification !== null,
  );
  // A placement can only be produced where the browser can render; elsewhere the original shape is
  // what the operator gets, and saying so is better than offering a control that cannot work.
  // Carrying the specification rather than a boolean lets the offer below narrow to it.
  // `=== true` deliberately: while the probe is unresolved this is neither a re-framing download
  // nor a plain one. Reading `null` as no would quietly hand over the original-shape file under a
  // label the operator chose a placement for, and the notice below is gated on a definite no.
  const reframing = render.supported === true ? exportSpecification : null;
  const capabilityPending = exportSpecification !== null && render.supported === null;

  return (
    <div css={{ display: 'grid', gap: theme.space.xs }} data-saved-video-success-actions="">
      <div css={actionRowStyles(theme)}>
        {reframing ? (
          <Button
            variant="secondary"
            busy={render.phase === 'rendering'}
            disabled={render.phase === 'rendering'}
            aria-label={`Download ${video.title}, Version ${video.currentVersion.ordinal}, for ${exportPlacementLabel(reframing.aspect)}`}
            onClick={() =>
              void download({ version: video.currentVersion, specification: reframing })
            }
          >
            Download for {exportPlacementLabel(reframing.aspect).toLowerCase()}
          </Button>
        ) : capabilityPending ? (
          // A placement was chosen and we do not yet know whether this browser can honour it.
          // Offering the plain download here would hand over the original shape under a label the
          // operator picked a placement for, so the control waits rather than doing the wrong one.
          <Button variant="secondary" busy disabled>
            Download
          </Button>
        ) : (
          <LinkButton
            href={downloadSavedVideoUrl(video.id, video.currentVersion.id)}
            download={video.currentVersion.filename}
            aria-label={`Download ${video.title}, Version ${video.currentVersion.ordinal}`}
          >
            Download
          </LinkButton>
        )}
        <Button variant="secondary" onClick={onOpenInAssets}>
          View in Assets
        </Button>
        {onCreateAnother ? (
          <Button variant="quiet" onClick={onCreateAnother}>
            {createAnotherLabel}
          </Button>
        ) : null}
      </div>
      {/* Only once the probe has answered: an unknown capability is not a warning. */}
      {exportSpecification !== null && render.supported === false ? (
        <StatusNotice tone="warning" title="Local editor unavailable">
          This browser cannot re-frame a video, so Download gives you the video in its original
          shape. The placement is still recorded on this Project.
        </StatusNotice>
      ) : null}
      {failure === null ? null : (
        <StatusNotice role="alert" tone="warning" title="Not re-framed">
          {failure}
        </StatusNotice>
      )}
      <ExportPlacementProgress
        phase={render.phase}
        progress={render.progress}
        error={render.error}
        onCancel={render.cancel}
      />
      {reframing ? (
        <LinkButton
          variant="link"
          size="small"
          href={downloadSavedVideoUrl(video.id, video.currentVersion.id)}
          download={video.currentVersion.filename}
          aria-label={`Download ${video.title}, Version ${video.currentVersion.ordinal}, in its original shape`}
          css={{ justifySelf: 'start' }}
        >
          Download the original shape instead
        </LinkButton>
      ) : null}
    </div>
  );
};
