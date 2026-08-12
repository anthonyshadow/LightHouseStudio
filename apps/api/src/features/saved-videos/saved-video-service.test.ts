import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { SavedVideoUploadMetadata } from '@studio/contracts';
import { LocalAssetByteStore } from '../../storage/asset-byte-store.js';
import { FileSavedVideoRepository, type SavedVideoRepository } from './saved-video-repository.js';
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

const readAsset = async (asset: Awaited<ReturnType<SavedVideoService['thumbnail']>>['asset']) => {
  const chunks: Buffer[] = [];
  for await (const chunk of asset.createReadStream()) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
};

const metadata = (override: Partial<SavedVideoUploadMetadata> = {}): SavedVideoUploadMetadata => ({
  title: '  Demo   take  ',
  origin: 'recorded',
  characterName: null,
  characterVariantName: null,
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
    service = new SavedVideoService(repository, bytes, {
      now: () => new Date('2026-08-05T12:00:00.000Z'),
      inspect: () => Promise.resolve(inspected),
      deleteStoredAssetsOnManualDelete: true,
    });
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
      currentVersion: {
        filename: 'unsafe-name.mp4',
        origin: 'recorded',
        characterName: null,
      },
    });
    const aggregates = await repository.list(ownerUserId);
    expect(aggregates).toHaveLength(1);
    expect(await bytes.exists(ownerUserId, aggregates[0]!.versions[0]!.assetId)).toBe(true);
    expect(await bytes.exists(otherUserId, aggregates[0]!.versions[0]!.assetId)).toBe(false);
  });

  it('rounds inspected fractional milliseconds before persistence', async () => {
    service = new SavedVideoService(repository, bytes, {
      now: () => new Date('2026-08-05T12:00:00.000Z'),
      inspect: () => Promise.resolve({ ...inspected, durationMs: 5_034.666_666_666_666 }),
      deleteStoredAssetsOnManualDelete: true,
    });

    const saved = await service.saveNew(ownerUserId, crypto.randomUUID(), sourcePath, metadata());

    expect(saved.currentVersion.durationMs).toBe(5_035);
    await expect(repository.get(ownerUserId, saved.id)).resolves.toMatchObject({
      versions: [{ durationMs: 5_035 }],
    });
  });

  it('removes the losing asset when idempotent saves race', async () => {
    const key = crypto.randomUUID();
    const [first, second] = await Promise.all([
      service.saveNew(ownerUserId, key, sourcePath, metadata()),
      service.saveNew(ownerUserId, key, sourcePath, metadata()),
    ]);

    expect(second).toEqual(first);
    expect(await readdir(path.join(directory, 'media', 'v1', 'assets'))).toHaveLength(1);
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

  it('deletes a source and its unshared stored bytes while retaining its derived record', async () => {
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

    await service.delete(ownerUserId, source.id);

    expect(await repository.list(ownerUserId)).toMatchObject([
      {
        video: {
          id: derived.id,
          sourceVideoId: source.id,
          status: 'ready',
          deletedAt: null,
        },
      },
    ]);
    await expect(service.content(ownerUserId, derived.id)).resolves.toMatchObject({
      video: { id: derived.id, sourceVideoId: source.id },
    });
    expect(await bytes.exists(ownerUserId, sourceAssetId)).toBe(false);

    await service.delete(ownerUserId, derived.id);
    expect(await repository.list(ownerUserId)).toHaveLength(0);
  });

  it('deletes every unshared video-version and thumbnail asset for a cloud-backed record', async () => {
    const first = await service.saveNew(ownerUserId, crypto.randomUUID(), sourcePath, metadata());
    const thumbnail = await sharp({
      create: { width: 640, height: 360, channels: 3, background: '#876c52' },
    })
      .webp()
      .toBuffer();
    await service.saveThumbnail(ownerUserId, first.id, first.currentVersion.id, thumbnail);
    const second = await service.appendVersion(
      ownerUserId,
      first.id,
      first.currentVersion.id,
      crypto.randomUUID(),
      sourcePath,
      metadata({ origin: 'editor', sourceVersionId: first.currentVersion.id }),
    );
    await service.saveThumbnail(ownerUserId, first.id, second.currentVersion.id, thumbnail);
    const aggregate = await repository.get(ownerUserId, first.id);
    const assetIds = aggregate!.versions.flatMap((version) => [
      version.assetId,
      version.thumbnailAssetId!,
    ]);

    await service.delete(ownerUserId, first.id);

    await Promise.all(
      assetIds.map(async (assetId) => {
        expect(await bytes.exists(ownerUserId, assetId)).toBe(false);
      }),
    );
  });

  it('keeps a stored object until the last saved-video relationship is deleted', async () => {
    const first = await service.saveNew(ownerUserId, crypto.randomUUID(), sourcePath, metadata());
    const firstAggregate = (await repository.get(ownerUserId, first.id))!;
    const sharedVideoId = crypto.randomUUID();
    const sharedVersionId = crypto.randomUUID();
    const shared = {
      video: {
        ...firstAggregate.video,
        id: sharedVideoId,
        currentVersionId: sharedVersionId,
        title: 'Shared bytes',
      },
      versions: [
        {
          ...firstAggregate.versions[0]!,
          id: sharedVersionId,
          videoId: sharedVideoId,
        },
      ],
      revision: 1,
    };
    await repository.create(ownerUserId, shared, {
      idempotencyKey: crypto.randomUUID(),
      videoId: sharedVideoId,
      versionId: sharedVersionId,
      createdAt: firstAggregate.video.createdAt,
    });
    const sharedAssetId = firstAggregate.versions[0]!.assetId;

    await service.delete(ownerUserId, first.id);
    expect(await bytes.exists(ownerUserId, sharedAssetId)).toBe(true);

    await service.delete(ownerUserId, sharedVideoId);
    expect(await bytes.exists(ownerUserId, sharedAssetId)).toBe(false);
  });

  it('keeps physical deletion retryable after the record is tombstoned', async () => {
    const video = await service.saveNew(ownerUserId, crypto.randomUUID(), sourcePath, metadata());
    const assetId = (await repository.get(ownerUserId, video.id))!.versions[0]!.assetId;
    const deleteBytes = bytes.delete.bind(bytes);
    vi.spyOn(bytes, 'delete')
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockImplementation(deleteBytes);

    await expect(service.delete(ownerUserId, video.id)).rejects.toMatchObject({
      statusCode: 503,
      code: 'storage_failure',
    });
    expect(await repository.list(ownerUserId)).toHaveLength(0);
    expect(await bytes.exists(ownerUserId, assetId)).toBe(true);

    await expect(service.delete(ownerUserId, video.id)).resolves.toBeUndefined();
    expect(await bytes.exists(ownerUserId, assetId)).toBe(false);
  });

  it('tombstones library metadata without deleting Project-retained Version bytes', async () => {
    const video = await service.saveNew(ownerUserId, crypto.randomUUID(), sourcePath, metadata());
    const assetId = (await repository.get(ownerUserId, video.id))!.versions[0]!.assetId;
    const projectRetention = {
      retainsAsset: vi.fn().mockResolvedValue(true),
      retainedAssetIds: vi
        .fn()
        .mockImplementation((_ownerUserId: string, assetIds: readonly string[]) =>
          Promise.resolve(new Set(assetIds)),
        ),
    };
    service = new SavedVideoService(repository, bytes, {
      now: () => new Date('2026-08-05T12:00:00.000Z'),
      inspect: () => Promise.resolve(inspected),
      deleteStoredAssetsOnManualDelete: true,
      projectRetention,
    });

    await service.delete(ownerUserId, video.id);

    expect(await repository.list(ownerUserId)).toHaveLength(0);
    expect(await bytes.exists(ownerUserId, assetId)).toBe(true);
    expect(projectRetention.retainedAssetIds).toHaveBeenCalledWith(ownerUserId, [assetId]);
    expect(projectRetention.retainsAsset).not.toHaveBeenCalled();
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
    await expect(sharp(await readAsset(content.asset)).metadata()).resolves.toMatchObject({
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

    const pageOne = await service.list(ownerUserId, { pageSize: 1, sort: 'latest' });
    const pageTwo = await service.list(ownerUserId, {
      cursor: pageOne.nextCursor!,
      pageSize: 1,
      sort: 'latest',
    });
    expect(new Set([pageOne.videos[0]!.id, pageTwo.videos[0]!.id])).toEqual(
      new Set([first.id, second.id]),
    );
    expect(pageOne.nextCursor).not.toBeNull();
    expect(pageTwo.nextCursor).toBeNull();
    expect(pageOne.videos[0]).not.toHaveProperty('assetId');
    await expect(
      service.list(ownerUserId, {
        cursor: pageOne.nextCursor!,
        pageSize: 1,
        sort: 'oldest',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'validation_error' });
  });

  it('delegates paging to repositories that provide a storage-level query', async () => {
    await service.saveNew(ownerUserId, crypto.randomUUID(), sourcePath, metadata());
    const [aggregate] = await repository.list(ownerUserId);
    const listPage = vi.fn().mockResolvedValue({
      videos: [aggregate],
      total: 2,
      characterNames: ['Mara'],
      formats: ['landscape'],
    });
    const databaseService = new SavedVideoService(
      { listPage } as unknown as SavedVideoRepository,
      bytes,
    );

    const page = await databaseService.list(ownerUserId, { pageSize: 1, sort: 'latest' });

    expect(listPage).toHaveBeenCalledWith(ownerUserId, { pageSize: 1, sort: 'latest' }, 0);
    expect(page).toMatchObject({
      total: 2,
      facets: { characterNames: ['Mara'], formats: ['landscape'] },
    });
    expect(page.videos).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
  });

  it('filters the full library by character and format and sorts by time or duration', async () => {
    const facts = [
      { ...inspected, durationMs: 30_000, width: 1_280, height: 720 },
      { ...inspected, durationMs: 5_000, width: 720, height: 1_280 },
      { ...inspected, durationMs: 12_000, width: 1_080, height: 1_080 },
    ];
    const dates = [
      '2026-08-03T12:00:00.000Z',
      '2026-08-04T12:00:00.000Z',
      '2026-08-05T12:00:00.000Z',
    ];
    let index = 0;
    service = new SavedVideoService(repository, bytes, {
      now: () => new Date(dates[index - 1]!),
      inspect: () => Promise.resolve(facts[index++]!),
      deleteStoredAssetsOnManualDelete: true,
    });
    await service.saveNew(
      ownerUserId,
      crypto.randomUUID(),
      sourcePath,
      metadata({
        title: 'Mara landscape',
        characterName: 'Mara',
        characterVariantName: 'Evening',
      }),
    );
    await service.saveNew(
      ownerUserId,
      crypto.randomUUID(),
      sourcePath,
      metadata({ title: 'Nova portrait', characterName: 'Nova' }),
    );
    await service.saveNew(
      ownerUserId,
      crypto.randomUUID(),
      sourcePath,
      metadata({ title: 'Mara square', characterName: 'Mara' }),
    );

    const mara = await service.list(ownerUserId, {
      pageSize: 20,
      characterName: 'Mara',
      sort: 'oldest',
    });
    expect(mara.videos.map((video) => video.title)).toEqual(['Mara landscape', 'Mara square']);
    expect(mara.total).toBe(2);
    expect(mara.videos[0]?.currentVersion).toMatchObject({
      characterName: 'Mara',
      characterVariantName: 'Evening',
    });
    expect(mara.facets).toEqual({
      characterNames: ['Mara', 'Nova'],
      formats: ['landscape', 'portrait', 'square'],
    });

    const latest = await service.list(ownerUserId, { pageSize: 20, sort: 'latest' });
    expect(latest.videos.map((video) => video.title)).toEqual([
      'Mara square',
      'Nova portrait',
      'Mara landscape',
    ]);

    const portrait = await service.list(ownerUserId, {
      pageSize: 20,
      format: 'portrait',
      sort: 'latest',
    });
    expect(portrait.videos.map((video) => video.title)).toEqual(['Nova portrait']);

    const maraSquare = await service.list(ownerUserId, {
      pageSize: 20,
      characterName: 'Mara',
      format: 'square',
      sort: 'latest',
    });
    expect(maraSquare.videos.map((video) => video.title)).toEqual(['Mara square']);

    const shortest = await service.list(ownerUserId, { pageSize: 20, sort: 'shortest' });
    expect(shortest.videos.map((video) => video.title)).toEqual([
      'Nova portrait',
      'Mara square',
      'Mara landscape',
    ]);
    const longest = await service.list(ownerUserId, { pageSize: 20, sort: 'longest' });
    expect(longest.videos.map((video) => video.title)).toEqual([
      'Mara landscape',
      'Mara square',
      'Nova portrait',
    ]);
  });

  it('atomically migrates legacy timestamps and fractional durations on read', async () => {
    const videoId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const manifestDirectory = path.join(directory, 'metadata', 'v1', 'saved-videos');
    const manifestPath = path.join(
      manifestDirectory,
      `${createHash('sha256').update(ownerUserId).digest('hex')}.json`,
    );
    await mkdir(manifestDirectory, { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify({
        schemaVersion: 2,
        ownerUserId,
        revision: 1,
        videos: [
          {
            video: {
              id: videoId,
              ownerUserId,
              title: 'Legacy saved video',
              currentVersionId: versionId,
              sourceVideoId: null,
              status: 'ready',
              createdAt: '2026-08-01 12:00:00+00',
              updatedAt: '2026-08-01T08:00:00-04:00',
              deletedAt: null,
            },
            versions: [
              {
                id: versionId,
                videoId,
                ownerUserId,
                ordinal: 1,
                origin: 'recorded',
                sourceVersionId: null,
                assetId: crypto.randomUUID(),
                thumbnailAssetId: null,
                mimeType: 'video/mp4',
                filename: 'legacy.mp4',
                sizeBytes: 11,
                durationMs: 12_000.4,
                width: 1_280,
                height: 720,
                createdAt: '2026-08-01 12:00:00+00',
                characterName: null,
              },
            ],
            revision: 1,
          },
        ],
        receipts: [],
      }),
    );

    expect((await repository.list(ownerUserId))[0]).toMatchObject({
      video: {
        createdAt: '2026-08-01T12:00:00.000Z',
        updatedAt: '2026-08-01T12:00:00.000Z',
      },
      versions: [
        {
          characterName: null,
          durationMs: 12_000,
          createdAt: '2026-08-01T12:00:00.000Z',
        },
      ],
    });
    const migrated = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      schemaVersion: number;
      videos: Array<{
        video: { createdAt: string; updatedAt: string };
        versions: Array<{
          characterName?: string | null;
          durationMs: number;
          createdAt: string;
        }>;
      }>;
    };
    expect(migrated).toMatchObject({
      schemaVersion: 4,
      videos: [
        {
          video: {
            createdAt: '2026-08-01T12:00:00.000Z',
            updatedAt: '2026-08-01T12:00:00.000Z',
          },
          versions: [
            {
              characterName: null,
              characterVariantName: null,
              durationMs: 12_000,
              createdAt: '2026-08-01T12:00:00.000Z',
            },
          ],
        },
      ],
    });
  });
});
