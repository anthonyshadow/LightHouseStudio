import { useEffect, useRef, type RefObject } from 'react';
import { Button, OverlayPanel } from '../../ui';

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmationDialog = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Stay',
  danger = false,
  busy = false,
  returnFocusRef,
  onCancel,
  onConfirm,
}: ConfirmationDialogProps) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => cancelRef.current?.focus());
  }, [open]);

  return (
    <OverlayPanel
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      placement="bottom"
      size="standard"
      closeDisabled={busy}
      closeOnBackdrop={false}
      initialFocus="heading"
      {...(returnFocusRef ? { returnFocusRef } : {})}
      footer={
        <div css={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.75rem' }}>
          <Button ref={cancelRef} disabled={busy} variant="quiet" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            busy={busy}
            disabled={busy}
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p>{description}</p>
    </OverlayPanel>
  );
};
