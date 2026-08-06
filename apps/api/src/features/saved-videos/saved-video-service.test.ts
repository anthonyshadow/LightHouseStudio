import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { SavedVideoUploadMetadata } from '@studio/contracts';
import { LocalAssetByteStore } from '../../storage/asset-byte-store.js';
import { FileSavedVideoRepository } from './saved-video-repository.js';
import { SavedVideoService } from './saved-video-service.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const otherUserId = '9826fc75-4759-47cc-b07d-d7325ce0ad14';
const inspected = {
  mimeType: 'video/mp4' as const,
  container: 'mp4' as const,
  videoCodec: 'avc' as const,
  audioCodec: 'aac' as const,
  durationMs: 12_000,
  width: 1_280,
  height: 720,
  sizeBytes: 11,
  hasAudio: true,
};

const metadata = (override: Partial<SavedVideoUploadMetadata> = {}): SavedVideoUploadMetadata => ({
  title: '  Demo   take  ',
  origin: 'recorded',
  filename: '../unsafe name?.mp4',
  sourceVideoId: null,
  sourceVersionId: null,
  ...override,
});

describe('SavedVideoService', () => {
  let directory: string;
  let sourcePath: string;
  let repository: FileSavedVideoRepository;
  let bytes: LocalAssetByteStore;
  let service: SavedVideoService;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-saved-video-'));
    sourcePath = path.join(directory, 'upload.video');
    await writeFile(sourcePath, 'video-bytes');
    repository = new FileSavedVideoRepository(directory);
    bytes = new LocalAssetByteStore(directory);
    service = new SavedVideoService(
      repository,
      bytes,
      () => new Date('2026-08-05T12:00:00.000Z'),
      () => Promise.resolve(inspected),
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates one owned aggregate and asset for repeated idempotent saves', async () => {
    const key = crypto.randomUUID();
    const first = await service.saveNew(ownerUserId, key, sourcePath, metadata());
    const repeated = await service.saveNew(ownerUserId, key, sourcePath, metadata());

    expect(repeated).toEqual(first);
    expect(first).toMatchObject({
      title: 'Demo take',
      sourceVideoId: null,
      versionCount: 1,
      currentVersion: { filename: 'unsafe-name.mp4', origin: 'recorded' },
    });
    const aggregates = await repository.list(ownerUserId);
    expect(aggregates).toHaveLength(1);
    expect(await bytes.exists(ownerUserId, aggregates[0]!.versions[0]!.assetId)).toBe(true);
    expect(await bytes.exists(otherUserId, aggregates[0]!.versions[0]!.assetId)).toBe(false);
  });

  it('appends immutable versions only against the expected current version', async () => {
    const original = await service.saveNew(
      ownerUserId,
      crypto.randomUUID(),
      sourcePath,
      metadata(),
    );

    await expect(
      service.appendVersion(
        ownerUserId,
        original.id,
        crypto.randomUUID(),
        crypto.randomUUID(),
        sourcePath,
        metadata({ origin: 'editor' }),
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'conflict' });

    const updated = await service.appendVersion(
      ownerUserId,
      original.id,
      original.currentVersion.id,
      crypto.randomUUID(),
      sourcePath,
      metadata({ origin: 'editor' }),
    );
    expect(updated.versionCount).toBe(2);
    expect(updated.currentVersion).toMatchObject({
      ordinal: 2,
      origin: 'editor',
      sourceVersionId: original.currentVersion.id,
    });
    expect(updated.versions[0]).toEqual(original.currentVersion);
  });

  it('blocks source deletion until derived records are removed and retains bytes for Phase 2', async () => {
    const source = await service.saveNew(ownerUserId, crypto.randomUUID(), sourcePath, metadata());
    const derived = await service.saveNew(
      ownerUserId,
      crypto.randomUUID(),
      sourcePath,
      metadata({
        title: 'Derived edit',
        origin: 'editor',
        sourceVideoId: source.id,
        sourceVersionId: source.currentVersion.id,
      }),
    );
    const sourceAssetId = (await repository.get(ownerUserId, source.id))!.versions[0]!.assetId;

    await expect(service.delete(ownerUserId, source.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'conflict',
    });
    await service.delete(ownerUserId, derived.id);
    await service.delete(ownerUserId, source.id);

    expect(await repository.list(ownerUserId)).toHaveLength(0);
    expect(await bytes.exists(ownerUserId, sourceAssetId)).toBe(true);
  });

  it('returns non-enumerating wrong-owner failures and marks missing local bytes', async () => {
    const video = await service.saveNew(ownerUserId, crypto.randomUUID(), sourcePath, metadata());
    await expect(service.get(otherUserId, video.id)).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found',
    });

    const aggregate = await repository.get(ownerUserId, video.id);
    await bytes.delete(ownerUserId, aggregate!.versions[0]!.assetId);
    await expect(service.content(ownerUserId, video.id)).rejects.toMatchObject({
      statusCode: 404,
      code: 'asset_missing',
    });
    await expect(service.get(ownerUserId, video.id)).resolves.toMatchObject({ status: 'missing' });
  });

  it('stores a bounded optional thumbnail without exposing its asset key', async () => {
    const video = await service.saveNew(ownerUserId, crypto.randomUUID(), sourcePath, metadata());
    const thumbnail = await sharp({
      create: { width: 640, height: 360, channels: 3, background: '#876c52' },
    })
      .webp()
      .toBuffer();

    const updated = await service.saveThumbnail(
      ownerUserId,
      video.id,
      video.currentVersion.id,
      thumbnail,
    );
    expect(updated.thumbnailAvailable).toBe(true);
    expect(updated).not.toHaveProperty('thumbnailAssetId');
    const content = await service.thumbnail(ownerUserId, video.id);
    await expect(sharp(content.path).metadata()).resolves.toMatchObject({
      format: 'webp',
      width: 480,
      height: 270,
    });
    await expect(service.thumbnail(otherUserId, video.id)).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found',
    });
  });

  it('paginates metadata newest-first without returning media bytes', async () => {
    const first = await service.saveNew(
      ownerUserId,
      crypto.randomUUID(),
      sourcePath,
      metadata({ title: 'First' }),
    );
    const second = await service.saveNew(
      ownerUserId,
      crypto.randomUUID(),
      sourcePath,
      metadata({ title: 'Second' }),
    );

    const pageOne = await service.list(ownerUserId, undefined, 1);
    const pageTwo = await service.list(ownerUserId, pageOne.nextCursor!, 1);
    expect(new Set([pageOne.videos[0]!.id, pageTwo.videos[0]!.id])).toEqual(
      new Set([first.id, second.id]),
    );
    expect(pageOne.nextCursor).not.toBeNull();
    expect(pageTwo.nextCursor).toBeNull();
    expect(pageOne.videos[0]).not.toHaveProperty('assetId');
  });
});
