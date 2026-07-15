import { normalizeAuthoredPrompt } from '../common/text';
import type { EphemeralImageDescriptor } from './image';
import { CHARACTER_MODEL_ID, LOCAL_MODE_ID, type ModelModeId, type SessionModeId } from './modes';

export interface SessionDraft {
  readonly modeId: SessionModeId;
  readonly prompt: string;
  readonly image: EphemeralImageDescriptor | null;
  readonly enhancePrompt: boolean;
}

export type DraftValidationCode = 'model-input-required';

export interface DraftValidationIssue {
  readonly code: DraftValidationCode;
  readonly message: string;
}

export interface RealtimeStateSnapshot {
  readonly modeId: ModelModeId;
  readonly prompt: string;
  /** Explicit null means remove any provider-side image from the replacement state. */
  readonly imageId: string | null;
  readonly enhancePrompt: boolean;
}

export interface AppliedRealtimeState extends RealtimeStateSnapshot {
  readonly appliedAt: string;
}

export const CHARACTER_IMAGE_ONLY_INSTRUCTION =
  'Transform the subject using the provided portrait as the character identity while preserving recognizable facial features.';

export const createCleanSessionDraft = (modeId: SessionModeId = LOCAL_MODE_ID): SessionDraft => ({
  modeId,
  prompt: '',
  image: null,
  enhancePrompt: false,
});

export const validateSessionDraft = (draft: SessionDraft): readonly DraftValidationIssue[] => {
  if (draft.modeId === LOCAL_MODE_ID) return [];
  if (normalizeAuthoredPrompt(draft.prompt) || draft.image) return [];
  return [
    {
      code: 'model-input-required',
      message: 'Add a prompt, a reference image, or both before starting AI.',
    },
  ];
};

export const buildRealtimeStateSnapshot = (draft: SessionDraft): RealtimeStateSnapshot | null => {
  if (draft.modeId === LOCAL_MODE_ID || validateSessionDraft(draft).length > 0) return null;
  const normalizedPrompt = normalizeAuthoredPrompt(draft.prompt);
  return {
    modeId: draft.modeId,
    prompt:
      draft.modeId === CHARACTER_MODEL_ID && !normalizedPrompt && draft.image
        ? CHARACTER_IMAGE_ONLY_INSTRUCTION
        : normalizedPrompt,
    imageId: draft.image?.id ?? null,
    enhancePrompt: draft.enhancePrompt,
  };
};

export const markRealtimeStateApplied = (
  snapshot: RealtimeStateSnapshot,
  appliedAt: string,
): AppliedRealtimeState => ({ ...snapshot, appliedAt });

export const hasPendingRealtimeChanges = (
  draft: SessionDraft,
  applied: AppliedRealtimeState | null,
): boolean => {
  const snapshot = buildRealtimeStateSnapshot(draft);
  if (!snapshot) return applied !== null;
  if (!applied) return true;
  return (
    snapshot.modeId !== applied.modeId ||
    snapshot.prompt !== applied.prompt ||
    snapshot.imageId !== applied.imageId ||
    snapshot.enhancePrompt !== applied.enhancePrompt
  );
};

export const revertDraftToAppliedState = (
  draft: SessionDraft,
  applied: AppliedRealtimeState,
  appliedImage: EphemeralImageDescriptor | null,
): SessionDraft => ({
  modeId: applied.modeId,
  prompt: applied.prompt === CHARACTER_IMAGE_ONLY_INSTRUCTION ? '' : applied.prompt,
  image: applied.imageId === appliedImage?.id ? appliedImage : null,
  enhancePrompt: applied.enhancePrompt,
});
