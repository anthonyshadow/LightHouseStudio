import { z } from 'zod';

export const REFERENCE_IMAGE_MODEL_ID = 'gpt-image-2' as const;
export const REFERENCE_IMAGE_QUALITY = 'high' as const;
export const REFERENCE_IMAGE_SIZES = ['1024x1024', '1024x1536', '1536x1024'] as const;
export const REFERENCE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REFERENCE_IMAGE_PROMPT_MAX_LENGTH = 4_000;
export const REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH = 32_000;
export const REFERENCE_IMAGE_CHANGE_INSTRUCTIONS_MAX_LENGTH = 2_000;

export const CHARACTER_PROMPT_OPTIMIZER_DEFAULT_MODEL = 'gpt-5.6' as const;
export const CHARACTER_PROMPT_OPTIMIZER_DEFAULT_REASONING = 'medium' as const;
export const CHARACTER_PROMPT_OPTIMIZER_DEFAULT_VERSION = 'lucy-character-reference-v1' as const;

export const CHARACTER_REFERENCE_FRAMINGS = [
  'head_and_shoulders',
  'waist_up',
  'full_body',
] as const;
export const CHARACTER_REFERENCE_ORIENTATIONS = [
  'auto',
  'portrait_9_16',
  'landscape_16_9',
  'square',
] as const;
export const CHARACTER_REFERENCE_RENDERING_MODES = [
  'photorealistic',
  'faithful_source_style',
] as const;
export const CHARACTER_REFERENCE_EXPRESSIONS = ['neutral', 'subtle_friendly'] as const;
export const CHARACTER_REFERENCE_BACKGROUNDS = [
  'neutral_gray',
  'off_white',
  'plain_custom',
] as const;

export const characterReferenceFramingSchema = z.enum(CHARACTER_REFERENCE_FRAMINGS);
export const characterReferenceOrientationSchema = z.enum(CHARACTER_REFERENCE_ORIENTATIONS);
export const characterReferenceRenderingModeSchema = z.enum(CHARACTER_REFERENCE_RENDERING_MODES);
export const characterReferenceExpressionSchema = z.enum(CHARACTER_REFERENCE_EXPRESSIONS);
export const characterReferenceBackgroundSchema = z.enum(CHARACTER_REFERENCE_BACKGROUNDS);

const customBackgroundSchema = z.string().trim().min(1).max(200);

export const characterReferenceOptionsSchema = z
  .object({
    framing: characterReferenceFramingSchema,
    orientation: characterReferenceOrientationSchema,
    renderingMode: characterReferenceRenderingModeSchema,
    expression: characterReferenceExpressionSchema,
    background: characterReferenceBackgroundSchema,
    customBackground: customBackgroundSchema.optional(),
    targetUse: z.literal('lucy_2_5_character_reference'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.background === 'plain_custom' && value.customBackground === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['customBackground'],
        message: 'Provide a short plain background description.',
      });
    }
    if (value.background !== 'plain_custom' && value.customBackground !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['customBackground'],
        message: 'Custom background is only valid with plain_custom.',
      });
    }
  });

export const characterReferenceGeneratorSchema = z
  .object({
    provider: z.string().trim().min(1).max(128).optional(),
    model: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

const rawCharacterPromptSchema = z
  .string()
  .trim()
  .min(1, 'Character prompt must contain text.')
  .max(REFERENCE_IMAGE_PROMPT_MAX_LENGTH);

export const optimizeCharacterReferencePromptRequestSchema = z
  .object({
    rawPrompt: rawCharacterPromptSchema,
    options: characterReferenceOptionsSchema,
    generator: characterReferenceGeneratorSchema.optional(),
  })
  .strict();

const boundedResultString = (maximum: number) => z.string().min(1).max(maximum).regex(/\S/u);
const boundedResultList = (maximumItems: number) =>
  z.array(boundedResultString(500)).max(maximumItems);

const recommendedSettingsCommon = {
  framing: characterReferenceFramingSchema,
  quality: z.enum(['high', 'medium']),
  format: z.enum(['png', 'webp', 'jpeg']),
} as const;

export const characterPromptOptimizationResultSchema = z
  .object({
    optimizedImagePrompt: boundedResultString(REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH),
    lucy25CharacterPrompt: boundedResultString(5_000),
    normalizedCharacterDescription: boundedResultString(10_000),
    preservedCharacterFacts: boundedResultList(64),
    technicalDefaultsAdded: boundedResultList(32),
    warnings: boundedResultList(32),
    recommendedSettings: z.discriminatedUnion('orientation', [
      z
        .object({
          orientation: z.literal('portrait'),
          size: z.literal('1024x1536'),
          ...recommendedSettingsCommon,
        })
        .strict(),
      z
        .object({
          orientation: z.literal('landscape'),
          size: z.literal('1536x1024'),
          ...recommendedSettingsCommon,
        })
        .strict(),
      z
        .object({
          orientation: z.literal('square'),
          size: z.literal('1024x1024'),
          ...recommendedSettingsCommon,
        })
        .strict(),
    ]),
  })
  .strict();

export const characterPromptOptimizationInputHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const optimizeCharacterReferencePromptResponseSchema = z
  .object({
    result: characterPromptOptimizationResultSchema,
    model: z.string().trim().min(1).max(128),
    version: z.string().trim().min(1).max(128),
    inputHash: characterPromptOptimizationInputHashSchema,
  })
  .strict();

export const enabledReferenceImageOptimizationSchema = z
  .object({
    enabled: z.literal(true),
    result: characterPromptOptimizationResultSchema,
    model: z.string().trim().min(1).max(128),
    version: z.string().trim().min(1).max(128),
    inputHash: characterPromptOptimizationInputHashSchema,
    manuallyEdited: z.boolean(),
  })
  .strict();

const disabledReferenceImageOptimizationSchema = z
  .object({
    enabled: z.literal(false),
  })
  .strict();

export const referenceImageOptimizationSchema = z.discriminatedUnion('enabled', [
  enabledReferenceImageOptimizationSchema,
  disabledReferenceImageOptimizationSchema,
]);

export const referenceImageAssetIdSchema = z.uuid();
export const referenceImageRequestIdSchema = z.uuid();
export const referenceImageMimeTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const referenceImagePromptHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const referenceImageSizeSchema = z.enum(REFERENCE_IMAGE_SIZES);
export const referenceImageWidthSchema = z.union([z.literal(1024), z.literal(1536)]);
export const referenceImageHeightSchema = z.union([z.literal(1024), z.literal(1536)]);

export const createReferenceImageRequestSchema = z
  .object({
    requestId: referenceImageRequestIdSchema,
    rawPrompt: rawCharacterPromptSchema,
    options: characterReferenceOptionsSchema,
    generator: characterReferenceGeneratorSchema.optional(),
    optimization: referenceImageOptimizationSchema,
  })
  .strict();

export const editReferenceImageRequestSchema = z
  .object({
    requestId: referenceImageRequestIdSchema,
    rawPrompt: rawCharacterPromptSchema,
    changeInstructions: z
      .string()
      .trim()
      .min(1, 'Describe what should change in the reference image.')
      .max(REFERENCE_IMAGE_CHANGE_INSTRUCTIONS_MAX_LENGTH),
    options: characterReferenceOptionsSchema,
    generator: characterReferenceGeneratorSchema.optional(),
    optimization: enabledReferenceImageOptimizationSchema,
  })
  .strict();

export const referenceImageAssetParamsSchema = z
  .object({
    assetId: referenceImageAssetIdSchema,
  })
  .strict();

export const editReferenceImageParamsSchema = z
  .object({
    sourceAssetId: referenceImageAssetIdSchema,
  })
  .strict();

export const referenceImageDerivationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('generate') }).strict(),
  z
    .object({
      kind: z.literal('edit'),
      sourceAssetId: referenceImageAssetIdSchema,
    })
    .strict(),
]);

const referenceImageOptimizerAuditSchema = z
  .object({
    model: z.string().trim().min(1).max(128),
    version: z.string().trim().min(1).max(128),
  })
  .strict();

const referenceImageAssetCommonShape = {
  assetId: referenceImageAssetIdSchema,
  mimeType: referenceImageMimeTypeSchema,
  byteSize: z
    .number()
    .int()
    .positive()
    .max(REFERENCE_IMAGE_MAX_BYTES - 1),
  source: z.literal('generated'),
  provider: z.literal('openai'),
  model: z.string().trim().min(1).max(128),
  quality: z.enum(['high', 'medium']),
  promptHash: referenceImagePromptHashSchema,
  optimizationEnabled: z.boolean(),
  originalPrompt: rawCharacterPromptSchema,
  optimizedImagePrompt: boundedResultString(REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH),
  lucy25CharacterPrompt: boundedResultString(5_000),
  normalizedCharacterDescription: boundedResultString(10_000),
  preservedCharacterFacts: boundedResultList(64),
  technicalDefaultsAdded: boundedResultList(32),
  warnings: boundedResultList(32),
  options: characterReferenceOptionsSchema,
  requestedGenerator: characterReferenceGeneratorSchema.nullable(),
  optimizer: referenceImageOptimizerAuditSchema.nullable(),
  optimizationInputHash: characterPromptOptimizationInputHashSchema.nullable(),
  manuallyEdited: z.boolean(),
  derivation: referenceImageDerivationSchema.optional(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  contentUrl: z.string().regex(/^\/api\/reference-images\/[0-9a-f-]+\/content$/u),
} as const;

/** Owner-scoped immutable asset metadata; internal storage keys and provider payloads stay hidden. */
export const referenceImageAssetSchema = z.discriminatedUnion('size', [
  z
    .object({
      ...referenceImageAssetCommonShape,
      size: z.literal('1024x1024'),
      width: z.literal(1024),
      height: z.literal(1024),
    })
    .strict(),
  z
    .object({
      ...referenceImageAssetCommonShape,
      size: z.literal('1024x1536'),
      width: z.literal(1024),
      height: z.literal(1536),
    })
    .strict(),
  z
    .object({
      ...referenceImageAssetCommonShape,
      size: z.literal('1536x1024'),
      width: z.literal(1536),
      height: z.literal(1024),
    })
    .strict(),
]);

export const createReferenceImageResponseSchema = z
  .object({
    asset: referenceImageAssetSchema,
  })
  .strict();

export const editReferenceImageResponseSchema = createReferenceImageResponseSchema;

export const referenceImageMetadataResponseSchema = referenceImageAssetSchema;

export type CharacterReferenceFraming = z.infer<typeof characterReferenceFramingSchema>;
export type CharacterReferenceOrientation = z.infer<typeof characterReferenceOrientationSchema>;
export type CharacterReferenceRenderingMode = z.infer<typeof characterReferenceRenderingModeSchema>;
export type CharacterReferenceExpression = z.infer<typeof characterReferenceExpressionSchema>;
export type CharacterReferenceBackground = z.infer<typeof characterReferenceBackgroundSchema>;
export type CharacterReferenceOptions = z.infer<typeof characterReferenceOptionsSchema>;
export type CharacterReferenceGenerator = z.infer<typeof characterReferenceGeneratorSchema>;
export type OptimizeCharacterReferencePromptRequest = z.infer<
  typeof optimizeCharacterReferencePromptRequestSchema
>;
export type CharacterPromptOptimizationResult = z.infer<
  typeof characterPromptOptimizationResultSchema
>;
export type OptimizeCharacterReferencePromptResponse = z.infer<
  typeof optimizeCharacterReferencePromptResponseSchema
>;
export type ReferenceImageOptimization = z.infer<typeof referenceImageOptimizationSchema>;
export type ReferenceImageSize = z.infer<typeof referenceImageSizeSchema>;
export type CreateReferenceImageRequest = z.infer<typeof createReferenceImageRequestSchema>;
export type EditReferenceImageRequest = z.infer<typeof editReferenceImageRequestSchema>;
export type ReferenceImageAssetParams = z.infer<typeof referenceImageAssetParamsSchema>;
export type EditReferenceImageParams = z.infer<typeof editReferenceImageParamsSchema>;
export type ReferenceImageDerivation = z.infer<typeof referenceImageDerivationSchema>;
export type ReferenceImageAsset = z.infer<typeof referenceImageAssetSchema>;
export type ReferenceImageMetadataResponse = z.infer<typeof referenceImageMetadataResponseSchema>;
export type CreateReferenceImageResponse = z.infer<typeof createReferenceImageResponseSchema>;
export type EditReferenceImageResponse = z.infer<typeof editReferenceImageResponseSchema>;
