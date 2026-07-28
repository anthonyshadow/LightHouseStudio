import type { AudioStream } from '../../application/audio-stream.js';

export interface ElevenLabsModel {
  readonly modelId: string;
  readonly canDoVoiceConversion: boolean;
}

export interface ProviderVoice {
  readonly voiceId: string;
  readonly name: string;
  readonly category: string | null;
  readonly description: string | null;
  readonly labels: Readonly<Record<string, string>>;
  readonly previewUrl: string | null;
}

export interface ProviderWorkspaceVoicePage {
  readonly voices: readonly ProviderVoice[];
  readonly hasMore: boolean;
  readonly nextPageToken: string | null;
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
  getWorkspaceVoice(voiceId: string, signal: AbortSignal): Promise<ProviderVoice | null>;
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
