import { z } from 'zod';

export const API_ERROR_CODES = [
  'bad_request',
  'feature_unavailable',
  'forbidden_origin',
  'generation_in_progress',
  'incompatible_voice',
  'invalid_audio',
  'invalid_provider_image',
  'moderation_blocked',
  'not_found',
  'payload_too_large',
  'provider_authentication',
  'provider_billing',
  'provider_configuration',
  'provider_failure',
  'provider_policy',
  'provider_quota',
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
export const opaquePageTokenSchema = z.string().trim().min(1).max(500);
export const boundedSearchSchema = z.string().trim().max(100).default('');
export const PAGE_SIZE_LIMIT = 10;

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
