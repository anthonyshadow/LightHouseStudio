import type { AssetDeletionClaim, AssetLifecycleRegistry } from './asset-lifecycle.js';
import type { AssetByteStore, AssetReadHandle, StoredAssetManifest } from './asset-byte-store.js';

/** Adds the SQL lifecycle record required by relational media references to a local byte store. */
export class ManagedLocalAssetByteStore implements AssetByteStore {
  constructor(
    private readonly bytes: AssetByteStore,
    private readonly lifecycle: AssetLifecycleRegistry,
  ) {}

  async #register(manifest: StoredAssetManifest): Promise<StoredAssetManifest> {
    try {
      await this.lifecycle.prepare(manifest, {
        provider: 'local',
        storageKey: manifest.assetId,
      });
      await this.lifecycle.markReady(manifest.assetId, null);
      return manifest;
    } catch (error) {
      await this.bytes.delete(manifest.ownerUserId, manifest.assetId).catch(() => undefined);
      await this.lifecycle.markFailed(manifest.assetId).catch(() => undefined);
      throw error;
    }
  }

  async storeFile(input: Parameters<AssetByteStore['storeFile']>[0]): Promise<StoredAssetManifest> {
    return this.#register(await this.bytes.storeFile(input));
  }

  async storeBytes(
    input: Parameters<AssetByteStore['storeBytes']>[0],
  ): Promise<StoredAssetManifest> {
    return this.#register(await this.bytes.storeBytes(input));
  }

  async open(ownerUserId: string, assetId: string): Promise<AssetReadHandle | null> {
    if ((await this.lifecycle.findReady(ownerUserId, assetId)) === null) return null;
    return this.bytes.open(ownerUserId, assetId);
  }

  async exists(ownerUserId: string, assetId: string): Promise<boolean> {
    return (await this.open(ownerUserId, assetId)) !== null;
  }

  async delete(ownerUserId: string, assetId: string): Promise<void> {
    const claim = await this.lifecycle.claimDeletion(ownerUserId, assetId, 'local');
    if (claim === null) return;
    await this.bytes.delete(ownerUserId, claim.storageKey);
    await this.lifecycle.markDeleted(ownerUserId, assetId, claim);
  }

  async deleteMany(
    ownerUserId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlyMap<string, unknown>> {
    // One claim and one settlement for the set: the lifecycle rows are what made a per-asset
    // deletion cost a transaction each, and the byte removals below are per object either way.
    const claims = await this.lifecycle.claimDeletions(ownerUserId, assetIds, 'local');
    const claimed = [...claims];
    const removals = await Promise.allSettled(
      claimed.map(([, claim]) => this.bytes.delete(ownerUserId, claim.storageKey)),
    );
    const failures = new Map<string, unknown>();
    const settled = new Map<string, AssetDeletionClaim>();
    removals.forEach((result, index) => {
      const [assetId, claim] = claimed[index]!;
      if (result.status === 'rejected') failures.set(assetId, result.reason);
      else settled.set(assetId, claim);
    });
    await this.lifecycle.markDeletedMany(ownerUserId, settled);
    return failures;
  }
}
