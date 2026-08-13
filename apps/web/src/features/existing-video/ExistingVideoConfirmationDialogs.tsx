import type { RefObject } from 'react';
import { ConfirmationDialog } from '../../ui';
import { visualToolName, type ExistingVideoVisualToolId } from './existingVideoPresentation';

export type PendingVisualSwitch = Readonly<{
  from: ExistingVideoVisualToolId;
  to: ExistingVideoVisualToolId;
}>;

export const ExistingVideoConfirmationDialogs = ({
  pendingVisualSwitch,
  visualSwitchOpen,
  visualSwitchInvokerRef,
  replaceOpen,
  replaceButtonRef,
  discardOpen,
  discardButtonRef,
  onCancelVisualSwitch,
  onConfirmVisualSwitch,
  onCancelReplace,
  onConfirmReplace,
  onCancelDiscard,
  onConfirmDiscard,
}: {
  readonly pendingVisualSwitch: PendingVisualSwitch | null;
  readonly visualSwitchOpen: boolean;
  readonly visualSwitchInvokerRef: RefObject<HTMLButtonElement | null>;
  readonly replaceOpen: boolean;
  readonly replaceButtonRef: RefObject<HTMLButtonElement | null>;
  readonly discardOpen: boolean;
  readonly discardButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onCancelVisualSwitch: () => void;
  readonly onConfirmVisualSwitch: () => void;
  readonly onCancelReplace: () => void;
  readonly onConfirmReplace: () => void;
  readonly onCancelDiscard: () => void;
  readonly onConfirmDiscard: () => void;
}) => (
  <>
    <ConfirmationDialog
      open={visualSwitchOpen}
      title={
        pendingVisualSwitch
          ? `Switch to ${visualToolName(pendingVisualSwitch.to)}?`
          : 'Switch visual edit?'
      }
      description={
        pendingVisualSwitch
          ? `Switching will clear your current ${visualToolName(pendingVisualSwitch.from)} settings. Your Voice settings will not be affected, and Voice can still be combined with ${visualToolName(pendingVisualSwitch.to)}.`
          : ''
      }
      confirmLabel="Clear and switch"
      cancelLabel={
        pendingVisualSwitch ? `Keep ${visualToolName(pendingVisualSwitch.from)}` : 'Keep editing'
      }
      returnFocusRef={visualSwitchInvokerRef}
      onCancel={onCancelVisualSwitch}
      onConfirm={onConfirmVisualSwitch}
    />
    <ConfirmationDialog
      open={replaceOpen}
      title="Replace source video?"
      description="A valid replacement clears the current edit setup and generated result. If validation fails, this video remains available."
      confirmLabel="Choose replacement"
      cancelLabel="Keep current video"
      returnFocusRef={replaceButtonRef}
      onCancel={onCancelReplace}
      onConfirm={onConfirmReplace}
    />
    <ConfirmationDialog
      open={discardOpen}
      title="Discard this video?"
      description="The source, edit setup, and generated result are temporary and cannot be recovered after this tab releases them."
      confirmLabel="Discard video"
      cancelLabel="Keep video"
      danger
      returnFocusRef={discardButtonRef}
      onCancel={onCancelDiscard}
      onConfirm={onConfirmDiscard}
    />
  </>
);
