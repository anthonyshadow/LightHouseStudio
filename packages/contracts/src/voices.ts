import { z } from 'zod';
import {
  PAGE_SIZE_LIMIT,
  boundedSearchSchema,
  opaquePageTokenSchema,
  providerIdSchema,
} from './common';

export const VOICE_PROVIDER_INTENT_HEADER = 'x-lightframe-provider-intent' as const;
export const VOICE_PROVIDER_INTENT_VALUE = 'voice' as const;

export const voiceLabelsSchema = z.record(z.string().max(80), z.string().max(200));

const optionalVoiceAttributeSchema = z.string().trim().min(1).max(80).nullable();

export const voiceTraitsSchema = z
  .object({
    language: optionalVoiceAttributeSchema,
    gender: optionalVoiceAttributeSchema,
    age: optionalVoiceAttributeSchema,
    accent: optionalVoiceAttributeSchema,
    useCase: optionalVoiceAttributeSchema,
    descriptive: optionalVoiceAttributeSchema,
  })
  .strict();

export const voiceSummarySchema = z
  .object({
    voiceId: providerIdSchema,
    name: z.string().trim().min(1).max(100),
    category: z.string().trim().max(100).nullable(),
    description: z.string().trim().max(500).nullable(),
    labels: voiceLabelsSchema,
    traits: voiceTraitsSchema,
    previewAvailable: z.boolean(),
  })
  .strict();

export const workspaceVoiceSummarySchema = voiceSummarySchema
  .extend({ removable: z.boolean() })
  .strict();

export const sharedVoiceSummarySchema = voiceSummarySchema
  .extend({
    publicOwnerId: providerIdSchema,
    saved: z.boolean(),
  })
  .strict();

const voiceFilterQueryFields = {
  search: boundedSearchSchema,
  language: z.string().trim().max(80).default(''),
  gender: z.string().trim().max(80).default(''),
  age: z.string().trim().max(80).default(''),
  accent: z.string().trim().max(80).default(''),
  useCase: z.string().trim().max(80).default(''),
  descriptive: z.string().trim().max(80).default(''),
} as const;

const queryBooleanSchema = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
);

export const workspaceVoicesQuerySchema = z
  .object({
    ...voiceFilterQueryFields,
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_LIMIT).default(PAGE_SIZE_LIMIT),
    pageToken: opaquePageTokenSchema.optional(),
    refresh: queryBooleanSchema.default(false),
  })
  .strict();

export const workspaceVoicesResponseSchema = z
  .object({
    voices: z.array(workspaceVoiceSummarySchema).max(PAGE_SIZE_LIMIT),
    hasMore: z.boolean(),
    nextPageToken: opaquePageTokenSchema.nullable(),
    total: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const sharedVoiceSortSchema = z.enum([
  'trending',
  'created_date',
  'usage_character_count_1y',
  'cloned_by_count',
]);

export const sharedVoicesQuerySchema = z
  .object({
    ...voiceFilterQueryFields,
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_LIMIT).default(PAGE_SIZE_LIMIT),
    page: z.coerce.number().int().min(0).default(0),
    sort: sharedVoiceSortSchema.default('trending'),
    refresh: queryBooleanSchema.default(false),
  })
  .strict();

export const sharedVoicesResponseSchema = z
  .object({
    voices: z.array(sharedVoiceSummarySchema).max(PAGE_SIZE_LIMIT),
    hasMore: z.boolean(),
    page: z.number().int().nonnegative(),
    total: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const workspaceVoiceParamsSchema = z.object({ voiceId: providerIdSchema }).strict();

export const workspaceVoiceRelationshipResponseSchema = z
  .object({
    voiceId: providerIdSchema,
    saved: z.boolean(),
  })
  .strict();

/**
 * How many voices this account has kept, read from Lightframe's own saved-voice records.
 *
 * Deliberately not the provider's workspace size: this answer has to be available to a surface that
 * only wants a number, and no count is worth a paid provider call.
 */
export const savedVoiceCountResponseSchema = z
  .object({ count: z.number().int().nonnegative() })
  .strict();

export const sharedVoiceParamsSchema = z
  .object({ publicOwnerId: providerIdSchema, voiceId: providerIdSchema })
  .strict();

export const voiceLibraryMutationResponseSchema = z
  .object({
    status: z.enum(['saved', 'already-saved', 'removed', 'already-removed']),
    voiceId: providerIdSchema,
  })
  .strict();

export const voiceChangerQuerySchema = z.object({ voiceId: providerIdSchema }).strict();

export const VOICE_CONVERSION_MAX_BYTES = 25 * 1024 * 1024;
/**
 * Saved previews are short provider MP3 assets. Two MiB allows more than two minutes at the
 * requested 128 kbps format while bounding an unexpected successful response.
 */
export const VOICE_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
/**
 * Voice Changer is pinned to mp3_44100_128. Five minutes is about 4.8 MB at 128 kbps; eight MiB
 * leaves more than 70% container/metadata headroom without permitting unbounded output.
 */
export const VOICE_CONVERSION_OUTPUT_MAX_BYTES = 8 * 1024 * 1024;
export const VOICE_CONVERSION_CONTENT_TYPES = [
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
] as const;
export const voiceConversionContentTypeSchema = z.enum(VOICE_CONVERSION_CONTENT_TYPES);

export type VoiceSummary = z.infer<typeof voiceSummarySchema>;
export type VoiceTraits = z.infer<typeof voiceTraitsSchema>;
export type WorkspaceVoiceSummary = z.infer<typeof workspaceVoiceSummarySchema>;
export type SharedVoiceSummary = z.infer<typeof sharedVoiceSummarySchema>;
export type WorkspaceVoicesQuery = z.infer<typeof workspaceVoicesQuerySchema>;
export type WorkspaceVoicesResponse = z.infer<typeof workspaceVoicesResponseSchema>;
export type SharedVoicesQuery = z.infer<typeof sharedVoicesQuerySchema>;
export type SharedVoicesResponse = z.infer<typeof sharedVoicesResponseSchema>;
export type SharedVoiceParams = z.infer<typeof sharedVoiceParamsSchema>;
export type VoiceLibraryMutationResponse = z.infer<typeof voiceLibraryMutationResponseSchema>;
export type WorkspaceVoiceParams = z.infer<typeof workspaceVoiceParamsSchema>;
export type WorkspaceVoiceRelationshipResponse = z.infer<
  typeof workspaceVoiceRelationshipResponseSchema
>;
export type SavedVoiceCountResponse = z.infer<typeof savedVoiceCountResponseSchema>;
export type VoiceChangerQuery = z.infer<typeof voiceChangerQuerySchema>;
export type VoiceConversionContentType = z.infer<typeof voiceConversionContentTypeSchema>;
