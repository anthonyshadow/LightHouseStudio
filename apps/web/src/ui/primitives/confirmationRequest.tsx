import type { RefObject } from 'react';
import { ConfirmationDialog } from './ConfirmationDialog';
import { useAwaitableQuestion, type AwaitableQuestion } from './useAwaitableQuestion';

export interface ConfirmationRequestOptions {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
}

export type ConfirmationRequest = AwaitableQuestion<ConfirmationRequestOptions>;

/**
 * An awaitable confirmation, answered by a real {@link ConfirmationDialog}.
 *
 * The replacement for `window.confirm`, which blocks the main thread, cannot be themed, is
 * invisible to the overlay stack's focus-return contract, and needs `window` stubbed to test. The
 * caller poses a fully-formed question — title, body and button copy — and awaits the answer.
 *
 * Pair with {@link ConfirmationRequestDialog}, which renders whatever is pending.
 */
export const useConfirmationRequest = (): ConfirmationRequest =>
  useAwaitableQuestion<ConfirmationRequestOptions>();

/**
 * Renders the question a {@link useConfirmationRequest} is currently asking, if any.
 *
 * Mount one per owner of a request. Placement only decides where the dialog belongs in the tree;
 * the overlay stack handles layering, so a surface embedded inside another overlay can mount its
 * own without coordinating with the shell.
 */
export const ConfirmationRequestDialog = ({
  request,
  returnFocusRef,
}: {
  readonly request: ConfirmationRequest;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}) => (
  <ConfirmationDialog
    open={request.pending !== null}
    title={request.pending?.title ?? ''}
    description={request.pending?.description ?? ''}
    confirmLabel={request.pending?.confirmLabel ?? 'Confirm'}
    {...(request.pending?.cancelLabel === undefined
      ? {}
      : { cancelLabel: request.pending.cancelLabel })}
    danger={request.pending?.danger ?? false}
    {...(returnFocusRef ? { returnFocusRef } : {})}
    onCancel={request.cancel}
    onConfirm={request.confirm}
  />
);
