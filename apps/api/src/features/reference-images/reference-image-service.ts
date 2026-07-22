import {
  CHARACTER_PROMPT_OPTIMIZER_DEFAULT_VERSION,
  optimizeCharacterReferencePromptResponseSchema,
  REFERENCE_IMAGE_MODEL_ID,
  REFERENCE_IMAGE_QUALITY,
  type CharacterPromptOptimizationResult,
  type OptimizeCharacterReferencePromptRequest,
  type OptimizeCharacterReferencePromptResponse,
  type ReferenceImageAsset,
} from '@studio/contracts';
import {
  type ReferenceImageAssetStore,
  ReferenceImageStorageError,
  type StoredReferenceImageContent,
  type StoredReferenceImageMetadata,
} from './asset-store.js';
import { InvalidReferenceImageError, validateReferenceImage } from './image-validation.js';
import { createReferenceImageEditPrompt, createPromptOptimizationInputHash } from './prompt.js';
import {
  CharacterPromptOptimizerError,
  type CharacterPromptOptimizer,
} from '../../providers/openai/character-prompt-optimizer.js';
import {
  type ReferenceImageProvider,
  ReferenceImageProviderError,
} from '../../providers/openai/reference-image-provider.js';
import { ReferenceImageGenerationStateError } from './reference-image-error.js';
import { ReferenceImageOperationCoordinator } from './reference-image-operation-coordinator.js';
import {
  assertMatchingRequestFingerprint,
  editRequestFingerprint,
  type EditReferenceImageInput,
  generationRequestFingerprint,
  type GenerateReferenceImageInput,
  hashReferenceImageEditInstructions,
  prepareReferenceImageGeneration,
  settingsMatchReferenceImageOptions,
  toReferenceImageAsset,
} from './reference-image-preparation.js';

export class ReferenceImageService {
  readonly #provider: ReferenceImageProvider | null;
  readonly #optimizer: CharacterPromptOptimizer | null;
  readonly #store: ReferenceImageAssetStore;
  readonly #imageModel: string;
  readonly #imageQuality: 'high' | 'medium';
  readonly #optimizerVersion: string;
  readonly #operations = new ReferenceImageOperationCoordinator();

  constructor(
    provider: ReferenceImageProvider | null,
    store: ReferenceImageAssetStore,
    options: {
      readonly optimizer?: CharacterPromptOptimizer | null;
      readonly imageModel?: string;
      readonly imageQuality?: 'high' | 'medium';
      readonly optimizerVersion?: string;
    } = {},
  ) {
    this.#provider = provider;
    this.#optimizer = options.optimizer ?? null;
    this.#store = store;
    this.#imageModel = options.imageModel ?? REFERENCE_IMAGE_MODEL_ID;
    this.#imageQuality = options.imageQuality ?? REFERENCE_IMAGE_QUALITY;
    this.#optimizerVersion =
      options.optimizerVersion ??
      this.#optimizer?.version ??
      CHARACTER_PROMPT_OPTIMIZER_DEFAULT_VERSION;
  }

  get generationAvailable(): boolean {
    return this.#provider !== null;
  }

  get optimizationAvailable(): boolean {
    return this.#optimizer !== null;
  }

  get editAvailable(): boolean {
    return this.#provider?.edit !== undefined && this.#optimizer !== null;
  }

  async optimize(
    input: OptimizeCharacterReferencePromptRequest,
    signal?: AbortSignal,
  ): Promise<OptimizeCharacterReferencePromptResponse> {
    if (this.#optimizer === null) {
      throw new ReferenceImageGenerationStateError('optimizer-not-configured');
    }
    const inputHash = createPromptOptimizationInputHash(input, this.#optimizerVersion);
    const optimizer = this.#optimizer;
    return this.#operations.runOptimization(inputHash, signal, async (operationSignal) => {
      const optimized = await optimizer.optimize(input, operationSignal);
      if (!settingsMatchReferenceImageOptions(optimized, input.options)) {
        throw new CharacterPromptOptimizerError('invalid-response');
      }
      const normalizedResult: CharacterPromptOptimizationResult = {
        ...optimized,
        recommendedSettings: {
          ...optimized.recommendedSettings,
          quality: this.#imageQuality,
        },
      };
      return optimizeCharacterReferencePromptResponseSchema.parse({
        result: normalizedResult,
        model: optimizer.model,
        version: this.#optimizerVersion,
        inputHash,
      });
    });
  }

  async generate(input: GenerateReferenceImageInput): Promise<ReferenceImageAsset> {
    const requestFingerprint = generationRequestFingerprint(input);
    const persisted = await this.#store.findByRequestId(input.localOwnerId, input.requestId);
    if (persisted !== null) {
      assertMatchingRequestFingerprint(persisted, requestFingerprint);
      return toReferenceImageAsset(persisted);
    }
    const metadata = await this.#operations.runForOwner({
      localOwnerId: input.localOwnerId,
      requestId: input.requestId,
      requestFingerprint,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      start: (operationSignal) => {
        const provider = this.#provider;
        if (provider === null) {
          throw new ReferenceImageGenerationStateError('provider-not-configured');
        }
        return this.#generateAndStore(
          provider,
          { ...input, signal: operationSignal },
          requestFingerprint,
        );
      },
    });
    return toReferenceImageAsset(metadata);
  }

  async edit(input: EditReferenceImageInput): Promise<ReferenceImageAsset> {
    const requestFingerprint = editRequestFingerprint(input);
    const persisted = await this.#store.findByRequestId(input.localOwnerId, input.requestId);
    if (persisted !== null) {
      assertMatchingRequestFingerprint(persisted, requestFingerprint);
      return toReferenceImageAsset(persisted);
    }
    const metadata = await this.#operations.runForOwner({
      localOwnerId: input.localOwnerId,
      requestId: input.requestId,
      requestFingerprint,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      start: (operationSignal) => {
        const provider = this.#provider;
        const editProvider = provider?.edit;
        if (editProvider === undefined || provider === null) {
          throw new ReferenceImageGenerationStateError('edit-not-configured');
        }
        return this.#editAndStore(
          provider,
          editProvider,
          { ...input, signal: operationSignal },
          requestFingerprint,
        );
      },
    });
    return toReferenceImageAsset(metadata);
  }

  async #generateAndStore(
    provider: ReferenceImageProvider,
    input: GenerateReferenceImageInput,
    requestFingerprint: string,
  ): Promise<StoredReferenceImageMetadata> {
    const prepared = prepareReferenceImageGeneration(input, {
      optimizer: this.#optimizer,
      optimizerVersion: this.#optimizerVersion,
      imageQuality: this.#imageQuality,
    });
    let generated: Awaited<ReturnType<ReferenceImageProvider['generate']>>;
    try {
      generated = await provider.generate({
        prompt: prepared.prompt,
        size: prepared.size,
        format: prepared.format,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
    } catch (error) {
      if (error instanceof ReferenceImageProviderError) throw error;
      throw new ReferenceImageProviderError('failure', { cause: error });
    }
    const image = await validateReferenceImage(generated.base64, prepared.size);
    return this.#store.store({
      localOwnerId: input.localOwnerId,
      bytes: image.bytes,
      mimeType: image.mimeType,
      size: prepared.size,
      width: image.width,
      height: image.height,
      model: this.#imageModel,
      quality: this.#imageQuality,
      originalPrompt: input.rawPrompt,
      derivedPrompt: prepared.prompt,
      promptAudit: prepared.promptAudit,
      promptHash: prepared.promptHash,
      requestId: input.requestId,
      requestFingerprint,
      derivation: { kind: 'generate' },
      ...(generated.providerRequestId === undefined
        ? {}
        : { providerRequestId: generated.providerRequestId }),
    });
  }

  async #editAndStore(
    provider: ReferenceImageProvider,
    editProvider: NonNullable<ReferenceImageProvider['edit']>,
    input: EditReferenceImageInput,
    requestFingerprint: string,
  ): Promise<StoredReferenceImageMetadata> {
    const source = await this.#store.getContent(input.localOwnerId, input.sourceAssetId);
    if (source === null) {
      throw new ReferenceImageGenerationStateError('source-asset-not-found');
    }

    const prepared = prepareReferenceImageGeneration(input, {
      optimizer: this.#optimizer,
      optimizerVersion: this.#optimizerVersion,
      imageQuality: this.#imageQuality,
    });
    const providerPrompt = createReferenceImageEditPrompt(
      prepared.prompt,
      input.changeInstructions,
    );
    let edited: Awaited<ReturnType<NonNullable<ReferenceImageProvider['edit']>>>;
    try {
      edited = await editProvider.call(provider, {
        prompt: providerPrompt,
        size: prepared.size,
        format: prepared.format,
        source: {
          bytes: source.bytes,
          mimeType: source.metadata.mimeType,
        },
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
    } catch (error) {
      if (error instanceof ReferenceImageProviderError) throw error;
      throw new ReferenceImageProviderError('failure', { cause: error });
    }

    const image = await validateReferenceImage(edited.base64, prepared.size);
    return this.#store.store({
      localOwnerId: input.localOwnerId,
      bytes: image.bytes,
      mimeType: image.mimeType,
      size: prepared.size,
      width: image.width,
      height: image.height,
      model: this.#imageModel,
      quality: this.#imageQuality,
      originalPrompt: input.rawPrompt,
      // The provider-only prompt contains the raw requested change and must not be persisted.
      derivedPrompt: prepared.prompt,
      promptAudit: prepared.promptAudit,
      promptHash: prepared.promptHash,
      requestId: input.requestId,
      requestFingerprint,
      derivation: {
        kind: 'edit',
        sourceAssetId: input.sourceAssetId,
        changeInstructionsHash: hashReferenceImageEditInstructions(input.changeInstructions),
      },
      ...(edited.providerRequestId === undefined
        ? {}
        : { providerRequestId: edited.providerRequestId }),
    });
  }

  async getMetadata(localOwnerId: string, assetId: string): Promise<ReferenceImageAsset | null> {
    const metadata = await this.#store.getMetadata(localOwnerId, assetId);
    return metadata === null ? null : toReferenceImageAsset(metadata);
  }

  getContent(localOwnerId: string, assetId: string): Promise<StoredReferenceImageContent | null> {
    return this.#store.getContent(localOwnerId, assetId);
  }
}

export { InvalidReferenceImageError, ReferenceImageStorageError };
export {
  ReferenceImageGenerationStateError,
  type ReferenceImageGenerationStateErrorReason,
} from './reference-image-error.js';
export type {
  EditReferenceImageInput,
  GenerateReferenceImageInput,
} from './reference-image-preparation.js';
