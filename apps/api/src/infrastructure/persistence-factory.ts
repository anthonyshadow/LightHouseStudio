import type { AppPersistenceDependencies } from '../app.js';
import type { RuntimeConfig } from '../config/environment.js';
import { LocalAssetByteStore, type AssetByteStore } from '../storage/asset-byte-store.js';
import { ManagedLocalAssetByteStore } from '../storage/managed-asset-byte-store.js';
import { R2AssetByteStore } from '../storage/r2-asset-byte-store.js';
import { ShadowAssetByteStore } from '../storage/shadow-asset-byte-store.js';
import { DrizzleAssetLifecycleRegistry } from './database/asset-lifecycle-registry.js';
import { DrizzleSessionRepository, DrizzleUserRepository } from './database/auth-repositories.js';
import { createPostgresDatabase } from './database/client.js';
import { DrizzleCreativeLibraryRepository } from './database/creative-library-repository.js';
import { DrizzleDirectUploadRepository } from './database/direct-upload-repository.js';
import { DrizzleProcessingJobTraceWriter } from './database/processing-job-repository.js';
import { DrizzleProjectRepository } from './database/project-repository.js';
import { DrizzleReferenceImageAssetStore } from './database/reference-image-asset-store.js';
import { DrizzleSavedVideoRepository } from './database/saved-video-repository.js';
import { DrizzleSavedVoiceRepository } from './database/saved-voice-repository.js';

const r2Store = (
  config: RuntimeConfig,
  lifecycle: DrizzleAssetLifecycleRegistry,
): R2AssetByteStore => {
  if (
    config.r2AccountId === undefined ||
    config.r2AccessKeyId === undefined ||
    config.r2SecretAccessKey === undefined ||
    config.r2Bucket === undefined
  ) {
    throw new Error('R2 storage is selected but its server credentials are incomplete.');
  }
  return new R2AssetByteStore({
    accountId: config.r2AccountId,
    accessKeyId: config.r2AccessKeyId,
    secretAccessKey: config.r2SecretAccessKey,
    bucket: config.r2Bucket,
    keyPrefix: config.r2KeyPrefix,
    lifecycle,
  });
};

export const createConfiguredPersistence = async (
  config: RuntimeConfig,
): Promise<AppPersistenceDependencies | undefined> => {
  if (config.databaseMode === 'local') return undefined;
  if (config.databaseUrl === undefined) {
    throw new Error('Relational persistence requires DATABASE_URL.');
  }
  const connection = createPostgresDatabase(config.databaseUrl);
  try {
    const users = new DrizzleUserRepository(connection.db);
    await users.ensureSeededUser({
      id: config.demoUserId,
      login: config.demoUserLogin,
      displayName: config.demoUserDisplayName,
      passwordHash: config.demoUserPasswordHash,
    });
    const lifecycle = new DrizzleAssetLifecycleRegistry(connection.db);
    const localBytes = new LocalAssetByteStore(config.lightframeDataDir);
    let assetBytes: AssetByteStore;
    let directR2Storage: R2AssetByteStore | undefined;
    if (config.assetStoreProvider === 'r2') {
      const remoteBytes = r2Store(config, lifecycle);
      directR2Storage = remoteBytes;
      assetBytes =
        config.databaseMode === 'shadow'
          ? new ShadowAssetByteStore(remoteBytes, localBytes)
          : remoteBytes;
    } else {
      assetBytes = new ManagedLocalAssetByteStore(localBytes, lifecycle);
    }
    const processingJobTraces = new DrizzleProcessingJobTraceWriter(connection.db);

    if (config.databaseMode === 'shadow') {
      return {
        ...(config.assetStoreProvider === 'r2' ? { assetBytes } : {}),
        processingJobTraces,
        processingJobs: processingJobTraces,
        close: () => connection.close(),
      };
    }

    const referenceImages = new DrizzleReferenceImageAssetStore(connection.db, assetBytes);
    return {
      users,
      sessions: new DrizzleSessionRepository(connection.db),
      savedVideos: new DrizzleSavedVideoRepository(connection.db),
      assetBytes,
      savedVoices: new DrizzleSavedVoiceRepository(connection.db),
      referenceImages,
      processingJobTraces,
      processingJobs: processingJobTraces,
      projects: new DrizzleProjectRepository(connection.db),
      creativeLibraries: new DrizzleCreativeLibraryRepository(
        connection.db,
        async (ownerUserId, assetIds) => {
          await Promise.all(
            assetIds.map((assetId) => referenceImages.discardIfUnreferenced(ownerUserId, assetId)),
          );
        },
      ),
      ...(directR2Storage === undefined
        ? {}
        : {
            directVideoUploads: {
              repository: new DrizzleDirectUploadRepository(connection.db),
              storage: directR2Storage,
            },
          }),
      close: () => connection.close(),
    };
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw error;
  }
};
