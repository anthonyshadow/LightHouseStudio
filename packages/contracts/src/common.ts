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

export const LIST_SEARCH_MIN_LENGTH = 2;
export const LIST_SEARCH_MAX_LENGTH = 80;

/**
 * A typed list search term, bounded once here so that no repository has to bound it again.
 *
 * Absent, empty and whitespace-only all mean the same thing — no search — so a cleared input is
 * never a different query from one that was never typed in. A term that is too short or too long
 * is a validation error rather than something a repository silently truncates into a wider match.
 */
export const listSearchSchema = z
  .string()
  .trim()
  .max(LIST_SEARCH_MAX_LENGTH)
  .refine(
    (value) => value.length === 0 || value.length >= LIST_SEARCH_MIN_LENGTH,
    `Use at least ${LIST_SEARCH_MIN_LENGTH} characters to search.`,
  )
  .transform((value): string | undefined => (value.length === 0 ? undefined : value))
  .optional();

/**
 * How many matches a list counts before it stops counting.
 *
 * A list surface needs an honest sense of scale, not a census. Counting is bounded so that adding
 * search cannot turn a page read into a full scan, and the ceiling is reported rather than hidden:
 * past it a surface says "more than N", never an exact number it did not actually establish.
 */
export const LIST_TOTAL_CEILING = 200;

export const listTotalSchema = z
  .object({
    count: z.number().int().nonnegative().max(LIST_TOTAL_CEILING),
    /** True when more than `count` match, so the count is a floor and must be rendered as one. */
    exceedsCeiling: z.boolean(),
  })
  .strict();

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type ListTotal = z.infer<typeof listTotalSchema>;
