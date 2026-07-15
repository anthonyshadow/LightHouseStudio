import type { SessionDraft, StudioMode } from './types';

export const MODE_REPLACEMENT_MESSAGE =
  'Switch modes and clear the current working prompt, image, and enhancement?';

export const hasDraftContent = (draft: SessionDraft): boolean =>
  Boolean(draft.prompt.trim() || draft.image || draft.enhance);

export const confirmModeReplacement = (
  draft: SessionDraft,
  target: StudioMode,
  confirm: (message: string) => boolean,
): boolean => target === draft.mode || !hasDraftContent(draft) || confirm(MODE_REPLACEMENT_MESSAGE);
