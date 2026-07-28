import type { VoiceSummary, WorkspaceVoicesResponse } from '@studio/contracts';
import type { AudioStream } from '../../application/audio-stream.js';
import { createSharedOperation, type SharedOperation } from '../../application/shared-operation.js';
import { ProviderError } from '../../providers/provider-error.js';
import type {
  ElevenLabsModel,
  ElevenLabsProvider,
  ProviderVoice,
} from '../../providers/elevenlabs/types.js';
import { VoiceServiceError } from './voice-service-error.js';

export const VOICE_MODEL_CACHE_TTL_MS = 30_000;

const runParallel = async <Left, Right>(
  callerSignal: AbortSignal,
  left: (signal: AbortSignal) => Promise<Left>,
  right: (signal: AbortSignal) => Promise<Right>,
): Promise<readonly [Left, Right]> => {
  const siblingController = new AbortController();
  const signal = AbortSignal.any([callerSignal, siblingController.signal]);
  try {
    return await Promise.all([left(signal), right(signal)]);
  } catch (error) {
    siblingController.abort('parallel-sibling-failed');
    throw error;
  }
};

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

export class VoiceService {
  readonly #provider: ElevenLabsProvider;
  readonly #modelId: string;
  readonly #enableLogging: boolean;
  #cachedConversionModel: { readonly model: ElevenLabsModel; readonly expiresAt: number } | null =
    null;
  #activeConversionModel: SharedOperation<ElevenLabsModel> | null = null;

  constructor(provider: ElevenLabsProvider, modelId: string, enableLogging: boolean) {
    this.#provider = provider;
    this.#modelId = modelId;
    this.#enableLogging = enableLogging;
  }

  async #conversionModel(signal: AbortSignal): Promise<ElevenLabsModel> {
    const cached = this.#cachedConversionModel;
    if (cached && cached.expiresAt > Date.now()) return cached.model;

    const active = this.#activeConversionModel;
    if (active?.acceptingSubscribers) {
      return active.subscribe(signal, () => new ProviderError('models', 'aborted'));
    }

    const operation = createSharedOperation(async (operationSignal) => {
      const models = await this.#provider.listModels(operationSignal);
      const model = models.find((candidate) => candidate.modelId === this.#modelId);
      if (model === undefined) {
        throw new VoiceServiceError('configured-model-unavailable');
      }
      if (!model.canDoVoiceConversion) {
        throw new VoiceServiceError('configured-model-incompatible');
      }
      return model;
    });
    this.#activeConversionModel = operation;
    const release = (): void => {
      if (this.#activeConversionModel === operation) this.#activeConversionModel = null;
    };
    void operation.result.then((model) => {
      this.#cachedConversionModel = {
        model,
        expiresAt: Date.now() + VOICE_MODEL_CACHE_TTL_MS,
      };
      release();
    }, release);
    return operation.subscribe(signal, () => new ProviderError('models', 'aborted'));
  }

  #assertVoiceCompatible(voice: ProviderVoice, model: ElevenLabsModel): void {
    if (!isModelCompatible(voice, model)) {
      throw new VoiceServiceError('voice-incompatible');
    }
  }

  #requireLibraryVoice(voice: ProviderVoice | null): ProviderVoice {
    if (voice === null) throw new VoiceServiceError('library-voice-not-found');
    return voice;
  }

  async listWorkspaceVoices(input: {
    readonly search: string;
    readonly pageSize: number;
    readonly nextPageToken: string | null;
    readonly signal: AbortSignal;
  }): Promise<WorkspaceVoicesResponse> {
    const [page, model] = await runParallel(
      input.signal,
      (signal) => this.#provider.listWorkspaceVoices({ ...input, signal }),
      (signal) => this.#conversionModel(signal),
    );
    return {
      voices: page.voices.filter((voice) => isModelCompatible(voice, model)).map(summarizeVoice),
      hasMore: page.hasMore,
      nextPageToken: page.nextPageToken,
      // Filtering is local, so the upstream total would be misleading.
      total: null,
    };
  }

  async workspacePreview(voiceId: string, signal: AbortSignal): Promise<AudioStream> {
    const [candidate, model] = await runParallel(
      signal,
      (operationSignal) => this.#provider.getWorkspaceVoice(voiceId, operationSignal),
      (operationSignal) => this.#conversionModel(operationSignal),
    );
    const voice = this.#requireLibraryVoice(candidate);
    this.#assertVoiceCompatible(voice, model);
    if (voice.previewUrl === null) {
      throw new VoiceServiceError('preview-unavailable');
    }
    return this.#provider.fetchPreview(voice.previewUrl, signal);
  }

  async convertRecording(input: {
    readonly voiceId: string;
    readonly audio: Uint8Array;
    readonly mimeType: string;
    readonly signal: AbortSignal;
  }): Promise<AudioStream> {
    const [candidate, model] = await runParallel(
      input.signal,
      (signal) => this.#provider.getWorkspaceVoice(input.voiceId, signal),
      (signal) => this.#conversionModel(signal),
    );
    const voice = this.#requireLibraryVoice(candidate);
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
