import type {
  CapabilitiesResponse,
  ReferenceImageSize,
  VoiceSummary,
  WorkspaceVoicesResponse,
} from '@studio/contracts';
import type { ModelModeId, SessionLifecycleStatus, SessionModeId } from '@studio/domain';

export type StudioMode = SessionModeId;
export type ModelMode = ModelModeId;
export type SessionLifecycle = SessionLifecycleStatus;

export type PromptCommittedHandler = (
  mode: ModelMode,
  prompt: string,
  referenceImageAssetId: string | null,
) => void;

export type RealtimeSessionTiming = Readonly<{
  status: 'active' | 'limit-reached' | 'completed';
  maximumSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  warning: boolean;
}>;

export type ProviderAvailability = {
  decart: boolean;
  videoProcessing?: CapabilitiesResponse['videoProcessing'];
  elevenLabs: boolean;
  elevenLabsModel: string | null;
  referenceImages?: boolean;
  referenceImageEditAvailable?: boolean;
  referenceImageProvider?: 'openai' | 'bfl' | 'wiro' | null;
  referenceImageModel?: string | null;
  referenceImageSizes?: readonly ReferenceImageSize[];
  referenceImageOptimizerAvailable?: boolean;
  referenceImageOptimizerModel?: string | null;
  referenceImageOptimizerVersion?: string | null;
  wardrobeAddOutfitAvailable?: boolean;
};

export type BrowserCapabilities = {
  secureContext: boolean;
  mediaDevices: boolean;
  mediaRecorder: boolean;
  webAudio: boolean;
  offlineAudio: boolean;
};

export type LocalCaptureProfileId = '720p30' | '1080p30';
export type LocalCaptureAspectRatio = '16:9' | '9:16';
export type CameraFacingMode = 'user' | 'environment';

export type CapturePreferences = {
  videoDeviceId: string | null;
  audioDeviceId: string | null;
  profile: LocalCaptureProfileId;
  aspectRatio: LocalCaptureAspectRatio;
};

export type CaptureDeviceOption = {
  deviceId: string;
  label: string;
  facingModes?: readonly CameraFacingMode[];
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
export type VoiceLibraryItem = WorkspaceVoiceItem;

export type WorkspaceVoicePage = Omit<WorkspaceVoicesResponse, 'voices'> & {
  voices: WorkspaceVoiceItem[];
};
