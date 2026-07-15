import {
  buildRealtimeStateSnapshot,
  hasPendingRealtimeChanges,
  isImageMimeType,
  markRealtimeStateApplied,
  normalizeAuthoredPrompt,
  revertDraftToAppliedState,
  validateSessionDraft,
  type AppliedRealtimeState as DomainAppliedRealtimeState,
  type EphemeralImageDescriptor,
  type SessionDraft as DomainSessionDraft,
} from '@studio/domain';
import type { RealtimeSnapshot } from '../../adapters/decart-realtime/DecartRealtimeGateway';
import type { AppliedRealtimeState, ModelMode, SessionDraft } from '../../features/media-session';

export const normalizePrompt = normalizeAuthoredPrompt;

const imageIds = new WeakMap<File, number>();
let nextImageId = 0;

export const imageIdentity = (file: File | null): string | null => {
  if (!file) return null;
  let id = imageIds.get(file);
  if (!id) {
    id = ++nextImageId;
    imageIds.set(file, id);
  }
  return `${file.name}:${file.type}:${file.size}:${file.lastModified}#${id}`;
};

const toImageDescriptor = (file: File | null): EphemeralImageDescriptor | null => {
  if (!file || !isImageMimeType(file.type)) return null;
  return {
    id: imageIdentity(file) ?? '',
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
};

const toDomainDraft = (draft: SessionDraft): DomainSessionDraft => ({
  modeId: draft.mode,
  prompt: draft.prompt,
  image: toImageDescriptor(draft.image),
  enhancePrompt: draft.enhance,
});

const toDomainApplied = (applied: AppliedRealtimeState): DomainAppliedRealtimeState =>
  markRealtimeStateApplied(
    {
      modeId: applied.mode,
      prompt: applied.prompt,
      imageId: applied.imageIdentity,
      enhancePrompt: applied.enhance,
    },
    'browser-session',
  );

export const validateModelDraft = (draft: SessionDraft): string | null => {
  return validateSessionDraft(toDomainDraft(draft))[0]?.message ?? null;
};

export const toProviderSnapshot = (
  mode: ModelMode,
  draft: Pick<SessionDraft, 'prompt' | 'image' | 'enhance'>,
): RealtimeSnapshot => {
  const snapshot = buildRealtimeStateSnapshot({
    modeId: mode,
    prompt: draft.prompt,
    image: toImageDescriptor(draft.image),
    enhancePrompt: draft.enhance,
  });
  if (!snapshot) throw new Error('A valid model recipe is required before connecting.');
  return {
    prompt: snapshot.prompt,
    image: draft.image,
    enhance: snapshot.enhancePrompt,
  };
};

export const toAppliedState = (draft: SessionDraft): AppliedRealtimeState => {
  if (draft.mode === 'local') throw new Error('Local preview has no provider state.');
  const snapshot = buildRealtimeStateSnapshot(toDomainDraft(draft));
  if (!snapshot) throw new Error('A valid model recipe is required before applying.');
  return {
    mode: snapshot.modeId,
    prompt: snapshot.prompt,
    image: draft.image,
    imageIdentity: snapshot.imageId,
    enhance: snapshot.enhancePrompt,
  };
};

export const hasPendingChanges = (
  draft: SessionDraft,
  applied: AppliedRealtimeState | null,
): boolean => {
  if (!applied) return false;
  return hasPendingRealtimeChanges(toDomainDraft(draft), toDomainApplied(applied));
};

export const revertToAppliedDraft = (
  draft: SessionDraft,
  applied: AppliedRealtimeState,
): SessionDraft => {
  const reverted = revertDraftToAppliedState(
    toDomainDraft(draft),
    toDomainApplied(applied),
    toImageDescriptor(applied.image),
  );
  return {
    mode: reverted.modeId,
    prompt: reverted.prompt,
    image: reverted.image ? applied.image : null,
    imagePreviewUrl: null,
    enhance: reverted.enhancePrompt,
  };
};
