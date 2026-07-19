import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalReferenceImageAssetStore } from './asset-store.js';

const assetId = '6a7b3553-1e30-42cd-a809-750ebdd04460';
const requestId = '85c85adf-bb1b-4664-bfef-5e955e67af62';
const ownerId = 'a'.repeat(64);
const otherOwnerId = 'b'.repeat(64);

describe('LocalReferenceImageAssetStore', () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
  });

  const setup = async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-assets-'));
    directories.push(directory);
    return {
      directory,
      store: new LocalReferenceImageAssetStore(directory, {
        createAssetId: () => assetId,
        now: () => new Date('2026-07-18T12:00:00.000Z'),
      }),
    };
  };

  const input = {
    localOwnerId: ownerId,
    bytes: Buffer.from('immutable-image-bytes'),
    mimeType: 'image/jpeg' as const,
    width: 1024 as const,
    height: 1024 as const,
    originalPrompt: 'Original Lucy prompt',
    derivedPrompt: 'Reference wrapper\nOriginal Lucy prompt',
    promptHash: 'c'.repeat(64),
    requestId,
    providerRequestId: 'provider-request-one',
  };

  it('atomically persists immutable bytes, versioned private metadata, and an idempotency mapping', async () => {
    const { directory, store } = await setup();
    const stored = await store.store(input);
    const replayed = await store.store(input);
    const content = await store.getContent(ownerId, assetId);

    expect(replayed).toEqual(stored);
    expect(content?.bytes).toEqual(input.bytes);
    expect(stored).toMatchObject({
      schemaVersion: 1,
      assetId,
      localOwnerId: ownerId,
      mimeType: 'image/jpeg',
      originalPrompt: input.originalPrompt,
      derivedPrompt: input.derivedPrompt,
      promptHash: input.promptHash,
      requestId,
      providerRequestId: 'provider-request-one',
      createdAt: '2026-07-18T12:00:00.000Z',
    });

    const assetDirectory = path.join(directory, 'reference-images', 'v1', 'assets', assetId);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(assetDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(assetDirectory, 'metadata.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(assetDirectory, 'content.jpg'))).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path.join(assetDirectory, 'metadata.json'), 'utf8'))).toEqual(
      stored,
    );
    expect(await readdir(path.join(directory, 'reference-images', 'v1', 'assets'))).toEqual([
      assetId,
    ]);
  });

  it('replays request IDs after a fresh store instance and isolates reads by local owner', async () => {
    const { directory, store } = await setup();
    await store.store(input);
    const restarted = new LocalReferenceImageAssetStore(directory);

    await expect(restarted.findByRequestId(ownerId, requestId)).resolves.toMatchObject({ assetId });
    await expect(restarted.getMetadata(otherOwnerId, assetId)).resolves.toBeNull();
    await expect(restarted.getContent(otherOwnerId, assetId)).resolves.toBeNull();
  });

  it('removes temporary asset directories when an atomic commit fails', async () => {
    const { directory, store } = await setup();
    const first = await store.store(input);

    await expect(
      store.store({
        ...input,
        requestId: 'c048a9a8-c04b-4d1a-a9de-37489864f659',
      }),
    ).rejects.toMatchObject({ name: 'ReferenceImageStorageError' });

    const assetsRoot = path.join(directory, 'reference-images', 'v1', 'assets');
    expect(await readdir(assetsRoot)).toEqual([assetId]);
    await expect(store.getContent(ownerId, assetId)).resolves.toMatchObject({
      metadata: first,
      bytes: input.bytes,
    });
  });
});
