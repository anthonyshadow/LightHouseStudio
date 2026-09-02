import {
  creativeLibraryReplaceRequestSchema,
  creativeLibrarySnapshotSchema,
} from '@studio/contracts';
import { CREATIVE_LIBRARY_EXPORT_MAX_BYTES, sanitizeCreativeAssetStore } from '@studio/domain';
import type { ApplicationRuntime } from '../../application/application-runtime.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { AppError } from '../../http/app-error.js';
import type { CreativeLibraryRepository } from './creative-library-repository.js';
import type { ReferenceImageAssetStore } from '../reference-images/asset-store.js';

// The same bound the browser refuses an oversized import against, so a file the export path
// accepts can never be one this route rejects.
const replaceRouteOptions = { bodyLimit: CREATIVE_LIBRARY_EXPORT_MAX_BYTES };

export const registerCreativeLibraryRoutes = (
  app: ApplicationRuntime,
  repository: CreativeLibraryRepository | undefined,
  referenceImages?: ReferenceImageAssetStore,
): void => {
  if (repository === undefined) return;

  // Both success bodies leave through the contract schema. The repository interface declares the
  // same three fields, but a declaration is a promise the compiler stops checking at the app
  // boundary — the client parses this strictly, so a drifted repository would 502 every browser.
  // Parsing here makes the twin impossible to drift silently.
  app.get('/api/creative-library', async (request) => {
    const snapshot = await repository.load(ownerUserIdForRequest(request));
    await referenceImages?.purgeExpiredUnreferenced?.().catch(() => undefined);
    return creativeLibrarySnapshotSchema.parse(snapshot);
  });

  app.put('/api/creative-library', replaceRouteOptions, async (request) => {
    const parsed = creativeLibraryReplaceRequestSchema.safeParse(request.body);
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
    return creativeLibrarySnapshotSchema.parse(replaced);
  });
};
