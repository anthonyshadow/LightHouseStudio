import type { ModelModeId, SessionLifecycleStatus, SessionModeId } from '@studio/domain';

export type StudioMode = SessionModeId;
export type ModelMode = ModelModeId;
export type SessionLifecycle = SessionLifecycleStatus;

export type ProviderAvailability = {
  decart: boolean;
  elevenLabs: boolean;
  elevenLabsModel: string | null;
};

export type BrowserCapabilities = {
  secureContext: boolean;
  mediaDevices: boolean;
  mediaRecorder: boolean;
  webAudio: boolean;
  offlineAudio: boolean;
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
