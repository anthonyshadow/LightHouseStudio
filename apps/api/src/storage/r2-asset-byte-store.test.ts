import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import type { AssetLifecycleRegistry, StoredAssetLocation } from './asset-lifecycle.js';
import type { StoredAssetManifest } from './asset-byte-store.js';
import { R2AssetByteStore } from './r2-asset-byte-store.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const assetId = 'f7c32ea0-b108-4e21-93ab-b376106605bb';

class MemoryLifecycle implements AssetLifecycleRegistry {
  location: StoredAssetLocation | null = null;
  deleting = false;

  prepare(
    manifest: StoredAssetManifest,
    location: Pick<StoredAssetLocation, 'provider' | 'storageKey'>,
  ): Promise<void> {
    this.location = { manifest, ...location, etag: null };
    return Promise.resolve();
  }
  markReady(_assetId: string, etag: string | null): Promise<void> {
    if (this.location !== null) this.location = { ...this.location, etag };
    return Promise.resolve();
  }
  markFailed(): Promise<void> {
    return Promise.resolve();
  }
  findReady(requestOwner: string, requestAssetId: string): Promise<StoredAssetLocation | null> {
    return Promise.resolve(
      this.location?.manifest.ownerUserId === requestOwner &&
        this.location.manifest.assetId === requestAssetId
        ? this.location
        : null,
    );
  }
  markDeleting(): Promise<boolean> {
    this.deleting = true;
    return Promise.resolve(true);
  }
  markDeleted(): Promise<void> {
    this.location = null;
    return Promise.resolve();
  }
}

describe('R2AssetByteStore', () => {
  it('uses opaque keys, registers the asset, supports range reads, and tombstones deletion', async () => {
    const payload = Buffer.from('private-video-bytes');
    let metadata: Record<string, string> = {};
    let contentType = '';
    let key = '';
    let requestedRange: string | undefined;
    const send = vi.fn((command: unknown): Promise<unknown> => {
      if (command instanceof PutObjectCommand) {
        metadata = command.input.Metadata ?? {};
        contentType = command.input.ContentType ?? '';
        key = command.input.Key ?? '';
        return Promise.resolve({ ETag: '"opaque-etag"' });
      }
      if (command instanceof HeadObjectCommand) {
        return Promise.resolve({
          Metadata: metadata,
          ContentLength: payload.byteLength,
          ContentType: contentType,
          ETag: '"opaque-etag"',
        });
      }
      if (command instanceof GetObjectCommand) {
        requestedRange = command.input.Range;
        return Promise.resolve({ Body: Readable.from(payload.subarray(2, 8)) });
      }
      if (command instanceof DeleteObjectCommand) return Promise.resolve({});
      throw new Error('Unexpected R2 command.');
    });
    const lifecycle = new MemoryLifecycle();
    const store = new R2AssetByteStore({
      accountId: '0123456789abcdef0123456789abcdef',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      bucket: 'private-assets',
      client: { send } as unknown as S3Client,
      lifecycle,
    });

    await store.storeBytes({
      assetId,
      ownerUserId,
      bytes: payload,
      mimeType: 'video/mp4',
      filename: 'creator title.mp4',
      createdAt: '2026-08-07T20:00:00.000Z',
    });

    expect(key).toBe(`media/v1/${assetId.slice(0, 2)}/${assetId}`);
    expect(key).not.toContain('creator');
    expect(key).not.toContain(ownerUserId);
    expect(lifecycle.location).toMatchObject({
      provider: 'r2',
      storageKey: key,
      etag: '"opaque-etag"',
    });

    const asset = await store.open(ownerUserId, assetId);
    expect(asset?.manifest).toMatchObject({ assetId, ownerUserId, sizeBytes: payload.byteLength });
    expect(await buffer(asset!.createReadStream({ start: 2, end: 7 }))).toEqual(
      payload.subarray(2, 8),
    );
    expect(requestedRange).toBe('bytes=2-7');

    await store.delete(ownerUserId, assetId);
    expect(lifecycle.deleting).toBe(true);
    expect(lifecycle.location).toBeNull();
    expect(send.mock.calls.some(([command]) => command instanceof DeleteObjectCommand)).toBe(true);
  });

  it('does not reveal an owned object when the database lifecycle record is absent', async () => {
    const send = vi.fn();
    const store = new R2AssetByteStore({
      accountId: '0123456789abcdef0123456789abcdef',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      bucket: 'private-assets',
      client: { send } as unknown as S3Client,
      lifecycle: new MemoryLifecycle(),
    });

    await expect(store.open(ownerUserId, assetId)).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
