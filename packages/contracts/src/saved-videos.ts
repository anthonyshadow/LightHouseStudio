import { z } from 'zod';
import { videoInputMimeTypeSchema, VIDEO_RESULT_MAX_BYTES } from './video-jobs';

export const SAVED_VIDEO_ORIGINS = [
  'recorded',
  'uploaded',
  'character-swap',
  'virtual-try-on',
  'voice-treatment',
  'editor',
  'legacy-import',
] as const;
export const savedVideoOriginSchema = z.enum(SAVED_VIDEO_ORIGINS);
export const savedVideoStatusSchema = z.enum(['ready', 'processing', 'failed', 'missing']);
export const savedVideoTitleSchema = z.string().trim().min(1).max(120);
export const savedVideoIdSchema = z.uuid();
export const savedVideoIdempotencyKeySchema = z.uuid();

export const savedVideoVersionSchema = z
  .object({
    id: z.uuid(),
    videoId: z.uuid(),
    ordinal: z.number().int().positive(),
    origin: savedVideoOriginSchema,
    sourceVersionId: z.uuid().nullable(),
    mimeType: videoInputMimeTypeSchema,
    filename: z.string().trim().min(1).max(180),
    sizeBytes: z.number().int().positive().max(VIDEO_RESULT_MAX_BYTES),
    durationMs: z.number().finite().positive().max(300_000),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const savedVideoSummarySchema = z
  .object({
    id: z.uuid(),
    title: savedVideoTitleSchema,
    status: savedVideoStatusSchema,
    currentVersion: savedVideoVersionSchema,
    sourceVideoId: z.uuid().nullable(),
    versionCount: z.number().int().positive(),
    thumbnailAvailable: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const savedVideoDetailSchema = savedVideoSummarySchema
  .extend({ versions: z.array(savedVideoVersionSchema).min(1).max(100) })
  .strict();

export const savedVideosQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(500).optional(),
    pageSize: z.coerce.number().int().min(1).max(40).default(20),
  })
  .strict();

export const savedVideosResponseSchema = z
  .object({
    videos: z.array(savedVideoSummarySchema).max(40),
    nextCursor: z.string().max(500).nullable(),
  })
  .strict();

export const savedVideoParamsSchema = z.object({ videoId: z.uuid() }).strict();
export const savedVideoVersionParamsSchema = z
  .object({ videoId: z.uuid(), versionId: z.uuid() })
  .strict();
export const renameSavedVideoRequestSchema = z.object({ title: savedVideoTitleSchema }).strict();

export const savedVideoUploadMetadataSchema = z
  .object({
    title: savedVideoTitleSchema,
    origin: savedVideoOriginSchema,
    filename: z.string().trim().min(1).max(180),
    sourceVideoId: z.uuid().nullable().default(null),
    sourceVersionId: z.uuid().nullable().default(null),
  })
  .strict();

export type SavedVideoOrigin = z.infer<typeof savedVideoOriginSchema>;
export type SavedVideoVersion = z.infer<typeof savedVideoVersionSchema>;
export type SavedVideoSummary = z.infer<typeof savedVideoSummarySchema>;
export type SavedVideoDetail = z.infer<typeof savedVideoDetailSchema>;
export type SavedVideosResponse = z.infer<typeof savedVideosResponseSchema>;
export type SavedVideoUploadMetadata = z.infer<typeof savedVideoUploadMetadataSchema>;
