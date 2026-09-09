import type { StoredAssetManifest } from './asset-byte-store.js';

export interface StoredAssetLocation {
  readonly manifest: StoredAssetManifest;
  readonly provider: 'local' | 'r2';
  readonly storageKey: string;
  readonly etag: string | null;
}

export type AssetStorageProvider = StoredAssetLocation['provider'];

export interface AssetDeletionClaim {
  readonly provider: AssetStorageProvider;
  readonly storageKey: string;
}

export interface AssetLifecycleRegistry {
  prepare(
    manifest: StoredAssetManifest,
    location: Pick<StoredAssetLocation, 'provider' | 'storageKey'>,
  ): Promise<void>;
  markReady(assetId: string, etag: string | null): Promise<void>;
  markFailed(assetId: string): Promise<void>;
  findReady(ownerUserId: string, assetId: string): Promise<StoredAssetLocation | null>;
  /** Claims a ready asset or reclaims an interrupted deleting asset for idempotent cleanup. */
  claimDeletion(
    ownerUserId: string,
    assetId: string,
    expectedProvider: AssetStorageProvider,
  ): Promise<AssetDeletionClaim | null>;
  /**
   * The batch form, keyed by asset id and holding only the assets this call claimed. One lock and
   * one retention question for the whole set: a Saved Video delete or an expired-image purge hands
   * over every id it has already decided is unreferenced, and asking again per id cost a
   * transaction each.
   */
  claimDeletions(
    ownerUserId: string,
    assetIds: readonly string[],
    expectedProvider: AssetStorageProvider,
  ): Promise<ReadonlyMap<string, AssetDeletionClaim>>;
  markDeleted(ownerUserId: string, assetId: string, claim: AssetDeletionClaim): Promise<void>;
  /** The batch form of `markDeleted`, for claims taken together by `claimDeletions`. */
  markDeletedMany(
    ownerUserId: string,
    claims: ReadonlyMap<string, AssetDeletionClaim>,
  ): Promise<void>;
}
