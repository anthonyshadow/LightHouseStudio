import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Button, type ButtonVariant } from './Button';
import { OverlayPanel } from './OverlayPanel';
import { StatusNotice } from './StatusNotice';

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  /**
   * Body copy, when the question the operator answers differs from the panel's description.
   * Defaults to repeating `description`.
   */
  body?: ReactNode;
  alert?: string | undefined;
  /**
   * Renders the alert as a titled `StatusNotice` instead of a bare paragraph. Confirmations that
   * report a failed mutation want the heavier treatment; a plain caution does not.
   */
  alertTitle?: string | undefined;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  /** Blocks the confirm action while leaving the dialog readable — an explained refusal. */
  confirmDisabled?: boolean;
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
  body,
  alert,
  alertTitle,
  confirmLabel,
  cancelLabel = 'Stay',
  danger = false,
  busy = false,
  confirmDisabled = false,
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
            disabled={busy || confirmDisabled}
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body === undefined ? <p>{description}</p> : body}
      {alert !== undefined && alertTitle !== undefined ? (
        <StatusNotice role="alert" tone="warning" title={alertTitle}>
          {alert}
        </StatusNotice>
      ) : null}
      {alert !== undefined && alertTitle === undefined ? <p role="alert">{alert}</p> : null}
    </OverlayPanel>
  );
};
