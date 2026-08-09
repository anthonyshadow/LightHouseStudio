import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import type { VoiceConversionContentType } from '@studio/contracts';
import type { RuntimeConfig } from '../config/environment.js';
import type { AudioStream } from '../application/audio-stream.js';
import type {
  ElevenLabsModel,
  ElevenLabsProvider,
  VoiceConversionAudio,
  ProviderVoice,
  ProviderSharedVoice,
  ProviderSharedVoicePage,
  ProviderWorkspaceVoicePage,
  SharedVoiceSearchInput,
  VoiceSearchInput,
} from '../providers/elevenlabs/types.js';

export const testConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => ({
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 4100,
  demoAuthEnabled: false,
  demoAuthPrefill: true,
  demoUserId: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
  demoUserLogin: 'demo@lightframe.local',
  demoUserDisplayName: 'Demo Creator',
  demoUserPassword: 'lightframe-demo',
  demoUserPasswordHash:
    '$argon2id$v=19$m=19456,t=2,p=1$AQ6KYL1hKyx+ajWTKCCdCA$wrv4SBSsWdptAwMQE3QHId1riBhXxJ/10dvv0Kh/HK8',
  authJwtSecret: 'lightframe-test-signing-key-with-at-least-32-characters',
  authSessionTtlSeconds: 86_400,
  authCookieName: 'lightframe_session',
  authCookieSecure: false,
  databaseMode: 'local',
  assetStoreProvider: 'local',
  r2KeyPrefix: 'media/v1',
  telemetryEnabled: false,
  otelTraceSampleRatio: 0.1,
  videoJobMaxActive: 8,
  videoJobMaxActivePerProvider: 4,
  existingVideoCharacterSwapProvider: 'decart',
  prunaVideoReplaceEnabled: false,
  prunaImageTryOnEnabled: false,
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
  language: 'en',
  gender: 'female',
  age: 'young',
  accent: 'Canadian',
  useCase: 'narration',
  descriptive: 'bright',
  isOwner: false,
  isBookmarked: true,
  publicOwnerId: 'owner-one',
  ...overrides,
});

export const sharedVoice = (overrides: Partial<ProviderSharedVoice> = {}): ProviderSharedVoice => ({
  publicOwnerId: 'owner-one',
  voiceId: 'shared-one',
  name: 'Atlas',
  category: 'professional',
  description: 'Warm and assured narration',
  previewUrl: 'https://storage.googleapis.com/eleven-public-prod/atlas.mp3',
  language: 'en',
  gender: 'neutral',
  age: 'middle-aged',
  accent: 'American',
  useCase: 'narration',
  descriptive: 'warm',
  rate: 1,
  freeUsersAllowed: true,
  ...overrides,
});

export class FakeElevenLabsProvider implements ElevenLabsProvider {
  models: readonly ElevenLabsModel[] = [standardModel];
  workspaceVoices: readonly ProviderVoice[] = [voice()];
  workspaceHasMore = false;
  workspaceNextPageToken: string | null = null;
  sharedVoices: readonly ProviderSharedVoice[] = [sharedVoice()];
  sharedHasMore = false;
  sharedTotal = 1;
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
  readonly sharedSearches: SharedVoiceSearchInput[] = [];
  readonly addedVoices: Array<{
    readonly publicOwnerId: string;
    readonly voiceId: string;
    readonly name: string;
  }> = [];
  readonly deletedVoiceIds: string[] = [];

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

  getWorkspaceVoicesByIds(
    voiceIds: readonly string[],
    _signal: AbortSignal,
  ): Promise<readonly ProviderVoice[]> {
    return Promise.resolve(
      this.workspaceVoices.filter((candidate) => voiceIds.includes(candidate.voiceId)),
    );
  }

  listSharedVoices(input: SharedVoiceSearchInput): Promise<ProviderSharedVoicePage> {
    this.sharedSearches.push(input);
    return Promise.resolve({
      voices: this.sharedVoices,
      hasMore: this.sharedHasMore,
      total: this.sharedTotal,
    });
  }

  getSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    _signal: AbortSignal,
  ): Promise<ProviderSharedVoice | null> {
    return Promise.resolve(
      this.sharedVoices.find(
        (candidate) => candidate.publicOwnerId === publicOwnerId && candidate.voiceId === voiceId,
      ) ?? null,
    );
  }

  addSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    name: string,
    _signal: AbortSignal,
  ): Promise<string> {
    this.addedVoices.push({ publicOwnerId, voiceId, name });
    return Promise.resolve(voiceId);
  }

  deleteWorkspaceVoice(voiceId: string, _signal: AbortSignal): Promise<void> {
    this.deletedVoiceIds.push(voiceId);
    return Promise.resolve();
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
    audio: VoiceConversionAudio,
    mimeType: VoiceConversionContentType,
    enableLogging: boolean,
    _signal: AbortSignal,
  ): Promise<AudioStream> {
    const audioBytes = audio instanceof Uint8Array ? audio.slice() : readFile(audio.path);
    return Promise.resolve(audioBytes).then((resolvedAudio) => {
      this.conversions.push({
        voiceId,
        modelId,
        audio: resolvedAudio,
        mimeType,
        enableLogging,
      });
      return {
        body: Readable.from(this.convertedBytes),
        contentType: this.conversionContentType,
        contentLength: this.convertedBytes.byteLength,
      };
    });
  }
}
