import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';
import {
  REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
  VIDEO_INPUT_MAX_BYTES,
  VTON_VIDEO_INPUT_MAX_BYTES,
  referenceImageMimeTypeSchema,
  videoJobParamsSchema,
  videoTransformRecipeSchema,
  type VideoTransformRecipe,
} from '@studio/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../http/app-error.js';
import {
  localOwnerIdForRequest,
  requireTrustedOrigin,
  requireVideoProviderIntent,
} from '../../http/security.js';
import {
  InvalidReferenceImageUploadError,
  validateUploadedReferenceImage,
  type ValidReferenceImageMimeType,
} from '../reference-images/image-validation.js';
import type { VideoJobService } from './video-job-service.js';

const verifyVideoProviderIntent = (request: FastifyRequest): Promise<void> => {
  requireTrustedOrigin(request);
  requireVideoProviderIntent(request);
  return Promise.resolve();
};

const writePart = async (
  part: AsyncIterable<Uint8Array> & { readonly truncated?: boolean },
  destination: string,
  maximumBytes: number,
): Promise<void> => {
  const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  let received = 0;
  try {
    for await (const chunk of part) {
      received += chunk.byteLength;
      if (received > maximumBytes) {
        throw new AppError(413, 'payload_too_large', 'The uploaded media exceeds its safe limit.');
      }
      if (!output.write(chunk)) await once(output, 'drain');
    }
    output.end();
    await finished(output);
    if (part.truncated || received === 0) {
      throw new AppError(
        received === 0 ? 400 : 413,
        received === 0 ? 'invalid_video' : 'payload_too_large',
        received === 0 ? 'The uploaded media is empty.' : 'The uploaded media is too large.',
      );
    }
  } catch (error) {
    output.destroy();
    await rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
};

export const registerVideoJobRoutes = (app: FastifyInstance, service: VideoJobService): void => {
  app.put(
    '/api/video-jobs/:jobId',
    {
      bodyLimit: VIDEO_INPUT_MAX_BYTES + REFERENCE_IMAGE_UPLOAD_MAX_BYTES + 64 * 1_024,
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
      const ownerId = localOwnerIdForRequest(request);
      const duplicate = await service.existing(parsedParams.data.jobId, ownerId);
      if (duplicate?.status === 'expired') {
        await reply.status(202).send(duplicate);
        return;
      }
      const paths = await service.prepareJobDirectory(parsedParams.data.jobId);
      let recipe: VideoTransformRecipe | null = null;
      let videoReceived = false;
      let referenceReceived = false;
      let referenceMimeType: ValidReferenceImageMimeType | null = null;
      try {
        for await (const part of request.parts({
          limits: {
            fields: 1,
            files: 2,
            parts: 3,
            fieldSize: 16 * 1_024,
            fileSize: VIDEO_INPUT_MAX_BYTES,
          },
        })) {
          if (part.type === 'field') {
            if (part.fieldname !== 'request' || recipe !== null || typeof part.value !== 'string') {
              throw new AppError(400, 'validation_error', 'The video job request is invalid.');
            }
            let value: unknown;
            try {
              value = JSON.parse(part.value);
            } catch {
              throw new AppError(400, 'validation_error', 'The video job recipe is invalid.');
            }
            const parsedRecipe = videoTransformRecipeSchema.safeParse(value);
            if (!parsedRecipe.success) {
              throw new AppError(
                400,
                'validation_error',
                'Add a valid prompt, reference image, or both.',
              );
            }
            recipe = parsedRecipe.data;
            continue;
          }
          if (!recipe) {
            part.file.resume();
            throw new AppError(400, 'validation_error', 'Send the recipe before media files.');
          }
          if (part.fieldname === 'data' && !videoReceived) {
            videoReceived = true;
            await writePart(
              part.file,
              paths.inputPath,
              recipe.operation === 'virtual-try-on'
                ? VTON_VIDEO_INPUT_MAX_BYTES
                : VIDEO_INPUT_MAX_BYTES,
            );
            continue;
          }
          if (
            part.fieldname === 'reference_image' &&
            recipe.hasReferenceImage &&
            !referenceReceived
          ) {
            const parsedMimeType = referenceImageMimeTypeSchema.safeParse(part.mimetype);
            if (!parsedMimeType.success) {
              part.file.resume();
              throw new AppError(
                400,
                'validation_error',
                'Use a JPEG, PNG, or WebP reference image.',
              );
            }
            referenceReceived = true;
            referenceMimeType = parsedMimeType.data;
            await writePart(part.file, paths.referencePath, REFERENCE_IMAGE_UPLOAD_MAX_BYTES);
            continue;
          }
          part.file.resume();
          throw new AppError(400, 'validation_error', 'The video job files are invalid.');
        }
        if (!recipe || !videoReceived || recipe.hasReferenceImage !== referenceReceived) {
          throw new AppError(400, 'validation_error', 'The video job media is incomplete.');
        }
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
        await reply.status(202).send(status);
      } catch (error) {
        await rm(paths.directory, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    },
  );

  app.get('/api/video-jobs/:jobId', { onRequest: verifyVideoProviderIntent }, async (request) => {
    const parsed = videoJobParamsSchema.safeParse(request.params);
    if (!parsed.success) throw new AppError(400, 'validation_error', 'Use a valid video job ID.');
    return service.status(parsed.data.jobId, localOwnerIdForRequest(request));
  });

  app.get(
    '/api/video-jobs/:jobId/content',
    { onRequest: verifyVideoProviderIntent },
    async (request, reply) => {
      const parsed = videoJobParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new AppError(400, 'validation_error', 'Use a valid video job ID.');
      const ownerId = localOwnerIdForRequest(request);
      const result = await service.content(parsed.data.jobId, ownerId);
      void reply.header('Content-Length', String(result.media.sizeBytes));
      void reply.type(result.media.mimeType);
      let settled = false;
      const settle = (delivered: boolean): void => {
        if (settled) return;
        settled = true;
        void result.settle(delivered);
      };
      reply.raw.once('finish', () => {
        settle(true);
      });
      reply.raw.once('close', () => {
        settle(reply.raw.writableFinished);
      });
      const stream = createReadStream(result.path);
      stream.once('error', () => {
        settle(false);
      });
      return reply.send(stream);
    },
  );

  app.delete(
    '/api/video-jobs/:jobId',
    { onRequest: verifyVideoProviderIntent },
    async (request, reply) => {
      const parsed = videoJobParamsSchema.safeParse(request.params);
      if (!parsed.success) throw new AppError(400, 'validation_error', 'Use a valid video job ID.');
      await service.release(parsed.data.jobId, localOwnerIdForRequest(request));
      await reply.status(204).send();
    },
  );
};
