import {
  savedVideoDetailSchema,
  savedVideoIdempotencyKeySchema,
  savedVideoParamsSchema,
  savedVideosQuerySchema,
  savedVideosResponseSchema,
  savedVideoUploadMetadataSchema,
  savedVideoVersionParamsSchema,
  renameSavedVideoRequestSchema,
  VIDEO_RESULT_MAX_BYTES,
} from '@studio/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isSpooledAudioUpload } from '../../application/spooled-upload.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { AppError } from '../../http/app-error.js';
import type { SavedVideoService } from './saved-video-service.js';

const header = (request: FastifyRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
};

const uploadMetadata = (request: FastifyRequest) => {
  const encoded = header(request, 'x-lightframe-video-metadata');
  try {
    return savedVideoUploadMetadataSchema.parse(
      JSON.parse(decodeURIComponent(encoded ?? '')) as unknown,
    );
  } catch {
    throw new AppError(400, 'validation_error', 'Provide valid saved-video metadata.');
  }
};

const idempotencyKey = (request: FastifyRequest): string => {
  const parsed = savedVideoIdempotencyKeySchema.safeParse(header(request, 'idempotency-key'));
  if (!parsed.success)
    throw new AppError(400, 'validation_error', 'Provide a UUID Idempotency-Key.');
  return parsed.data;
};

const parseRange = (
  value: string | undefined,
  size: number,
): { start: number; end: number } | null => {
  if (value === undefined) return null;
  const match = /^bytes=(\d+)-(\d*)$/u.exec(value);
  if (match === null) throw new AppError(416, 'validation_error', 'Use a valid byte range.');
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  const end = Math.min(requestedEnd, size - 1);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    throw new AppError(416, 'validation_error', 'The requested byte range is unavailable.');
  }
  return { start, end };
};

const sendContent = async (
  request: FastifyRequest,
  reply: FastifyReply,
  service: SavedVideoService,
  videoId: string,
  versionId?: string,
) => {
  const result = await service.content(ownerUserIdForRequest(request), videoId, versionId);
  const size = result.asset.manifest.sizeBytes;
  const range = parseRange(header(request, 'range'), size);
  const download =
    typeof request.query === 'object' &&
    request.query !== null &&
    'download' in request.query &&
    request.query.download === 'true';
  const filename = result.version.filename.replaceAll(/["\\\r\n]/gu, '_');
  void reply.header('Accept-Ranges', 'bytes');
  void reply.header('Content-Type', result.version.mimeType);
  void reply.header('X-Content-Type-Options', 'nosniff');
  void reply.header(
    'Content-Disposition',
    `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
  );
  if (range === null) {
    void reply.header('Content-Length', size);
    return reply.send(result.asset.createReadStream());
  }
  void reply.status(206);
  void reply.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  void reply.header('Content-Length', range.end - range.start + 1);
  return reply.send(result.asset.createReadStream(range));
};

const THUMBNAIL_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const registerSavedVideoRoutes = (
  app: FastifyInstance,
  service: SavedVideoService,
): void => {
  app.post('/api/videos', { bodyLimit: VIDEO_RESULT_MAX_BYTES }, async (request, reply) => {
    if (!isSpooledAudioUpload(request.body))
      throw new AppError(400, 'invalid_video', 'Provide video bytes to save.');
    try {
      const detail = await service.saveNew(
        ownerUserIdForRequest(request),
        idempotencyKey(request),
        request.body.path,
        uploadMetadata(request),
        request.body.checksumSha256,
      );
      await reply.status(201).send(savedVideoDetailSchema.parse(detail));
    } finally {
      await request.body.cleanup().catch(() => undefined);
    }
  });

  app.post(
    '/api/videos/:videoId/versions',
    { bodyLimit: VIDEO_RESULT_MAX_BYTES },
    async (request, reply) => {
      const params = savedVideoParamsSchema.safeParse(request.params);
      const expectedVersionId = header(request, 'if-match')?.replaceAll('"', '');
      if (!params.success || !savedVideoIdempotencyKeySchema.safeParse(expectedVersionId).success) {
        throw new AppError(
          400,
          'validation_error',
          'Choose a valid saved video and expected current version.',
        );
      }
      if (!isSpooledAudioUpload(request.body))
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
        await reply.status(201).send(savedVideoDetailSchema.parse(detail));
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
    await reply.status(204).send();
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
    { bodyLimit: THUMBNAIL_UPLOAD_MAX_BYTES },
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
