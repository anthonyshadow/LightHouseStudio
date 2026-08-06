import { z } from 'zod';

export const API_ERROR_CODES = [
  'authentication_required',
  'bad_request',
  'conflict',
  'feature_unavailable',
  'forbidden_origin',
  'generation_in_progress',
  'incompatible_voice',
  'internal_error',
  'invalid_credentials',
  'invalid_audio',
  'invalid_provider_image',
  'invalid_remote_image',
  'invalid_image_upload',
  'invalid_video',
  'unsupported_container',
  'unsupported_codec',
  'unsupported_aspect_ratio',
  'duration_exceeded',
  'provider_unavailable',
  'provider_rejected',
  'provider_timeout',
  'result_invalid',
  'result_too_large',
  'job_expired',
  'moderation_blocked',
  'asset_missing',
  'migration_required',
  'not_found',
  'payload_too_large',
  'provider_authentication',
  'provider_billing',
  'provider_configuration',
  'provider_failure',
  'provider_policy',
  'provider_quota',
  'provider_response_too_large',
  'rate_limited',
  'request_aborted',
  'request_id_conflict',
  'request_timeout',
  'storage_failure',
  'unsupported_media_type',
  'validation_error',
] as const;

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);

export const apiErrorDetailSchema = z
  .object({
    code: apiErrorCodeSchema,
    message: z.string().trim().min(1).max(300),
    upstreamStatus: z.number().int().min(400).max(599).optional(),
  })
  .strict();

export const apiErrorResponseSchema = z
  .object({
    error: apiErrorDetailSchema,
  })
  .strict();

export const providerIdSchema = z.string().trim().min(1).max(200);
export const opaquePageTokenSchema = z.string().trim().min(1).max(1_000);
export const boundedSearchSchema = z.string().trim().max(100).default('');
export const PAGE_SIZE_LIMIT = 20;

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
