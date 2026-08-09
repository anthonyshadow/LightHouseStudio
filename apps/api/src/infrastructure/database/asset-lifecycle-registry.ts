import { and, eq, inArray } from 'drizzle-orm';
import { toIsoTimestamp } from '../../application/timestamps.js';
import type {
  AssetDeletionClaim,
  AssetLifecycleRegistry,
  AssetStorageProvider,
  StoredAssetLocation,
} from '../../storage/asset-lifecycle.js';
import type { StoredAssetManifest } from '../../storage/asset-byte-store.js';
import type { LightframeDatabase } from './client.js';
import { mediaAssets } from './schema.js';

export class DrizzleAssetLifecycleRegistry implements AssetLifecycleRegistry {
  constructor(private readonly db: LightframeDatabase) {}

  async prepare(
    manifest: StoredAssetManifest,
    location: Pick<StoredAssetLocation, 'provider' | 'storageKey'>,
  ): Promise<void> {
    await this.db
      .insert(mediaAssets)
      .values({
        id: manifest.assetId,
        ownerUserId: manifest.ownerUserId,
        storageProvider: location.provider,
        storageKey: location.storageKey,
        status: 'pending',
        mimeType: manifest.mimeType,
        filename: manifest.filename,
        sizeBytes: manifest.sizeBytes,
        checksumSha256: manifest.checksumSha256,
        etag: null,
        deletedAt: null,
        createdAt: toIsoTimestamp(manifest.createdAt),
        updatedAt: toIsoTimestamp(manifest.createdAt),
      })
      .onConflictDoNothing({ target: mediaAssets.id });
  }

  async markReady(assetId: string, etag: string | null): Promise<void> {
    await this.db
      .update(mediaAssets)
      .set({ status: 'ready', etag, updatedAt: new Date().toISOString() })
      .where(eq(mediaAssets.id, assetId));
  }

  async markFailed(assetId: string): Promise<void> {
    await this.db
      .update(mediaAssets)
      .set({ status: 'failed', updatedAt: new Date().toISOString() })
      .where(eq(mediaAssets.id, assetId));
  }

  async findReady(ownerUserId: string, assetId: string): Promise<StoredAssetLocation | null> {
    const [row] = await this.db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, assetId),
          eq(mediaAssets.ownerUserId, ownerUserId),
          eq(mediaAssets.status, 'ready'),
        ),
      )
      .limit(1);
    return row === undefined
      ? null
      : {
          manifest: {
            schemaVersion: 1,
            assetId: row.id,
            ownerUserId: row.ownerUserId,
            mimeType: row.mimeType,
            filename: row.filename,
            sizeBytes: row.sizeBytes,
            checksumSha256: row.checksumSha256,
            createdAt: toIsoTimestamp(row.createdAt),
          },
          provider: row.storageProvider,
          storageKey: row.storageKey,
          etag: row.etag,
        };
  }

  async claimDeletion(
    ownerUserId: string,
    assetId: string,
    expectedProvider: AssetStorageProvider,
  ): Promise<AssetDeletionClaim | null> {
    const [row] = await this.db
      .update(mediaAssets)
      .set({ status: 'deleting', updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(mediaAssets.id, assetId),
          eq(mediaAssets.ownerUserId, ownerUserId),
          eq(mediaAssets.storageProvider, expectedProvider),
          inArray(mediaAssets.status, ['ready', 'deleting']),
        ),
      )
      .returning({
        provider: mediaAssets.storageProvider,
        storageKey: mediaAssets.storageKey,
      });
    return row ?? null;
  }

  async markDeleted(
    ownerUserId: string,
    assetId: string,
    claim: AssetDeletionClaim,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(mediaAssets)
      .set({ status: 'deleted', deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(mediaAssets.id, assetId),
          eq(mediaAssets.ownerUserId, ownerUserId),
          eq(mediaAssets.storageProvider, claim.provider),
          eq(mediaAssets.storageKey, claim.storageKey),
          eq(mediaAssets.status, 'deleting'),
        ),
      );
  }
}
