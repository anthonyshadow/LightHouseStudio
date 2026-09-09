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

/**
 * Claims a set, removes each claimed object, and settles the ones that went — answering with the
 * failures keyed by asset id and never throwing.
 *
 * A failure of the claim or of the settlement is reported against every asset asked about. For a
 * claim failure that is simply true: nothing was removed. For a settlement failure it is
 * deliberately pessimistic — some objects are gone, but the bookkeeping that would let a caller
 * forget them did not land, so their lifecycle rows are still `deleting`. Reporting those as
 * succeeded would let the caller drop its own record of them, and nothing would ever reclaim the
 * stranded rows; reporting them as failed keeps the record that a later pass retries from, and the
 * object removal is idempotent.
 *
 * Shared by the two registry-backed byte stores: only the object removal differs between them.
 */
export const settleClaimedDeletions = async (
  lifecycle: AssetLifecycleRegistry,
  ownerUserId: string,
  assetIds: readonly string[],
  provider: AssetStorageProvider,
  removeObject: (claim: AssetDeletionClaim) => Promise<unknown>,
): Promise<ReadonlyMap<string, unknown>> => {
  const requested = [...new Set(assetIds)];
  try {
    const claimed = [...(await lifecycle.claimDeletions(ownerUserId, requested, provider))];
    const removals = await Promise.allSettled(claimed.map(([, claim]) => removeObject(claim)));
    const failures = new Map<string, unknown>();
    const settled = new Map<string, AssetDeletionClaim>();
    removals.forEach((result, index) => {
      const [assetId, claim] = claimed[index]!;
      if (result.status === 'rejected') failures.set(assetId, result.reason);
      else settled.set(assetId, claim);
    });
    await lifecycle.markDeletedMany(ownerUserId, settled);
    // Keyed in the order asked, so a caller reporting "the first failure" reports the same one on
    // every run — `UPDATE ... RETURNING` does not promise an order.
    return new Map(
      requested.flatMap((assetId) =>
        failures.has(assetId) ? [[assetId, failures.get(assetId)] as const] : [],
      ),
    );
  } catch (error) {
    return new Map(requested.map((assetId) => [assetId, error]));
  }
};

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
