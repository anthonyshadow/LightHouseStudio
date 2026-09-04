import { SAVED_VIDEO_TITLE_MAX_LENGTH } from '@studio/contracts';
import type { ProjectExportSpecification, VideoEditSourceGeometry } from '@studio/domain';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, OverlayPanel, TextField } from '../../ui';
import {
  ExportPlacementChooser,
  ExportPlacementProgress,
  exportPlacementRenderSupported,
  type ExportPlacementRenderPhase,
} from '../export-placements';
import { ThumbnailSourceChooser } from './ThumbnailSourceChooser';
import {
  DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE,
  type SavedVideoThumbnailChoice,
} from './thumbnailSource';

export interface SaveVideoDialogProps {
  readonly fallbackName: string;
  /**
   * The measured frame of what is being saved. Present, a placement can be chosen and the crop is
   * previewed exactly; absent, the video is saved in the shape it already has.
   */
  readonly source?: VideoEditSourceGeometry | null;
  /** Live re-framing state, so the dialog stays open and answerable while the render runs. */
  readonly placementRender?:
    | {
        readonly phase: ExportPlacementRenderPhase;
        readonly progress: number;
        readonly error: string | null;
        readonly onCancel: () => void;
      }
    | undefined;
  readonly onCancel: () => void;
  readonly onSave: (
    name?: string,
    thumbnail?: SavedVideoThumbnailChoice,
    placement?: ProjectExportSpecification | null,
  ) => void;
}

export const SaveVideoDialog = ({
  fallbackName,
  source = null,
  placementRender,
  onCancel,
  onSave,
}: SaveVideoDialogProps) => {
  const formId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [thumbnail, setThumbnail] = useState<SavedVideoThumbnailChoice>(
    DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE,
  );
  const [placement, setPlacement] = useState<ProjectExportSpecification | null>(null);
  const rendering = placementRender?.phase === 'rendering';
  // Re-framing needs both a measured frame and a browser that can render one.
  const placementOffered = source !== null;
  const [placementSupported, setPlacementSupported] = useState<boolean | null>(null);
  useEffect(() => {
    let current = true;
    void exportPlacementRenderSupported().then((value) => {
      if (current) setPlacementSupported(value);
    });
    return () => {
      current = false;
    };
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (rendering) return;
    const requestedName = name.trim();
    onSave(requestedName || undefined, thumbnail, placementOffered ? placement : null);
  };

  return (
    <OverlayPanel
      open
      onClose={onCancel}
      title="Save to Assets"
      description="Give this video an optional name and preview image before retaining it in Assets."
      placement="bottom"
      size="standard"
      closeOnBackdrop={false}
      closeDisabled={rendering}
      initialFocusRef={fieldRef}
      footer={
        <div css={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.75rem' }}>
          <Button variant="quiet" disabled={rendering} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" busy={rendering}>
            Save to Assets
          </Button>
        </div>
      }
    >
      <form id={formId} noValidate onSubmit={submit} css={{ display: 'grid', gap: '1rem' }}>
        <TextField
          ref={fieldRef}
          label="Video name (optional)"
          hint={`Up to ${SAVED_VIDEO_TITLE_MAX_LENGTH} characters. Leave blank to use “${fallbackName}”.`}
          value={name}
          maxLength={SAVED_VIDEO_TITLE_MAX_LENGTH}
          autoComplete="off"
          onChange={(event) => setName(event.currentTarget.value)}
        />
        {placementOffered ? (
          <ExportPlacementChooser
            value={placement}
            source={source}
            // Unknown is not unavailable: the chooser waits a beat rather than telling the
            // operator their browser cannot re-frame and then changing its mind.
            disabled={rendering || placementSupported === null}
            unavailable={placementSupported === false}
            onChange={setPlacement}
          />
        ) : null}
        {placementRender ? (
          <ExportPlacementProgress
            phase={placementRender.phase}
            progress={placementRender.progress}
            error={placementRender.error}
            onCancel={placementRender.onCancel}
          />
        ) : null}
        <ThumbnailSourceChooser value={thumbnail} disabled={rendering} onChange={setThumbnail} />
      </form>
    </OverlayPanel>
  );
};
