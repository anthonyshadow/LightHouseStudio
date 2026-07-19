import { z } from 'zod';

export const REFERENCE_IMAGE_MODEL_ID = 'gpt-image-2' as const;
export const REFERENCE_IMAGE_SIZE = '1024x1024' as const;
export const REFERENCE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REFERENCE_IMAGE_PROMPT_MAX_LENGTH = 4_000;

export const referenceImageAssetIdSchema = z.uuid();
export const referenceImageRequestIdSchema = z.uuid();
export const referenceImageMimeTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const referenceImagePromptHashSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const createReferenceImageRequestSchema = z
  .object({
    requestId: referenceImageRequestIdSchema,
    workshopPrompt: z
      .string()
      .min(1)
      .max(REFERENCE_IMAGE_PROMPT_MAX_LENGTH)
      .refine((value) => value.trim().length > 0, 'Workshop prompt must contain text.'),
  })
  .strict();

export const referenceImageAssetParamsSchema = z
  .object({
    assetId: referenceImageAssetIdSchema,
  })
  .strict();

/** Browser-safe immutable asset metadata. Prompts and internal storage paths stay server-only. */
export const referenceImageAssetSchema = z
  .object({
    assetId: referenceImageAssetIdSchema,
    mimeType: referenceImageMimeTypeSchema,
    width: z.literal(1024),
    height: z.literal(1024),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(REFERENCE_IMAGE_MAX_BYTES - 1),
    source: z.literal('generated'),
    provider: z.literal('openai'),
    model: z.literal(REFERENCE_IMAGE_MODEL_ID),
    promptHash: referenceImagePromptHashSchema,
    createdAt: z.iso.datetime({ offset: true }),
    contentUrl: z.string().regex(/^\/api\/reference-images\/[0-9a-f-]+\/content$/u),
  })
  .strict();

export const createReferenceImageResponseSchema = z
  .object({
    asset: referenceImageAssetSchema,
  })
  .strict();

export const referenceImageMetadataResponseSchema = referenceImageAssetSchema;

export type CreateReferenceImageRequest = z.infer<typeof createReferenceImageRequestSchema>;
export type ReferenceImageAssetParams = z.infer<typeof referenceImageAssetParamsSchema>;
export type ReferenceImageAsset = z.infer<typeof referenceImageAssetSchema>;
export type ReferenceImageMetadataResponse = z.infer<typeof referenceImageMetadataResponseSchema>;
export type CreateReferenceImageResponse = z.infer<typeof createReferenceImageResponseSchema>;
