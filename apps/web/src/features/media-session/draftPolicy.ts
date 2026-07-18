import type { SessionDraft, StudioMode } from './types';

export const MODE_REPLACEMENT_MESSAGE =
  'Switch modes and remove the current reference image? Your text draft will be kept.';

export const hasDraftContent = (draft: SessionDraft): boolean =>
  Boolean(draft.prompt.trim() || draft.image || draft.enhance);

export const confirmModeReplacement = (
  draft: SessionDraft,
  target: StudioMode,
  confirm: (message: string) => boolean,
): boolean => target === draft.mode || !draft.image || confirm(MODE_REPLACEMENT_MESSAGE);
