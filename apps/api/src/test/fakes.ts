import { Readable } from 'node:stream';
import type { VoiceConversionContentType } from '@studio/contracts';
import type { RuntimeConfig } from '../config/environment.js';
import type { AudioStream } from '../application/audio-stream.js';
import type {
  ElevenLabsModel,
  ElevenLabsProvider,
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
  referenceImageTimeoutMs: 1_000,
  openAiPromptOptimizerModel: 'gpt-5.6',
  openAiPromptOptimizerReasoning: 'medium',
  openAiPromptOptimizerVersion: 'lucy-character-reference-v1',
  openAiPromptOptimizerTimeoutMs: 1_000,
  openAiReferenceImageModel: 'gpt-image-2',
  openAiReferenceImageQuality: 'high',
  referenceImageProvider: 'openai',
  bflReferenceImageModel: 'flux-2-pro',
  bflSafetyTolerance: 2,
  bflDisablePromptUpsampling: true,
  bflReferenceImageTimeoutMs: 1_000,
  wiroReferenceImageModel: 'seedream-v5-lite-uncensored',
  wiroReferenceImageTimeoutMs: 1_000,
  pilotAccessMode: 'participant',
  lightframeDataDir: './.lightframe-data-test',
  ...overrides,
});

export const standardModel: ElevenLabsModel = {
  modelId: 'eleven_multilingual_sts_v2',
  canDoVoiceConversion: true,
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

export class FakeElevenLabsProvider implements ElevenLabsProvider {
  models: readonly ElevenLabsModel[] = [standardModel];
  workspaceVoices: readonly ProviderVoice[] = [voice()];
  workspaceHasMore = false;
  workspaceNextPageToken: string | null = null;
  previewBytes = Buffer.from('preview-audio');
  convertedBytes = Buffer.from('converted-audio');
  previewContentType = 'audio/mpeg';
  conversionContentType = 'audio/mpeg';

  readonly workspaceSearches: Array<VoiceSearchInput & { readonly nextPageToken: string | null }> =
    [];
  readonly conversions: Array<{
    readonly voiceId: string;
    readonly modelId: string;
    readonly audio: Uint8Array;
    readonly mimeType: VoiceConversionContentType;
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

  getWorkspaceVoice(voiceId: string, _signal: AbortSignal): Promise<ProviderVoice | null> {
    const result = this.workspaceVoices.find((candidate) => candidate.voiceId === voiceId);
    return Promise.resolve(result ?? null);
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
    mimeType: VoiceConversionContentType,
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
