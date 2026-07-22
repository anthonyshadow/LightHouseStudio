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

export const publicVoiceSummarySchema = voiceSummarySchema.extend({
  publicOwnerId: providerIdSchema,
});

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

export const sharedVoicesQuerySchema = z
  .object({
    search: boundedSearchSchema,
    page: z.coerce.number().int().nonnegative().default(0),
    pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_LIMIT).default(PAGE_SIZE_LIMIT),
  })
  .strict();

export const sharedVoicesResponseSchema = z
  .object({
    voices: z.array(publicVoiceSummarySchema),
    page: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    nextPageToken: opaquePageTokenSchema.nullable(),
    /** Null is required when compatibility filtering makes the upstream total inaccurate. */
    total: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const sharedVoicePreviewParamsSchema = z
  .object({
    publicOwnerId: providerIdSchema,
    voiceId: providerIdSchema,
  })
  .strict();

export const importSharedVoiceRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    publicOwnerId: providerIdSchema,
    voiceId: providerIdSchema,
  })
  .strict();

export const importSharedVoiceResponseSchema = z.object({ voiceId: providerIdSchema }).strict();

export const voiceChangerQuerySchema = z.object({ voiceId: providerIdSchema }).strict();

export const VOICE_CONVERSION_MAX_BYTES = 25 * 1024 * 1024;
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
export type PublicVoiceSummary = z.infer<typeof publicVoiceSummarySchema>;
export type WorkspaceVoicesQuery = z.infer<typeof workspaceVoicesQuerySchema>;
export type WorkspaceVoicesResponse = z.infer<typeof workspaceVoicesResponseSchema>;
export type WorkspaceVoiceParams = z.infer<typeof workspaceVoiceParamsSchema>;
export type SharedVoicesQuery = z.infer<typeof sharedVoicesQuerySchema>;
export type SharedVoicesResponse = z.infer<typeof sharedVoicesResponseSchema>;
export type SharedVoicePreviewParams = z.infer<typeof sharedVoicePreviewParamsSchema>;
export type ImportSharedVoiceRequest = z.infer<typeof importSharedVoiceRequestSchema>;
export type ImportSharedVoiceResponse = z.infer<typeof importSharedVoiceResponseSchema>;
export type VoiceChangerQuery = z.infer<typeof voiceChangerQuerySchema>;
export type VoiceConversionContentType = z.infer<typeof voiceConversionContentTypeSchema>;
