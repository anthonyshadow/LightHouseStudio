import { createHash } from 'node:crypto';
import {
  referenceImageAssetSchema,
  REFERENCE_IMAGE_QUALITY,
  type CharacterPromptOptimizationResult,
  type CreateReferenceImageRequest,
  type EditReferenceImageRequest,
  type ReferenceImageAsset,
  type ReferenceImageSize,
} from '@studio/contracts';
import type { CharacterPromptOptimizer } from '../../providers/openai/character-prompt-optimizer.js';
import type { StoredReferenceImageMetadata } from './asset-store.js';
import { ReferenceImageGenerationStateError } from './reference-image-error.js';
import {
  createPromptOptimizationInputHash,
  createWorkshopPromptHash,
  REFERENCE_IMAGE_EDIT_PROMPT_TEMPLATE_VERSION,
  versionReferenceImagePrompt,
} from './prompt.js';

export interface GenerateReferenceImageInput extends CreateReferenceImageRequest {
  readonly localOwnerId: string;
  readonly signal?: AbortSignal;
}

export interface EditReferenceImageInput extends EditReferenceImageRequest {
  readonly localOwnerId: string;
  readonly sourceAssetId: string;
  readonly signal?: AbortSignal;
}

export interface PreparedReferenceImageGeneration {
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

type ReferenceImageOptions = CreateReferenceImageRequest['options'];
type RecommendedSettings = CharacterPromptOptimizationResult['recommendedSettings'];

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

export const generationRequestFingerprint = (input: GenerateReferenceImageInput): string =>
  sha256(
    JSON.stringify({
      kind: 'generate',
      rawPrompt: input.rawPrompt,
      options: input.options,
      generator: input.generator ?? null,
      optimization: input.optimization,
    }),
  );

export const editRequestFingerprint = (input: EditReferenceImageInput): string =>
  sha256(
    JSON.stringify({
      kind: 'edit',
      templateVersion: REFERENCE_IMAGE_EDIT_PROMPT_TEMPLATE_VERSION,
      sourceAssetId: input.sourceAssetId,
      rawPrompt: input.rawPrompt,
      changeInstructions: input.changeInstructions,
      options: input.options,
      generator: input.generator ?? null,
      optimization: input.optimization,
    }),
  );

export const hashReferenceImageEditInstructions = (instructions: string): string =>
  sha256(instructions);

export const assertMatchingRequestFingerprint = (
  metadata: StoredReferenceImageMetadata,
  requestFingerprint: string,
): void => {
  if (
    metadata.requestFingerprint !== undefined &&
    metadata.requestFingerprint !== requestFingerprint
  ) {
    throw new ReferenceImageGenerationStateError('request-id-conflict');
  }
};

const ORIENTATION_DEFAULTS: Record<
  ReferenceImageOptions['orientation'],
  { readonly orientation: RecommendedSettings['orientation']; readonly size: ReferenceImageSize }
> = {
  auto: { orientation: 'landscape', size: '1536x1024' },
  portrait_9_16: { orientation: 'portrait', size: '1024x1536' },
  landscape_16_9: { orientation: 'landscape', size: '1536x1024' },
  square: { orientation: 'square', size: '1024x1024' },
};

const LEGACY_REFERENCE_OPTIONS: ReferenceImageOptions = {
  framing: 'head_and_shoulders',
  orientation: 'square',
  renderingMode: 'faithful_source_style',
  expression: 'neutral',
  background: 'neutral_gray',
  targetUse: 'lucy_2_5_character_reference',
};

const formatForMimeType = (
  mimeType: StoredReferenceImageMetadata['mimeType'],
): RecommendedSettings['format'] => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpeg';
};

const recommendedSettingsForSize = (
  size: ReferenceImageSize,
  framing: ReferenceImageOptions['framing'],
  quality: 'high' | 'medium',
  format: RecommendedSettings['format'],
): RecommendedSettings => {
  switch (size) {
    case '1024x1536':
      return { framing, orientation: 'portrait', size, quality, format };
    case '1536x1024':
      return { framing, orientation: 'landscape', size, quality, format };
    case '1024x1024':
      return { framing, orientation: 'square', size, quality, format };
  }
};

export const settingsMatchReferenceImageOptions = (
  result: CharacterPromptOptimizationResult,
  options: ReferenceImageOptions,
  quality?: 'high' | 'medium',
): boolean =>
  result.recommendedSettings.framing === options.framing &&
  ORIENTATION_DEFAULTS[options.orientation].orientation ===
    result.recommendedSettings.orientation &&
  (quality === undefined || result.recommendedSettings.quality === quality);

export const prepareReferenceImageGeneration = (
  input: GenerateReferenceImageInput | EditReferenceImageInput,
  options: {
    readonly optimizer: Pick<CharacterPromptOptimizer, 'model'> | null;
    readonly optimizerVersion: string;
    readonly imageQuality: 'high' | 'medium';
  },
): PreparedReferenceImageGeneration => {
  if (input.optimization.enabled) {
    if (options.optimizer === null) {
      throw new ReferenceImageGenerationStateError('optimizer-not-configured');
    }
    if (
      input.optimization.version !== options.optimizerVersion ||
      input.optimization.model !== options.optimizer.model
    ) {
      throw new ReferenceImageGenerationStateError('stale-optimization');
    }
    const expectedHash = createPromptOptimizationInputHash(
      {
        rawPrompt: input.rawPrompt,
        options: input.options,
        ...(input.generator === undefined ? {} : { generator: input.generator }),
      },
      options.optimizerVersion,
    );
    if (input.optimization.inputHash !== expectedHash) {
      throw new ReferenceImageGenerationStateError('stale-optimization');
    }
    if (
      !settingsMatchReferenceImageOptions(
        input.optimization.result,
        input.options,
        options.imageQuality,
      )
    ) {
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
        optimizer: { model: input.optimization.model, version: input.optimization.version },
        inputHash: expectedHash,
        manuallyEdited: input.optimization.manuallyEdited,
      },
    };
  }

  const versioned = versionReferenceImagePrompt(input.rawPrompt, input.options.framing);
  const size = ORIENTATION_DEFAULTS[input.options.orientation].size;
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
      options.imageQuality,
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
};

const legacyOptimizationResult = (
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

export const toReferenceImageAsset = (
  metadata: StoredReferenceImageMetadata,
): ReferenceImageAsset => {
  const audit = metadata.promptAudit;
  const result = audit?.result ?? legacyOptimizationResult(metadata);
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
    ...(metadata.derivation === undefined
      ? {}
      : metadata.derivation.kind === 'edit'
        ? {
            derivation: {
              kind: 'edit' as const,
              sourceAssetId: metadata.derivation.sourceAssetId,
            },
          }
        : { derivation: { kind: 'generate' as const } }),
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt ?? metadata.createdAt,
    contentUrl: `/api/reference-images/${metadata.assetId}/content`,
  });
};
