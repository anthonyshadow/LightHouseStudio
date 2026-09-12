import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import type { VoiceConversionContentType } from '@studio/contracts';
import type { RuntimeConfig } from '../config/environment.js';
import type { AudioStream } from '../application/audio-stream.js';
import type { DirectUploadRepository, StoredDirectUpload } from '../storage/direct-upload.js';
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

export const testConfig = (overrides: Partial<RuntimeConfig> = {}): RuntimeConfig => {
  const nodeEnv = overrides.nodeEnv ?? 'test';
  const demoAuthEnabled = overrides.demoAuthEnabled ?? false;
  return {
    nodeEnv,
    demoAuthEnabled,
    // In-process suites drive the API without a session, and the flag is not readable from the
    // environment — declaring it here is the only way any process can reach that path. The
    // condition is the one this harness always implied, so a suite that asks for the real hook by
    // enabling demo auth still gets it, and one can also just set the flag directly.
    testAuthBypassEnabled: nodeEnv === 'test' && !demoAuthEnabled,
    host: '127.0.0.1',
    port: 4100,
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
    // No suite grows a background timer by building an app; a test that wants one asks for it.
    videoJobProgressionIntervalMs: 0,
    realtimeVideoBetaEnabled: true,
    existingVideoCharacterSwapProvider: 'decart',
    prunaVideoReplaceEnabled: false,
    prunaVideoReplaceDisableSafetyChecker: false,
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
  };
};

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

/**
 * The staged-upload rows in memory, holding the status transitions the relational repository
 * enforces: a provider upload id may only be attached once, verification may only be entered from
 * `uploading`, and a terminal row may only be reused through `restart`.
 *
 * One copy, because two would drift: the service suite and the route suite are both about those
 * transitions, and a claim answered differently on each side would prove the double rather than the
 * upload.
 */
export class MemoryDirectUploadRepository implements DirectUploadRepository {
  readonly rows = new Map<string, StoredDirectUpload>();

  create(upload: StoredDirectUpload): Promise<StoredDirectUpload> {
    const prior = [...this.rows.values()].find(
      (row) =>
        row.ownerUserId === upload.ownerUserId && row.idempotencyKey === upload.idempotencyKey,
    );
    if (prior !== undefined) return Promise.resolve(prior);
    this.rows.set(upload.id, upload);
    return Promise.resolve(upload);
  }

  findByIdempotency(
    ownerUserId: string,
    idempotencyKey: string,
  ): Promise<StoredDirectUpload | null> {
    return Promise.resolve(
      [...this.rows.values()].find(
        (row) => row.ownerUserId === ownerUserId && row.idempotencyKey === idempotencyKey,
      ) ?? null,
    );
  }

  restart(upload: StoredDirectUpload): Promise<StoredDirectUpload | null> {
    const prior = this.rows.get(upload.id);
    if (
      prior === undefined ||
      prior.ownerUserId !== upload.ownerUserId ||
      !['failed', 'aborted', 'expired'].includes(prior.status)
    ) {
      return Promise.resolve(null);
    }
    this.rows.set(upload.id, upload);
    return Promise.resolve(upload);
  }

  find(ownerUserId: string, uploadId: string): Promise<StoredDirectUpload | null> {
    const row = this.rows.get(uploadId);
    return Promise.resolve(row?.ownerUserId === ownerUserId ? row : null);
  }

  setProviderUploadId(
    ownerUserId: string,
    uploadId: string,
    providerUploadId: string,
    updatedAt: string,
  ): Promise<StoredDirectUpload | null> {
    return Promise.resolve(
      this.#update(ownerUserId, uploadId, (row) =>
        row.status === 'pending' && row.providerUploadId === null
          ? { ...row, providerUploadId, status: 'uploading', updatedAt }
          : row,
      ),
    );
  }

  markVerifying(
    ownerUserId: string,
    uploadId: string,
    updatedAt: string,
  ): Promise<StoredDirectUpload | null> {
    return Promise.resolve(
      this.#update(ownerUserId, uploadId, (row) =>
        row.status === 'uploading' ? { ...row, status: 'verifying', updatedAt } : row,
      ),
    );
  }

  returnToUploading(ownerUserId: string, uploadId: string, updatedAt: string): Promise<void> {
    this.#update(ownerUserId, uploadId, (row) =>
      row.status === 'verifying' ? { ...row, status: 'uploading', updatedAt } : row,
    );
    return Promise.resolve();
  }

  markReady(
    ownerUserId: string,
    uploadId: string,
    resultVideoId: string,
    completedAt: string,
  ): Promise<void> {
    this.#update(ownerUserId, uploadId, (row) => ({
      ...row,
      status: 'ready',
      resultVideoId,
      completedAt,
      updatedAt: completedAt,
    }));
    return Promise.resolve();
  }

  markTerminal(
    ownerUserId: string,
    uploadId: string,
    status: 'failed' | 'aborted' | 'expired',
    updatedAt: string,
  ): Promise<void> {
    this.#update(ownerUserId, uploadId, (row) =>
      ['pending', 'uploading', 'verifying'].includes(row.status)
        ? { ...row, status, updatedAt }
        : row,
    );
    return Promise.resolve();
  }

  claimExpired(now: string, limit: number): Promise<readonly StoredDirectUpload[]> {
    const claimed = [...this.rows.values()]
      .filter(
        (row) => ['pending', 'uploading', 'verifying'].includes(row.status) && row.expiresAt <= now,
      )
      // The relational repository claims the oldest retry order first, and a limited pass only
      // means anything if the order it slices is decided rather than whatever insertion left.
      .sort(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) ||
          left.expiresAt.localeCompare(right.expiresAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map((row) => ({ ...row, updatedAt: now }));
    for (const row of claimed) this.rows.set(row.id, row);
    return Promise.resolve(claimed);
  }

  #update(
    ownerUserId: string,
    uploadId: string,
    update: (row: StoredDirectUpload) => StoredDirectUpload,
  ): StoredDirectUpload | null {
    const row = this.rows.get(uploadId);
    if (row === undefined || row.ownerUserId !== ownerUserId) return null;
    const updated = update(row);
    this.rows.set(uploadId, updated);
    return updated;
  }
}

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

/**
 * The submission-receipt half of `ReferenceImageAssetStore` for fakes that never exercise it.
 *
 * Spread into a stub store so each one does not restate the pair; a fake that needs the receipt to
 * be present overrides `findSubmission` after the spread.
 */
export const withoutReferenceImageSubmissions = () => ({
  claimSubmission: (): Promise<boolean> => Promise.resolve(true),
  clearSubmission: (): Promise<void> => Promise.resolve(),
});
