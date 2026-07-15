import { Readable } from 'node:stream';
import type { RuntimeConfig } from '../config/environment.js';
import type { AudioStream } from '../application/audio-stream.js';
import type {
  ElevenLabsModel,
  ElevenLabsProvider,
  ProviderSharedVoice,
  ProviderSharedVoicePage,
  ProviderVoice,
  ProviderWorkspaceVoicePage,
  VoiceSearchInput,
} from '../providers/elevenlabs/types.js';

export const testConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 4100,
  elevenLabsModelId: 'eleven_multilingual_sts_v2',
  elevenLabsEnableLogging: false,
  providerTimeoutMs: 1_000,
  ...overrides,
});

export const standardModel: ElevenLabsModel = {
  modelId: 'eleven_multilingual_sts_v2',
  canDoVoiceConversion: true,
  servesProfessionalVoices: false,
};

export const voice = (overrides: Partial<ProviderVoice> = {}): ProviderVoice => ({
  voiceId: 'voice-one',
  name: 'Nova',
  category: 'generated',
  description: 'Bright and conversational',
  labels: { accent: 'Canadian' },
  previewUrl: 'https://storage.googleapis.com/eleven-public-prod/nova.mp3',
  ...overrides,
});

export const sharedVoice = (overrides: Partial<ProviderSharedVoice> = {}): ProviderSharedVoice => ({
  ...voice(),
  publicOwnerId: 'owner-one',
  freeUsersAllowed: true,
  ...overrides,
});

export class FakeElevenLabsProvider implements ElevenLabsProvider {
  models: readonly ElevenLabsModel[] = [standardModel];
  workspaceVoices: readonly ProviderVoice[] = [voice()];
  sharedVoices: readonly ProviderSharedVoice[] = [sharedVoice()];
  workspaceHasMore = false;
  workspaceNextPageToken: string | null = null;
  sharedHasMore = false;
  importedVoiceId = 'imported-voice';
  previewBytes = Buffer.from('preview-audio');
  convertedBytes = Buffer.from('converted-audio');
  previewContentType = 'audio/mpeg';
  conversionContentType = 'audio/mpeg';

  readonly workspaceSearches: Array<VoiceSearchInput & { readonly nextPageToken: string | null }> =
    [];
  readonly sharedSearches: Array<
    VoiceSearchInput & { readonly page: number; readonly publicOwnerId?: string }
  > = [];
  readonly imports: Array<{
    readonly publicOwnerId: string;
    readonly voiceId: string;
    readonly name: string;
  }> = [];
  readonly conversions: Array<{
    readonly voiceId: string;
    readonly modelId: string;
    readonly audio: Uint8Array;
    readonly mimeType: string;
    readonly enableLogging: boolean;
  }> = [];
  readonly previewUrls: string[] = [];

  listModels(_signal: AbortSignal): Promise<readonly ElevenLabsModel[]> {
    return Promise.resolve(this.models);
  }

  listWorkspaceVoices(
    input: VoiceSearchInput & { readonly nextPageToken: string | null },
  ): Promise<ProviderWorkspaceVoicePage> {
    this.workspaceSearches.push(input);
    return Promise.resolve({
      voices: this.workspaceVoices,
      hasMore: this.workspaceHasMore,
      nextPageToken: this.workspaceNextPageToken,
    });
  }

  getWorkspaceVoice(voiceId: string, _signal: AbortSignal): Promise<ProviderVoice> {
    const result = this.workspaceVoices.find((candidate) => candidate.voiceId === voiceId);
    return Promise.resolve(result ?? voice({ voiceId }));
  }

  listSharedVoices(
    input: VoiceSearchInput & { readonly page: number; readonly publicOwnerId?: string },
  ): Promise<ProviderSharedVoicePage> {
    this.sharedSearches.push(input);
    return Promise.resolve({
      voices: this.sharedVoices.filter(
        (candidate) =>
          input.publicOwnerId === undefined || candidate.publicOwnerId === input.publicOwnerId,
      ),
      hasMore: this.sharedHasMore,
    });
  }

  importSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    name: string,
    _signal: AbortSignal,
  ): Promise<string> {
    this.imports.push({ publicOwnerId, voiceId, name });
    return Promise.resolve(this.importedVoiceId);
  }

  fetchPreview(url: string, _signal: AbortSignal): Promise<AudioStream> {
    this.previewUrls.push(url);
    return Promise.resolve({
      body: Readable.from(this.previewBytes),
      contentType: this.previewContentType,
      contentLength: this.previewBytes.byteLength,
    });
  }

  convertRecording(
    voiceId: string,
    modelId: string,
    audio: Uint8Array,
    mimeType: string,
    enableLogging: boolean,
    _signal: AbortSignal,
  ): Promise<AudioStream> {
    this.conversions.push({
      voiceId,
      modelId,
      audio: audio.slice(),
      mimeType,
      enableLogging,
    });
    return Promise.resolve({
      body: Readable.from(this.convertedBytes),
      contentType: this.conversionContentType,
      contentLength: this.convertedBytes.byteLength,
    });
  }
}
