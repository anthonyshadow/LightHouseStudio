import { createReadStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import {
  REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
  VIDEO_INPUT_MAX_BYTES,
  videoJobParamsSchema,
} from '@studio/contracts';
import type { ApplicationRuntime, HttpRequest } from '../../application/application-runtime.js';
import { AppError } from '../../http/app-error.js';
import { requireTrustedOrigin, requireVideoProviderIntent } from '../../http/security.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import {
  InvalidReferenceImageUploadError,
  validateUploadedReferenceImage,
} from '../reference-images/image-validation.js';
import { parseVideoJobMultipart } from './multipart.js';
import type { VideoJobService } from './video-job-service.js';

const verifyVideoProviderIntent = (request: HttpRequest): Promise<void> => {
  requireTrustedOrigin(request);
  requireVideoProviderIntent(request);
  return Promise.resolve();
};

export const registerVideoJobRoutes = (app: ApplicationRuntime, service: VideoJobService): void => {
  app.put(
    '/api/video-jobs/:jobId',
    {
      bodyLimit: VIDEO_INPUT_MAX_BYTES + REFERENCE_IMAGE_UPLOAD_MAX_BYTES + 64 * 1_024,
      bodyParser: 'multipart',
      unsupportedMediaType: {
        statusCode: 400,
        message: 'Upload the video job as multipart form data.',
      },
      payloadTooLargeMessage: 'The uploaded media exceeds its safe limit.',
      onRequest: verifyVideoProviderIntent,
    },
    async (request, reply) => {
      const parsedParams = videoJobParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        throw new AppError(400, 'validation_error', 'Use a valid temporary video job ID.');
      }
      if (!service.available) {
        throw new AppError(
          503,
          'provider_unavailable',
          'Visual processing is unavailable until its server configuration is complete.',
        );
      }
      const ownerId = ownerUserIdForRequest(request);
      const duplicate = await service.existing(parsedParams.data.jobId, ownerId);
      if (duplicate?.status === 'expired') {
        reply.status(202).send(duplicate);
        return;
      }
      const paths = await service.prepareJobDirectory(parsedParams.data.jobId);
      try {
        const { recipe, referenceReceived, referenceMimeType } = await parseVideoJobMultipart(
          request.raw,
          paths,
          VIDEO_INPUT_MAX_BYTES + REFERENCE_IMAGE_UPLOAD_MAX_BYTES + 64 * 1_024,
          request.signal,
        );
        request.markBodyReceived();
        if (referenceReceived && referenceMimeType) {
          try {
            await validateUploadedReferenceImage(
              await readFile(paths.referencePath),
              referenceMimeType,
            );
          } catch (error) {
            if (error instanceof InvalidReferenceImageUploadError) {
              throw new AppError(400, 'validation_error', error.message);
            }
            throw error;
          }
        }
        const status = await service.start({
          jobId: parsedParams.data.jobId,
          ownerId,
          recipe,
          directory: paths.directory,
          inputPath: paths.inputPath,
          referencePath: referenceReceived ? paths.referencePath : null,
          referenceMimeType,
        });
        reply.status(202).send(status);
      } catch (error) {
        await rm(paths.directory, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    },
  );

  app.get('/api/video-jobs/:jobId', { onRequest: verifyVideoProviderIntent }, async (request) => {
    const parsed = videoJobParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new AppError(400, 'validation_error', 'Use a valid video job ID.');
    return service.status(parsed.data.jobId, ownerUserIdForRequest(request));
  });

  app.get(
    '/api/video-jobs/:jobId/content',
    { onRequest: verifyVideoProviderIntent },
    async (request, reply) => {
      const parsed = videoJobParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new AppError(400, 'validation_error', 'Use a valid video job ID.');
      const ownerId = ownerUserIdForRequest(request);
      const result = await service.content(parsed.data.jobId, ownerId);
      void reply.header('Content-Length', String(result.media.sizeBytes));
      void reply.type(result.media.mimeType);
      let settled = false;
      const settle = async (delivered: boolean): Promise<void> => {
        if (settled) return;
        settled = true;
        await result.settle(delivered);
      };
      const stream = createReadStream(result.path);
      return reply.sendStream(stream, {
        onComplete: () => settle(true),
        onCancel: () => settle(false),
        onError: () => settle(false),
      });
    },
  );

  app.delete(
    '/api/video-jobs/:jobId',
    { onRequest: verifyVideoProviderIntent },
    async (request, reply) => {
      const parsed = videoJobParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new AppError(400, 'validation_error', 'Use a valid video job ID.');
      await service.release(parsed.data.jobId, ownerUserIdForRequest(request));
      reply.status(204).send();
    },
  );
};
