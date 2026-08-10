import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import { loadSelectedEnvironmentFile } from '../src/config/environment-file.js';
import { parseEnvironment, resolveLightframeDataDirectory } from '../src/config/environment.js';
import { LocalReferenceImageAssetStore } from '../src/features/reference-images/asset-store.js';
import { FileSavedVideoRepository } from '../src/features/saved-videos/saved-video-repository.js';
import { FileSavedVoiceRepository } from '../src/features/voices/saved-voice-repository.js';
import type { AssetByteStore, StoredAssetManifest } from '../src/storage/asset-byte-store.js';
import { LocalAssetByteStore } from '../src/storage/asset-byte-store.js';
import { ManagedLocalAssetByteStore } from '../src/storage/managed-asset-byte-store.js';
import { R2AssetByteStore } from '../src/storage/r2-asset-byte-store.js';
import { DrizzleAssetLifecycleRegistry } from '../src/infrastructure/database/asset-lifecycle-registry.js';
import { DrizzleUserRepository } from '../src/infrastructure/database/auth-repositories.js';
import { createPostgresDatabase } from '../src/infrastructure/database/client.js';
import { DrizzleReferenceImageAssetStore } from '../src/infrastructure/database/reference-image-asset-store.js';
import { DrizzleSavedVideoRepository } from '../src/infrastructure/database/saved-video-repository.js';
import { DrizzleSavedVoiceRepository } from '../src/infrastructure/database/saved-voice-repository.js';

loadSelectedEnvironmentFile({
  repositoryRoot: fileURLToPath(new URL('../../../', import.meta.url)),
  environment: process.env,
  load: (path, environment) =>
    loadEnvironment({ path, processEnv: environment, quiet: true, override: false }),
});

const apply = process.argv.includes('--apply');
const parsed = parseEnvironment(process.env);
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const dataDirectory = resolveLightframeDataDirectory(parsed.lightframeDataDir, {
  repositoryRoot,
  apiRoot,
  pathExists: existsSync,
}).path;
const config = { ...parsed, lightframeDataDir: dataDirectory };
const ownerUserId = config.demoUserId;

const localVideos = new FileSavedVideoRepository(dataDirectory);
const localVoices = new FileSavedVoiceRepository(dataDirectory);
const localReferences = new LocalReferenceImageAssetStore(dataDirectory, {
  legacyOwnerUserId: ownerUserId,
});
const localBytes = new LocalAssetByteStore(dataDirectory);

const [videos, voices, references] = await Promise.all([
  localVideos.list(ownerUserId),
  localVoices.list(ownerUserId),
  localReferences.listMetadata(ownerUserId),
]);
const assetIds = new Set<string>();
for (const aggregate of videos) {
  for (const version of aggregate.versions) {
    assetIds.add(version.assetId);
    if (version.thumbnailAssetId !== null) assetIds.add(version.thumbnailAssetId);
  }
}
let missingSavedVideoAssets = 0;
let savedVideoBytes = 0;
for (const assetId of assetIds) {
  const asset = await localBytes.open(ownerUserId, assetId);
  if (asset === null) missingSavedVideoAssets += 1;
  else savedVideoBytes += asset.manifest.sizeBytes;
}

const inventory = {
  mode: apply ? 'apply' : 'dry-run',
  ownerUserId,
  savedVideos: videos.length,
  savedVideoVersions: videos.reduce((total, video) => total + video.versions.length, 0),
  savedVideoAssets: assetIds.size,
  savedVideoBytes,
  missingSavedVideoAssets,
  savedVoices: voices.length,
  referenceImages: references.length,
  referenceImageBytes: references.reduce((total, reference) => total + reference.byteSize, 0),
};
console.log(JSON.stringify({ stage: 'inventory', ...inventory }));

if (!apply) process.exit(0);
if (missingSavedVideoAssets > 0) {
  throw new Error('Backfill stopped because saved-video assets are missing locally.');
}
if (config.databaseMode === 'local' || config.databaseUrl === undefined) {
  throw new Error(
    'Use DATABASE_MODE=shadow, postgres, or neon and set DATABASE_URL before --apply.',
  );
}

const connection = createPostgresDatabase(config.databaseUrl);
try {
  const users = new DrizzleUserRepository(connection.db);
  await users.ensureSeededUser({
    id: ownerUserId,
    login: config.demoUserLogin,
    displayName: config.demoUserDisplayName,
    passwordHash: config.demoUserPasswordHash,
  });
  const lifecycle = new DrizzleAssetLifecycleRegistry(connection.db);
  let targetBytes: AssetByteStore;
  if (config.assetStoreProvider === 'r2') {
    if (
      config.r2AccountId === undefined ||
      config.r2AccessKeyId === undefined ||
      config.r2SecretAccessKey === undefined ||
      config.r2Bucket === undefined
    ) {
      throw new Error('R2 credentials are incomplete.');
    }
    targetBytes = new R2AssetByteStore({
      accountId: config.r2AccountId,
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
      bucket: config.r2Bucket,
      keyPrefix: config.r2KeyPrefix,
      lifecycle,
    });
  } else {
    targetBytes = new ManagedLocalAssetByteStore(localBytes, lifecycle);
  }

  const registerSavedVideoAsset = async (manifest: StoredAssetManifest): Promise<void> => {
    const existing = await lifecycle.findReady(ownerUserId, manifest.assetId);
    if (existing !== null) {
      if (
        existing.manifest.checksumSha256 !== manifest.checksumSha256 ||
        existing.manifest.sizeBytes !== manifest.sizeBytes
      ) {
        throw new Error('A target media asset conflicts with the local checksum.');
      }
      return;
    }
    if (config.assetStoreProvider === 'local') {
      await lifecycle.prepare(manifest, { provider: 'local', storageKey: manifest.assetId });
      await lifecycle.markReady(manifest.assetId, null);
      return;
    }
    if (targetBytes.storeStream === undefined) {
      throw new Error('The selected target does not support streaming backfill.');
    }
    const source = await localBytes.open(ownerUserId, manifest.assetId);
    if (source === null) throw new Error('A saved-video asset disappeared during backfill.');
    await targetBytes.storeStream({
      ...manifest,
      createReadStream: () => source.createReadStream(),
    });
  };

  for (const assetId of assetIds) {
    const asset = await localBytes.open(ownerUserId, assetId);
    if (asset === null) throw new Error('A saved-video asset disappeared during backfill.');
    await registerSavedVideoAsset(asset.manifest);
  }

  const targetVideos = new DrizzleSavedVideoRepository(connection.db);
  for (const aggregate of videos) {
    const ordered = [...aggregate.versions].sort((left, right) => left.ordinal - right.ordinal);
    const first = ordered[0];
    const last = ordered.at(-1);
    if (first === undefined || last?.id !== aggregate.video.currentVersionId) {
      throw new Error('A local saved-video aggregate has inconsistent version ordering.');
    }
    const existing = await targetVideos.get(ownerUserId, aggregate.video.id);
    if (existing !== null) {
      if (
        existing.video.currentVersionId !== aggregate.video.currentVersionId ||
        existing.versions.length !== aggregate.versions.length
      ) {
        throw new Error('A target saved-video aggregate conflicts with local metadata.');
      }
      continue;
    }
    let current = await targetVideos.create(
      ownerUserId,
      {
        video: {
          ...aggregate.video,
          currentVersionId: first.id,
          status: 'ready',
          updatedAt: first.createdAt,
          deletedAt: null,
        },
        versions: [first],
        revision: 1,
      },
      {
        idempotencyKey: aggregate.video.id,
        videoId: aggregate.video.id,
        versionId: first.id,
        createdAt: first.createdAt,
      },
    );
    for (const version of ordered.slice(1)) {
      const appended = await targetVideos.append(
        ownerUserId,
        aggregate.video.id,
        current.video.currentVersionId,
        version,
        {
          idempotencyKey: version.id,
          videoId: aggregate.video.id,
          versionId: version.id,
          createdAt: version.createdAt,
        },
      );
      if (typeof appended === 'string') {
        throw new Error('A saved-video version could not be backfilled transactionally.');
      }
      current = appended;
    }
  }

  const targetVoices = new DrizzleSavedVoiceRepository(connection.db);
  await targetVoices.completeMigration(
    ownerUserId,
    voices.map((voice) => ({
      voiceId: voice.providerVoiceId,
      publicOwnerId: voice.publicOwnerId,
    })),
    new Date().toISOString(),
  );

  const targetReferences = new DrizzleReferenceImageAssetStore(connection.db, targetBytes);
  for (const metadata of references) {
    const content = await localReferences.getContent(ownerUserId, metadata.assetId);
    if (content === null) throw new Error('A reference image disappeared during backfill.');
    await targetReferences.importExisting(metadata, content.bytes);
  }

  const [verifiedVideos, verifiedVoices] = await Promise.all([
    targetVideos.list(ownerUserId),
    targetVoices.list(ownerUserId),
  ]);
  console.log(
    JSON.stringify({
      stage: 'verified',
      savedVideos: verifiedVideos.length,
      savedVideoVersions: verifiedVideos.reduce((total, video) => total + video.versions.length, 0),
      savedVoices: verifiedVoices.length,
      referenceImages: references.length,
    }),
  );
} finally {
  await connection.close();
}
