import type { ModelMode, SessionLifecycle, StudioMode } from '../../application/types';
import type { SafeMediaError } from './errors';

export type {
  BrowserCapabilities,
  ModelMode,
  ProviderAvailability,
  SessionLifecycle,
  StudioMode,
} from '../../application/types';

export type EphemeralSessionReference = {
  kind: 'ephemeral';
  file: File;
  /** Owned object URL; the session draft state revokes it on replacement/unmount. */
  previewUrl: string;
};

export type PersistedSessionReference = {
  kind: 'persisted';
  assetId: string;
  file: File;
  /** Stable same-origin content URL. It must never be revoked as a blob URL. */
  contentUrl: string;
};

export type SessionReferenceImage = EphemeralSessionReference | PersistedSessionReference;

export type SessionDraft = {
  mode: StudioMode;
  prompt: string;
  referenceImage: SessionReferenceImage | null;
  enhance: boolean;
};

export type AppliedRealtimeState = {
  mode: ModelMode;
  prompt: string;
  referenceImage: SessionReferenceImage | null;
  referenceIdentity: string | null;
  enhance: boolean;
};

export type RecipeDraftReplacement = {
  mode: ModelMode;
  prompt: string;
  referenceImage: SessionReferenceImage | null;
  enhance?: boolean;
};

export type StudioSessionController = {
  draft: SessionDraft;
  applied: AppliedRealtimeState | null;
  lifecycle: SessionLifecycle;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  displayStream: MediaStream | null;
  transformedVideoUsable: boolean;
  pendingChanges: boolean;
  error: SafeMediaError | null;
  liveSeconds: number;
  generationSeconds: number;
  applying: boolean;
  startLocal(): Promise<void>;
  preflight(): Promise<void>;
  startModel(): Promise<void>;
  applyChanges(): Promise<void>;
  revertDraft(): void;
  stopModel(): void;
  resetModel(): void;
  stopCamera(): void;
  releaseForRecordedReview(): Promise<void>;
  selectMode(mode: StudioMode): boolean;
  canReplaceRecipeDraft(mode: StudioMode): boolean;
  replaceRecipeDraft(replacement: RecipeDraftReplacement): boolean;
  updatePrompt(prompt: string): void;
  updateEnhancement(enhance: boolean): void;
  updateReferenceImage(referenceImage: SessionReferenceImage | null): void;
  /** @deprecated Use updateReferenceImage with the discriminated reference shape. */
  updateImage(image: File | null, previewUrl: string | null): void;
  clearError(): void;
};

export const isModelMode = (mode: StudioMode): mode is ModelMode => mode !== 'local';

export const modeLabel = (mode: StudioMode): string => {
  if (mode === 'lucy-2.5') return 'Character';
  if (mode === 'lucy-vton-3') return 'Virtual Try-On';
  return 'Local Camera';
};

export const createEmptyDraft = (mode: StudioMode): SessionDraft => ({
  mode,
  prompt: '',
  referenceImage: null,
  enhance: false,
});

export const referenceFile = (reference: SessionReferenceImage | null): File | null =>
  reference?.file ?? null;

export const referencePreviewUrl = (reference: SessionReferenceImage | null): string | null => {
  if (!reference) return null;
  return reference.kind === 'persisted' ? reference.contentUrl : reference.previewUrl;
};

export const persistedReferenceAssetId = (
  reference: SessionReferenceImage | null,
): string | null => (reference?.kind === 'persisted' ? reference.assetId : null);
