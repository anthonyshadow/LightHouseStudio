import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button, OverlayPanel, StatusNotice, TextAreaField } from '../../ui';

export interface RegenerationDialogProps {
  open: boolean;
  busy?: boolean;
  editAvailable?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel(): void;
  onSubmit(changeInstructions: string): void;
}

export const RegenerationDialog = ({
  open,
  busy = false,
  editAvailable = true,
  returnFocusRef,
  onCancel,
  onSubmit,
}: RegenerationDialogProps) => {
  const [instructions, setInstructions] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const writtenEditUnavailable = Boolean(instructions.trim()) && !editAvailable;

  useEffect(() => {
    if (open) setInstructions('');
  }, [open]);

  return (
    <OverlayPanel
      open={open}
      onClose={onCancel}
      title="Regenerate character preview"
      description="Optionally describe what should change. Leave this blank for a fresh image from the current character prompt."
      placement="bottom"
      size="standard"
      closeOnBackdrop={false}
      initialFocusRef={fieldRef}
      {...(returnFocusRef ? { returnFocusRef } : {})}
      footer={
        <div css={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.75rem' }}>
          <Button disabled={busy} variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={writtenEditUnavailable}
            variant="primary"
            onClick={() => onSubmit(instructions)}
          >
            Regenerate
          </Button>
        </div>
      }
    >
      <TextAreaField
        ref={fieldRef}
        label="What would you like changed?"
        hint="Optional. Written changes use the previous image as an edit reference."
        value={instructions}
        maxLength={2_000}
        disabled={busy}
        onChange={(event) => setInstructions(event.currentTarget.value)}
      />
      {!editAvailable ? (
        <StatusNotice tone="warning" role="status">
          Provider-backed edits are unavailable. Leave the field blank to generate a fresh image
          from the current character direction.
        </StatusNotice>
      ) : null}
    </OverlayPanel>
  );
};
