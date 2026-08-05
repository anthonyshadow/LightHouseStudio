import type { SharedVoicesQuery, VoiceConversionContentType } from '@studio/contracts';
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
  readonly language: string | null;
  readonly gender: string | null;
  readonly age: string | null;
  readonly accent: string | null;
  readonly useCase: string | null;
  readonly descriptive: string | null;
  readonly isOwner: boolean | null;
  readonly isBookmarked: boolean | null;
  readonly publicOwnerId: string | null;
}

export interface ProviderSharedVoice {
  readonly publicOwnerId: string;
  readonly voiceId: string;
  readonly name: string;
  readonly category: string | null;
  readonly description: string | null;
  readonly previewUrl: string | null;
  readonly language: string | null;
  readonly gender: string | null;
  readonly age: string | null;
  readonly accent: string | null;
  readonly useCase: string | null;
  readonly descriptive: string | null;
  readonly rate: number;
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
  readonly total: number;
}

export interface VoiceFilters {
  readonly search: string;
  readonly language: string;
  readonly gender: string;
  readonly age: string;
  readonly accent: string;
  readonly useCase: string;
  readonly descriptive: string;
}

export interface VoiceSearchInput extends VoiceFilters {
  readonly pageSize: number;
  readonly signal: AbortSignal;
}

export interface SharedVoiceSearchInput extends VoiceSearchInput {
  readonly page: number;
  readonly sort: SharedVoicesQuery['sort'];
}

export interface ElevenLabsProvider {
  listModels(signal: AbortSignal): Promise<readonly ElevenLabsModel[]>;
  listWorkspaceVoices(
    input: VoiceSearchInput & { readonly nextPageToken: string | null },
  ): Promise<ProviderWorkspaceVoicePage>;
  getWorkspaceVoice(voiceId: string, signal: AbortSignal): Promise<ProviderVoice | null>;
  getWorkspaceVoicesByIds(
    voiceIds: readonly string[],
    signal: AbortSignal,
  ): Promise<readonly ProviderVoice[]>;
  listSharedVoices(input: SharedVoiceSearchInput): Promise<ProviderSharedVoicePage>;
  getSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    signal: AbortSignal,
  ): Promise<ProviderSharedVoice | null>;
  addSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    name: string,
    signal: AbortSignal,
  ): Promise<string>;
  deleteWorkspaceVoice(voiceId: string, signal: AbortSignal): Promise<void>;
  fetchPreview(url: string, signal: AbortSignal): Promise<AudioStream>;
  convertRecording(
    voiceId: string,
    modelId: string,
    audio: VoiceConversionAudio,
    mimeType: VoiceConversionContentType,
    enableLogging: boolean,
    signal: AbortSignal,
  ): Promise<AudioStream>;
}

export type VoiceConversionAudio =
  Uint8Array | { readonly path: string; readonly byteLength: number };
