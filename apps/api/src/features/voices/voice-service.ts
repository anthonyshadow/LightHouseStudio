import type {
  PublicVoiceSummary,
  SharedVoicesResponse,
  VoiceSummary,
  WorkspaceVoicesResponse,
} from '@studio/contracts';
import type { AudioStream } from '../../application/audio-stream.js';
import { ProviderError } from '../../providers/provider-error.js';
import type {
  ElevenLabsModel,
  ElevenLabsProvider,
  ProviderSharedVoice,
  ProviderVoice,
} from '../../providers/elevenlabs/types.js';
import { VoiceServiceError } from './voice-service-error.js';

const isProfessionalVoice = (voice: ProviderVoice): boolean =>
  voice.category?.trim().toLowerCase() === 'professional';

const isModelCompatible = (voice: ProviderVoice, model: ElevenLabsModel): boolean =>
  model.servesProfessionalVoices || !isProfessionalVoice(voice);

const summarizeVoice = (voice: ProviderVoice): VoiceSummary => ({
  voiceId: voice.voiceId,
  name: voice.name,
  category: voice.category,
  description: voice.description,
  labels: voice.labels,
  previewAvailable: voice.previewUrl !== null,
});

const summarizePublicVoice = (voice: ProviderSharedVoice): PublicVoiceSummary => ({
  ...summarizeVoice(voice),
  publicOwnerId: voice.publicOwnerId,
});

export class VoiceService {
  readonly #provider: ElevenLabsProvider;
  readonly #modelId: string;
  readonly #enableLogging: boolean;

  constructor(provider: ElevenLabsProvider, modelId: string, enableLogging: boolean) {
    this.#provider = provider;
    this.#modelId = modelId;
    this.#enableLogging = enableLogging;
  }

  async #conversionModel(signal: AbortSignal): Promise<ElevenLabsModel> {
    const models = await this.#provider.listModels(signal);
    const model = models.find((candidate) => candidate.modelId === this.#modelId);
    if (model === undefined) {
      throw new VoiceServiceError('configured-model-unavailable');
    }
    if (!model.canDoVoiceConversion) {
      throw new VoiceServiceError('configured-model-incompatible');
    }
    return model;
  }

  #assertVoiceCompatible(voice: ProviderVoice, model: ElevenLabsModel): void {
    if (!isModelCompatible(voice, model)) {
      throw new VoiceServiceError('voice-incompatible');
    }
  }

  async listWorkspaceVoices(input: {
    readonly search: string;
    readonly pageSize: number;
    readonly nextPageToken: string | null;
    readonly signal: AbortSignal;
  }): Promise<WorkspaceVoicesResponse> {
    const [page, model] = await Promise.all([
      this.#provider.listWorkspaceVoices(input),
      this.#conversionModel(input.signal),
    ]);
    return {
      voices: page.voices.filter((voice) => isModelCompatible(voice, model)).map(summarizeVoice),
      hasMore: page.hasMore,
      nextPageToken: page.nextPageToken,
      // Filtering is local, so the upstream total would be misleading.
      total: null,
    };
  }

  async listSharedVoices(input: {
    readonly search: string;
    readonly pageSize: number;
    readonly page: number;
    readonly signal: AbortSignal;
  }): Promise<SharedVoicesResponse> {
    const [result, model] = await Promise.all([
      this.#provider.listSharedVoices(input),
      this.#conversionModel(input.signal),
    ]);
    return {
      voices: result.voices
        .filter((voice) => voice.freeUsersAllowed && isModelCompatible(voice, model))
        .map(summarizePublicVoice),
      hasMore: result.hasMore,
      page: input.page,
      nextPageToken: null,
      total: null,
    };
  }

  async #findEligibleSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    signal: AbortSignal,
  ): Promise<{ readonly voice: ProviderSharedVoice; readonly model: ElevenLabsModel }> {
    const model = await this.#conversionModel(signal);
    let page = 0;

    while (page < 10) {
      const result = await this.#provider.listSharedVoices({
        search: '',
        pageSize: 100,
        page,
        publicOwnerId,
        signal,
      });
      const voice = result.voices.find(
        (candidate) => candidate.publicOwnerId === publicOwnerId && candidate.voiceId === voiceId,
      );
      if (voice !== undefined) {
        if (!voice.freeUsersAllowed) {
          throw new VoiceServiceError('shared-voice-ineligible');
        }
        this.#assertVoiceCompatible(voice, model);
        return { voice, model };
      }
      if (!result.hasMore) break;
      page += 1;
    }

    throw new VoiceServiceError('shared-voice-not-found');
  }

  async workspacePreview(voiceId: string, signal: AbortSignal): Promise<AudioStream> {
    const [voice, model] = await Promise.all([
      this.#provider.getWorkspaceVoice(voiceId, signal),
      this.#conversionModel(signal),
    ]);
    this.#assertVoiceCompatible(voice, model);
    if (voice.previewUrl === null) {
      throw new VoiceServiceError('preview-unavailable');
    }
    return this.#provider.fetchPreview(voice.previewUrl, signal);
  }

  async sharedPreview(
    publicOwnerId: string,
    voiceId: string,
    signal: AbortSignal,
  ): Promise<AudioStream> {
    const { voice } = await this.#findEligibleSharedVoice(publicOwnerId, voiceId, signal);
    if (voice.previewUrl === null) {
      throw new VoiceServiceError('preview-unavailable');
    }
    return this.#provider.fetchPreview(voice.previewUrl, signal);
  }

  async importSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    name: string,
    signal: AbortSignal,
  ): Promise<{ readonly voiceId: string }> {
    await this.#findEligibleSharedVoice(publicOwnerId, voiceId, signal);
    const importedVoiceId = await this.#provider.importSharedVoice(
      publicOwnerId,
      voiceId,
      name,
      signal,
    );
    return { voiceId: importedVoiceId };
  }

  async convertRecording(input: {
    readonly voiceId: string;
    readonly audio: Uint8Array;
    readonly mimeType: string;
    readonly signal: AbortSignal;
  }): Promise<AudioStream> {
    const [voice, model] = await Promise.all([
      this.#provider.getWorkspaceVoice(input.voiceId, input.signal),
      this.#conversionModel(input.signal),
    ]);
    this.#assertVoiceCompatible(voice, model);
    try {
      return await this.#provider.convertRecording(
        input.voiceId,
        model.modelId,
        input.audio,
        input.mimeType,
        this.#enableLogging,
        input.signal,
      );
    } catch (error) {
      if (
        !this.#enableLogging &&
        error instanceof ProviderError &&
        error.operation === 'conversion' &&
        error.reason === 'zero-retention-unavailable'
      ) {
        throw new VoiceServiceError('zero-retention-required', error.upstreamStatus);
      }
      throw error;
    }
  }
}
