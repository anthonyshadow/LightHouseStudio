import {
  CHARACTER_PROMPT_OPTIMIZER_DEFAULT_VERSION,
  optimizeCharacterReferencePromptResponseSchema,
  referenceImageAssetSchema,
  REFERENCE_IMAGE_MODEL_ID,
  REFERENCE_IMAGE_QUALITY,
  type CharacterPromptOptimizationResult,
  type CreateReferenceImageRequest,
  type OptimizeCharacterReferencePromptRequest,
  type OptimizeCharacterReferencePromptResponse,
  type ReferenceImageAsset,
  type ReferenceImageSize,
} from '@studio/contracts';
import {
  type ReferenceImageAssetStore,
  ReferenceImageStorageError,
  type StoredReferenceImageContent,
  type StoredReferenceImageMetadata,
} from './asset-store.js';
import { InvalidReferenceImageError, validateReferenceImage } from './image-validation.js';
import {
  createPromptOptimizationInputHash,
  createWorkshopPromptHash,
  versionReferenceImagePrompt,
} from './prompt.js';
import {
  CharacterPromptOptimizerError,
  type CharacterPromptOptimizer,
} from '../../providers/openai/character-prompt-optimizer.js';
import {
  type ReferenceImageProvider,
  ReferenceImageProviderError,
} from '../../providers/openai/reference-image-provider.js';

export type ReferenceImageGenerationStateErrorReason =
  | 'generation-in-progress'
  | 'optimizer-not-configured'
  | 'provider-not-configured'
  | 'stale-optimization'
  | 'invalid-optimization';

export class ReferenceImageGenerationStateError extends Error {
  readonly reason: ReferenceImageGenerationStateErrorReason;

  constructor(reason: ReferenceImageGenerationStateErrorReason) {
    super(`Reference image generation unavailable: ${reason}`);
    this.name = 'ReferenceImageGenerationStateError';
    this.reason = reason;
  }
}

export interface GenerateReferenceImageInput extends CreateReferenceImageRequest {
  readonly localOwnerId: string;
}

interface PreparedReferenceImageGeneration {
  readonly prompt: string;
  readonly size: ReferenceImageSize;
  readonly format: CharacterPromptOptimizationResult['recommendedSettings']['format'];
  readonly promptHash: string;
  readonly promptAudit: {
    readonly optimizationEnabled: boolean;
    readonly result: CharacterPromptOptimizationResult;
    readonly options: CreateReferenceImageRequest['options'];
    readonly requestedGenerator: NonNullable<CreateReferenceImageRequest['generator']> | null;
    readonly optimizer: { readonly model: string; readonly version: string } | null;
    readonly inputHash: string | null;
    readonly manuallyEdited: boolean;
  };
}

const LEGACY_REFERENCE_OPTIONS: CreateReferenceImageRequest['options'] = {
  framing: 'head_and_shoulders',
  orientation: 'square',
  renderingMode: 'faithful_source_style',
  expression: 'neutral',
  background: 'neutral_gray',
  targetUse: 'lucy_2_5_character_reference',
};

const formatForMimeType = (
  mimeType: StoredReferenceImageMetadata['mimeType'],
): CharacterPromptOptimizationResult['recommendedSettings']['format'] => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpeg';
};

const recommendedSettingsForSize = (
  size: ReferenceImageSize,
  framing: CreateReferenceImageRequest['options']['framing'],
  quality: 'high' | 'medium',
  format: CharacterPromptOptimizationResult['recommendedSettings']['format'],
): CharacterPromptOptimizationResult['recommendedSettings'] => {
  switch (size) {
    case '1024x1536':
      return { framing, orientation: 'portrait', size, quality, format };
    case '1536x1024':
      return { framing, orientation: 'landscape', size, quality, format };
    case '1024x1024':
      return { framing, orientation: 'square', size, quality, format };
  }
};

const requestedOrientationMatches = (
  requested: CreateReferenceImageRequest['options']['orientation'],
  actual: CharacterPromptOptimizationResult['recommendedSettings']['orientation'],
): boolean =>
  (requested === 'auto' && actual === 'landscape') ||
  (requested === 'portrait_9_16' && actual === 'portrait') ||
  (requested === 'landscape_16_9' && actual === 'landscape') ||
  (requested === 'square' && actual === 'square');

const settingsMatchOptions = (
  result: CharacterPromptOptimizationResult,
  options: CreateReferenceImageRequest['options'],
  quality?: 'high' | 'medium',
): boolean =>
  result.recommendedSettings.framing === options.framing &&
  requestedOrientationMatches(options.orientation, result.recommendedSettings.orientation) &&
  (quality === undefined || result.recommendedSettings.quality === quality);

const sizeForBypass = (
  orientation: CreateReferenceImageRequest['options']['orientation'],
): ReferenceImageSize => {
  if (orientation === 'portrait_9_16') return '1024x1536';
  if (orientation === 'auto' || orientation === 'landscape_16_9') return '1536x1024';
  return '1024x1024';
};

const legacyResult = (
  metadata: StoredReferenceImageMetadata,
): CharacterPromptOptimizationResult => {
  const size = metadata.size ?? '1024x1024';
  return {
    optimizedImagePrompt: metadata.derivedPrompt,
    lucy25CharacterPrompt: metadata.originalPrompt,
    normalizedCharacterDescription: metadata.originalPrompt,
    preservedCharacterFacts: [],
    technicalDefaultsAdded: [],
    warnings: [],
    recommendedSettings: recommendedSettingsForSize(
      size,
      'head_and_shoulders',
      metadata.quality ?? REFERENCE_IMAGE_QUALITY,
      formatForMimeType(metadata.mimeType),
    ),
  };
};

const safeMetadata = (metadata: StoredReferenceImageMetadata): ReferenceImageAsset => {
  const audit = metadata.promptAudit;
  const result = audit?.result ?? legacyResult(metadata);
  return referenceImageAssetSchema.parse({
    assetId: metadata.assetId,
    mimeType: metadata.mimeType,
    size: metadata.size ?? '1024x1024',
    width: metadata.width,
    height: metadata.height,
    byteSize: metadata.byteSize,
    source: metadata.source,
    provider: metadata.provider,
    model: metadata.model,
    quality: metadata.quality ?? REFERENCE_IMAGE_QUALITY,
    promptHash: metadata.promptHash,
    optimizationEnabled: audit?.optimizationEnabled ?? false,
    originalPrompt: metadata.originalPrompt,
    optimizedImagePrompt: result.optimizedImagePrompt,
    lucy25CharacterPrompt: result.lucy25CharacterPrompt,
    normalizedCharacterDescription: result.normalizedCharacterDescription,
    preservedCharacterFacts: result.preservedCharacterFacts,
    technicalDefaultsAdded: result.technicalDefaultsAdded,
    warnings: result.warnings,
    options: audit?.options ?? LEGACY_REFERENCE_OPTIONS,
    requestedGenerator: audit?.requestedGenerator ?? null,
    optimizer: audit?.optimizer ?? null,
    optimizationInputHash: audit?.inputHash ?? null,
    manuallyEdited: audit?.manuallyEdited ?? false,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt ?? metadata.createdAt,
    contentUrl: `/api/reference-images/${metadata.assetId}/content`,
  });
};

export class ReferenceImageService {
  readonly #provider: ReferenceImageProvider | null;
  readonly #optimizer: CharacterPromptOptimizer | null;
  readonly #store: ReferenceImageAssetStore;
  readonly #imageModel: string;
  readonly #imageQuality: 'high' | 'medium';
  readonly #optimizerVersion: string;
  readonly #activeOptimizations = new Map<
    string,
    Promise<OptimizeCharacterReferencePromptResponse>
  >();
  #active:
    | {
        readonly localOwnerId: string;
        readonly requestId: string;
        readonly result: Promise<StoredReferenceImageMetadata>;
      }
    | undefined;

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

  async optimize(
    input: OptimizeCharacterReferencePromptRequest,
  ): Promise<OptimizeCharacterReferencePromptResponse> {
    if (this.#optimizer === null) {
      throw new ReferenceImageGenerationStateError('optimizer-not-configured');
    }
    const inputHash = createPromptOptimizationInputHash(input, this.#optimizerVersion);
    const active = this.#activeOptimizations.get(inputHash);
    if (active !== undefined) return active;

    const optimizer = this.#optimizer;
    const result = (async () => {
      const optimized = await optimizer.optimize(input);
      if (!settingsMatchOptions(optimized, input.options)) {
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
    })();
    this.#activeOptimizations.set(inputHash, result);
    try {
      return await result;
    } finally {
      if (this.#activeOptimizations.get(inputHash) === result) {
        this.#activeOptimizations.delete(inputHash);
      }
    }
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

  #prepareGeneration(input: GenerateReferenceImageInput): PreparedReferenceImageGeneration {
    if (input.optimization.enabled) {
      if (this.#optimizer === null) {
        throw new ReferenceImageGenerationStateError('optimizer-not-configured');
      }
      if (input.optimization.version !== this.#optimizerVersion) {
        throw new ReferenceImageGenerationStateError('stale-optimization');
      }
      if (input.optimization.model !== this.#optimizer.model) {
        throw new ReferenceImageGenerationStateError('stale-optimization');
      }
      const expectedHash = createPromptOptimizationInputHash(
        {
          rawPrompt: input.rawPrompt,
          options: input.options,
          ...(input.generator === undefined ? {} : { generator: input.generator }),
        },
        this.#optimizerVersion,
      );
      if (input.optimization.inputHash !== expectedHash) {
        throw new ReferenceImageGenerationStateError('stale-optimization');
      }
      if (!settingsMatchOptions(input.optimization.result, input.options, this.#imageQuality)) {
        throw new ReferenceImageGenerationStateError('invalid-optimization');
      }
      return {
        prompt: input.optimization.result.optimizedImagePrompt,
        size: input.optimization.result.recommendedSettings.size,
        format: input.optimization.result.recommendedSettings.format,
        promptHash: createWorkshopPromptHash(input.rawPrompt),
        promptAudit: {
          optimizationEnabled: true,
          result: input.optimization.result,
          options: input.options,
          requestedGenerator: input.generator ?? null,
          optimizer: {
            model: input.optimization.model,
            version: input.optimization.version,
          },
          inputHash: expectedHash,
          manuallyEdited: input.optimization.manuallyEdited,
        },
      };
    }

    const versioned = versionReferenceImagePrompt(input.rawPrompt, input.options.framing);
    const size = sizeForBypass(input.options.orientation);
    const result: CharacterPromptOptimizationResult = {
      optimizedImagePrompt: versioned.derivedPrompt,
      lucy25CharacterPrompt: input.rawPrompt,
      normalizedCharacterDescription: input.rawPrompt,
      preservedCharacterFacts: [],
      technicalDefaultsAdded: ['Applied the existing deterministic reference-image wrapper.'],
      warnings: [],
      recommendedSettings: recommendedSettingsForSize(
        size,
        input.options.framing,
        this.#imageQuality,
        'jpeg',
      ),
    };
    return {
      prompt: versioned.derivedPrompt,
      size,
      format: 'jpeg',
      promptHash: createWorkshopPromptHash(input.rawPrompt),
      promptAudit: {
        optimizationEnabled: false,
        result,
        options: input.options,
        requestedGenerator: input.generator ?? null,
        optimizer: null,
        inputHash: null,
        manuallyEdited: false,
      },
    };
  }

  async #generateAndStore(
    provider: ReferenceImageProvider,
    input: GenerateReferenceImageInput,
  ): Promise<StoredReferenceImageMetadata> {
    const prepared = this.#prepareGeneration(input);
    let generated: Awaited<ReturnType<ReferenceImageProvider['generate']>>;
    try {
      generated = await provider.generate({
        prompt: prepared.prompt,
        size: prepared.size,
        format: prepared.format,
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
