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

export const voiceSummarySchema = z
  .object({
    voiceId: providerIdSchema,
    name: z.string().trim().min(1).max(100),
    category: z.string().trim().max(100).nullable(),
    description: z.string().trim().max(500).nullable(),
    labels: voiceLabelsSchema,
    previewAvailable: z.boolean(),
  })
  .strict();

export const workspaceVoicesQuerySchema = z
  .object({
    search: boundedSearchSchema,
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_LIMIT).default(PAGE_SIZE_LIMIT),
    pageToken: opaquePageTokenSchema.optional(),
  })
  .strict();

export const workspaceVoicesResponseSchema = z
  .object({
    voices: z.array(voiceSummarySchema),
    hasMore: z.boolean(),
    nextPageToken: opaquePageTokenSchema.nullable(),
    total: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const workspaceVoiceParamsSchema = z.object({ voiceId: providerIdSchema }).strict();

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
export type WorkspaceVoicesQuery = z.infer<typeof workspaceVoicesQuerySchema>;
export type WorkspaceVoicesResponse = z.infer<typeof workspaceVoicesResponseSchema>;
export type WorkspaceVoiceParams = z.infer<typeof workspaceVoiceParamsSchema>;
export type VoiceChangerQuery = z.infer<typeof voiceChangerQuerySchema>;
export type VoiceConversionContentType = z.infer<typeof voiceConversionContentTypeSchema>;
