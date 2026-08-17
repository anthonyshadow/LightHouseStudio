import type { SessionDraft, StudioMode } from './types';

export const MODE_REPLACEMENT_MESSAGE =
  'Switch modes and remove the current reference image? Your text draft will be kept.';

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

export const confirmModeReplacement = (
  draft: SessionDraft,
  target: StudioMode,
  confirm: (message: string) => boolean,
): boolean => !modeReplacementNeedsConfirmation(draft, target) || confirm(MODE_REPLACEMENT_MESSAGE);
