import { useTheme } from '@emotion/react';
import type { SavedVideoSummary, SavedVideoVersion } from '@studio/contracts';
import { projectExportSpecificationsEqual, type ProjectExportSpecification } from '@studio/domain';
import { useState, type RefObject } from 'react';
import { downloadSavedVideoUrl } from '../../adapters/api-client/savedVideosApi';
import { Button, LinkButton, OverlayPanel, StatusNotice } from '../../ui';
import {
  ExportPlacementChooser,
  ExportPlacementProgress,
  exportPlacementLabel,
} from '../export-placements';
import { useSavedVideoPlacementDownload } from '../saved-videos/useSavedVideoPlacementDownload';
import { previewFooterStyles } from './VideoGallery.styles';

/**
 * Re-framing a retained Version for a placement, mounted only while the panel is open.
 *
 * The render reports progress many times a second, so the state that receives it lives here rather
 * than in the gallery: a leaf that exists for the length of the export cannot re-render the poster
 * grid behind it, and unmounting on close releases the render along with the panel.
 */
export const VideoExportPanel = ({
  video,
  version,
  versions = [],
  returnFocusRef,
  onClose,
}: {
  readonly video: SavedVideoSummary;
  readonly version: SavedVideoVersion;
  /**
   * Every Version of this video the caller has already read, so the panel can recognise the ones
   * saved together with this one. Empty while that read is loading or failed: the placement is then
   * re-framed here, which is what happens for a video that has no set anyway.
   */
  readonly versions?: readonly SavedVideoVersion[];
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) => {
  const theme = useTheme();
  // The Version records the placement its bytes were produced for, so the panel opens on the answer
  // this video already has rather than asking the question a second time.
  const [placement, setPlacement] = useState<ProjectExportSpecification | null>(
    version.exportSpecification,
  );
  const { render, failure, cancel, download } = useSavedVideoPlacementDownload();
  const rendering = render.phase === 'rendering';
  // A placement can only be produced where the browser can render one; elsewhere the chooser says
  // so and the original shape is what the operator gets. Carrying the placement rather than a
  // boolean lets the offer below narrow to it.
  //
  // Re-framing the placement already recorded would be work with nothing to show for it: a Version
  // carries a placement exactly when a rendition was stored for it, so those bytes are that shape
  // and the server can simply hand them over.
  const isStoredShape = projectExportSpecificationsEqual(placement, version.exportSpecification);
  const reframing = render.supported === true && !isStoredShape ? placement : null;
  // A Version saved together with this one may already hold the chosen placement, produced from the
  // same cut in the same save: the server hands those bytes over, and nothing is re-framed here —
  // including where this browser could not re-frame at all.
  //
  // Only within one set, and never for a Version that belongs to none. Without that check, choosing
  // Square post on a Studio-saved Version would offer some other save's square file — a different
  // cut, presented as the re-frame of this one.
  const savedTogether =
    placement === null || isStoredShape || version.variantSetId === null
      ? null
      : (versions.find(
          (candidate) =>
            candidate.id !== version.id &&
            candidate.variantSetId === version.variantSetId &&
            candidate.exportSpecification?.aspect === placement.aspect,
        ) ?? null);

  const close = () => {
    cancel();
    onClose();
  };

  return (
    <OverlayPanel
      open
      onClose={close}
      title="Export video"
      description="Choose where this video is going. Re-framing happens in this browser; the saved version is not changed."
      placement="bottom"
      size="standard"
      closeOnBackdrop={false}
      closeDisabled={rendering}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={previewFooterStyles(theme)}>
          <Button variant="quiet" disabled={rendering} onClick={close}>
            Cancel
          </Button>
          {savedTogether && placement ? (
            <LinkButton
              variant="primary"
              href={downloadSavedVideoUrl(video.id, savedTogether.id)}
              download={savedTogether.filename}
              aria-label={`Download ${video.title}, Version ${savedTogether.ordinal}`}
            >
              Download for {exportPlacementLabel(placement.aspect).toLowerCase()}
            </LinkButton>
          ) : reframing ? (
            <Button
              variant="primary"
              busy={rendering}
              aria-label={`Download ${video.title}, Version ${version.ordinal}, for ${exportPlacementLabel(reframing.aspect)}`}
              onClick={() => void download({ version, specification: reframing })}
            >
              Download for {exportPlacementLabel(reframing.aspect).toLowerCase()}
            </Button>
          ) : (
            <LinkButton
              variant="primary"
              href={downloadSavedVideoUrl(video.id, version.id)}
              download={version.filename}
              aria-label={`Download ${video.title}, Version ${version.ordinal}`}
            >
              Download
            </LinkButton>
          )}
        </div>
      }
    >
      <div css={{ display: 'grid', gap: theme.space.sm }}>
        <ExportPlacementChooser
          value={placement}
          source={{ width: version.width, height: version.height, durationMs: version.durationMs }}
          disabled={rendering}
          supported={render.supported}
          onChange={setPlacement}
        />
        {savedTogether ? (
          <p css={{ margin: 0 }} data-export-saved-together="">
            Version {savedTogether.ordinal} was saved together with this one for exactly this
            placement, so it downloads from the server instead of being re-framed here.
          </p>
        ) : null}
        <ExportPlacementProgress
          phase={render.phase}
          progress={render.progress}
          error={render.error}
          onCancel={render.cancel}
        />
        {failure ? (
          <StatusNotice role="alert" tone="warning" title="Not re-framed">
            {failure}
          </StatusNotice>
        ) : null}
      </div>
    </OverlayPanel>
  );
};
