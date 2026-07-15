import type { AudioStream } from '../../application/audio-stream.js';

export interface ElevenLabsModel {
  readonly modelId: string;
  readonly canDoVoiceConversion: boolean;
  readonly servesProfessionalVoices: boolean;
}

export interface ProviderVoice {
  readonly voiceId: string;
  readonly name: string;
  readonly category: string | null;
  readonly description: string | null;
  readonly labels: Readonly<Record<string, string>>;
  readonly previewUrl: string | null;
}

export interface ProviderSharedVoice extends ProviderVoice {
  readonly publicOwnerId: string;
  readonly freeUsersAllowed: boolean;
}

export interface ProviderWorkspaceVoicePage {
  readonly voices: readonly ProviderVoice[];
  readonly hasMore: boolean;
  readonly nextPageToken: string | null;
}

export interface ProviderSharedVoicePage {
  readonly voices: readonly ProviderSharedVoice[];
  readonly hasMore: boolean;
}

export interface VoiceSearchInput {
  readonly search: string;
  readonly pageSize: number;
  readonly signal: AbortSignal;
}

export interface ElevenLabsProvider {
  listModels(signal: AbortSignal): Promise<readonly ElevenLabsModel[]>;
  listWorkspaceVoices(
    input: VoiceSearchInput & { readonly nextPageToken: string | null },
  ): Promise<ProviderWorkspaceVoicePage>;
  getWorkspaceVoice(voiceId: string, signal: AbortSignal): Promise<ProviderVoice>;
  listSharedVoices(
    input: VoiceSearchInput & {
      readonly page: number;
      readonly publicOwnerId?: string;
    },
  ): Promise<ProviderSharedVoicePage>;
  importSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    name: string,
    signal: AbortSignal,
  ): Promise<string>;
  fetchPreview(url: string, signal: AbortSignal): Promise<AudioStream>;
  convertRecording(
    voiceId: string,
    modelId: string,
    audio: Uint8Array,
    mimeType: string,
    enableLogging: boolean,
    signal: AbortSignal,
  ): Promise<AudioStream>;
}
