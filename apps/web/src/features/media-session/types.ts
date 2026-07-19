import type { ModelMode, SessionLifecycle, StudioMode } from '../../application/types';
import type { SafeMediaError } from './errors';

export type {
  BrowserCapabilities,
  ModelMode,
  ProviderAvailability,
  SessionLifecycle,
  StudioMode,
} from '../../application/types';

export type SessionDraft = {
  mode: StudioMode;
  prompt: string;
  image: File | null;
  imagePreviewUrl: string | null;
  enhance: boolean;
};

export type AppliedRealtimeState = {
  mode: ModelMode;
  prompt: string;
  image: File | null;
  imageIdentity: string | null;
  enhance: boolean;
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
  updatePrompt(prompt: string): void;
  updateEnhancement(enhance: boolean): void;
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
  image: null,
  imagePreviewUrl: null,
  enhance: false,
});
