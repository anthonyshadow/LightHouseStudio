import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {
  savedVideoDetailSchema,
  savedVideoSummarySchema,
  type SavedVideoDetail,
  type SavedVideoSummary,
  type SavedVideoUploadMetadata,
  type InspectedVideo,
} from '@studio/contracts';
import { normalizeSavedVideoTitle } from '@studio/domain';
import type { AssetByteStore } from '../../storage/asset-byte-store.js';
import { AppError } from '../../http/app-error.js';
import { inspectSavedVideoFile } from './saved-video-inspection.js';
import type {
  SavedVideoReceipt,
  SavedVideoRepository,
  StoredSavedVideoAggregate,
  StoredVideoVersion,
} from './saved-video-repository.js';

const safeFilename = (value: string, mimeType: string): string => {
  const extension =
    mimeType === 'video/mp4' ? '.mp4' : mimeType === 'video/quicktime' ? '.mov' : '.webm';
  const stem =
    path
      .basename(value)
      .replaceAll(/[^a-zA-Z0-9._ -]+/gu, '')
      .replaceAll(/\s+/gu, '-')
      .replace(/\.[^.]+$/u, '')
      .slice(0, 120) || 'video';
  return `${stem}${extension}`;
};

const currentVersion = (aggregate: StoredSavedVideoAggregate): StoredVideoVersion => {
  const version = aggregate.versions.find((item) => item.id === aggregate.video.currentVersionId);
  if (version === undefined) throw new Error('Saved video current version is inconsistent.');
  return version;
};

const publicVersion = (version: StoredVideoVersion) => ({
  id: version.id,
  videoId: version.videoId,
  ordinal: version.ordinal,
  origin: version.origin,
  sourceVersionId: version.sourceVersionId,
  mimeType: version.mimeType,
  filename: version.filename,
  sizeBytes: version.sizeBytes,
  durationMs: version.durationMs,
  width: version.width,
  height: version.height,
  createdAt: version.createdAt,
});

const publicSummary = (aggregate: StoredSavedVideoAggregate): SavedVideoSummary =>
  savedVideoSummarySchema.parse({
    id: aggregate.video.id,
    title: aggregate.video.title,
    status: aggregate.video.status,
    currentVersion: publicVersion(currentVersion(aggregate)),
    sourceVideoId: aggregate.video.sourceVideoId,
    versionCount: aggregate.versions.length,
    thumbnailAvailable: currentVersion(aggregate).thumbnailAssetId !== null,
    createdAt: aggregate.video.createdAt,
    updatedAt: aggregate.video.updatedAt,
  });

const publicDetail = (aggregate: StoredSavedVideoAggregate): SavedVideoDetail =>
  savedVideoDetailSchema.parse({
    ...publicSummary(aggregate),
    versions: aggregate.versions.map(publicVersion),
  });

const encodeCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ version: 1, offset }), 'utf8').toString('base64url');

const decodeCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      value.version === 1 &&
      'offset' in value &&
      typeof value.offset === 'number' &&
      Number.isInteger(value.offset) &&
      value.offset >= 0 &&
      value.offset <= 100_000
    )
      return value.offset;
  } catch {
    // Invalid opaque cursors become an app-owned validation error.
  }
  throw new AppError(400, 'validation_error', 'Use a valid saved-video page cursor.');
};

export class SavedVideoService {
  readonly #repository: SavedVideoRepository;
  readonly #bytes: AssetByteStore;
  readonly #now: () => Date;
  readonly #inspect: (filePath: string) => Promise<InspectedVideo>;

  constructor(
    repository: SavedVideoRepository,
    bytes: AssetByteStore,
    now: () => Date = () => new Date(),
    inspect: (filePath: string) => Promise<InspectedVideo> = inspectSavedVideoFile,
  ) {
    this.#repository = repository;
    this.#bytes = bytes;
    this.#now = now;
    this.#inspect = inspect;
  }

  async #versionFromUpload(
    ownerUserId: string,
    videoId: string,
    ordinal: number,
    sourcePath: string,
    metadata: SavedVideoUploadMetadata,
  ): Promise<StoredVideoVersion> {
    const inspected = await this.#inspect(sourcePath);
    const createdAt = this.#now().toISOString();
    const assetId = randomUUID();
    const filename = safeFilename(metadata.filename, inspected.mimeType);
    await this.#bytes.storeFile({
      assetId,
      ownerUserId,
      sourcePath,
      mimeType: inspected.mimeType,
      filename,
      createdAt,
    });
    return {
      id: randomUUID(),
      videoId,
      ownerUserId,
      ordinal,
      origin: metadata.origin,
      sourceVersionId: metadata.sourceVersionId,
      assetId,
      thumbnailAssetId: null,
      mimeType: inspected.mimeType,
      filename,
      sizeBytes: inspected.sizeBytes,
      durationMs: inspected.durationMs,
      width: inspected.width,
      height: inspected.height,
      createdAt,
    };
  }

  async saveNew(
    ownerUserId: string,
    idempotencyKey: string,
    sourcePath: string,
    metadata: SavedVideoUploadMetadata,
  ): Promise<SavedVideoDetail> {
    const prior = await this.#repository.findReceipt(ownerUserId, idempotencyKey);
    if (prior !== null) {
      const aggregate = await this.#repository.get(ownerUserId, prior.videoId);
      if (aggregate !== null) return publicDetail(aggregate);
    }
    const videoId = randomUUID();
    const version = await this.#versionFromUpload(ownerUserId, videoId, 1, sourcePath, metadata);
    const aggregate: StoredSavedVideoAggregate = {
      video: {
        id: videoId,
        ownerUserId,
        title: normalizeSavedVideoTitle(metadata.title),
        currentVersionId: version.id,
        sourceVideoId: metadata.sourceVideoId,
        status: 'ready',
        createdAt: version.createdAt,
        updatedAt: version.createdAt,
        deletedAt: null,
      },
      versions: [version],
      revision: 1,
    };
    const receipt: SavedVideoReceipt = {
      idempotencyKey,
      videoId,
      versionId: version.id,
      createdAt: version.createdAt,
    };
    return publicDetail(await this.#repository.create(ownerUserId, aggregate, receipt));
  }

  async appendVersion(
    ownerUserId: string,
    videoId: string,
    expectedVersionId: string,
    idempotencyKey: string,
    sourcePath: string,
    metadata: SavedVideoUploadMetadata,
  ): Promise<SavedVideoDetail> {
    const prior = await this.#repository.findReceipt(ownerUserId, idempotencyKey);
    if (prior !== null) {
      const aggregate = await this.#repository.get(ownerUserId, prior.videoId);
      if (aggregate !== null) return publicDetail(aggregate);
    }
    const aggregate = await this.#repository.get(ownerUserId, videoId);
    if (aggregate === null)
      throw new AppError(404, 'not_found', 'That saved video is unavailable.');
    if (aggregate.video.currentVersionId !== expectedVersionId) {
      throw new AppError(
        409,
        'conflict',
        'The saved video changed before this version could be added.',
      );
    }
    const version = await this.#versionFromUpload(
      ownerUserId,
      videoId,
      aggregate.versions.length + 1,
      sourcePath,
      {
        ...metadata,
        sourceVideoId: aggregate.video.sourceVideoId,
        sourceVersionId: expectedVersionId,
      },
    );
    const receipt = {
      idempotencyKey,
      videoId,
      versionId: version.id,
      createdAt: version.createdAt,
    };
    const result = await this.#repository.append(
      ownerUserId,
      videoId,
      expectedVersionId,
      version,
      receipt,
    );
    if (result === 'not-found')
      throw new AppError(404, 'not_found', 'That saved video is unavailable.');
    if (result === 'conflict')
      throw new AppError(
        409,
        'conflict',
        'The saved video changed before this version could be added.',
      );
    return publicDetail(result);
  }

  async list(
    ownerUserId: string,
    cursor: string | undefined,
    pageSize: number,
  ): Promise<{ videos: readonly SavedVideoSummary[]; nextCursor: string | null }> {
    const offset = decodeCursor(cursor);
    const all = [...(await this.#repository.list(ownerUserId))].sort(
      (left, right) =>
        right.video.createdAt.localeCompare(left.video.createdAt) ||
        right.video.id.localeCompare(left.video.id),
    );
    const page = all.slice(offset, offset + pageSize);
    return {
      videos: page.map(publicSummary),
      nextCursor: offset + page.length < all.length ? encodeCursor(offset + page.length) : null,
    };
  }

  async get(ownerUserId: string, videoId: string): Promise<SavedVideoDetail> {
    const aggregate = await this.#repository.get(ownerUserId, videoId);
    if (aggregate === null)
      throw new AppError(404, 'not_found', 'That saved video is unavailable.');
    return publicDetail(aggregate);
  }

  async rename(ownerUserId: string, videoId: string, title: string): Promise<SavedVideoDetail> {
    const aggregate = await this.#repository.rename(
      ownerUserId,
      videoId,
      normalizeSavedVideoTitle(title),
      this.#now().toISOString(),
    );
    if (aggregate === null)
      throw new AppError(404, 'not_found', 'That saved video is unavailable.');
    return publicDetail(aggregate);
  }

  async delete(ownerUserId: string, videoId: string): Promise<void> {
    const all = await this.#repository.list(ownerUserId);
    if (all.some((item) => item.video.sourceVideoId === videoId)) {
      throw new AppError(
        409,
        'conflict',
        'Delete derived videos before deleting their source video.',
      );
    }
    if (!(await this.#repository.delete(ownerUserId, videoId, this.#now().toISOString()))) {
      throw new AppError(404, 'not_found', 'That saved video is unavailable.');
    }
    // Phase 1 intentionally retains unreferenced local media until Phase 2 reconciliation.
  }

  async content(
    ownerUserId: string,
    videoId: string,
    versionId?: string,
  ): Promise<{ video: SavedVideoDetail; version: StoredVideoVersion; path: string }> {
    const aggregate = await this.#repository.get(ownerUserId, videoId);
    if (aggregate === null)
      throw new AppError(404, 'not_found', 'That saved video is unavailable.');
    const version =
      versionId === undefined
        ? currentVersion(aggregate)
        : aggregate.versions.find((item) => item.id === versionId);
    if (version === undefined)
      throw new AppError(404, 'not_found', 'That saved video version is unavailable.');
    const asset = await this.#bytes.open(ownerUserId, version.assetId);
    if (asset === null) {
      await this.#repository.markMissing(ownerUserId, videoId, this.#now().toISOString());
      throw new AppError(
        404,
        'asset_missing',
        'The saved video file is missing from local storage.',
      );
    }
    return { video: publicDetail(aggregate), version, path: asset.path };
  }

  async saveThumbnail(
    ownerUserId: string,
    videoId: string,
    versionId: string,
    input: Uint8Array,
  ): Promise<SavedVideoDetail> {
    const aggregate = await this.#repository.get(ownerUserId, videoId);
    const version = aggregate?.versions.find((item) => item.id === versionId);
    if (aggregate === null || aggregate === undefined || version === undefined) {
      throw new AppError(404, 'not_found', 'That saved video version is unavailable.');
    }
    if (version.thumbnailAssetId !== null) return publicDetail(aggregate);
    let thumbnail: Buffer;
    try {
      thumbnail = await sharp(input, { failOn: 'error', limitInputPixels: 20_000_000 })
        .rotate()
        .resize(480, 270, { fit: 'cover', position: 'centre', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    } catch (error) {
      throw new AppError(400, 'validation_error', 'Provide a valid WebP video thumbnail.', {
        cause: error,
      });
    }
    const createdAt = this.#now().toISOString();
    const assetId = randomUUID();
    await this.#bytes.storeBytes({
      assetId,
      ownerUserId,
      bytes: thumbnail,
      mimeType: 'image/webp',
      filename: `${videoId}-${versionId}.webp`,
      createdAt,
    });
    const updated = await this.#repository.setThumbnail(
      ownerUserId,
      videoId,
      versionId,
      assetId,
      createdAt,
    );
    if (updated === null) {
      throw new AppError(404, 'not_found', 'That saved video version is unavailable.');
    }
    return publicDetail(updated);
  }

  async thumbnail(
    ownerUserId: string,
    videoId: string,
    versionId?: string,
  ): Promise<{ path: string; mimeType: 'image/webp' }> {
    const aggregate = await this.#repository.get(ownerUserId, videoId);
    if (aggregate === null)
      throw new AppError(404, 'not_found', 'That saved video is unavailable.');
    const version =
      versionId === undefined
        ? currentVersion(aggregate)
        : aggregate.versions.find((item) => item.id === versionId);
    if (version?.thumbnailAssetId == null) {
      throw new AppError(404, 'not_found', 'That saved video thumbnail is unavailable.');
    }
    const asset = await this.#bytes.open(ownerUserId, version.thumbnailAssetId);
    if (asset === null) {
      throw new AppError(404, 'asset_missing', 'The saved video thumbnail is missing.');
    }
    return { path: asset.path, mimeType: 'image/webp' };
  }
}
