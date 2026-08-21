import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { SavedVideoDetail } from '@studio/contracts';
import type { ProjectExportSpecification } from '@studio/domain';
import { useEffect, useRef, useState } from 'react';
import {
  downloadSavedVideoUrl,
  readSavedVideoContent,
} from '../../adapters/api-client/savedVideosApi';
import { Button, StatusNotice } from '../../ui';
import {
  ExportPlacementProgress,
  exportPlacementLabel,
  useExportPlacementRender,
} from '../export-placements';

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

// Download is a server-served anchor rather than a Button so the browser owns the transfer, matching
// the Videos gallery and Project history affordances.
const downloadLinkStyles = (theme: Theme): CSSObject => ({
  minWidth: '2.75rem',
  minHeight: '2.75rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.55rem 0.8rem',
  border: `1px solid ${theme.colors.accent}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: theme.colors.surfaceStrong,
  fontWeight: 720,
  lineHeight: 1.1,
  textDecoration: 'none',
  '&:hover': { borderColor: theme.colors.accentStrong },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
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
  const placement = useExportPlacementRender();
  const fetchRef = useRef<AbortController | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // A placement can only be produced where the browser can render; elsewhere the original shape is
  // what the operator gets, and saying so is better than offering a control that cannot work.
  const reframing = exportSpecification !== null && placement.supported;
  const placementName =
    exportSpecification === null ? null : exportPlacementLabel(exportSpecification.aspect);

  useEffect(() => () => fetchRef.current?.abort('unmount'), []);

  const downloadPlacement = async () => {
    if (exportSpecification === null || placement.phase === 'rendering') return;
    setFailure(null);
    const controller = new AbortController();
    fetchRef.current = controller;
    let media: Blob;
    try {
      media = await readSavedVideoContent({
        videoId: video.id,
        versionId: video.currentVersion.id,
        mimeType: video.currentVersion.mimeType,
        signal: controller.signal,
        abortMessage: 'Preparing this download was cancelled.',
      });
    } catch {
      if (!controller.signal.aborted) {
        setFailure('This video could not be read to re-frame it. Download it as it is instead.');
      }
      return;
    } finally {
      if (fetchRef.current === controller) fetchRef.current = null;
    }
    const rendered = await placement.render({
      media,
      specification: exportSpecification,
      source: {
        width: video.currentVersion.width,
        height: video.currentVersion.height,
        durationMs: video.currentVersion.durationMs,
      },
      // The retained record does not state whether it carries audio, so an existing track is kept
      // rather than required.
      hasAudio: false,
      filename: video.currentVersion.filename,
    });
    if (rendered === null) return;
    // The Blob exists only for the length of the click that hands it over.
    const url = URL.createObjectURL(rendered.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = rendered.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div css={{ display: 'grid', gap: theme.space.xs }} data-saved-video-success-actions="">
      <div css={actionRowStyles(theme)}>
        {reframing ? (
          <Button
            variant="secondary"
            busy={placement.phase === 'rendering'}
            disabled={placement.phase === 'rendering'}
            aria-label={`Download ${video.title}, Version ${video.currentVersion.ordinal}, for ${placementName}`}
            onClick={() => void downloadPlacement()}
          >
            Download for {placementName?.toLowerCase()}
          </Button>
        ) : (
          <a
            href={downloadSavedVideoUrl(video.id, video.currentVersion.id)}
            download={video.currentVersion.filename}
            aria-label={`Download ${video.title}, Version ${video.currentVersion.ordinal}`}
            css={downloadLinkStyles(theme)}
          >
            Download
          </a>
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
      {exportSpecification !== null && !placement.supported ? (
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
        phase={placement.phase}
        progress={placement.progress}
        error={placement.error}
        onCancel={placement.cancel}
      />
      {reframing ? (
        <a
          href={downloadSavedVideoUrl(video.id, video.currentVersion.id)}
          download={video.currentVersion.filename}
          aria-label={`Download ${video.title}, Version ${video.currentVersion.ordinal}, in its original shape`}
          css={{ fontSize: '0.85rem', justifySelf: 'start' }}
        >
          Download the original shape instead
        </a>
      ) : null}
    </div>
  );
};
