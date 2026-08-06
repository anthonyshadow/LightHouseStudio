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
  outfitTryOnParamsSchema,
  outfitTryOnRequestSchema,
  outfitTryOnResponseSchema,
  referenceImageAssetParamsSchema,
  referenceImageMetadataResponseSchema,
  REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
  referenceImageMimeTypeSchema,
  referenceImageRequestIdSchema,
  remoteReferenceImageImportRequestSchema,
  uploadReferenceImageResponseSchema,
} from '@studio/contracts';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../http/errors.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import {
  requireReferenceImageImportIntent,
  requireTrustedOrigin,
  requireWardrobeProviderIntent,
} from '../../http/security.js';
import { withRequestLifetime } from '../../http/streaming.js';
import { SafeRemoteImageDownloader } from '../../providers/transport/safe-remote-image-downloader.js';
import {
  InvalidReferenceImageUploadError,
  validateUploadedReferenceImage,
  type ValidReferenceImageMimeType,
} from './image-validation.js';
import type { ReferenceImageService } from './reference-image-service.js';
import type { OutfitTryOnService } from './outfit-try-on-service.js';

export interface RemoteReferenceImageDownloader {
  download: (
    url: string,
    signal: AbortSignal,
  ) => Promise<Readonly<{ bytes: Buffer; mimeType: ValidReferenceImageMimeType }>>;
}

const verifyGenerationOrigin = (request: FastifyRequest): Promise<void> => {
  requireTrustedOrigin(request);
  return Promise.resolve();
};

const verifyRemoteImportIntent = (request: FastifyRequest): Promise<void> => {
  requireTrustedOrigin(request);
  requireReferenceImageImportIntent(request);
  return Promise.resolve();
};

const verifyWardrobeProviderIntent = (request: FastifyRequest): Promise<void> => {
  requireTrustedOrigin(request);
  requireWardrobeProviderIntent(request);
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
  options: {
    readonly remoteImageDownloader?: RemoteReferenceImageDownloader;
    readonly outfitTryOnService?: OutfitTryOnService;
  } = {},
): void => {
  const remoteImageDownloader =
    options.remoteImageDownloader ??
    new SafeRemoteImageDownloader({
      policy: {
        maxRedirects: 3,
        maxBytes: REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
        acceptedMimeTypes: referenceImageMimeTypeSchema.options,
      },
      createError: () =>
        new AppError(
          422,
          'invalid_remote_image',
          'The public HTTPS image could not be imported safely.',
        ),
    });

  app.post(
    '/api/reference-images/:sourceAssetId/outfit-try-ons',
    { bodyLimit: 16 * 1_024, onRequest: verifyWardrobeProviderIntent },
    async (request, reply) => {
      const params = outfitTryOnParamsSchema.safeParse(request.params);
      const body = outfitTryOnRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(
          400,
          'validation_error',
          'Choose valid character and garment reference images and start a new request.',
        );
      }
      const tryOnService = options.outfitTryOnService;
      if (!tryOnService?.available) {
        throw new AppError(
          503,
          'feature_unavailable',
          'Add Outfit is unavailable until its server configuration is complete.',
        );
      }
      return withRequestLifetime(request, reply, async (signal) =>
        outfitTryOnResponseSchema.parse({
          asset: await tryOnService.tryOn({
            localOwnerId: ownerUserIdForRequest(request),
            sourceAssetId: params.data.sourceAssetId,
            garmentAssetId: body.data.garmentAssetId,
            requestId: body.data.requestId,
            signal,
          }),
        }),
      );
    },
  );

  app.post(
    '/api/reference-images/import',
    { bodyLimit: 4 * 1_024, onRequest: verifyRemoteImportIntent },
    async (request, reply) => {
      const parsed = remoteReferenceImageImportRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'validation_error',
          'Provide a public HTTPS image URL without credentials or a fragment.',
        );
      }
      return withRequestLifetime(request, reply, async (signal) => {
        const downloaded = await remoteImageDownloader.download(parsed.data.url, signal);
        let validated;
        try {
          validated = await validateUploadedReferenceImage(
            downloaded.bytes,
            downloaded.mimeType,
            signal,
          );
        } catch (error) {
          if (error instanceof InvalidReferenceImageUploadError) {
            throw new AppError(
              422,
              'invalid_remote_image',
              'The imported resource is not a safe, decodable JPEG, PNG, or WebP image.',
            );
          }
          throw error;
        }
        const extension =
          validated.mimeType === 'image/png'
            ? 'png'
            : validated.mimeType === 'image/webp'
              ? 'webp'
              : 'jpg';
        void reply.header('Content-Type', validated.mimeType);
        void reply.header('Content-Length', validated.bytes.byteLength);
        void reply.header(
          'Content-Disposition',
          `attachment; filename="imported-reference-${randomUUID().slice(0, 8)}.${extension}"`,
        );
        void reply.header('X-Content-Type-Options', 'nosniff');
        return reply.send(validated.bytes);
      });
    },
  );

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
          localOwnerId: ownerUserIdForRequest(request),
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
          localOwnerId: ownerUserIdForRequest(request),
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
          localOwnerId: ownerUserIdForRequest(request),
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
          localOwnerId: ownerUserIdForRequest(request),
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
    const asset = await service.getMetadata(ownerUserIdForRequest(request), assetId);
    if (asset === null) {
      throw new AppError(404, 'not_found', 'That local reference image is unavailable.');
    }
    return referenceImageMetadataResponseSchema.parse(asset);
  });

  app.get('/api/reference-images/:assetId/content', async (request, reply) => {
    const assetId = requireAssetId(request.params);
    const localOwnerId = ownerUserIdForRequest(request);
    const fileLookup = await service.getContentFile(localOwnerId, assetId);
    const content =
      fileLookup.status === 'available'
        ? fileLookup.file
        : fileLookup.status === 'streaming-unsupported'
          ? await service.getContent(localOwnerId, assetId)
          : null;
    if (content === null) {
      throw new AppError(404, 'not_found', 'That local reference image is unavailable.');
    }
    void reply.header('Content-Type', content.metadata.mimeType);
    void reply.header('Content-Length', content.metadata.byteSize);
    void reply.header('X-Content-Type-Options', 'nosniff');
    return reply.send('path' in content ? createReadStream(content.path) : content.bytes);
  });
};
