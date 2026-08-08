import { createHash } from 'node:crypto';
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
  type StoreGeneratedReferenceImageInput,
  type StoredReferenceImageContent,
  type StoredReferenceImageStream,
  type StoredReferenceImageMetadata,
} from './asset-store.js';
import {
  type ValidReferenceImageMimeType,
  validateReferenceImageBytes,
  validateUploadedReferenceImage,
} from './image-validation.js';
import {
  createPromptOptimizationInputHash,
  createReferenceImageCompositionPrompt,
  createReferenceImageEditPrompt,
} from './prompt.js';
import type { CharacterPromptOptimizer } from '../../providers/openai/character-prompt-optimizer.js';
import {
  type GeneratedReferenceImagePayload,
  type ReferenceImageProvider,
  type ReferenceImageProviderDescriptor,
  ReferenceImageProviderError,
} from '../../providers/reference-images/reference-image-provider.js';
import { ReferenceImageGenerationStateError } from './reference-image-error.js';
import { ReferenceImageOperationCoordinator } from './reference-image-operation-coordinator.js';
import {
  assertMatchingRequestFingerprint,
  type ComposeReferenceImageInput,
  compositionRequestFingerprint,
  editRequestFingerprint,
  type EditReferenceImageInput,
  generationRequestFingerprint,
  type GenerateReferenceImageInput,
  hashReferenceImageEditInstructions,
  referenceImageEditRawPrompt,
  type PreparedReferenceImageGeneration,
  prepareReferenceImageGeneration,
  recommendedSettingsForOptions,
  toReferenceImageAsset,
} from './reference-image-preparation.js';

export interface UploadReferenceImageInput {
  readonly localOwnerId: string;
  readonly requestId: string;
  readonly bytes: Buffer;
  readonly mimeType: ValidReferenceImageMimeType;
  readonly signal?: AbortSignal;
}

type GeneratedReferenceImageStoreInput = StoreGeneratedReferenceImageInput;
type ReferenceImageDerivation = NonNullable<GeneratedReferenceImageStoreInput['derivation']>;

interface ReferenceImageFinalizationOperationMetadata {
  readonly localOwnerId: string;
  readonly requestId: string;
  readonly requestFingerprint: string;
  readonly originalPrompt: string;
  readonly prepared: PreparedReferenceImageGeneration;
  readonly signal?: AbortSignal;
}

interface ReferenceImageFinalizationInput {
  readonly providerResult: GeneratedReferenceImagePayload;
  readonly derivation: ReferenceImageDerivation;
  readonly operation: ReferenceImageFinalizationOperationMetadata;
}

export type ReferenceImageContentStreamLookup =
  | Readonly<{ status: 'available'; content: StoredReferenceImageStream }>
  | Readonly<{ status: 'missing' }>
  | Readonly<{ status: 'streaming-unsupported' }>;

const uploadRequestFingerprint = (input: UploadReferenceImageInput): string =>
  createHash('sha256')
    .update('upload\0', 'utf8')
    .update(input.mimeType, 'utf8')
    .update('\0', 'utf8')
    .update(input.bytes)
    .digest('hex');

export class ReferenceImageService {
  readonly #provider: ReferenceImageProvider | null;
  readonly #optimizer: CharacterPromptOptimizer | null;
  readonly #store: ReferenceImageAssetStore;
  readonly #providerDescriptor: ReferenceImageProviderDescriptor;
  readonly #imageModel: string;
  readonly #imageQuality: 'high' | 'medium';
  readonly #optimizerVersion: string;
  readonly #operations = new ReferenceImageOperationCoordinator();

  constructor(
    provider: ReferenceImageProvider | null,
    store: ReferenceImageAssetStore,
    options: {
      readonly optimizer?: CharacterPromptOptimizer | null;
      readonly providerDescriptor?: ReferenceImageProviderDescriptor;
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
    this.#providerDescriptor = provider?.descriptor ??
      options.providerDescriptor ?? {
        providerId: 'openai',
        modelId: this.#imageModel,
        adapterVersion: 'legacy-injected-v1',
        effectiveSettings: { quality: this.#imageQuality },
      };
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
    return this.#provider?.edit !== undefined;
  }

  async discard(localOwnerId: string, assetId: string): Promise<void> {
    await this.#store.discardIfUnreferenced?.(localOwnerId, assetId);
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
      const normalizedResult: CharacterPromptOptimizationResult = {
        ...optimized,
        recommendedSettings: recommendedSettingsForOptions(
          input.options,
          this.#imageQuality,
          optimized.recommendedSettings.format,
        ),
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
    const requestFingerprint = generationRequestFingerprint(input, this.#providerDescriptor);
    const legacyFingerprint = generationRequestFingerprint(input);
    const persisted = await this.#store.findByRequestId(input.localOwnerId, input.requestId);
    if (persisted !== null) {
      assertMatchingRequestFingerprint(persisted, requestFingerprint, {
        legacyFingerprint,
        descriptor: this.#providerDescriptor,
      });
      return toReferenceImageAsset(persisted);
    }
    const metadata = await this.#operations.runForOwner({
      localOwnerId: input.localOwnerId,
      requestId: input.requestId,
      requestFingerprint,
      providerId: this.#providerDescriptor.providerId,
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

  async upload(input: UploadReferenceImageInput): Promise<ReferenceImageAsset> {
    if (input.signal?.aborted === true) {
      throw new ReferenceImageGenerationStateError('operation-aborted');
    }
    const requestFingerprint = uploadRequestFingerprint(input);
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
      start: async (operationSignal) => {
        if (operationSignal.aborted) {
          throw new ReferenceImageGenerationStateError('operation-aborted');
        }
        const image = await validateUploadedReferenceImage(
          input.bytes,
          input.mimeType,
          operationSignal,
        );
        if (operationSignal.aborted) {
          throw new ReferenceImageGenerationStateError('operation-aborted');
        }
        return this.#store.store({
          localOwnerId: input.localOwnerId,
          bytes: image.bytes,
          mimeType: image.mimeType,
          source: 'uploaded',
          width: image.width,
          height: image.height,
          requestId: input.requestId,
          requestFingerprint,
        });
      },
    });
    return toReferenceImageAsset(metadata);
  }

  async edit(input: EditReferenceImageInput): Promise<ReferenceImageAsset> {
    const requestFingerprint = editRequestFingerprint(input, this.#providerDescriptor);
    const legacyFingerprint = editRequestFingerprint(input);
    const persisted = await this.#store.findByRequestId(input.localOwnerId, input.requestId);
    if (persisted !== null) {
      assertMatchingRequestFingerprint(persisted, requestFingerprint, {
        legacyFingerprint,
        descriptor: this.#providerDescriptor,
      });
      return toReferenceImageAsset(persisted);
    }
    const metadata = await this.#operations.runForOwner({
      localOwnerId: input.localOwnerId,
      requestId: input.requestId,
      requestFingerprint,
      providerId: this.#providerDescriptor.providerId,
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

  async compose(input: ComposeReferenceImageInput): Promise<ReferenceImageAsset> {
    const requestFingerprint = compositionRequestFingerprint(input, this.#providerDescriptor);
    const legacyFingerprint = compositionRequestFingerprint(input);
    const persisted = await this.#store.findByRequestId(input.localOwnerId, input.requestId);
    if (persisted !== null) {
      assertMatchingRequestFingerprint(persisted, requestFingerprint, {
        legacyFingerprint,
        descriptor: this.#providerDescriptor,
      });
      return toReferenceImageAsset(persisted);
    }
    const metadata = await this.#operations.runForOwner({
      localOwnerId: input.localOwnerId,
      requestId: input.requestId,
      requestFingerprint,
      providerId: this.#providerDescriptor.providerId,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      start: (operationSignal) => {
        const provider = this.#provider;
        const editProvider = provider?.edit;
        if (editProvider === undefined || provider === null) {
          throw new ReferenceImageGenerationStateError('edit-not-configured');
        }
        return this.#composeAndStore(
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
    const generated = await this.#callProvider(() =>
      provider.generate({
        prompt: prepared.prompt,
        size: prepared.size,
        format: prepared.format,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      }),
    );
    return this.#finalizeReferenceImage({
      providerResult: generated,
      derivation: { kind: 'generate' },
      operation: {
        localOwnerId: input.localOwnerId,
        originalPrompt: input.rawPrompt,
        requestId: input.requestId,
        requestFingerprint,
        prepared,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
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
      input.sourcePromptMode === 'image-only' ? null : prepared.prompt,
      input.changeInstructions,
      input.allowDrasticChanges ?? false,
    );
    const edited = await this.#callProvider(() =>
      editProvider.call(provider, {
        prompt: providerPrompt,
        size: prepared.size,
        format: prepared.format,
        source: {
          bytes: source.bytes,
          mimeType: source.metadata.mimeType,
        },
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      }),
    );

    return this.#finalizeReferenceImage({
      providerResult: edited,
      derivation: {
        kind: 'edit',
        sourceAssetId: input.sourceAssetId,
        changeInstructionsHash: hashReferenceImageEditInstructions(input.changeInstructions),
      },
      operation: {
        localOwnerId: input.localOwnerId,
        originalPrompt: referenceImageEditRawPrompt(input),
        requestId: input.requestId,
        requestFingerprint,
        prepared,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    });
  }

  async #composeAndStore(
    provider: ReferenceImageProvider,
    editProvider: NonNullable<ReferenceImageProvider['edit']>,
    input: ComposeReferenceImageInput,
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
    const composed = await this.#callProvider(() =>
      editProvider.call(provider, {
        prompt: createReferenceImageCompositionPrompt(prepared.prompt),
        size: prepared.size,
        format: prepared.format,
        source: { bytes: source.bytes, mimeType: source.metadata.mimeType },
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      }),
    );

    return this.#finalizeReferenceImage({
      providerResult: composed,
      derivation: { kind: 'compose', sourceAssetId: input.sourceAssetId },
      operation: {
        localOwnerId: input.localOwnerId,
        originalPrompt: input.rawPrompt,
        requestId: input.requestId,
        requestFingerprint,
        prepared,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    });
  }

  async #finalizeReferenceImage(
    input: ReferenceImageFinalizationInput,
  ): Promise<StoredReferenceImageMetadata> {
    const { providerResult, derivation, operation } = input;
    return this.#withRemoteArtifactCleanup(providerResult, async () => {
      this.#assertProviderResultMatchesSelection(providerResult);
      const image = await validateReferenceImageBytes(
        providerResult.bytes,
        operation.prepared.size,
        providerResult.mimeType,
        operation.signal,
      );
      return this.#store.store({
        localOwnerId: operation.localOwnerId,
        bytes: image.bytes,
        mimeType: image.mimeType,
        source: 'generated',
        size: operation.prepared.size,
        width: image.width,
        height: image.height,
        provider: providerResult.providerId,
        model: providerResult.modelId,
        quality: this.#imageQuality,
        originalPrompt: operation.originalPrompt,
        // Edit provider prompts can contain raw change instructions; persist only the prepared prompt.
        derivedPrompt: operation.prepared.prompt,
        promptAudit: operation.prepared.promptAudit,
        promptHash: operation.prepared.promptHash,
        requestId: operation.requestId,
        requestFingerprint: operation.requestFingerprint,
        requestFingerprintVersion: 2,
        derivation,
        ...(providerResult.providerRequestId === undefined
          ? {}
          : { providerRequestId: providerResult.providerRequestId }),
        ...this.#storedProviderAudit(providerResult.safeUsage),
      });
    });
  }

  async #withRemoteArtifactCleanup<Result>(
    generated: GeneratedReferenceImagePayload,
    persist: () => Promise<Result>,
  ): Promise<Result> {
    try {
      return await persist();
    } finally {
      await generated.cleanupRemoteArtifacts?.().catch(() => undefined);
    }
  }

  async #callProvider<Result>(request: () => Promise<Result>): Promise<Result> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof ReferenceImageProviderError) throw error;
      throw new ReferenceImageProviderError('failure', {
        providerId: this.#providerDescriptor.providerId,
        cause: error,
      });
    }
  }

  #assertProviderResultMatchesSelection(result: GeneratedReferenceImagePayload): void {
    if (
      result.providerId !== this.#providerDescriptor.providerId ||
      result.modelId !== this.#providerDescriptor.modelId
    ) {
      throw new ReferenceImageProviderError('invalid-response', {
        providerId: this.#providerDescriptor.providerId,
        ...(result.providerRequestId === undefined
          ? {}
          : { providerRequestId: result.providerRequestId }),
      });
    }
  }

  #storedProviderAudit(
    safeUsage: Readonly<Record<string, number>> | undefined,
  ): Pick<GeneratedReferenceImageStoreInput, 'providerSettings' | 'providerUsage'> {
    if (this.#providerDescriptor.providerId === 'wiro') {
      const { owner, resolution, maxImages, watermark } =
        this.#providerDescriptor.effectiveSettings;
      if (owner !== 'ByteDance' || resolution !== '2k' || maxImages !== 1 || watermark !== false) {
        throw new ReferenceImageProviderError('configuration', { providerId: 'wiro' });
      }
      return {
        providerSettings: { owner, resolution, maxImages, watermark },
        ...(typeof safeUsage?.cost === 'number' ? { providerUsage: { cost: safeUsage.cost } } : {}),
      };
    }
    if (this.#providerDescriptor.providerId !== 'bfl') return {};
    const safetyTolerance = this.#providerDescriptor.effectiveSettings.safetyTolerance;
    const disablePromptUpsampling =
      this.#providerDescriptor.effectiveSettings.disablePromptUpsampling;
    if (typeof safetyTolerance !== 'number' || typeof disablePromptUpsampling !== 'boolean') {
      throw new ReferenceImageProviderError('configuration', { providerId: 'bfl' });
    }
    const providerUsage = {
      ...(typeof safeUsage?.cost === 'number' ? { cost: safeUsage.cost } : {}),
      ...(typeof safeUsage?.inputMegapixels === 'number'
        ? { inputMegapixels: safeUsage.inputMegapixels }
        : {}),
      ...(typeof safeUsage?.outputMegapixels === 'number'
        ? { outputMegapixels: safeUsage.outputMegapixels }
        : {}),
    };
    return {
      providerSettings: { safetyTolerance, disablePromptUpsampling },
      ...(Object.keys(providerUsage).length === 0 ? {} : { providerUsage }),
    };
  }

  async getMetadata(localOwnerId: string, assetId: string): Promise<ReferenceImageAsset | null> {
    const metadata = await this.#store.getMetadata(localOwnerId, assetId);
    return metadata === null ? null : toReferenceImageAsset(metadata);
  }

  getContent(localOwnerId: string, assetId: string): Promise<StoredReferenceImageContent | null> {
    return this.#store.getContent(localOwnerId, assetId);
  }

  async getContentStream(
    localOwnerId: string,
    assetId: string,
  ): Promise<ReferenceImageContentStreamLookup> {
    if (!this.#store.getContentStream) return { status: 'streaming-unsupported' };
    const content = await this.#store.getContentStream(localOwnerId, assetId);
    return content === null ? { status: 'missing' } : { status: 'available', content };
  }
}
