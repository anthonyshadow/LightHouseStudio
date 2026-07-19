import type { ModelModeId, SessionLifecycleStatus, SessionModeId } from '@studio/domain';

export type StudioMode = SessionModeId;
export type ModelMode = ModelModeId;
export type SessionLifecycle = SessionLifecycleStatus;

export type ProviderAvailability = {
  decart: boolean;
  elevenLabs: boolean;
  elevenLabsModel: string | null;
  referenceImages?: boolean;
  referenceImageModel?: 'gpt-image-2' | null;
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

export type VoiceSummary = {
  voiceId: string;
  name: string;
  category: string | null;
  description: string | null;
  labels: Record<string, string>;
  previewAvailable: boolean;
  publicOwnerId?: string;
};

export type VoicePage = {
  voices: VoiceSummary[];
  hasMore: boolean;
  nextPageToken: string | null;
  total: number | null;
};

export type VoiceLibraryKind = 'workspace' | 'public';
