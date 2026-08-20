import { SAVED_VIDEO_TITLE_MAX_LENGTH } from '@studio/contracts';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Button, OverlayPanel, TextField } from '../../ui';
import { ThumbnailSourceChooser } from './ThumbnailSourceChooser';
import {
  DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE,
  type SavedVideoThumbnailChoice,
} from './thumbnailSource';

export interface SaveVideoDialogProps {
  readonly fallbackName: string;
  readonly onCancel: () => void;
  readonly onSave: (name?: string, thumbnail?: SavedVideoThumbnailChoice) => void;
}

export const SaveVideoDialog = ({ fallbackName, onCancel, onSave }: SaveVideoDialogProps) => {
  const formId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [thumbnail, setThumbnail] = useState<SavedVideoThumbnailChoice>(
    DEFAULT_SAVED_VIDEO_THUMBNAIL_CHOICE,
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const requestedName = name.trim();
    onSave(requestedName || undefined, thumbnail);
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
      initialFocusRef={fieldRef}
      footer={
        <div css={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.75rem' }}>
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary">
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
        <ThumbnailSourceChooser value={thumbnail} onChange={setThumbnail} />
      </form>
    </OverlayPanel>
  );
};
