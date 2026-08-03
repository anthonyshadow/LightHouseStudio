import { z } from 'zod';

export const VIDEO_PROVIDER_INTENT_HEADER = 'x-lightframe-provider-intent' as const;
export const VIDEO_PROVIDER_INTENT_VALUE = 'video' as const;

export const VIDEO_TRANSFORM_MODEL_IDS = ['lucy-latest', 'lucy-vton-latest'] as const;
export const videoTransformModelIdSchema = z.enum(VIDEO_TRANSFORM_MODEL_IDS);
export const VIDEO_TRANSFORM_OPERATION_IDS = ['character-swap', 'virtual-try-on'] as const;
export const videoTransformOperationIdSchema = z.enum(VIDEO_TRANSFORM_OPERATION_IDS);
export const VIDEO_OUTPUT_RESOLUTIONS = ['720p', '1080p'] as const;
export const videoOutputResolutionSchema = z.enum(VIDEO_OUTPUT_RESOLUTIONS);
export const VIDEO_TRANSFORM_INPUT_KINDS = [
  'character',
  'saved-outfit',
  'reference-image',
  'prompt',
] as const;
export const videoTransformInputKindSchema = z.enum(VIDEO_TRANSFORM_INPUT_KINDS);

export const VIDEO_INPUT_MAX_DURATION_SECONDS = 300;
export const VIDEO_INPUT_MAX_BYTES = 300_000_000;
export const VTON_VIDEO_INPUT_MAX_BYTES = 200_000_000;
export const VIDEO_RESULT_MAX_BYTES = 300_000_000;
export const VIDEO_JOB_TTL_MS = 60 * 60 * 1_000;
export const VIDEO_ASPECT_RATIO_TOLERANCE = 0.01;
export const VIDEO_RESULT_DURATION_TOLERANCE_MS = 500;

export const VIDEO_INPUT_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export const videoInputMimeTypeSchema = z.enum(VIDEO_INPUT_MIME_TYPES);

export const VIDEO_JOB_STATUSES = [
  'validating',
  'submitting',
  'queued',
  'processing',
  'retrieving',
  'ready',
  'failed',
  'expired',
] as const;
export const videoJobStatusSchema = z.enum(VIDEO_JOB_STATUSES);

export const VIDEO_JOB_ERROR_CODES = [
  'invalid_video',
  'unsupported_container',
  'unsupported_codec',
  'unsupported_aspect_ratio',
  'duration_exceeded',
  'payload_too_large',
  'provider_unavailable',
  'provider_rejected',
  'provider_timeout',
  'result_invalid',
  'result_too_large',
  'job_expired',
] as const;
export const videoJobErrorCodeSchema = z.enum(VIDEO_JOB_ERROR_CODES);

export const videoTransformRecipeSchema = z
  .object({
    operation: videoTransformOperationIdSchema,
    inputKind: videoTransformInputKindSchema.optional(),
    prompt: z
      .string()
      .max(1_200)
      .transform((value) => value.trim()),
    enhancePrompt: z.boolean().default(false),
    hasReferenceImage: z.boolean(),
    outputResolution: videoOutputResolutionSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.prompt && !value.hasReferenceImage) {
      context.addIssue({
        code: 'custom',
        path: ['prompt'],
        message: 'A prompt, reference image, or both is required.',
      });
      return;
    }
    if (value.operation === 'character-swap') {
      if (value.inputKind !== undefined && value.inputKind !== 'character') {
        context.addIssue({
          code: 'custom',
          path: ['inputKind'],
          message: 'Character edits must use character input.',
        });
      }
      return;
    }
    if (value.inputKind === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['inputKind'],
        message: 'Choose a Virtual Try-On input type.',
      });
      return;
    }
    if (value.inputKind === 'character') {
      context.addIssue({
        code: 'custom',
        path: ['inputKind'],
        message: 'Choose a Virtual Try-On input type.',
      });
    }
    if (
      value.inputKind === 'reference-image' &&
      (!value.hasReferenceImage || value.prompt || value.enhancePrompt)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['inputKind'],
        message: 'Reference-image input cannot include prompt text or enhancement.',
      });
    }
    if (value.inputKind === 'prompt' && (!value.prompt || value.hasReferenceImage)) {
      context.addIssue({
        code: 'custom',
        path: ['inputKind'],
        message: 'Prompt input cannot include a reference image.',
      });
    }
    if (value.inputKind === 'saved-outfit' && value.enhancePrompt) {
      context.addIssue({
        code: 'custom',
        path: ['enhancePrompt'],
        message: 'Saved outfits cannot enable prompt enhancement.',
      });
    }
  });

export const videoJobParamsSchema = z.object({ jobId: z.uuid() }).strict();

export const inspectedVideoSchema = z
  .object({
    mimeType: videoInputMimeTypeSchema,
    container: z.enum(['mp4', 'quicktime', 'webm']),
    videoCodec: z.enum(['avc', 'vp8']),
    audioCodec: z.string().trim().min(1).max(32).nullable(),
    durationMs: z
      .number()
      .finite()
      .positive()
      .max(VIDEO_INPUT_MAX_DURATION_SECONDS * 1_000),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sizeBytes: z.number().int().positive().max(VIDEO_RESULT_MAX_BYTES),
    hasAudio: z.boolean(),
  })
  .strict();

export const videoJobSafeErrorSchema = z
  .object({
    code: videoJobErrorCodeSchema,
    message: z.string().trim().min(1).max(300),
  })
  .strict();

export const videoJobStatusResponseSchema = z
  .object({
    jobId: z.uuid(),
    operation: videoTransformOperationIdSchema,
    status: videoJobStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    result: inspectedVideoSchema.nullable(),
    error: videoJobSafeErrorSchema.nullable(),
  })
  .strict();

export type VideoTransformModelId = z.infer<typeof videoTransformModelIdSchema>;
export type VideoTransformOperationId = z.infer<typeof videoTransformOperationIdSchema>;
export type VideoOutputResolution = z.infer<typeof videoOutputResolutionSchema>;
export type VideoTransformInputKind = z.infer<typeof videoTransformInputKindSchema>;
export type VideoInputMimeType = z.infer<typeof videoInputMimeTypeSchema>;
export type VideoTransformRecipe = z.infer<typeof videoTransformRecipeSchema>;
export type VideoJobStatus = z.infer<typeof videoJobStatusSchema>;
export type VideoJobErrorCode = z.infer<typeof videoJobErrorCodeSchema>;
export type VideoJobSafeError = z.infer<typeof videoJobSafeErrorSchema>;
export type InspectedVideo = z.infer<typeof inspectedVideoSchema>;
export type VideoJobStatusResponse = z.infer<typeof videoJobStatusResponseSchema>;
