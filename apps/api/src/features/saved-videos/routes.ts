import {
  completeDirectSavedVideoUploadRequestSchema,
  createDirectSavedVideoUploadRequestSchema,
  directSavedVideoUploadParamsSchema,
  directSavedVideoUploadPartParamsSchema,
  directSavedVideoUploadPartsResponseSchema,
  directSavedVideoUploadPartUrlSchema,
  directSavedVideoUploadResponseSchema,
  SAVED_VIDEO_THUMBNAIL_MAX_BYTES,
  savedVideoDetailSchema,
  savedVideoIdempotencyKeySchema,
  savedVideoParamsSchema,
  savedVideosQuerySchema,
  savedVideosResponseSchema,
  savedVideoUploadMetadataSchema,
  savedVideoVersionParamsSchema,
  renameSavedVideoRequestSchema,
  VIDEO_INPUT_MIME_TYPES,
  VIDEO_RESULT_MAX_BYTES,
} from '@studio/contracts';
import type {
  ApplicationRuntime,
  HttpReply,
  HttpRequest,
} from '../../application/application-runtime.js';
import { isSpooledUpload } from '../../application/spooled-upload.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { AppError } from '../../http/app-error.js';
import { requestHeader } from '../../http/request-helpers.js';
import type { SavedVideoService } from './saved-video-service.js';
import type { DirectSavedVideoUploadService } from './direct-upload-service.js';
import { sendRangedAsset } from './byte-range.js';

const uploadMetadata = (request: HttpRequest) => {
  const encoded = requestHeader(request, 'x-lightframe-video-metadata');
  try {
    return savedVideoUploadMetadataSchema.parse(
      JSON.parse(decodeURIComponent(encoded ?? '')) as unknown,
    );
  } catch {
    throw new AppError(400, 'validation_error', 'Provide valid saved-video metadata.');
  }
};

const idempotencyKey = (request: HttpRequest): string => {
  const parsed = savedVideoIdempotencyKeySchema.safeParse(
    requestHeader(request, 'idempotency-key'),
  );
  if (!parsed.success)
    throw new AppError(400, 'validation_error', 'Provide a UUID Idempotency-Key.');
  return parsed.data;
};

const sendContent = async (
  request: HttpRequest,
  reply: HttpReply,
  service: SavedVideoService,
  videoId: string,
  versionId?: string,
) => {
  const result = await service.content(ownerUserIdForRequest(request), videoId, versionId);
  return sendRangedAsset(request, reply, {
    asset: result.asset,
    mimeType: result.version.mimeType,
    filename: result.version.filename,
  });
};

export const registerSavedVideoRoutes = (
  app: ApplicationRuntime,
  service: SavedVideoService,
  directUploads?: DirectSavedVideoUploadService,
): void => {
  if (directUploads !== undefined) {
    app.post('/api/videos/uploads', async (request, reply) => {
      const body = createDirectSavedVideoUploadRequestSchema.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, 'validation_error', 'Provide valid staged-video metadata.');
      }
      const staged = await directUploads.stage(ownerUserIdForRequest(request), body.data);
      reply.status(201).send(directSavedVideoUploadResponseSchema.parse(staged));
    });

    app.get('/api/videos/uploads/:uploadId/parts', async (request) => {
      const params = directSavedVideoUploadParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, 'validation_error', 'Choose a valid staged video upload.');
      }
      return directSavedVideoUploadPartsResponseSchema.parse({
        parts: await directUploads.listParts(ownerUserIdForRequest(request), params.data.uploadId),
      });
    });

    app.post('/api/videos/uploads/:uploadId/parts/:partNumber', async (request) => {
      const params = directSavedVideoUploadPartParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, 'validation_error', 'Choose a valid staged upload part.');
      }
      return directSavedVideoUploadPartUrlSchema.parse(
        await directUploads.signPart(
          ownerUserIdForRequest(request),
          params.data.uploadId,
          params.data.partNumber,
        ),
      );
    });

    app.post('/api/videos/uploads/:uploadId/complete', async (request) => {
      const params = directSavedVideoUploadParamsSchema.safeParse(request.params);
      const body = completeDirectSavedVideoUploadRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, 'validation_error', 'Provide valid completed upload parts.');
      }
      return savedVideoDetailSchema.parse(
        await directUploads.complete(
          ownerUserIdForRequest(request),
          params.data.uploadId,
          body.data.parts,
        ),
      );
    });

    app.delete('/api/videos/uploads/:uploadId', async (request, reply) => {
      const params = directSavedVideoUploadParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, 'validation_error', 'Choose a valid staged video upload.');
      }
      await directUploads.abort(ownerUserIdForRequest(request), params.data.uploadId);
      reply.status(204).send();
    });
  }

  app.post(
    '/api/videos',
    {
      bodyLimit: VIDEO_RESULT_MAX_BYTES,
      bodyParser: 'spooled',
      acceptedContentTypes: VIDEO_INPUT_MIME_TYPES,
      unsupportedMediaType: {
        statusCode: 400,
        message: 'Upload an MP4, QuickTime, or WebM saved video.',
      },
      payloadTooLargeMessage: 'The saved video must be 300 MB or smaller.',
    },
    async (request, reply) => {
      if (!isSpooledUpload(request.body))
        throw new AppError(400, 'invalid_video', 'Provide video bytes to save.');
      try {
        const detail = await service.saveNew(
          ownerUserIdForRequest(request),
          idempotencyKey(request),
          request.body.path,
          uploadMetadata(request),
          request.body.checksumSha256,
        );
        reply.status(201).send(savedVideoDetailSchema.parse(detail));
      } finally {
        await request.body.cleanup().catch(() => undefined);
      }
    },
  );

  app.post(
    '/api/videos/:videoId/versions',
    {
      bodyLimit: VIDEO_RESULT_MAX_BYTES,
      bodyParser: 'spooled',
      acceptedContentTypes: VIDEO_INPUT_MIME_TYPES,
      unsupportedMediaType: {
        statusCode: 400,
        message: 'Upload an MP4, QuickTime, or WebM saved video.',
      },
      payloadTooLargeMessage: 'The saved video must be 300 MB or smaller.',
    },
    async (request, reply) => {
      const params = savedVideoParamsSchema.safeParse(request.params);
      const expectedVersionId = requestHeader(request, 'if-match')?.replaceAll('"', '');
      if (!params.success || !savedVideoIdempotencyKeySchema.safeParse(expectedVersionId).success) {
        throw new AppError(
          400,
          'validation_error',
          'Choose a valid saved video and expected current version.',
        );
      }
      if (!isSpooledUpload(request.body))
        throw new AppError(400, 'invalid_video', 'Provide video bytes to save.');
      try {
        const detail = await service.appendVersion(
          ownerUserIdForRequest(request),
          params.data.videoId,
          expectedVersionId!,
          idempotencyKey(request),
          request.body.path,
          uploadMetadata(request),
          request.body.checksumSha256,
        );
        reply.status(201).send(savedVideoDetailSchema.parse(detail));
      } finally {
        await request.body.cleanup().catch(() => undefined);
      }
    },
  );

  app.get('/api/videos', async (request) => {
    const query = savedVideosQuerySchema.safeParse(request.query);
    if (!query.success)
      throw new AppError(400, 'validation_error', 'Use a valid gallery page request.');
    return savedVideosResponseSchema.parse(
      await service.list(ownerUserIdForRequest(request), query.data),
    );
  });

  app.get('/api/videos/:videoId', async (request) => {
    const params = savedVideoParamsSchema.safeParse(request.params);
    if (!params.success) throw new AppError(400, 'validation_error', 'Choose a valid saved video.');
    return savedVideoDetailSchema.parse(
      await service.get(ownerUserIdForRequest(request), params.data.videoId),
    );
  });

  app.patch('/api/videos/:videoId', async (request) => {
    const params = savedVideoParamsSchema.safeParse(request.params);
    const body = renameSavedVideoRequestSchema.safeParse(request.body);
    if (!params.success || !body.success)
      throw new AppError(400, 'validation_error', 'Provide a valid video title.');
    return savedVideoDetailSchema.parse(
      await service.rename(ownerUserIdForRequest(request), params.data.videoId, body.data.title),
    );
  });

  app.delete('/api/videos/:videoId', async (request, reply) => {
    const params = savedVideoParamsSchema.safeParse(request.params);
    if (!params.success) throw new AppError(400, 'validation_error', 'Choose a valid saved video.');
    await service.delete(ownerUserIdForRequest(request), params.data.videoId);
    reply.status(204).send();
  });

  app.get('/api/videos/:videoId/content', async (request, reply) => {
    const params = savedVideoParamsSchema.safeParse(request.params);
    if (!params.success) throw new AppError(400, 'validation_error', 'Choose a valid saved video.');
    return sendContent(request, reply, service, params.data.videoId);
  });

  app.get('/api/videos/:videoId/versions/:versionId/content', async (request, reply) => {
    const params = savedVideoVersionParamsSchema.safeParse(request.params);
    if (!params.success)
      throw new AppError(400, 'validation_error', 'Choose a valid saved video version.');
    return sendContent(request, reply, service, params.data.videoId, params.data.versionId);
  });

  app.put(
    '/api/videos/:videoId/versions/:versionId/thumbnail',
    {
      bodyLimit: SAVED_VIDEO_THUMBNAIL_MAX_BYTES,
      bodyParser: 'buffer',
      acceptedContentTypePrefixes: ['image/'],
      unsupportedMediaType: {
        statusCode: 400,
        message: 'Upload an image thumbnail.',
      },
    },
    async (request) => {
      const params = savedVideoVersionParamsSchema.safeParse(request.params);
      if (!params.success || !Buffer.isBuffer(request.body) || request.body.byteLength === 0) {
        throw new AppError(400, 'validation_error', 'Provide a valid saved video thumbnail.');
      }
      return savedVideoDetailSchema.parse(
        await service.saveThumbnail(
          ownerUserIdForRequest(request),
          params.data.videoId,
          params.data.versionId,
          request.body,
        ),
      );
    },
  );

  app.get('/api/videos/:videoId/thumbnail', async (request, reply) => {
    const params = savedVideoParamsSchema.safeParse(request.params);
    if (!params.success) throw new AppError(400, 'validation_error', 'Choose a valid saved video.');
    const thumbnail = await service.thumbnail(ownerUserIdForRequest(request), params.data.videoId);
    void reply.header('Content-Length', thumbnail.asset.manifest.sizeBytes);
    void reply.header('Content-Type', thumbnail.mimeType);
    void reply.header('Content-Disposition', 'inline');
    void reply.header('X-Content-Type-Options', 'nosniff');
    return reply.send(thumbnail.asset.createReadStream());
  });
};
