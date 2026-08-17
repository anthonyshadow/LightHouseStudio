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
 * The Studio shell's awaitable confirmations, rendered by `StudioLifecycleDialogs`.
 *
 * Carries everything the shared `ConfirmationDialog` needs, so a caller poses a fully-formed
 * question — title, body and button copy — instead of a bare string the dialog has to dress up.
 */
export const useConfirmationRequest = (): ConfirmationRequest =>
  useAwaitableQuestion<ConfirmationRequestOptions>();
