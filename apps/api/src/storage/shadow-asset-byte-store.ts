import type { AssetByteStore, AssetReadHandle, StoredAssetManifest } from './asset-byte-store.js';

/**
 * Transitional R2 cutover adapter: new writes must reach both stores; reads prefer R2 and retain
 * verified local fallback. It is intentionally removed after reconciliation and the rollback window.
 */
export class ShadowAssetByteStore implements AssetByteStore {
  constructor(
    private readonly primary: AssetByteStore,
    private readonly rollback: AssetByteStore,
  ) {}

  async storeFile(input: Parameters<AssetByteStore['storeFile']>[0]): Promise<StoredAssetManifest> {
    await this.rollback.storeFile(input);
    try {
      return await this.primary.storeFile(input);
    } catch (error) {
      await this.rollback.delete(input.ownerUserId, input.assetId).catch(() => undefined);
      throw error;
    }
  }

  async storeBytes(
    input: Parameters<AssetByteStore['storeBytes']>[0],
  ): Promise<StoredAssetManifest> {
    await this.rollback.storeBytes(input);
    try {
      return await this.primary.storeBytes(input);
    } catch (error) {
      await this.rollback.delete(input.ownerUserId, input.assetId).catch(() => undefined);
      throw error;
    }
  }

  async open(ownerUserId: string, assetId: string): Promise<AssetReadHandle | null> {
    return (
      (await this.primary.open(ownerUserId, assetId)) ??
      (await this.rollback.open(ownerUserId, assetId))
    );
  }

  async exists(ownerUserId: string, assetId: string): Promise<boolean> {
    return (await this.open(ownerUserId, assetId)) !== null;
  }

  async delete(ownerUserId: string, assetId: string): Promise<void> {
    const results = await Promise.allSettled([
      this.primary.delete(ownerUserId, assetId),
      this.rollback.delete(ownerUserId, assetId),
    ]);
    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed !== undefined) throw failed.reason;
  }
}
