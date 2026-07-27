import {
  composeReferenceImageRequestSchema,
  composeReferenceImageResponseSchema,
  createReferenceImageRequestSchema,
  createReferenceImageResponseSchema,
  editReferenceImageParamsSchema,
  editReferenceImageRequestSchema,
  editReferenceImageResponseSchema,
  optimizeCharacterReferencePromptRequestSchema,
  optimizeCharacterReferencePromptResponseSchema,
  referenceImageAssetParamsSchema,
  referenceImageMetadataResponseSchema,
  REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
  referenceImageMimeTypeSchema,
  referenceImageRequestIdSchema,
  uploadReferenceImageResponseSchema,
} from '@studio/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../http/errors.js';
import { localOwnerIdForRequest, requireTrustedOrigin } from '../../http/security.js';
import { withRequestLifetime } from '../../http/streaming.js';
import type { ReferenceImageService } from './reference-image-service.js';

const verifyGenerationOrigin = (request: FastifyRequest): Promise<void> => {
  requireTrustedOrigin(request);
  return Promise.resolve();
};

const requireAssetId = (params: unknown): string => {
  const parsed = referenceImageAssetParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new AppError(400, 'validation_error', 'Choose a valid reference image asset.');
  }
  return parsed.data.assetId;
};

const requireSourceAssetId = (params: unknown): string => {
  const parsed = editReferenceImageParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new AppError(400, 'validation_error', 'Choose a valid source reference image.');
  }
  return parsed.data.sourceAssetId;
};

const requireUploadRequestId = (headers: FastifyRequest['headers']): string => {
  const parsed = referenceImageRequestIdSchema.safeParse(headers['idempotency-key']);
  if (!parsed.success) {
    throw new AppError(
      400,
      'validation_error',
      'Provide a UUID Idempotency-Key for this image upload.',
    );
  }
  return parsed.data;
};

const requireUploadMimeType = (headers: FastifyRequest['headers']) => {
  const contentType = headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
  const parsed = referenceImageMimeTypeSchema.safeParse(contentType);
  if (!parsed.success) {
    throw new AppError(415, 'unsupported_media_type', 'Upload a JPEG, PNG, or WebP image.');
  }
  return parsed.data;
};

export const registerReferenceImageRoutes = (
  app: FastifyInstance,
  service: ReferenceImageService,
): void => {
  app.post(
    '/api/reference-images/optimize',
    { bodyLimit: 64 * 1024, onRequest: verifyGenerationOrigin },
    async (request, reply) => {
      const parsed = optimizeCharacterReferencePromptRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'validation_error',
          'Provide a valid character description and reference-image options.',
        );
      }
      return withRequestLifetime(request, reply, async (signal) => {
        return optimizeCharacterReferencePromptResponseSchema.parse(
          await service.optimize(parsed.data, signal),
        );
      });
    },
  );

  app.post(
    '/api/reference-images',
    { bodyLimit: 256 * 1024, onRequest: verifyGenerationOrigin },
    async (request, reply) => {
      const parsed = createReferenceImageRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'validation_error',
          'Provide a valid reference generation request and a new request ID.',
        );
      }
      return withRequestLifetime(request, reply, async (signal) => {
        const asset = await service.generate({
          localOwnerId: localOwnerIdForRequest(request),
          signal,
          ...parsed.data,
        });
        return createReferenceImageResponseSchema.parse({ asset });
      });
    },
  );

  app.post(
    '/api/reference-images/uploads',
    {
      bodyLimit: REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
      onRequest: verifyGenerationOrigin,
    },
    async (request, reply) => {
      const requestId = requireUploadRequestId(request.headers);
      const mimeType = requireUploadMimeType(request.headers);
      const bytes = request.body;
      if (!Buffer.isBuffer(bytes)) {
        throw new AppError(400, 'validation_error', 'Provide image bytes in the request body.');
      }
      return withRequestLifetime(request, reply, async (signal) => {
        const asset = await service.upload({
          localOwnerId: localOwnerIdForRequest(request),
          requestId,
          bytes,
          mimeType,
          signal,
        });
        return uploadReferenceImageResponseSchema.parse({ asset });
      });
    },
  );

  app.post(
    '/api/reference-images/:sourceAssetId/edits',
    { bodyLimit: 256 * 1024, onRequest: verifyGenerationOrigin },
    async (request, reply) => {
      const sourceAssetId = requireSourceAssetId(request.params);
      const parsed = editReferenceImageRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'validation_error',
          'Provide a valid reference edit request, change instructions, and a new request ID.',
        );
      }
      return withRequestLifetime(request, reply, async (signal) => {
        const asset = await service.edit({
          localOwnerId: localOwnerIdForRequest(request),
          sourceAssetId,
          signal,
          ...parsed.data,
        });
        return editReferenceImageResponseSchema.parse({ asset });
      });
    },
  );

  app.post(
    '/api/reference-images/:sourceAssetId/compositions',
    { bodyLimit: 256 * 1024, onRequest: verifyGenerationOrigin },
    async (request, reply) => {
      const sourceAssetId = requireSourceAssetId(request.params);
      const parsed = composeReferenceImageRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'validation_error',
          'Provide a valid reference composition request and a new request ID.',
        );
      }
      return withRequestLifetime(request, reply, async (signal) => {
        const asset = await service.compose({
          localOwnerId: localOwnerIdForRequest(request),
          sourceAssetId,
          signal,
          ...parsed.data,
        });
        return composeReferenceImageResponseSchema.parse({ asset });
      });
    },
  );

  app.get('/api/reference-images/:assetId', async (request) => {
    const assetId = requireAssetId(request.params);
    const asset = await service.getMetadata(localOwnerIdForRequest(request), assetId);
    if (asset === null) {
      throw new AppError(404, 'not_found', 'That local reference image is unavailable.');
    }
    return referenceImageMetadataResponseSchema.parse(asset);
  });

  app.get('/api/reference-images/:assetId/content', async (request, reply) => {
    const assetId = requireAssetId(request.params);
    const content = await service.getContent(localOwnerIdForRequest(request), assetId);
    if (content === null) {
      throw new AppError(404, 'not_found', 'That local reference image is unavailable.');
    }
    void reply.header('Content-Type', content.metadata.mimeType);
    void reply.header('Content-Length', content.metadata.byteSize);
    void reply.header('X-Content-Type-Options', 'nosniff');
    return reply.send(content.bytes);
  });
};
