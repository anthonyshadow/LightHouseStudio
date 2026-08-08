import type { AssetLifecycleRegistry } from './asset-lifecycle.js';
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
    if (!(await this.lifecycle.markDeleting(ownerUserId, assetId))) return;
    await this.bytes.delete(ownerUserId, assetId);
    await this.lifecycle.markDeleted(ownerUserId, assetId);
  }
}
