import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StoredSavedVideoAggregate } from '../../features/saved-videos/saved-video-repository.js';
import { createPostgresDatabase, type DatabaseConnection } from './client.js';
import { DrizzleSavedVideoRepository } from './saved-video-repository.js';
import { mediaAssets, savedVideoReceipts, savedVideos, users, videoVersions } from './schema.js';

const databaseUrl =
  process.env.LIGHTFRAME_PROJECT_TEST_DATABASE_URL ??
  (process.env.CI === 'true' || process.env.LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST === 'true'
    ? process.env.DATABASE_URL
    : undefined);

const now = '2026-08-11T15:00:00.000Z';

describe.runIf(databaseUrl !== undefined)('Saved video repository PostgreSQL invariants', () => {
  let connection: DatabaseConnection;

  beforeAll(() => {
    connection = createPostgresDatabase(databaseUrl!);
  });

  afterAll(async () => {
    await connection.close();
  });

  /** A ready `media_assets` row, because `thumbnail_asset_id` is a restricted foreign key. */
  const storedAsset = async (ownerUserId: string, mimeType: string): Promise<string> => {
    const assetId = randomUUID();
    await connection.db.insert(mediaAssets).values({
      id: assetId,
      ownerUserId,
      storageProvider: 'local',
      storageKey: assetId,
      status: 'ready',
      mimeType,
      filename: mimeType === 'video/mp4' ? 'take.mp4' : 'poster.jpg',
      sizeBytes: 11,
      checksumSha256: 'a'.repeat(64),
      etag: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return assetId;
  };

  const seed = async (ownerUserId: string) => {
    await connection.db.insert(users).values({
      id: ownerUserId,
      login: `${ownerUserId}@video.test`,
      normalizedLogin: `${ownerUserId}@video.test`,
      username: `v-${ownerUserId}`,
      email: `${ownerUserId}@video.test`,
      displayName: 'Video owner',
    });
    const assetId = await storedAsset(ownerUserId, 'video/mp4');
    const videoId = randomUUID();
    const versionId = randomUUID();
    const aggregate: StoredSavedVideoAggregate = {
      video: {
        id: videoId,
        ownerUserId,
        title: 'Poster subject',
        currentVersionId: versionId,
        sourceVideoId: null,
        status: 'ready',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      versions: [
        {
          id: versionId,
          videoId,
          ownerUserId,
          ordinal: 1,
          origin: 'recorded',
          characterName: null,
          characterVariantName: null,
          sourceVersionId: null,
          assetId,
          thumbnailAssetId: null,
          mimeType: 'video/mp4',
          filename: 'take.mp4',
          sizeBytes: 11,
          durationMs: 1_000,
          width: 1_280,
          height: 720,
          exportSpecification: null,
          variantSetId: null,
          createdAt: now,
        },
      ],
      revision: 1,
    };
    const repository = new DrizzleSavedVideoRepository(connection.db);
    await repository.create(ownerUserId, aggregate, {
      idempotencyKey: randomUUID(),
      videoId,
      versionId,
      createdAt: now,
    });
    return { repository, videoId, versionId };
  };

  const cleanUp = async (ownerUserId: string) => {
    await connection.db
      .delete(savedVideoReceipts)
      .where(eq(savedVideoReceipts.ownerUserId, ownerUserId));
    await connection.db.delete(videoVersions).where(eq(videoVersions.ownerUserId, ownerUserId));
    await connection.db.delete(savedVideos).where(eq(savedVideos.ownerUserId, ownerUserId));
    await connection.db.delete(mediaAssets).where(eq(mediaAssets.ownerUserId, ownerUserId));
    await connection.db.delete(users).where(eq(users.id, ownerUserId));
  };

  it('lets only the first poster win, so the loser can reclaim its bytes', async () => {
    const ownerUserId = randomUUID();
    try {
      const { repository, videoId, versionId } = await seed(ownerUserId);
      const first = await storedAsset(ownerUserId, 'image/jpeg');
      const second = await storedAsset(ownerUserId, 'image/jpeg');

      await expect(
        repository.setThumbnail(ownerUserId, videoId, versionId, first, now),
      ).resolves.toMatchObject({ versions: [{ thumbnailAssetId: first }] });

      // Unchanged, and still naming the first asset — so the second caller knows its own bytes
      // are referenced by nothing and deletes them, rather than leaving them to leak.
      await expect(
        repository.setThumbnail(ownerUserId, videoId, versionId, second, now),
      ).resolves.toMatchObject({ versions: [{ thumbnailAssetId: first }] });
    } finally {
      await cleanUp(ownerUserId);
    }
  });

  it('refuses a poster for a Version the video does not have', async () => {
    const ownerUserId = randomUUID();
    try {
      const { repository, videoId } = await seed(ownerUserId);

      // A live video, so the parent lock is taken and the refusal comes from the Version row —
      // the branch the unit test reaches only through an absent video.
      await expect(
        repository.setThumbnail(
          ownerUserId,
          videoId,
          randomUUID(),
          await storedAsset(ownerUserId, 'image/jpeg'),
          now,
        ),
      ).resolves.toBeNull();
    } finally {
      await cleanUp(ownerUserId);
    }
  });

  it('refuses a poster for a video that has been deleted', async () => {
    const ownerUserId = randomUUID();
    try {
      const { repository, videoId, versionId } = await seed(ownerUserId);
      await repository.delete(ownerUserId, videoId, now);

      // A Version row carries no tombstone of its own, so without the live-parent guard this
      // wrote a poster onto a deleted video and the service then deleted the bytes it named.
      await expect(
        repository.setThumbnail(
          ownerUserId,
          videoId,
          versionId,
          await storedAsset(ownerUserId, 'image/jpeg'),
          now,
        ),
      ).resolves.toBeNull();
      const [version] = await connection.db
        .select({ thumbnailAssetId: videoVersions.thumbnailAssetId })
        .from(videoVersions)
        .where(eq(videoVersions.id, versionId));
      expect(version?.thumbnailAssetId).toBeNull();
    } finally {
      await cleanUp(ownerUserId);
    }
  });
});
