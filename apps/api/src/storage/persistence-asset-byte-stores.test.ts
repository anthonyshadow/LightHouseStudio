import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { AssetByteStore, StoredAssetManifest } from './asset-byte-store.js';
import type { AssetLifecycleRegistry } from './asset-lifecycle.js';
import { ManagedLocalAssetByteStore } from './managed-asset-byte-store.js';
import { ShadowAssetByteStore } from './shadow-asset-byte-store.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const assetId = '9826fc75-4759-47cc-b07d-d7325ce0ad14';
const manifest: StoredAssetManifest = {
  schemaVersion: 1,
  assetId,
  ownerUserId,
  mimeType: 'video/mp4',
  filename: 'take.mp4',
  sizeBytes: 4,
  checksumSha256: 'a'.repeat(64),
  createdAt: '2026-08-07T12:00:00.000Z',
};
const handle = {
  manifest,
  createReadStream: () => Readable.from('data'),
};

const byteStore = (overrides: Partial<AssetByteStore> = {}): AssetByteStore => ({
  storeFile: vi.fn().mockResolvedValue(manifest),
  storeBytes: vi.fn().mockResolvedValue(manifest),
  open: vi.fn().mockResolvedValue(handle),
  exists: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const lifecycle = (overrides: Partial<AssetLifecycleRegistry> = {}): AssetLifecycleRegistry => ({
  prepare: vi.fn().mockResolvedValue(undefined),
  markReady: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
  findReady: vi.fn().mockResolvedValue({
    manifest,
    provider: 'local',
    storageKey: assetId,
    etag: null,
  }),
  markDeleting: vi.fn().mockResolvedValue(true),
  markDeleted: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('ManagedLocalAssetByteStore', () => {
  it('registers local writes and requires a ready lifecycle record for reads and deletes', async () => {
    const bytes = byteStore();
    const registry = lifecycle();
    const store = new ManagedLocalAssetByteStore(bytes, registry);

    await expect(
      store.storeFile({
        assetId,
        ownerUserId,
        sourcePath: '/private/tmp/take.mp4',
        mimeType: 'video/mp4',
        filename: 'take.mp4',
        createdAt: manifest.createdAt,
      }),
    ).resolves.toEqual(manifest);
    await expect(
      store.storeBytes({
        assetId,
        ownerUserId,
        bytes: Buffer.from('data'),
        mimeType: 'video/mp4',
        filename: 'take.mp4',
        createdAt: manifest.createdAt,
      }),
    ).resolves.toEqual(manifest);
    await expect(store.open(ownerUserId, assetId)).resolves.toEqual(handle);
    await expect(store.exists(ownerUserId, assetId)).resolves.toBe(true);
    await store.delete(ownerUserId, assetId);

    expect(registry.prepare).toHaveBeenCalledWith(manifest, {
      provider: 'local',
      storageKey: assetId,
    });
    expect(registry.markReady).toHaveBeenCalledTimes(2);
    expect(bytes.delete).toHaveBeenCalledWith(ownerUserId, assetId);
    expect(registry.markDeleted).toHaveBeenCalledWith(ownerUserId, assetId);
  });

  it('hides non-ready assets, skips an already-deleted row, and cleans bytes after registration failure', async () => {
    const registrationError = new Error('registration failed');
    const bytes = byteStore();
    const registry = lifecycle({
      prepare: vi.fn().mockRejectedValue(registrationError),
      findReady: vi.fn().mockResolvedValue(null),
      markDeleting: vi.fn().mockResolvedValue(false),
    });
    const store = new ManagedLocalAssetByteStore(bytes, registry);

    await expect(
      store.storeBytes({
        assetId,
        ownerUserId,
        bytes: Buffer.from('data'),
        mimeType: 'video/mp4',
        filename: 'take.mp4',
        createdAt: manifest.createdAt,
      }),
    ).rejects.toBe(registrationError);
    await expect(store.open(ownerUserId, assetId)).resolves.toBeNull();
    await expect(store.exists(ownerUserId, assetId)).resolves.toBe(false);
    await store.delete(ownerUserId, assetId);

    expect(bytes.delete).toHaveBeenCalledTimes(1);
    expect(registry.markFailed).toHaveBeenCalledWith(assetId);
  });
});

describe('ShadowAssetByteStore', () => {
  it('dual-writes, prefers primary reads, falls back locally, and deletes both copies', async () => {
    const primary = byteStore();
    const rollback = byteStore();
    const store = new ShadowAssetByteStore(primary, rollback);

    await expect(
      store.storeFile({
        assetId,
        ownerUserId,
        sourcePath: '/private/tmp/take.mp4',
        mimeType: 'video/mp4',
        filename: 'take.mp4',
        createdAt: manifest.createdAt,
      }),
    ).resolves.toEqual(manifest);
    await expect(
      store.storeBytes({
        assetId,
        ownerUserId,
        bytes: Buffer.from('data'),
        mimeType: 'video/mp4',
        filename: 'take.mp4',
        createdAt: manifest.createdAt,
      }),
    ).resolves.toEqual(manifest);
    await expect(store.open(ownerUserId, assetId)).resolves.toEqual(handle);
    await expect(store.exists(ownerUserId, assetId)).resolves.toBe(true);
    await store.delete(ownerUserId, assetId);

    expect(rollback.storeFile).toHaveBeenCalledOnce();
    expect(rollback.storeBytes).toHaveBeenCalledOnce();
    expect(primary.delete).toHaveBeenCalledOnce();
    expect(rollback.delete).toHaveBeenCalledOnce();

    vi.mocked(primary.open).mockResolvedValueOnce(null);
    await expect(store.open(ownerUserId, assetId)).resolves.toEqual(handle);
  });

  it('removes rollback writes when a primary write fails and surfaces either delete failure', async () => {
    const writeError = new Error('primary unavailable');
    const primary = byteStore({
      storeFile: vi.fn().mockRejectedValue(writeError),
      storeBytes: vi.fn().mockRejectedValue(writeError),
      delete: vi.fn().mockRejectedValue(new Error('delete unavailable')),
    });
    const rollback = byteStore();
    const store = new ShadowAssetByteStore(primary, rollback);
    const fileInput = {
      assetId,
      ownerUserId,
      sourcePath: '/private/tmp/take.mp4',
      mimeType: 'video/mp4' as const,
      filename: 'take.mp4',
      createdAt: manifest.createdAt,
    };

    await expect(store.storeFile(fileInput)).rejects.toBe(writeError);
    await expect(
      store.storeBytes({
        assetId,
        ownerUserId,
        bytes: Buffer.from('data'),
        mimeType: 'video/mp4',
        filename: 'take.mp4',
        createdAt: manifest.createdAt,
      }),
    ).rejects.toBe(writeError);
    expect(rollback.delete).toHaveBeenCalledTimes(2);
    await expect(store.delete(ownerUserId, assetId)).rejects.toThrow('delete unavailable');
  });
});
