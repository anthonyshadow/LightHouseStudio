import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalAssetByteStore } from './asset-byte-store.js';

describe('LocalAssetByteStore', () => {
  it('normalizes a legacy media manifest timestamp atomically on read', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-assets-'));
    const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
    const assetId = '9826fc75-4759-47cc-b07d-d7325ce0ad14';
    const directory = path.join(root, 'media', 'v1', 'assets', assetId);
    const manifestPath = path.join(directory, 'manifest.json');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'content.mp4'), 'data');
    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 1,
        assetId,
        ownerUserId,
        mimeType: 'video/mp4',
        filename: 'take.mp4',
        sizeBytes: 4,
        checksumSha256: 'a'.repeat(64),
        createdAt: '2026-08-07 12:00:00+00',
      }),
    );

    try {
      const asset = await new LocalAssetByteStore(root).open(ownerUserId, assetId);
      expect(asset?.manifest.createdAt).toBe('2026-08-07T12:00:00.000Z');
      await expect(readFile(manifestPath, 'utf8')).resolves.toContain(
        '"createdAt":"2026-08-07T12:00:00.000Z"',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
