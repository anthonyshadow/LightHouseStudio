import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  SAVED_VIDEO_FORMATS,
  videoInputMimeTypeSchema,
  type SavedVideoFormat,
  type SavedVideosQuery,
} from '@studio/contracts';
import { nullableIsoTimestamp, toIsoTimestamp } from '../../application/timestamps.js';
import type {
  SavedVideoReceipt,
  SavedVideoRepository,
  StoredSavedVideoAggregate,
  StoredVideoVersion,
} from '../../features/saved-videos/saved-video-repository.js';
import type { LightframeDatabase } from './client.js';
import { savedVideoReceipts, savedVideos, videoVersions } from './schema.js';

type DatabaseExecutor = Parameters<Parameters<LightframeDatabase['transaction']>[0]>[0];
type VideoRow = typeof savedVideos.$inferSelect;
type VersionRow = typeof videoVersions.$inferSelect;

const toVersion = (row: VersionRow): StoredVideoVersion => ({
  id: row.id,
  videoId: row.videoId,
  ownerUserId: row.ownerUserId,
  ordinal: row.ordinal,
  origin: row.origin,
  characterName: row.characterName,
  sourceVersionId: row.sourceVersionId,
  assetId: row.assetId,
  thumbnailAssetId: row.thumbnailAssetId,
  mimeType: videoInputMimeTypeSchema.parse(row.mimeType),
  filename: row.filename,
  sizeBytes: row.sizeBytes,
  durationMs: row.durationMs,
  width: row.width,
  height: row.height,
  createdAt: toIsoTimestamp(row.createdAt),
});

const toAggregate = (
  video: VideoRow,
  versions: readonly VersionRow[],
): StoredSavedVideoAggregate => ({
  video: {
    id: video.id,
    ownerUserId: video.ownerUserId,
    title: video.title,
    currentVersionId: video.currentVersionId,
    sourceVideoId: video.sourceVideoId,
    status: video.status,
    createdAt: toIsoTimestamp(video.createdAt),
    updatedAt: toIsoTimestamp(video.updatedAt),
    deletedAt: nullableIsoTimestamp(video.deletedAt),
  },
  versions: versions.map(toVersion),
  revision: video.revision,
});

const versionValues = (version: StoredVideoVersion): typeof videoVersions.$inferInsert => ({
  id: version.id,
  videoId: version.videoId,
  ownerUserId: version.ownerUserId,
  ordinal: version.ordinal,
  origin: version.origin,
  characterName: version.characterName,
  sourceVersionId: version.sourceVersionId,
  assetId: version.assetId,
  thumbnailAssetId: version.thumbnailAssetId,
  mimeType: version.mimeType,
  filename: version.filename,
  sizeBytes: version.sizeBytes,
  durationMs: Math.max(1, Math.round(version.durationMs)),
  width: version.width,
  height: version.height,
  createdAt: toIsoTimestamp(version.createdAt),
});

const receiptValues = (
  ownerUserId: string,
  receipt: SavedVideoReceipt,
): typeof savedVideoReceipts.$inferInsert => ({
  ownerUserId,
  idempotencyKey: receipt.idempotencyKey,
  videoId: receipt.videoId,
  versionId: receipt.versionId,
  createdAt: toIsoTimestamp(receipt.createdAt),
});

export class DrizzleSavedVideoRepository implements SavedVideoRepository {
  constructor(private readonly db: LightframeDatabase) {}

  async #getWith(
    executor: LightframeDatabase | DatabaseExecutor,
    ownerUserId: string,
    videoId: string,
  ): Promise<StoredSavedVideoAggregate | null> {
    const [video] = await executor
      .select()
      .from(savedVideos)
      .where(
        and(
          eq(savedVideos.ownerUserId, ownerUserId),
          eq(savedVideos.id, videoId),
          isNull(savedVideos.deletedAt),
        ),
      )
      .limit(1);
    if (video === undefined) return null;
    const versions = await executor
      .select()
      .from(videoVersions)
      .where(and(eq(videoVersions.ownerUserId, ownerUserId), eq(videoVersions.videoId, videoId)))
      .orderBy(asc(videoVersions.ordinal));
    return toAggregate(video, versions);
  }

  async findReceipt(
    ownerUserId: string,
    idempotencyKey: string,
  ): Promise<SavedVideoReceipt | null> {
    const [row] = await this.db
      .select()
      .from(savedVideoReceipts)
      .where(
        and(
          eq(savedVideoReceipts.ownerUserId, ownerUserId),
          eq(savedVideoReceipts.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row === undefined
      ? null
      : {
          idempotencyKey: row.idempotencyKey,
          videoId: row.videoId,
          versionId: row.versionId,
          createdAt: toIsoTimestamp(row.createdAt),
        };
  }

  async create(
    ownerUserId: string,
    aggregate: StoredSavedVideoAggregate,
    receipt: SavedVideoReceipt,
  ): Promise<StoredSavedVideoAggregate> {
    const existingReceipt = await this.findReceipt(ownerUserId, receipt.idempotencyKey);
    if (existingReceipt !== null) {
      const existing = await this.get(ownerUserId, existingReceipt.videoId);
      if (existing !== null) return existing;
    }
    try {
      return await this.db.transaction(async (tx) => {
        await tx.insert(savedVideos).values({
          id: aggregate.video.id,
          ownerUserId,
          title: aggregate.video.title,
          currentVersionId: aggregate.video.currentVersionId,
          sourceVideoId: aggregate.video.sourceVideoId,
          status: aggregate.video.status,
          revision: aggregate.revision,
          deletedAt: nullableIsoTimestamp(aggregate.video.deletedAt),
          createdAt: toIsoTimestamp(aggregate.video.createdAt),
          updatedAt: toIsoTimestamp(aggregate.video.updatedAt),
        });
        await tx.insert(videoVersions).values(aggregate.versions.map(versionValues));
        await tx.insert(savedVideoReceipts).values(receiptValues(ownerUserId, receipt));
        return aggregate;
      });
    } catch (error) {
      const duplicate = await this.findReceipt(ownerUserId, receipt.idempotencyKey);
      if (duplicate !== null) {
        const existing = await this.get(ownerUserId, duplicate.videoId);
        if (existing !== null) return existing;
      }
      throw error;
    }
  }

  async append(
    ownerUserId: string,
    videoId: string,
    expectedVersionId: string,
    version: StoredVideoVersion,
    receipt: SavedVideoReceipt,
  ): Promise<StoredSavedVideoAggregate | 'not-found' | 'conflict'> {
    const existingReceipt = await this.findReceipt(ownerUserId, receipt.idempotencyKey);
    if (existingReceipt !== null) {
      return (await this.get(ownerUserId, existingReceipt.videoId)) ?? 'not-found';
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(savedVideos)
          .where(
            and(
              eq(savedVideos.ownerUserId, ownerUserId),
              eq(savedVideos.id, videoId),
              isNull(savedVideos.deletedAt),
            ),
          )
          .for('update')
          .limit(1);
        if (current === undefined) return 'not-found' as const;
        if (current.currentVersionId !== expectedVersionId) return 'conflict' as const;
        await tx.insert(videoVersions).values(versionValues(version));
        await tx
          .update(savedVideos)
          .set({
            currentVersionId: version.id,
            status: 'ready',
            revision: current.revision + 1,
            updatedAt: toIsoTimestamp(version.createdAt),
          })
          .where(and(eq(savedVideos.ownerUserId, ownerUserId), eq(savedVideos.id, videoId)));
        await tx.insert(savedVideoReceipts).values(receiptValues(ownerUserId, receipt));
        return (await this.#getWith(tx, ownerUserId, videoId)) ?? 'not-found';
      });
    } catch (error) {
      const duplicate = await this.findReceipt(ownerUserId, receipt.idempotencyKey);
      if (duplicate !== null) {
        return (await this.get(ownerUserId, duplicate.videoId)) ?? 'not-found';
      }
      throw error;
    }
  }

  async list(ownerUserId: string): Promise<readonly StoredSavedVideoAggregate[]> {
    const videos = await this.db
      .select()
      .from(savedVideos)
      .where(and(eq(savedVideos.ownerUserId, ownerUserId), isNull(savedVideos.deletedAt)));
    if (videos.length === 0) return [];
    const versions = await this.db
      .select()
      .from(videoVersions)
      .where(
        and(
          eq(videoVersions.ownerUserId, ownerUserId),
          inArray(
            videoVersions.videoId,
            videos.map((video) => video.id),
          ),
        ),
      )
      .orderBy(asc(videoVersions.videoId), asc(videoVersions.ordinal));
    const grouped = new Map<string, VersionRow[]>();
    for (const version of versions) {
      const group = grouped.get(version.videoId) ?? [];
      group.push(version);
      grouped.set(version.videoId, group);
    }
    return videos.map((video) => toAggregate(video, grouped.get(video.id) ?? []));
  }

  async listPage(
    ownerUserId: string,
    query: SavedVideosQuery,
    offset: number,
  ): Promise<{
    videos: readonly StoredSavedVideoAggregate[];
    total: number;
    characterNames: readonly string[];
    formats: readonly SavedVideoFormat[];
  }> {
    const currentVersion = and(
      eq(videoVersions.id, savedVideos.currentVersionId),
      eq(videoVersions.ownerUserId, savedVideos.ownerUserId),
    );
    const format = sql<SavedVideoFormat>`case
      when ${videoVersions.width} = ${videoVersions.height} then 'square'
      when ${videoVersions.width} > ${videoVersions.height} then 'landscape'
      else 'portrait'
    end`;
    const filters = and(
      eq(savedVideos.ownerUserId, ownerUserId),
      isNull(savedVideos.deletedAt),
      query.characterName === undefined
        ? undefined
        : eq(videoVersions.characterName, query.characterName),
      query.format === undefined ? undefined : sql`${format} = ${query.format}`,
    );
    const order =
      query.sort === 'shortest'
        ? [asc(videoVersions.durationMs), desc(savedVideos.createdAt), desc(savedVideos.id)]
        : query.sort === 'longest'
          ? [desc(videoVersions.durationMs), desc(savedVideos.createdAt), desc(savedVideos.id)]
          : query.sort === 'oldest'
            ? [asc(savedVideos.createdAt), asc(savedVideos.id)]
            : [desc(savedVideos.createdAt), desc(savedVideos.id)];

    const [pageRows, countRows, characterRows, formatRows] = await Promise.all([
      this.db
        .select({ video: savedVideos })
        .from(savedVideos)
        .innerJoin(videoVersions, currentVersion)
        .where(filters)
        .orderBy(...order)
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(savedVideos)
        .innerJoin(videoVersions, currentVersion)
        .where(filters),
      this.db
        .selectDistinct({ characterName: videoVersions.characterName })
        .from(savedVideos)
        .innerJoin(videoVersions, currentVersion)
        .where(
          and(
            eq(savedVideos.ownerUserId, ownerUserId),
            isNull(savedVideos.deletedAt),
            isNotNull(videoVersions.characterName),
          ),
        )
        .orderBy(asc(videoVersions.characterName)),
      this.db
        .selectDistinct({ format })
        .from(savedVideos)
        .innerJoin(videoVersions, currentVersion)
        .where(and(eq(savedVideos.ownerUserId, ownerUserId), isNull(savedVideos.deletedAt))),
    ]);
    const videos = pageRows.map((row) => row.video);
    if (videos.length === 0) {
      return {
        videos: [],
        total: countRows[0]?.count ?? 0,
        characterNames: characterRows.flatMap(({ characterName }) =>
          characterName === null ? [] : [characterName],
        ),
        formats: SAVED_VIDEO_FORMATS.filter((item) =>
          formatRows.some((row) => row.format === item),
        ),
      };
    }
    const versions = await this.db
      .select()
      .from(videoVersions)
      .where(
        and(
          eq(videoVersions.ownerUserId, ownerUserId),
          inArray(
            videoVersions.videoId,
            videos.map((video) => video.id),
          ),
        ),
      )
      .orderBy(asc(videoVersions.videoId), asc(videoVersions.ordinal));
    const grouped = new Map<string, VersionRow[]>();
    for (const version of versions) {
      const group = grouped.get(version.videoId) ?? [];
      group.push(version);
      grouped.set(version.videoId, group);
    }
    return {
      videos: videos.map((video) => toAggregate(video, grouped.get(video.id) ?? [])),
      total: countRows[0]?.count ?? 0,
      characterNames: characterRows.flatMap(({ characterName }) =>
        characterName === null ? [] : [characterName],
      ),
      formats: SAVED_VIDEO_FORMATS.filter((item) => formatRows.some((row) => row.format === item)),
    };
  }

  get(ownerUserId: string, videoId: string): Promise<StoredSavedVideoAggregate | null> {
    return this.#getWith(this.db, ownerUserId, videoId);
  }

  async rename(
    ownerUserId: string,
    videoId: string,
    title: string,
    updatedAt: string,
  ): Promise<StoredSavedVideoAggregate | null> {
    const [updated] = await this.db
      .update(savedVideos)
      .set({
        title,
        updatedAt: toIsoTimestamp(updatedAt),
        revision: sql`${savedVideos.revision} + 1`,
      })
      .where(
        and(
          eq(savedVideos.ownerUserId, ownerUserId),
          eq(savedVideos.id, videoId),
          isNull(savedVideos.deletedAt),
        ),
      )
      .returning({ id: savedVideos.id });
    return updated === undefined ? null : this.get(ownerUserId, updated.id);
  }

  async markMissing(ownerUserId: string, videoId: string, updatedAt: string): Promise<void> {
    await this.db
      .update(savedVideos)
      .set({ status: 'missing', updatedAt: toIsoTimestamp(updatedAt) })
      .where(
        and(
          eq(savedVideos.ownerUserId, ownerUserId),
          eq(savedVideos.id, videoId),
          isNull(savedVideos.deletedAt),
        ),
      );
  }

  async setThumbnail(
    ownerUserId: string,
    videoId: string,
    versionId: string,
    assetId: string,
    updatedAt: string,
  ): Promise<StoredSavedVideoAggregate | null> {
    const changed = await this.db.transaction(async (tx) => {
      const [version] = await tx
        .update(videoVersions)
        .set({ thumbnailAssetId: assetId })
        .where(
          and(
            eq(videoVersions.ownerUserId, ownerUserId),
            eq(videoVersions.videoId, videoId),
            eq(videoVersions.id, versionId),
          ),
        )
        .returning({ id: videoVersions.id });
      if (version === undefined) return false;
      await tx
        .update(savedVideos)
        .set({ updatedAt: toIsoTimestamp(updatedAt) })
        .where(and(eq(savedVideos.ownerUserId, ownerUserId), eq(savedVideos.id, videoId)));
      return true;
    });
    return changed ? this.get(ownerUserId, videoId) : null;
  }

  async delete(ownerUserId: string, videoId: string, deletedAt: string): Promise<boolean> {
    const rows = await this.db
      .update(savedVideos)
      .set({
        status: 'deleted',
        deletedAt: toIsoTimestamp(deletedAt),
        updatedAt: toIsoTimestamp(deletedAt),
      })
      .where(
        and(
          eq(savedVideos.ownerUserId, ownerUserId),
          eq(savedVideos.id, videoId),
          isNull(savedVideos.deletedAt),
        ),
      )
      .returning({ id: savedVideos.id });
    return rows.length === 1;
  }
}
