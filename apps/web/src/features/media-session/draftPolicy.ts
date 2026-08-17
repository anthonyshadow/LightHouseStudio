import type { ConfirmationRequestOptions } from '../../ui';
import type { SessionDraft, StudioMode } from './types';

export const hasDraftContent = (draft: SessionDraft): boolean =>
  Boolean(draft.prompt.trim() || draft.referenceImage || draft.enhance);

/**
 * Whether switching to `target` would discard something the operator would want to be asked about.
 *
 * The policy — what is at stake in a mode switch — is separate from how the question gets asked, so
 * a caller can pose it synchronously or await a real dialog without the rule being written twice.
 */
export const modeReplacementNeedsConfirmation = (
  draft: SessionDraft,
  target: StudioMode,
): boolean => target !== draft.mode && Boolean(draft.referenceImage);

/**
 * The one mode-replacement question, asked by every surface that can switch modes.
 *
 * Kept beside {@link modeReplacementNeedsConfirmation} so the rule and the words it puts to the
 * operator cannot drift: four surfaces ask this, and they must all describe the same consequence.
 */
export const MODE_REPLACEMENT_CONFIRMATION: ConfirmationRequestOptions = {
  title: 'Switch modes and remove the current reference image?',
  description: 'Your text draft will be kept.',
  confirmLabel: 'Switch mode',
  cancelLabel: 'Keep this mode',
};
