import { and, asc, eq, inArray, or } from 'drizzle-orm';
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
import type { DrizzleProjectRetentionPolicy } from './project-retention-policy.js';

export class DrizzleAssetLifecycleRegistry implements AssetLifecycleRegistry {
  constructor(
    private readonly db: LightframeDatabase,
    private readonly projectRetention?: Pick<DrizzleProjectRetentionPolicy, 'retainedAssetIdsWith'>,
  ) {}

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
    return (
      (await this.claimDeletions(ownerUserId, [assetId], expectedProvider)).get(assetId) ?? null
    );
  }

  async claimDeletions(
    ownerUserId: string,
    assetIds: readonly string[],
    expectedProvider: AssetStorageProvider,
  ): Promise<ReadonlyMap<string, AssetDeletionClaim>> {
    const requested = [...new Set(assetIds)];
    if (requested.length === 0) return new Map();
    return this.db.transaction(async (tx) => {
      const claimable = and(
        eq(mediaAssets.ownerUserId, ownerUserId),
        eq(mediaAssets.storageProvider, expectedProvider),
        inArray(mediaAssets.status, ['ready', 'deleting']),
      );
      const candidates = await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(and(inArray(mediaAssets.id, requested), claimable))
        // Ordered so two overlapping batches take the same row locks in the same order.
        .orderBy(asc(mediaAssets.id))
        .for('update');
      const candidateIds = candidates.map(({ id }) => id);
      const retained =
        (await this.projectRetention?.retainedAssetIdsWith(tx, ownerUserId, candidateIds)) ??
        new Set<string>();
      const deletable = candidateIds.filter((id) => !retained.has(id));
      if (deletable.length === 0) return new Map();
      const rows = await tx
        .update(mediaAssets)
        .set({ status: 'deleting', updatedAt: new Date().toISOString() })
        .where(and(inArray(mediaAssets.id, deletable), claimable))
        .returning({
          id: mediaAssets.id,
          provider: mediaAssets.storageProvider,
          storageKey: mediaAssets.storageKey,
        });
      return new Map(rows.map(({ id, provider, storageKey }) => [id, { provider, storageKey }]));
    });
  }

  async markDeleted(
    ownerUserId: string,
    assetId: string,
    claim: AssetDeletionClaim,
  ): Promise<void> {
    await this.markDeletedMany(ownerUserId, new Map([[assetId, claim]]));
  }

  async markDeletedMany(
    ownerUserId: string,
    claims: ReadonlyMap<string, AssetDeletionClaim>,
  ): Promise<void> {
    if (claims.size === 0) return;
    const now = new Date().toISOString();
    // One statement, but still matched per asset on the provider and key the claim was taken
    // against: a row whose storage moved since the claim is not the row this deletion settled.
    await this.db
      .update(mediaAssets)
      .set({ status: 'deleted', deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(mediaAssets.ownerUserId, ownerUserId),
          eq(mediaAssets.status, 'deleting'),
          or(
            ...[...claims].map(([assetId, claim]) =>
              and(
                eq(mediaAssets.id, assetId),
                eq(mediaAssets.storageProvider, claim.provider),
                eq(mediaAssets.storageKey, claim.storageKey),
              ),
            ),
          ),
        ),
      );
  }
}
