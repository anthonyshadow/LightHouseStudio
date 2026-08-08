import type { StoredAssetManifest } from './asset-byte-store.js';

export interface StoredAssetLocation {
  readonly manifest: StoredAssetManifest;
  readonly provider: 'local' | 'r2';
  readonly storageKey: string;
  readonly etag: string | null;
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
  markDeleting(ownerUserId: string, assetId: string): Promise<boolean>;
  markDeleted(ownerUserId: string, assetId: string): Promise<void>;
}
