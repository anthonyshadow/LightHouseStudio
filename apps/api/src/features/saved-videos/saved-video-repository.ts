import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  savedVideoCharacterNameSchema,
  savedVideoCharacterVariantNameSchema,
  savedVideoOriginSchema,
  videoInputMimeTypeSchema,
  type SavedVideoFormat,
  type SavedVideosQuery,
} from '@studio/contracts';
import { KeyedLock } from '../../application/keyed-lock.js';
import { persistedTimestampSchema } from '../../application/timestamps.js';

const legacyVersionSchema = z
  .object({
    id: z.uuid(),
    videoId: z.uuid(),
    ownerUserId: z.uuid(),
    ordinal: z.number().int().positive(),
    origin: savedVideoOriginSchema,
    sourceVersionId: z.uuid().nullable(),
    assetId: z.uuid(),
    thumbnailAssetId: z.uuid().nullable().default(null),
    mimeType: videoInputMimeTypeSchema,
    filename: z.string().trim().min(1).max(180),
    sizeBytes: z.number().int().positive(),
    durationMs: z.number().finite().positive().max(300_000),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

const versionV2Schema = legacyVersionSchema.extend({
  characterName: savedVideoCharacterNameSchema.nullable(),
});
const versionSchema = versionV2Schema.extend({
  durationMs: z.number().int().positive().max(300_000),
});
export const storedVideoVersionSchema = versionSchema.extend({
  characterVariantName: savedVideoCharacterVariantNameSchema.nullable(),
});

const videoSchema = z
  .object({
    id: z.uuid(),
    ownerUserId: z.uuid(),
    title: z.string().trim().min(1).max(120),
    currentVersionId: z.uuid(),
    sourceVideoId: z.uuid().nullable(),
    status: z.enum(['ready', 'missing', 'deleted']),
    createdAt: persistedTimestampSchema,
    updatedAt: persistedTimestampSchema,
    deletedAt: persistedTimestampSchema.nullable(),
  })
  .strict();

const legacyAggregateSchema = z
  .object({
    video: videoSchema,
    versions: z.array(legacyVersionSchema).min(1).max(100),
    revision: z.number().int().positive(),
  })
  .strict();
const aggregateV2Schema = legacyAggregateSchema.extend({
  versions: z.array(versionV2Schema).min(1).max(100),
});
const aggregateV3Schema = legacyAggregateSchema.extend({
  versions: z.array(versionSchema).min(1).max(100),
});
export const storedSavedVideoAggregateSchema = legacyAggregateSchema.extend({
  versions: z.array(storedVideoVersionSchema).min(1).max(100),
});
const receiptSchema = z
  .object({
    idempotencyKey: z.uuid(),
    videoId: z.uuid(),
    versionId: z.uuid(),
    createdAt: persistedTimestampSchema,
  })
  .strict();
const legacyLibrarySchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerUserId: z.uuid(),
    revision: z.number().int().nonnegative(),
    videos: z.array(legacyAggregateSchema),
    receipts: z.array(receiptSchema),
  })
  .strict();
const libraryV2Schema = legacyLibrarySchema.extend({
  schemaVersion: z.literal(2),
  videos: z.array(aggregateV2Schema),
});
const libraryV3Schema = legacyLibrarySchema.extend({
  schemaVersion: z.literal(3),
  videos: z.array(aggregateV3Schema),
});
export const savedVideoLibrarySchema = legacyLibrarySchema.extend({
  schemaVersion: z.literal(4),
  videos: z.array(storedSavedVideoAggregateSchema),
});

export type StoredVideoVersion = z.infer<typeof storedVideoVersionSchema>;
export type StoredSavedVideoAggregate = z.infer<typeof storedSavedVideoAggregateSchema>;

export const appendStoredVideoVersion = (
  current: StoredSavedVideoAggregate,
  version: StoredVideoVersion,
): StoredSavedVideoAggregate => ({
  video: {
    ...current.video,
    currentVersionId: version.id,
    status: 'ready',
    updatedAt: version.createdAt,
  },
  versions: [...current.versions, version],
  revision: current.revision + 1,
});

export interface StoredVideoVersionRead {
  readonly video: StoredSavedVideoAggregate['video'];
  readonly version: StoredVideoVersion;
}
export interface StoredSavedVideoSummary {
  readonly video: StoredSavedVideoAggregate['video'];
  readonly currentVersion: StoredVideoVersion;
  readonly versionCount: number;
}
export type SavedVideoReceipt = z.infer<typeof receiptSchema>;
export interface SavedVideoReceiptLookup {
  readonly ownerUserId: string;
  readonly idempotencyKey: string;
}
export type OwnedSavedVideoReceipt = SavedVideoReceipt & { readonly ownerUserId: string };
export type SavedVideoLibrary = z.infer<typeof savedVideoLibrarySchema>;

export interface SavedVideoRepositoryPage {
  readonly videos: readonly StoredSavedVideoSummary[];
  readonly total: number;
  readonly characterNames: readonly string[];
  readonly formats: readonly SavedVideoFormat[];
}

export interface SavedVideoRepository {
  findReceipt(ownerUserId: string, idempotencyKey: string): Promise<SavedVideoReceipt | null>;
  findActiveReceipts(
    lookups: readonly SavedVideoReceiptLookup[],
  ): Promise<readonly OwnedSavedVideoReceipt[]>;
  create(
    ownerUserId: string,
    aggregate: StoredSavedVideoAggregate,
    receipt: SavedVideoReceipt,
  ): Promise<StoredSavedVideoAggregate>;
  append(
    ownerUserId: string,
    videoId: string,
    expectedVersionId: string,
    version: StoredVideoVersion,
    receipt: SavedVideoReceipt,
  ): Promise<StoredSavedVideoAggregate | 'not-found' | 'conflict'>;
  list(ownerUserId: string): Promise<readonly StoredSavedVideoAggregate[]>;
  /** Storage-level paging is optional so the bounded local JSON repository stays simple. */
  listPage?(
    ownerUserId: string,
    query: SavedVideosQuery,
    offset: number,
  ): Promise<SavedVideoRepositoryPage>;
  referencedAssetIds(
    ownerUserId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
  get(ownerUserId: string, videoId: string): Promise<StoredSavedVideoAggregate | null>;
  getSummaries(
    ownerUserId: string,
    videoIds: readonly string[],
  ): Promise<readonly StoredSavedVideoSummary[]>;
  getVersion(
    ownerUserId: string,
    videoId: string,
    versionId: string,
  ): Promise<StoredVideoVersionRead | null>;
  /** Owner-checked exact Version access for a separately verified retained Project relation. */
  getRetainedVersion(
    ownerUserId: string,
    videoId: string,
    versionId: string,
  ): Promise<StoredVideoVersionRead | null>;
  rename(
    ownerUserId: string,
    videoId: string,
    title: string,
    updatedAt: string,
  ): Promise<StoredSavedVideoAggregate | null>;
  markMissing(ownerUserId: string, videoId: string, updatedAt: string): Promise<void>;
  setThumbnail(
    ownerUserId: string,
    videoId: string,
    versionId: string,
    assetId: string,
    updatedAt: string,
  ): Promise<StoredSavedVideoAggregate | null>;
  /**
   * Tombstones the owned record and returns its complete asset lineage. Repeated calls for an
   * already tombstoned record return the same lineage so failed physical cleanup can be retried.
   */
  delete(
    ownerUserId: string,
    videoId: string,
    deletedAt: string,
  ): Promise<StoredSavedVideoAggregate | null>;
}

const emptyLibrary = (ownerUserId: string): SavedVideoLibrary => ({
  schemaVersion: 4,
  ownerUserId,
  revision: 0,
  videos: [],
  receipts: [],
});

export class FileSavedVideoRepository implements SavedVideoRepository {
  readonly #root: string;
  readonly #ownerLock: KeyedLock;
  readonly #cache = new Map<string, SavedVideoLibrary>();
  readonly #loads = new Map<string, Promise<SavedVideoLibrary>>();

  constructor(dataDirectory: string, options: { readonly ownerLock?: KeyedLock } = {}) {
    this.#root = path.resolve(dataDirectory, 'metadata', 'v1', 'saved-videos');
    this.#ownerLock = options.ownerLock ?? new KeyedLock();
  }

  #file(ownerUserId: string): string {
    const segment = createHash('sha256').update(z.uuid().parse(ownerUserId)).digest('hex');
    return path.join(this.#root, `${segment}.json`);
  }

  #cacheLibrary(library: SavedVideoLibrary): void {
    this.#cache.delete(library.ownerUserId);
    this.#cache.set(library.ownerUserId, library);
    if (this.#cache.size > 16) {
      const oldestOwner = this.#cache.keys().next().value;
      if (oldestOwner !== undefined) this.#cache.delete(oldestOwner);
    }
  }

  async #read(ownerUserId: string): Promise<SavedVideoLibrary> {
    const cached = this.#cache.get(ownerUserId);
    if (cached !== undefined) {
      this.#cacheLibrary(cached);
      return cached;
    }
    const active = this.#loads.get(ownerUserId);
    if (active !== undefined) return active;

    const load = (async () => {
      try {
        const raw = JSON.parse(await readFile(this.#file(ownerUserId), 'utf8')) as unknown;
        const current = savedVideoLibrarySchema.safeParse(raw);
        let library: SavedVideoLibrary;
        let needsRewrite = false;
        if (current.success) {
          library = current.data;
          needsRewrite = JSON.stringify(raw) !== JSON.stringify(library);
        } else {
          const v3 = libraryV3Schema.safeParse(raw);
          const v2 = libraryV2Schema.safeParse(raw);
          const legacy = v3.success
            ? v3.data
            : v2.success
              ? v2.data
              : legacyLibrarySchema.parse(raw);
          library = savedVideoLibrarySchema.parse({
            ...legacy,
            schemaVersion: 4,
            videos: legacy.videos.map((aggregate) => ({
              ...aggregate,
              versions: aggregate.versions.map((version) => ({
                ...version,
                durationMs: Math.max(1, Math.round(version.durationMs)),
                characterName: 'characterName' in version ? version.characterName : null,
                characterVariantName: null,
              })),
            })),
          });
          needsRewrite = true;
        }
        if (library.ownerUserId !== ownerUserId) throw new Error('Saved video owner mismatch.');
        if (needsRewrite) await this.#write(library);
        else this.#cacheLibrary(library);
        return library;
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          const library = emptyLibrary(ownerUserId);
          this.#cacheLibrary(library);
          return library;
        }
        throw error;
      }
    })();
    this.#loads.set(ownerUserId, load);
    try {
      return await load;
    } finally {
      if (this.#loads.get(ownerUserId) === load) this.#loads.delete(ownerUserId);
    }
  }

  async #write(library: SavedVideoLibrary): Promise<void> {
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    await chmod(this.#root, 0o700);
    const filePath = this.#file(library.ownerUserId);
    const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
    try {
      const validated = savedVideoLibrarySchema.parse(library);
      const handle = await open(temporaryPath, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(validated)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, filePath);
      this.#cacheLibrary(validated);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async #mutate<Result>(
    ownerUserId: string,
    mutation: (library: SavedVideoLibrary) => Promise<Result> | Result,
  ): Promise<Result> {
    return this.#ownerLock.run(ownerUserId, async () => mutation(await this.#read(ownerUserId)));
  }

  async findReceipt(
    ownerUserId: string,
    idempotencyKey: string,
  ): Promise<SavedVideoReceipt | null> {
    return (
      (await this.#read(ownerUserId)).receipts.find(
        (item) => item.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async findActiveReceipts(
    lookups: readonly SavedVideoReceiptLookup[],
  ): Promise<readonly OwnedSavedVideoReceipt[]> {
    const keysByOwner = new Map<string, Set<string>>();
    for (const { ownerUserId, idempotencyKey } of lookups) {
      const keys = keysByOwner.get(ownerUserId) ?? new Set<string>();
      keys.add(idempotencyKey);
      keysByOwner.set(ownerUserId, keys);
    }
    const matches = await Promise.all(
      [...keysByOwner].map(async ([ownerUserId, keys]) => {
        const library = await this.#read(ownerUserId);
        const activeVideoIds = new Set(
          library.videos
            .filter(({ video }) => video.deletedAt === null)
            .map(({ video }) => video.id),
        );
        return library.receipts
          .filter(
            (receipt) => keys.has(receipt.idempotencyKey) && activeVideoIds.has(receipt.videoId),
          )
          .map((receipt) => ({ ...receipt, ownerUserId }));
      }),
    );
    return matches.flat();
  }

  async create(
    ownerUserId: string,
    aggregate: StoredSavedVideoAggregate,
    receipt: SavedVideoReceipt,
  ): Promise<StoredSavedVideoAggregate> {
    return this.#mutate(ownerUserId, async (library) => {
      const duplicate = library.receipts.find(
        (item) => item.idempotencyKey === receipt.idempotencyKey,
      );
      if (duplicate !== undefined) {
        const existing = library.videos.find((item) => item.video.id === duplicate.videoId);
        if (existing !== undefined) return existing;
      }
      await this.#write({
        ...library,
        revision: library.revision + 1,
        videos: [...library.videos, aggregate],
        receipts: [...library.receipts, receipt].slice(-500),
      });
      return aggregate;
    });
  }

  async append(
    ownerUserId: string,
    videoId: string,
    expectedVersionId: string,
    version: StoredVideoVersion,
    receipt: SavedVideoReceipt,
  ): Promise<StoredSavedVideoAggregate | 'not-found' | 'conflict'> {
    return this.#mutate(ownerUserId, async (library) => {
      const duplicate = library.receipts.find(
        (item) => item.idempotencyKey === receipt.idempotencyKey,
      );
      if (duplicate !== undefined)
        return library.videos.find((item) => item.video.id === duplicate.videoId) ?? 'not-found';
      const index = library.videos.findIndex(
        (item) => item.video.id === videoId && item.video.deletedAt === null,
      );
      if (index < 0) return 'not-found';
      const current = library.videos[index];
      if (current === undefined || current.video.currentVersionId !== expectedVersionId)
        return 'conflict';
      const next = storedSavedVideoAggregateSchema.parse(
        appendStoredVideoVersion(current, version),
      );
      const videos = [...library.videos];
      videos[index] = next;
      await this.#write({
        ...library,
        revision: library.revision + 1,
        videos,
        receipts: [...library.receipts, receipt].slice(-500),
      });
      return next;
    });
  }

  async list(ownerUserId: string): Promise<readonly StoredSavedVideoAggregate[]> {
    return (await this.#read(ownerUserId)).videos.filter((item) => item.video.deletedAt === null);
  }

  async referencedAssetIds(
    ownerUserId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const candidates = new Set(assetIds);
    const referenced = new Set<string>();
    if (candidates.size === 0) return referenced;

    for (const aggregate of await this.list(ownerUserId)) {
      for (const version of aggregate.versions) {
        if (candidates.has(version.assetId)) referenced.add(version.assetId);
        if (version.thumbnailAssetId !== null && candidates.has(version.thumbnailAssetId)) {
          referenced.add(version.thumbnailAssetId);
        }
      }
    }
    return referenced;
  }

  async get(ownerUserId: string, videoId: string): Promise<StoredSavedVideoAggregate | null> {
    return (
      (await this.#read(ownerUserId)).videos.find(
        (item) => item.video.id === videoId && item.video.deletedAt === null,
      ) ?? null
    );
  }

  async getSummaries(
    ownerUserId: string,
    videoIds: readonly string[],
  ): Promise<readonly StoredSavedVideoSummary[]> {
    const requested = new Set(videoIds);
    if (requested.size === 0) return [];
    return (await this.#read(ownerUserId)).videos.flatMap((aggregate) => {
      if (!requested.has(aggregate.video.id) || aggregate.video.deletedAt !== null) return [];
      const currentVersion = aggregate.versions.find(
        ({ id }) => id === aggregate.video.currentVersionId,
      );
      return currentVersion
        ? [{ video: aggregate.video, currentVersion, versionCount: aggregate.versions.length }]
        : [];
    });
  }

  async getVersion(
    ownerUserId: string,
    videoId: string,
    versionId: string,
  ): Promise<StoredVideoVersionRead | null> {
    const aggregate = await this.get(ownerUserId, videoId);
    const version = aggregate?.versions.find(({ id }) => id === versionId);
    return aggregate === null || version === undefined ? null : { video: aggregate.video, version };
  }

  async getRetainedVersion(
    ownerUserId: string,
    videoId: string,
    versionId: string,
  ): Promise<StoredVideoVersionRead | null> {
    const aggregate = (await this.#read(ownerUserId)).videos.find(
      (item) => item.video.id === videoId,
    );
    const version = aggregate?.versions.find(({ id }) => id === versionId);
    return aggregate === undefined || version === undefined
      ? null
      : { video: aggregate.video, version };
  }

  /** Called only while the shared owner lock is held by the local composite output unit of work. */
  readLibraryForProjectOutput(ownerUserId: string): Promise<SavedVideoLibrary> {
    return this.#read(ownerUserId);
  }

  /** Called only while the shared owner lock is held and a durable composite journal exists. */
  writeLibraryForProjectOutput(library: SavedVideoLibrary): Promise<void> {
    return this.#write(savedVideoLibrarySchema.parse(library));
  }

  async rename(
    ownerUserId: string,
    videoId: string,
    title: string,
    updatedAt: string,
  ): Promise<StoredSavedVideoAggregate | null> {
    return this.#mutate(ownerUserId, async (library) => {
      const index = library.videos.findIndex(
        (item) => item.video.id === videoId && item.video.deletedAt === null,
      );
      if (index < 0) return null;
      const current = library.videos[index];
      if (current === undefined) return null;
      const next = storedSavedVideoAggregateSchema.parse({
        ...current,
        video: { ...current.video, title, updatedAt },
        revision: current.revision + 1,
      });
      const videos = [...library.videos];
      videos[index] = next;
      await this.#write({ ...library, revision: library.revision + 1, videos });
      return next;
    });
  }

  async markMissing(ownerUserId: string, videoId: string, updatedAt: string): Promise<void> {
    await this.#mutate(ownerUserId, async (library) => {
      const index = library.videos.findIndex(
        (item) => item.video.id === videoId && item.video.deletedAt === null,
      );
      const current = library.videos[index];
      if (index < 0 || current === undefined || current.video.status === 'missing') return;
      const videos = [...library.videos];
      videos[index] = storedSavedVideoAggregateSchema.parse({
        ...current,
        video: { ...current.video, status: 'missing', updatedAt },
        revision: current.revision + 1,
      });
      await this.#write({ ...library, revision: library.revision + 1, videos });
    });
  }

  async setThumbnail(
    ownerUserId: string,
    videoId: string,
    versionId: string,
    assetId: string,
    updatedAt: string,
  ): Promise<StoredSavedVideoAggregate | null> {
    return this.#mutate(ownerUserId, async (library) => {
      const index = library.videos.findIndex(
        (item) => item.video.id === videoId && item.video.deletedAt === null,
      );
      const current = library.videos[index];
      if (index < 0 || current === undefined) return null;
      const versionIndex = current.versions.findIndex((item) => item.id === versionId);
      const version = current.versions[versionIndex];
      if (versionIndex < 0 || version === undefined) return null;
      if (version.thumbnailAssetId !== null) return current;
      const versions = [...current.versions];
      versions[versionIndex] = storedVideoVersionSchema.parse({
        ...version,
        thumbnailAssetId: assetId,
      });
      const next = storedSavedVideoAggregateSchema.parse({
        ...current,
        video: { ...current.video, updatedAt },
        versions,
        revision: current.revision + 1,
      });
      const videos = [...library.videos];
      videos[index] = next;
      await this.#write({ ...library, revision: library.revision + 1, videos });
      return next;
    });
  }

  async delete(
    ownerUserId: string,
    videoId: string,
    deletedAt: string,
  ): Promise<StoredSavedVideoAggregate | null> {
    return this.#mutate(ownerUserId, async (library) => {
      const index = library.videos.findIndex((item) => item.video.id === videoId);
      const current = library.videos[index];
      if (index < 0 || current === undefined) return null;
      if (current.video.deletedAt !== null) return current;
      const videos = [...library.videos];
      const deleted = storedSavedVideoAggregateSchema.parse({
        ...current,
        video: { ...current.video, status: 'deleted', deletedAt, updatedAt: deletedAt },
        revision: current.revision + 1,
      });
      videos[index] = deleted;
      await this.#write({ ...library, revision: library.revision + 1, videos });
      return deleted;
    });
  }
}
