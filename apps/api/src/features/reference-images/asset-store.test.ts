import { createHash } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalReferenceImageAssetStore } from './asset-store.js';

const assetId = '6a7b3553-1e30-42cd-a809-750ebdd04460';
const requestId = '85c85adf-bb1b-4664-bfef-5e955e67af62';
const ownerId = 'a'.repeat(64);
const otherOwnerId = 'b'.repeat(64);
const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

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
    size: '1024x1024' as const,
    width: 1024 as const,
    height: 1024 as const,
    model: 'gpt-image-2',
    quality: 'high' as const,
    originalPrompt: 'Original Lucy prompt',
    derivedPrompt: 'Reference wrapper\nOriginal Lucy prompt',
    promptAudit: {
      optimizationEnabled: true,
      result: {
        optimizedImagePrompt: 'Reference wrapper\nOriginal Lucy prompt',
        lucy25CharacterPrompt: 'Replace the character with the original Lucy character.',
        normalizedCharacterDescription: 'Original Lucy character.',
        preservedCharacterFacts: ['Original Lucy character'],
        technicalDefaultsAdded: ['Soft light'],
        warnings: [],
        recommendedSettings: {
          framing: 'head_and_shoulders' as const,
          orientation: 'square' as const,
          size: '1024x1024' as const,
          quality: 'high' as const,
          format: 'jpeg' as const,
        },
      },
      options: {
        framing: 'head_and_shoulders' as const,
        orientation: 'square' as const,
        renderingMode: 'photorealistic' as const,
        expression: 'neutral' as const,
        background: 'neutral_gray' as const,
        targetUse: 'lucy_2_5_character_reference' as const,
      },
      requestedGenerator: null,
      optimizer: { model: 'gpt-5.6', version: 'lucy-character-reference-v1' },
      inputHash: 'd'.repeat(64),
      manuallyEdited: false,
    },
    promptHash: 'c'.repeat(64),
    requestId,
    providerRequestId: 'provider-request-one',
  };

  it('atomically persists immutable bytes, versioned private metadata, and an idempotency mapping', async () => {
    const { directory, store } = await setup();
    await chmod(directory, 0o755);
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
      promptAudit: input.promptAudit,
      promptHash: input.promptHash,
      requestId,
      providerRequestId: 'provider-request-one',
      createdAt: '2026-07-18T12:00:00.000Z',
    });

    const assetDirectory = path.join(directory, 'reference-images', 'v1', 'assets', assetId);
    expect((await stat(directory)).mode & 0o777).toBe(0o755);
    expect((await stat(path.join(directory, 'reference-images'))).mode & 0o777).toBe(0o700);
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

  it('repairs malformed mappings while ignoring unrelated corrupt asset metadata', async () => {
    const { directory, store } = await setup();
    await store.store(input);
    const mappingPath = path.join(
      directory,
      'reference-images',
      'v1',
      'idempotency',
      digest(ownerId),
      `${digest(requestId)}.json`,
    );
    await writeFile(mappingPath, '{ malformed mapping');
    const corruptAsset = path.join(
      directory,
      'reference-images',
      'v1',
      'assets',
      '00000000-0000-4000-8000-000000000000',
    );
    await mkdir(corruptAsset);
    await writeFile(path.join(corruptAsset, 'metadata.json'), '{ malformed metadata');

    const restarted = new LocalReferenceImageAssetStore(directory);
    await expect(restarted.findByRequestId(ownerId, requestId)).resolves.toMatchObject({ assetId });
    expect(JSON.parse(await readFile(mappingPath, 'utf8'))).toMatchObject({ assetId, requestId });
  });

  it('propagates filesystem metadata read failures instead of treating them as corruption', async () => {
    const { directory, store } = await setup();
    await store.store(input);
    const mappingPath = path.join(
      directory,
      'reference-images',
      'v1',
      'idempotency',
      digest(ownerId),
      `${digest(requestId)}.json`,
    );
    const metadataPath = path.join(
      directory,
      'reference-images',
      'v1',
      'assets',
      assetId,
      'metadata.json',
    );
    await rm(mappingPath);
    await rm(metadataPath);
    await mkdir(metadataPath);

    const restarted = new LocalReferenceImageAssetStore(directory);

    await expect(restarted.findByRequestId(ownerId, requestId)).rejects.toMatchObject({
      name: 'ReferenceImageStorageError',
      message: 'Reference image metadata could not be read.',
    });
  });

  it('removes only stale app-owned temporary asset directories during initialization', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-assets-cleanup-'));
    directories.push(directory);
    const assetsRoot = path.join(directory, 'reference-images', 'v1', 'assets');
    const stale = path.join(assetsRoot, '.tmp-stale');
    const recent = path.join(assetsRoot, '.tmp-recent');
    await mkdir(stale, { recursive: true });
    await mkdir(recent);
    await utimes(stale, new Date('2026-07-01T00:00:00.000Z'), new Date('2026-07-01T00:00:00.000Z'));
    await utimes(
      recent,
      new Date('2026-07-18T11:30:00.000Z'),
      new Date('2026-07-18T11:30:00.000Z'),
    );
    const store = new LocalReferenceImageAssetStore(directory, {
      now: () => new Date('2026-07-18T12:00:00.000Z'),
    });

    await expect(store.findByRequestId(ownerId, requestId)).resolves.toBeNull();
    expect(await readdir(assetsRoot)).toEqual(['.tmp-recent']);
  });

  it('continues to read strict legacy v1 metadata without optimization audit fields', async () => {
    const { directory, store } = await setup();
    await store.store(input);
    const legacyAssetId = '741adf3f-e7d6-4852-8719-d264a055e9cc';
    const legacyRequestId = 'dd2b8d66-e038-4e87-886c-b827da820df3';
    const legacyBytes = Buffer.from('legacy-image-bytes');
    const assetDirectory = path.join(directory, 'reference-images', 'v1', 'assets', legacyAssetId);
    await mkdir(assetDirectory, { recursive: true });
    await writeFile(path.join(assetDirectory, 'content.jpg'), legacyBytes);
    await writeFile(
      path.join(assetDirectory, 'metadata.json'),
      JSON.stringify({
        schemaVersion: 1,
        assetId: legacyAssetId,
        localOwnerId: ownerId,
        storageKey: `reference-images/v1/assets/${legacyAssetId}/content.jpg`,
        mimeType: 'image/jpeg',
        width: 1024,
        height: 1024,
        byteSize: legacyBytes.byteLength,
        source: 'generated',
        provider: 'openai',
        model: 'gpt-image-2',
        originalPrompt: 'Legacy Lucy prompt',
        derivedPrompt: 'Legacy image prompt',
        promptHash: 'e'.repeat(64),
        requestId: legacyRequestId,
        createdAt: '2026-07-17T12:00:00.000Z',
      }),
    );

    const legacyMetadata = await store.getMetadata(ownerId, legacyAssetId);
    expect(legacyMetadata).toMatchObject({
      assetId: legacyAssetId,
      originalPrompt: 'Legacy Lucy prompt',
    });
    expect(legacyMetadata).not.toHaveProperty('size');
    expect(legacyMetadata).not.toHaveProperty('promptAudit');
    await expect(store.getContent(ownerId, legacyAssetId)).resolves.toMatchObject({
      bytes: legacyBytes,
    });
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
