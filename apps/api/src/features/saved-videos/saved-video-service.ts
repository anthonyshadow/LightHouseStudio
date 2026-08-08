import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {
  SAVED_VIDEO_FORMATS,
  savedVideoDetailSchema,
  savedVideoSummarySchema,
  type SavedVideoDetail,
  type SavedVideoFormat,
  type SavedVideoSummary,
  type SavedVideosQuery,
  type SavedVideoUploadMetadata,
  type InspectedVideo,
} from '@studio/contracts';
import { normalizeSavedVideoTitle } from '@studio/domain';
import type { AssetByteStore, AssetReadHandle } from '../../storage/asset-byte-store.js';
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
  characterName: version.characterName,
  sourceVersionId: version.sourceVersionId,
  mimeType: version.mimeType,
  filename: version.filename,
  sizeBytes: version.sizeBytes,
  durationMs: version.durationMs,
  width: version.width,
  height: version.height,
  createdAt: version.createdAt,
});

const publicSummary = (
  aggregate: StoredSavedVideoAggregate,
  version = currentVersion(aggregate),
): SavedVideoSummary =>
  savedVideoSummarySchema.parse({
    id: aggregate.video.id,
    title: aggregate.video.title,
    status: aggregate.video.status,
    currentVersion: publicVersion(version),
    sourceVideoId: aggregate.video.sourceVideoId,
    versionCount: aggregate.versions.length,
    thumbnailAvailable: version.thumbnailAssetId !== null,
    createdAt: aggregate.video.createdAt,
    updatedAt: aggregate.video.updatedAt,
  });

const publicDetail = (aggregate: StoredSavedVideoAggregate): SavedVideoDetail => {
  const version = currentVersion(aggregate);
  return savedVideoDetailSchema.parse({
    ...publicSummary(aggregate, version),
    versions: aggregate.versions.map(publicVersion),
  });
};

const cursorQueryKey = (query: SavedVideosQuery): string =>
  JSON.stringify({
    characterName: query.characterName ?? null,
    format: query.format ?? null,
    pageSize: query.pageSize,
    sort: query.sort,
  });

const encodeCursor = (offset: number, query: SavedVideosQuery): string =>
  Buffer.from(
    JSON.stringify({ version: 2, offset, query: cursorQueryKey(query) }),
    'utf8',
  ).toString('base64url');

const decodeCursor = (cursor: string | undefined, query: SavedVideosQuery): number => {
  if (cursor === undefined) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      'offset' in value &&
      typeof value.offset === 'number' &&
      Number.isInteger(value.offset) &&
      value.offset >= 0 &&
      value.offset <= 100_000 &&
      (value.version === 1 ||
        (value.version === 2 &&
          'query' in value &&
          typeof value.query === 'string' &&
          value.query === cursorQueryKey(query)))
    )
      return value.offset;
  } catch {
    // Invalid opaque cursors become an app-owned validation error.
  }
  throw new AppError(400, 'validation_error', 'Use a valid saved-video page cursor.');
};

const videoFormat = (version: StoredVideoVersion): SavedVideoFormat =>
  version.width === version.height
    ? 'square'
    : version.width > version.height
      ? 'landscape'
      : 'portrait';

interface IndexedVideo {
  readonly aggregate: StoredSavedVideoAggregate;
  readonly version: StoredVideoVersion;
  readonly format: SavedVideoFormat;
}

const aggregateAssetIds = (aggregate: StoredSavedVideoAggregate): string[] =>
  aggregate.versions.flatMap((version) =>
    version.thumbnailAssetId === null
      ? [version.assetId]
      : [version.assetId, version.thumbnailAssetId],
  );

export interface SavedVideoServiceOptions {
  readonly now?: () => Date;
  readonly inspect?: (filePath: string) => Promise<InspectedVideo>;
  /** R2/shadow mode only. Local-only deletion retains its existing reconciliation policy. */
  readonly deleteStoredAssetsOnManualDelete?: boolean;
}

const compareCreatedAt = (left: IndexedVideo, right: IndexedVideo): number =>
  left.aggregate.video.createdAt.localeCompare(right.aggregate.video.createdAt) ||
  left.aggregate.video.id.localeCompare(right.aggregate.video.id);

export class SavedVideoService {
  readonly #repository: SavedVideoRepository;
  readonly #bytes: AssetByteStore;
  readonly #now: () => Date;
  readonly #inspect: (filePath: string) => Promise<InspectedVideo>;
  readonly #deleteStoredAssetsOnManualDelete: boolean;

  constructor(
    repository: SavedVideoRepository,
    bytes: AssetByteStore,
    options: SavedVideoServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#bytes = bytes;
    this.#now = options.now ?? (() => new Date());
    this.#inspect = options.inspect ?? inspectSavedVideoFile;
    this.#deleteStoredAssetsOnManualDelete = options.deleteStoredAssetsOnManualDelete ?? false;
  }

  async #versionFromUpload(
    ownerUserId: string,
    videoId: string,
    ordinal: number,
    sourcePath: string,
    metadata: SavedVideoUploadMetadata,
    checksumSha256?: string,
  ): Promise<StoredVideoVersion> {
    const inspected = await this.#inspect(sourcePath);
    const createdAt = this.#now().toISOString();
    const assetId = randomUUID();
    const filename = safeFilename(metadata.filename, inspected.mimeType);
    await this.#bytes.storeFile({
      assetId,
      ownerUserId,
      sourcePath,
      ...(checksumSha256 === undefined ? {} : { checksumSha256 }),
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
      characterName: metadata.characterName,
      sourceVersionId: metadata.sourceVersionId,
      assetId,
      thumbnailAssetId: null,
      mimeType: inspected.mimeType,
      filename,
      sizeBytes: inspected.sizeBytes,
      durationMs: Math.max(1, Math.round(inspected.durationMs)),
      width: inspected.width,
      height: inspected.height,
      createdAt,
    };
  }

  async #deleteAsset(ownerUserId: string, assetId: string): Promise<void> {
    await this.#bytes.delete(ownerUserId, assetId).catch(() => undefined);
  }

  async saveNew(
    ownerUserId: string,
    idempotencyKey: string,
    sourcePath: string,
    metadata: SavedVideoUploadMetadata,
    checksumSha256?: string,
  ): Promise<SavedVideoDetail> {
    const prior = await this.#repository.findReceipt(ownerUserId, idempotencyKey);
    if (prior !== null) {
      const aggregate = await this.#repository.get(ownerUserId, prior.videoId);
      if (aggregate !== null) return publicDetail(aggregate);
    }
    const videoId = randomUUID();
    const version = await this.#versionFromUpload(
      ownerUserId,
      videoId,
      1,
      sourcePath,
      metadata,
      checksumSha256,
    );
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
    try {
      const saved = await this.#repository.create(ownerUserId, aggregate, receipt);
      if (!saved.versions.some((savedVersion) => savedVersion.id === version.id)) {
        await this.#deleteAsset(ownerUserId, version.assetId);
      }
      return publicDetail(saved);
    } catch (error) {
      await this.#deleteAsset(ownerUserId, version.assetId);
      throw error;
    }
  }

  async appendVersion(
    ownerUserId: string,
    videoId: string,
    expectedVersionId: string,
    idempotencyKey: string,
    sourcePath: string,
    metadata: SavedVideoUploadMetadata,
    checksumSha256?: string,
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
      checksumSha256,
    );
    const receipt = {
      idempotencyKey,
      videoId,
      versionId: version.id,
      createdAt: version.createdAt,
    };
    let result: Awaited<ReturnType<SavedVideoRepository['append']>>;
    try {
      result = await this.#repository.append(
        ownerUserId,
        videoId,
        expectedVersionId,
        version,
        receipt,
      );
    } catch (error) {
      await this.#deleteAsset(ownerUserId, version.assetId);
      throw error;
    }
    if (typeof result === 'string' || !result.versions.some((item) => item.id === version.id)) {
      await this.#deleteAsset(ownerUserId, version.assetId);
    }
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
    query: SavedVideosQuery,
  ): Promise<{
    videos: readonly SavedVideoSummary[];
    nextCursor: string | null;
    total: number;
    facets: { characterNames: string[]; formats: SavedVideoFormat[] };
  }> {
    const offset = decodeCursor(query.cursor, query);
    if (this.#repository.listPage !== undefined) {
      const page = await this.#repository.listPage(ownerUserId, query, offset);
      return {
        videos: page.videos.map((aggregate) => publicSummary(aggregate)),
        nextCursor:
          offset + page.videos.length < page.total
            ? encodeCursor(offset + page.videos.length, query)
            : null,
        total: page.total,
        facets: {
          characterNames: [...page.characterNames],
          formats: [...page.formats],
        },
      };
    }
    const all = (await this.#repository.list(ownerUserId)).map((aggregate): IndexedVideo => {
      const version = currentVersion(aggregate);
      return { aggregate, version, format: videoFormat(version) };
    });
    const characterNames = [
      ...new Set(
        all
          .map(({ version }) => version.characterName)
          .filter((name): name is string => name !== null),
      ),
    ].sort((left, right) => left.localeCompare(right));
    const availableFormats = new Set(all.map(({ format }) => format));
    const formats = SAVED_VIDEO_FORMATS.filter((format) => availableFormats.has(format));
    const filtered = all.filter(({ format, version }) => {
      return (
        (query.characterName === undefined || version.characterName === query.characterName) &&
        (query.format === undefined || format === query.format)
      );
    });
    filtered.sort((left, right) => {
      if (query.sort === 'shortest' || query.sort === 'longest') {
        const durationDifference = left.version.durationMs - right.version.durationMs;
        if (durationDifference !== 0)
          return query.sort === 'shortest' ? durationDifference : -durationDifference;
      }
      const createdAtComparison = compareCreatedAt(left, right);
      return query.sort === 'oldest' ? createdAtComparison : -createdAtComparison;
    });
    const page = filtered.slice(offset, offset + query.pageSize);
    return {
      videos: page.map(({ aggregate, version }) => publicSummary(aggregate, version)),
      nextCursor:
        offset + page.length < filtered.length ? encodeCursor(offset + page.length, query) : null,
      total: filtered.length,
      facets: { characterNames, formats },
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
    const deleted = await this.#repository.delete(ownerUserId, videoId, this.#now().toISOString());
    if (deleted === null) {
      throw new AppError(404, 'not_found', 'That saved video is unavailable.');
    }
    if (!this.#deleteStoredAssetsOnManualDelete) return;

    const retainedAssetIds = new Set(
      (await this.#repository.list(ownerUserId)).flatMap(aggregateAssetIds),
    );
    const discardedAssetIds = new Set(aggregateAssetIds(deleted));
    const results = await Promise.allSettled(
      [...discardedAssetIds]
        .filter((assetId) => !retainedAssetIds.has(assetId))
        .map((assetId) => this.#bytes.delete(ownerUserId, assetId)),
    );
    const failed = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failed !== undefined) {
      throw new AppError(
        503,
        'storage_failure',
        'The saved video was removed, but its stored media could not be deleted. Retry deletion.',
        { cause: failed.reason },
      );
    }
  }

  async content(
    ownerUserId: string,
    videoId: string,
    versionId?: string,
  ): Promise<{ video: SavedVideoDetail; version: StoredVideoVersion; asset: AssetReadHandle }> {
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
    return { video: publicDetail(aggregate), version, asset };
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
    let updated: StoredSavedVideoAggregate | null;
    try {
      updated = await this.#repository.setThumbnail(
        ownerUserId,
        videoId,
        versionId,
        assetId,
        createdAt,
      );
    } catch (error) {
      await this.#deleteAsset(ownerUserId, assetId);
      throw error;
    }
    if (
      updated === null ||
      updated.versions.find((item) => item.id === versionId)?.thumbnailAssetId !== assetId
    ) {
      await this.#deleteAsset(ownerUserId, assetId);
    }
    if (updated === null) {
      throw new AppError(404, 'not_found', 'That saved video version is unavailable.');
    }
    return publicDetail(updated);
  }

  async thumbnail(
    ownerUserId: string,
    videoId: string,
    versionId?: string,
  ): Promise<{ asset: AssetReadHandle; mimeType: 'image/webp' }> {
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
    return { asset, mimeType: 'image/webp' };
  }
}
