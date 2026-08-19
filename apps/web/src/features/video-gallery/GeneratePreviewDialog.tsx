import type { SavedVideoSummary } from '@studio/contracts';
import { useState, type RefObject } from 'react';
import { ThumbnailSourceChooser } from '../saved-videos/ThumbnailSourceChooser';
import { useGenerateSavedVideoPreview } from '../saved-videos/useGenerateSavedVideoPreview';
import {
  DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE,
  type SavedVideoThumbnailChoice,
} from '../saved-videos/thumbnailSource';
import { Button, OverlayPanel, StatusNotice } from '../../ui';

/**
 * Repair surface for a Saved Video with no poster frame. It offers the same three sources as the
 * save dialog, so a preview chosen here and a preview chosen at save time mean the same thing.
 */
export const GeneratePreviewDialog = ({
  video,
  returnFocusRef,
  onClose,
  onGenerated,
}: {
  readonly video: SavedVideoSummary;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onGenerated: (video: SavedVideoSummary) => void;
}) => {
  const [choice, setChoice] = useState<SavedVideoThumbnailChoice>(
    DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE,
  );
  const generate = useGenerateSavedVideoPreview();
  const busy = generate.isPending;

  const run = async () => {
    generate.reset();
    try {
      await generate.mutateAsync({ video, choice });
      onGenerated(video);
    } catch {
      // The mutation's error state owns the message; the panel stays open for a retry.
    }
  };

  return (
    <OverlayPanel
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Generate preview"
      description={`Choose the preview image for “${video.title}”. Its saved Versions are not changed.`}
      placement="bottom"
      size="standard"
      closeDisabled={busy}
      closeOnBackdrop={false}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.75rem' }}>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} disabled={busy} onClick={() => void run()}>
            {choice.kind === 'image' ? 'Use this image' : 'Generate preview'}
          </Button>
        </div>
      }
    >
      <div css={{ display: 'grid', gap: '1rem' }}>
        <ThumbnailSourceChooser value={choice} disabled={busy} onChange={setChoice} />
        {busy ? (
          <p role="status">
            {choice.kind === 'image'
              ? 'Preparing the preview image…'
              : 'Reading the video and generating a preview…'}
          </p>
        ) : null}
        {generate.isError ? (
          <StatusNotice role="alert" tone="danger" title="Preview not generated">
            {generate.error instanceof Error
              ? generate.error.message
              : 'The preview could not be generated.'}{' '}
            <Button size="small" onClick={() => void run()}>
              Retry
            </Button>
          </StatusNotice>
        ) : null}
      </div>
    </OverlayPanel>
  );
};
