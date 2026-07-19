import type { ReferenceImageAsset } from '@studio/contracts';
import {
  type ReferenceImageAssetStore,
  ReferenceImageStorageError,
  type StoredReferenceImageContent,
  type StoredReferenceImageMetadata,
} from './asset-store.js';
import { InvalidReferenceImageError, validateReferenceImage } from './image-validation.js';
import { versionReferenceImagePrompt } from './prompt.js';
import {
  type ReferenceImageProvider,
  ReferenceImageProviderError,
} from '../../providers/openai/reference-image-provider.js';

export class ReferenceImageGenerationStateError extends Error {
  readonly reason: 'generation-in-progress' | 'provider-not-configured';

  constructor(reason: 'generation-in-progress' | 'provider-not-configured') {
    super(`Reference image generation unavailable: ${reason}`);
    this.name = 'ReferenceImageGenerationStateError';
    this.reason = reason;
  }
}

export interface GenerateReferenceImageInput {
  readonly localOwnerId: string;
  readonly requestId: string;
  readonly workshopPrompt: string;
}

const safeMetadata = (metadata: StoredReferenceImageMetadata): ReferenceImageAsset => ({
  assetId: metadata.assetId,
  mimeType: metadata.mimeType,
  width: metadata.width,
  height: metadata.height,
  byteSize: metadata.byteSize,
  source: metadata.source,
  provider: metadata.provider,
  model: metadata.model,
  promptHash: metadata.promptHash,
  createdAt: metadata.createdAt,
  contentUrl: `/api/reference-images/${metadata.assetId}/content`,
});

export class ReferenceImageService {
  readonly #provider: ReferenceImageProvider | null;
  readonly #store: ReferenceImageAssetStore;
  #active:
    | {
        readonly localOwnerId: string;
        readonly requestId: string;
        readonly result: Promise<StoredReferenceImageMetadata>;
      }
    | undefined;

  constructor(provider: ReferenceImageProvider | null, store: ReferenceImageAssetStore) {
    this.#provider = provider;
    this.#store = store;
  }

  get generationAvailable(): boolean {
    return this.#provider !== null;
  }

  async generate(input: GenerateReferenceImageInput): Promise<ReferenceImageAsset> {
    const persisted = await this.#store.findByRequestId(input.localOwnerId, input.requestId);
    if (persisted !== null) return safeMetadata(persisted);

    const active = this.#active;
    if (active !== undefined) {
      if (active.localOwnerId === input.localOwnerId && active.requestId === input.requestId) {
        return safeMetadata(await active.result);
      }
      throw new ReferenceImageGenerationStateError('generation-in-progress');
    }
    if (this.#provider === null) {
      throw new ReferenceImageGenerationStateError('provider-not-configured');
    }

    const result = this.#generateAndStore(this.#provider, input);
    this.#active = {
      localOwnerId: input.localOwnerId,
      requestId: input.requestId,
      result,
    };
    try {
      return safeMetadata(await result);
    } finally {
      if (this.#active?.result === result) this.#active = undefined;
    }
  }

  async #generateAndStore(
    provider: ReferenceImageProvider,
    input: GenerateReferenceImageInput,
  ): Promise<StoredReferenceImageMetadata> {
    const prompt = versionReferenceImagePrompt(input.workshopPrompt);
    let generated: Awaited<ReturnType<ReferenceImageProvider['generate']>>;
    try {
      generated = await provider.generate(prompt.derivedPrompt);
    } catch (error) {
      if (error instanceof ReferenceImageProviderError) throw error;
      throw new ReferenceImageProviderError('failure', { cause: error });
    }
    const image = await validateReferenceImage(generated.base64);
    return this.#store.store({
      localOwnerId: input.localOwnerId,
      bytes: image.bytes,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      originalPrompt: prompt.originalPrompt,
      derivedPrompt: prompt.derivedPrompt,
      promptHash: prompt.promptHash,
      requestId: input.requestId,
      ...(generated.providerRequestId === undefined
        ? {}
        : { providerRequestId: generated.providerRequestId }),
    });
  }

  async getMetadata(localOwnerId: string, assetId: string): Promise<ReferenceImageAsset | null> {
    const metadata = await this.#store.getMetadata(localOwnerId, assetId);
    return metadata === null ? null : safeMetadata(metadata);
  }

  getContent(localOwnerId: string, assetId: string): Promise<StoredReferenceImageContent | null> {
    return this.#store.getContent(localOwnerId, assetId);
  }
}

export { InvalidReferenceImageError, ReferenceImageStorageError };
