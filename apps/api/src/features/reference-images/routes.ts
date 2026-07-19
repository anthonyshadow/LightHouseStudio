import {
  createReferenceImageRequestSchema,
  createReferenceImageResponseSchema,
  optimizeCharacterReferencePromptRequestSchema,
  optimizeCharacterReferencePromptResponseSchema,
  referenceImageAssetParamsSchema,
  referenceImageMetadataResponseSchema,
} from '@studio/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../http/errors.js';
import { localOwnerIdForRequest, requireTrustedOrigin } from '../../http/security.js';
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

export const registerReferenceImageRoutes = (
  app: FastifyInstance,
  service: ReferenceImageService,
): void => {
  app.post(
    '/api/reference-images/optimize',
    { bodyLimit: 64 * 1024, onRequest: verifyGenerationOrigin },
    async (request) => {
      const parsed = optimizeCharacterReferencePromptRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'validation_error',
          'Provide a valid character description and reference-image options.',
        );
      }
      return optimizeCharacterReferencePromptResponseSchema.parse(
        await service.optimize(parsed.data),
      );
    },
  );

  app.post(
    '/api/reference-images',
    { bodyLimit: 256 * 1024, onRequest: verifyGenerationOrigin },
    async (request) => {
      const parsed = createReferenceImageRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'validation_error',
          'Provide a valid reference generation request and a new request ID.',
        );
      }
      const asset = await service.generate({
        localOwnerId: localOwnerIdForRequest(request),
        ...parsed.data,
      });
      return createReferenceImageResponseSchema.parse({ asset });
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
