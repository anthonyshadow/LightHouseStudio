import { z } from 'zod';
import { projectExportSpecificationValueSchema } from './export-placements';
import { listSearchSchema } from './common';
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
/**
 * The longest edge of a stored poster frame. The short edge follows the source aspect ratio.
 *
 * Owned here because both ends of the poster path bound the same image: the browser encodes to this
 * edge, and the route re-encodes what arrives. When only the client knew the number, the server
 * bounded the poster its own way and cropped every portrait video into a landscape tile.
 */
export const SAVED_VIDEO_THUMBNAIL_LONG_EDGE = 480;
/**
 * The largest poster body `PUT /api/videos/:videoId/versions/:versionId/thumbnail` accepts.
 *
 * This bounds the re-encoded WebP the browser produces, not the image an operator picks: the
 * poster is capped at `SAVED_VIDEO_THUMBNAIL_LONG_EDGE`, so it lands orders of magnitude under
 * this. It exists so the client and the route state the same number instead of each keeping its own.
 */
export const SAVED_VIDEO_THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;
export const SAVED_VIDEO_TITLE_MAX_LENGTH = 120;
export const savedVideoTitleSchema = z.string().trim().min(1).max(SAVED_VIDEO_TITLE_MAX_LENGTH);
export const savedVideoCharacterNameSchema = z.string().trim().min(1).max(120);
export const savedVideoCharacterVariantNameSchema = z.string().trim().min(1).max(120);
export const savedVideoIdSchema = z.uuid();
export const savedVideoIdempotencyKeySchema = z.uuid();
export const SAVED_VIDEO_FORMATS = ['landscape', 'portrait', 'square'] as const;
export const savedVideoFormatSchema = z.enum(SAVED_VIDEO_FORMATS);
export const SAVED_VIDEO_SORTS = ['latest', 'oldest', 'shortest', 'longest'] as const;
export const savedVideoSortSchema = z.enum(SAVED_VIDEO_SORTS);

const requireParentCharacterForVariant = (
  value: { characterName: string | null; characterVariantName: string | null },
  context: z.RefinementCtx,
) => {
  if (value.characterVariantName !== null && value.characterName === null) {
    context.addIssue({
      code: 'custom',
      path: ['characterVariantName'],
      message: 'A character variant requires a parent character.',
    });
  }
};

export const savedVideoVersionSchema = z
  .object({
    id: z.uuid(),
    videoId: z.uuid(),
    ordinal: z.number().int().positive(),
    origin: savedVideoOriginSchema,
    characterName: savedVideoCharacterNameSchema.nullable(),
    characterVariantName: savedVideoCharacterVariantNameSchema.nullable(),
    sourceVersionId: z.uuid().nullable(),
    mimeType: videoInputMimeTypeSchema,
    filename: z.string().trim().min(1).max(180),
    sizeBytes: z.number().int().positive().max(VIDEO_RESULT_MAX_BYTES),
    durationMs: z.number().finite().positive().max(300_000),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /**
     * The placement these bytes were produced for, or `null` when the cut was stored in the shape
     * it already had — including where the browser could not re-frame it.
     */
    exportSpecification: projectExportSpecificationValueSchema.nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict()
  .superRefine(requireParentCharacterForVariant);

export const savedVideoSummarySchema = z
  .object({
    id: z.uuid(),
    title: savedVideoTitleSchema,
    status: savedVideoStatusSchema,
    currentVersion: savedVideoVersionSchema,
    sourceVideoId: z.uuid().nullable(),
    versionCount: z.number().int().positive(),
    thumbnailAvailable: z.boolean(),
    assignment: z.enum(['project-output', 'unassigned']).optional(),
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
    characterName: savedVideoCharacterNameSchema.optional(),
    format: savedVideoFormatSchema.optional(),
    search: listSearchSchema,
    sort: savedVideoSortSchema.default('latest'),
  })
  .strict();

export const savedVideosResponseSchema = z
  .object({
    videos: z.array(savedVideoSummarySchema).max(40),
    nextCursor: z.string().max(500).nullable(),
    total: z.number().int().nonnegative(),
    facets: z
      .object({
        characterNames: z.array(savedVideoCharacterNameSchema).max(500),
        formats: z.array(savedVideoFormatSchema).max(SAVED_VIDEO_FORMATS.length),
      })
      .strict(),
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
    characterName: savedVideoCharacterNameSchema.nullable().default(null),
    characterVariantName: savedVideoCharacterVariantNameSchema.nullable().default(null),
    filename: z.string().trim().min(1).max(180),
    sourceVideoId: z.uuid().nullable().default(null),
    sourceVersionId: z.uuid().nullable().default(null),
  })
  .strict()
  .superRefine(requireParentCharacterForVariant);

export const directSavedVideoUploadTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new') }).strict(),
  z
    .object({
      kind: z.literal('version'),
      videoId: savedVideoIdSchema,
      expectedVersionId: z.uuid(),
    })
    .strict(),
]);

export const createDirectSavedVideoUploadRequestSchema = z
  .object({
    idempotencyKey: savedVideoIdempotencyKeySchema,
    mimeType: videoInputMimeTypeSchema,
    sizeBytes: z.number().int().positive().max(VIDEO_RESULT_MAX_BYTES),
    metadata: savedVideoUploadMetadataSchema,
    target: directSavedVideoUploadTargetSchema,
  })
  .strict();

export const directSavedVideoUploadIdSchema = z.uuid();
export const directSavedVideoUploadParamsSchema = z
  .object({ uploadId: directSavedVideoUploadIdSchema })
  .strict();
export const directSavedVideoUploadPartParamsSchema = z
  .object({
    uploadId: directSavedVideoUploadIdSchema,
    partNumber: z.coerce.number().int().min(1).max(10_000),
  })
  .strict();
export const directSavedVideoUploadResponseSchema = z
  .object({
    uploadId: directSavedVideoUploadIdSchema,
    expiresAt: z.iso.datetime(),
    result: savedVideoDetailSchema.nullable(),
  })
  .strict();
export const directSavedVideoUploadPartUrlSchema = z
  .object({
    url: z.url(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export const directSavedVideoUploadPartSchema = z
  .object({
    PartNumber: z.number().int().min(1).max(10_000),
    Size: z.number().int().positive(),
    ETag: z.string().trim().min(1).max(200),
  })
  .strict();
export const directSavedVideoUploadPartsResponseSchema = z
  .object({ parts: z.array(directSavedVideoUploadPartSchema).max(10_000) })
  .strict();
export const completeDirectSavedVideoUploadRequestSchema = z
  .object({
    parts: z
      .array(
        z
          .object({
            PartNumber: z.number().int().min(1).max(10_000),
            ETag: z.string().trim().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(10_000),
  })
  .strict();

export type SavedVideoOrigin = z.infer<typeof savedVideoOriginSchema>;
export type SavedVideoFormat = z.infer<typeof savedVideoFormatSchema>;
export type SavedVideoSort = z.infer<typeof savedVideoSortSchema>;
export type SavedVideoVersion = z.infer<typeof savedVideoVersionSchema>;
export type SavedVideoSummary = z.infer<typeof savedVideoSummarySchema>;
export type SavedVideoDetail = z.infer<typeof savedVideoDetailSchema>;
export type SavedVideosResponse = z.infer<typeof savedVideosResponseSchema>;
export type SavedVideosQuery = z.infer<typeof savedVideosQuerySchema>;
export type SavedVideoUploadMetadata = z.infer<typeof savedVideoUploadMetadataSchema>;
export type DirectSavedVideoUploadTarget = z.infer<typeof directSavedVideoUploadTargetSchema>;
export type CreateDirectSavedVideoUploadRequest = z.infer<
  typeof createDirectSavedVideoUploadRequestSchema
>;
export type DirectSavedVideoUploadPart = z.infer<typeof directSavedVideoUploadPartSchema>;
