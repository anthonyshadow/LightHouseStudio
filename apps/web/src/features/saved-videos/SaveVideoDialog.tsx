import { useId, useRef, useState, type FormEvent } from 'react';
import { Button, OverlayPanel, TextField } from '../../ui';

const SAVED_VIDEO_NAME_MAX_LENGTH = 120;

export interface SaveVideoDialogProps {
  readonly fallbackName: string;
  readonly onCancel: () => void;
  readonly onSave: (name?: string) => void;
}

export const SaveVideoDialog = ({ fallbackName, onCancel, onSave }: SaveVideoDialogProps) => {
  const formId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const requestedName = name.trim();
    onSave(requestedName || undefined);
  };

  return (
    <OverlayPanel
      open
      onClose={onCancel}
      title="Save to Assets"
      description="Give this video an optional name before retaining it in Assets."
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
      <form id={formId} noValidate onSubmit={submit}>
        <TextField
          ref={fieldRef}
          label="Video name (optional)"
          hint={`Up to ${SAVED_VIDEO_NAME_MAX_LENGTH} characters. Leave blank to use “${fallbackName}”.`}
          value={name}
          maxLength={SAVED_VIDEO_NAME_MAX_LENGTH}
          autoComplete="off"
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </form>
    </OverlayPanel>
  );
};
