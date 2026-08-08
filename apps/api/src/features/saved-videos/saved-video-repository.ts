import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  savedVideoCharacterNameSchema,
  savedVideoOriginSchema,
  videoInputMimeTypeSchema,
  type SavedVideoFormat,
  type SavedVideosQuery,
} from '@studio/contracts';
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
const aggregateSchema = legacyAggregateSchema.extend({
  versions: z.array(versionSchema).min(1).max(100),
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
const librarySchema = legacyLibrarySchema.extend({
  schemaVersion: z.literal(3),
  videos: z.array(aggregateSchema),
});

export type StoredVideoVersion = z.infer<typeof versionSchema>;
export type StoredSavedVideoAggregate = z.infer<typeof aggregateSchema>;
export type SavedVideoReceipt = z.infer<typeof receiptSchema>;
type SavedVideoLibrary = z.infer<typeof librarySchema>;

export interface SavedVideoRepositoryPage {
  readonly videos: readonly StoredSavedVideoAggregate[];
  readonly total: number;
  readonly characterNames: readonly string[];
  readonly formats: readonly SavedVideoFormat[];
}

export interface SavedVideoRepository {
  findReceipt(ownerUserId: string, idempotencyKey: string): Promise<SavedVideoReceipt | null>;
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
  get(ownerUserId: string, videoId: string): Promise<StoredSavedVideoAggregate | null>;
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
  delete(ownerUserId: string, videoId: string, deletedAt: string): Promise<boolean>;
}

const emptyLibrary = (ownerUserId: string): SavedVideoLibrary => ({
  schemaVersion: 3,
  ownerUserId,
  revision: 0,
  videos: [],
  receipts: [],
});

export class FileSavedVideoRepository implements SavedVideoRepository {
  readonly #root: string;
  readonly #locks = new Map<string, Promise<unknown>>();
  readonly #cache = new Map<string, SavedVideoLibrary>();
  readonly #loads = new Map<string, Promise<SavedVideoLibrary>>();

  constructor(dataDirectory: string) {
    this.#root = path.resolve(dataDirectory, 'metadata', 'v1', 'saved-videos');
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
        const current = librarySchema.safeParse(raw);
        let library: SavedVideoLibrary;
        let needsRewrite = false;
        if (current.success) {
          library = current.data;
          needsRewrite = JSON.stringify(raw) !== JSON.stringify(library);
        } else {
          const v2 = libraryV2Schema.safeParse(raw);
          const legacy = v2.success ? v2.data : legacyLibrarySchema.parse(raw);
          library = librarySchema.parse({
            ...legacy,
            schemaVersion: 3,
            videos: legacy.videos.map((aggregate) => ({
              ...aggregate,
              versions: aggregate.versions.map((version) => ({
                ...version,
                durationMs: Math.max(1, Math.round(version.durationMs)),
                characterName: 'characterName' in version ? version.characterName : null,
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
      const validated = librarySchema.parse(library);
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
    const prior = this.#locks.get(ownerUserId) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prior.then(() => next);
    this.#locks.set(ownerUserId, chain);
    await prior;
    try {
      return await mutation(await this.#read(ownerUserId));
    } finally {
      release();
      if (this.#locks.get(ownerUserId) === chain) this.#locks.delete(ownerUserId);
    }
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
      const next: StoredSavedVideoAggregate = aggregateSchema.parse({
        video: {
          ...current.video,
          currentVersionId: version.id,
          status: 'ready',
          updatedAt: version.createdAt,
        },
        versions: [...current.versions, version],
        revision: current.revision + 1,
      });
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

  async get(ownerUserId: string, videoId: string): Promise<StoredSavedVideoAggregate | null> {
    return (
      (await this.#read(ownerUserId)).videos.find(
        (item) => item.video.id === videoId && item.video.deletedAt === null,
      ) ?? null
    );
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
      const next = aggregateSchema.parse({
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
      videos[index] = aggregateSchema.parse({
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
      versions[versionIndex] = versionSchema.parse({ ...version, thumbnailAssetId: assetId });
      const next = aggregateSchema.parse({
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

  async delete(ownerUserId: string, videoId: string, deletedAt: string): Promise<boolean> {
    return this.#mutate(ownerUserId, async (library) => {
      const index = library.videos.findIndex(
        (item) => item.video.id === videoId && item.video.deletedAt === null,
      );
      const current = library.videos[index];
      if (index < 0 || current === undefined) return false;
      const videos = [...library.videos];
      videos[index] = aggregateSchema.parse({
        ...current,
        video: { ...current.video, status: 'deleted', deletedAt, updatedAt: deletedAt },
        revision: current.revision + 1,
      });
      await this.#write({ ...library, revision: library.revision + 1, videos });
      return true;
    });
  }
}
