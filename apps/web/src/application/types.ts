import type {
  PublicVoiceSummary,
  ReferenceImageSize,
  SharedVoicesResponse,
  VoiceSummary,
  WorkspaceVoicesResponse,
} from '@studio/contracts';
import type { ModelModeId, SessionLifecycleStatus, SessionModeId } from '@studio/domain';

export type StudioMode = SessionModeId;
export type ModelMode = ModelModeId;
export type SessionLifecycle = SessionLifecycleStatus;

export type ProviderAvailability = {
  decart: boolean;
  elevenLabs: boolean;
  elevenLabsModel: string | null;
  referenceImages?: boolean;
  referenceImageEditAvailable?: boolean;
  referenceImageModel?: string | null;
  referenceImageSizes?: readonly ReferenceImageSize[];
  referenceImageOptimizerAvailable?: boolean;
  referenceImageOptimizerModel?: string | null;
  referenceImageOptimizerVersion?: string | null;
};

export type BrowserCapabilities = {
  secureContext: boolean;
  mediaDevices: boolean;
  mediaRecorder: boolean;
  webAudio: boolean;
  offlineAudio: boolean;
};

export type LocalCaptureProfileId = '720p30' | '1080p30';

export type CapturePreferences = {
  videoDeviceId: string | null;
  audioDeviceId: string | null;
  profile: LocalCaptureProfileId;
};

export type CaptureDeviceOption = {
  deviceId: string;
  label: string;
};

export type CaptureVideoSettings = {
  label: string;
  deviceId: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
};

export type CaptureAudioSettings = {
  label: string;
  deviceId: string | null;
};

export type CaptureStreamSettings = {
  video: CaptureVideoSettings | null;
  audio: CaptureAudioSettings | null;
};

export type WorkspaceVoiceItem = { readonly kind: 'workspace'; readonly voice: VoiceSummary };
export type PublicVoiceItem = { readonly kind: 'public'; readonly voice: PublicVoiceSummary };
export type VoiceLibraryItem = WorkspaceVoiceItem | PublicVoiceItem;

export type WorkspaceVoicePage = Omit<WorkspaceVoicesResponse, 'voices'> & {
  voices: WorkspaceVoiceItem[];
};

export type PublicVoicePage = Pick<SharedVoicesResponse, 'hasMore' | 'nextPageToken' | 'total'> & {
  voices: PublicVoiceItem[];
};

export type VoiceLibraryKind = 'workspace' | 'public';
