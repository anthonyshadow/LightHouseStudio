import { useEffect, useRef, type RefObject } from 'react';
import { Button, type ButtonVariant } from './Button';
import { OverlayPanel } from './OverlayPanel';

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  alert?: string | undefined;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  secondaryAction?: Readonly<{
    label: string;
    onAction: () => void;
    variant?: ButtonVariant;
  }>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmationDialog = ({
  open,
  title,
  description,
  alert,
  confirmLabel,
  cancelLabel = 'Stay',
  danger = false,
  busy = false,
  secondaryAction,
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
      initialFocusRef={cancelRef}
      {...(returnFocusRef ? { returnFocusRef } : {})}
      footer={
        <div css={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '.75rem' }}>
          <Button ref={cancelRef} disabled={busy} variant="quiet" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {secondaryAction ? (
            <Button
              disabled={busy}
              variant={secondaryAction.variant ?? 'secondary'}
              onClick={secondaryAction.onAction}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
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
      {alert ? <p role="alert">{alert}</p> : null}
    </OverlayPanel>
  );
};
