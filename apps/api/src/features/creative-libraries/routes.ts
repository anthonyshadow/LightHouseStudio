import { sanitizeCreativeAssetStore } from '@studio/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { AppError } from '../../http/app-error.js';
import type { CreativeLibraryRepository } from './creative-library-repository.js';
import type { ReferenceImageAssetStore } from '../reference-images/asset-store.js';

const replaceRequestSchema = z
  .object({ expectedRevision: z.number().int().nonnegative(), store: z.unknown() })
  .strict();

export const registerCreativeLibraryRoutes = (
  app: FastifyInstance,
  repository: CreativeLibraryRepository | undefined,
  referenceImages?: ReferenceImageAssetStore,
): void => {
  if (repository === undefined) return;

  app.get('/api/creative-library', async (request) => {
    const snapshot = await repository.load(ownerUserIdForRequest(request));
    await referenceImages?.purgeExpiredUnreferenced?.().catch(() => undefined);
    return snapshot;
  });

  app.put('/api/creative-library', { bodyLimit: 2 * 1024 * 1024 }, async (request) => {
    const parsed = replaceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'validation_error', 'Provide a valid creative library snapshot.');
    }
    const sanitized = sanitizeCreativeAssetStore(parsed.data.store);
    if (sanitized.recovered || sanitized.droppedRecords > 0) {
      throw new AppError(400, 'validation_error', 'Provide a canonical creative library snapshot.');
    }
    const replaced = await repository.replace(
      ownerUserIdForRequest(request),
      parsed.data.expectedRevision,
      sanitized.store,
      new Date().toISOString(),
    );
    if (replaced === 'conflict') {
      throw new AppError(
        409,
        'conflict',
        'The creative library changed in another session. Refresh before retrying.',
      );
    }
    await referenceImages?.purgeExpiredUnreferenced?.().catch(() => undefined);
    return replaced;
  });
};
