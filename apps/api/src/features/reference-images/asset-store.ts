import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createReferenceImageLayout,
  createStoredReferenceImageMetadata,
  isReferenceImageCodecError,
  parseReferenceImageAssetId,
  parseReferenceImageIdempotencyMapping,
  parseStoredReferenceImageMetadata,
  REFERENCE_IMAGE_DIRECTORY_MODE,
  REFERENCE_IMAGE_FILE_MODE,
  referenceImageContentFilename,
  type ReferenceImageIdempotencyMapping,
  type ReferenceImageLayout,
  referenceImageMappingPath,
  referenceImageStorageKey,
  serializeReferenceImageIdempotencyMapping,
  serializeStoredReferenceImageMetadata,
  STALE_REFERENCE_IMAGE_TEMP_AGE_MS,
  type StoredReferenceImageMetadata,
  type StoreReferenceImageInput,
} from './asset-layout.js';

export type { StoredReferenceImageMetadata, StoreReferenceImageInput } from './asset-layout.js';

export interface StoredReferenceImageContent {
  readonly metadata: StoredReferenceImageMetadata;
  readonly bytes: Buffer;
}

export interface ReferenceImageAssetStore {
  findByRequestId(
    localOwnerId: string,
    requestId: string,
  ): Promise<StoredReferenceImageMetadata | null>;
  getMetadata(localOwnerId: string, assetId: string): Promise<StoredReferenceImageMetadata | null>;
  getContent(localOwnerId: string, assetId: string): Promise<StoredReferenceImageContent | null>;
  store(input: StoreReferenceImageInput): Promise<StoredReferenceImageMetadata>;
}

export class ReferenceImageStorageError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ReferenceImageStorageError';
  }
}

const isMalformedStoredJsonError = (error: unknown): boolean =>
  error instanceof ReferenceImageStorageError && isReferenceImageCodecError(error.cause);

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, 'utf8')) as unknown;

const isMissingPathError = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export class LocalReferenceImageAssetStore implements ReferenceImageAssetStore {
  readonly #layout: ReferenceImageLayout;
  readonly #createAssetId: () => string;
  readonly #now: () => Date;
  #initialized: Promise<void> | undefined;

  constructor(
    dataDirectory: string,
    options: { readonly createAssetId?: () => string; readonly now?: () => Date } = {},
  ) {
    this.#layout = createReferenceImageLayout(dataDirectory);
    this.#createAssetId = options.createAssetId ?? randomUUID;
    this.#now = options.now ?? (() => new Date());
  }

  async #initialize(): Promise<void> {
    this.#initialized ??= (async () => {
      const ownedDirectories = [
        path.dirname(this.#layout.root),
        this.#layout.root,
        this.#layout.assetsRoot,
        this.#layout.idempotencyRoot,
      ];
      for (const directory of ownedDirectories) {
        await mkdir(directory, { recursive: true, mode: REFERENCE_IMAGE_DIRECTORY_MODE });
        await chmod(directory, REFERENCE_IMAGE_DIRECTORY_MODE);
      }
      await this.#removeStaleTemporaryDirectories();
    })();
    try {
      await this.#initialized;
    } catch (error) {
      this.#initialized = undefined;
      throw new ReferenceImageStorageError('Reference image storage could not be initialized.', {
        cause: error,
      });
    }
  }

  async #removeStaleTemporaryDirectories(): Promise<void> {
    const cutoff = this.#now().getTime() - STALE_REFERENCE_IMAGE_TEMP_AGE_MS;
    const entries = await readdir(this.#layout.assetsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('.tmp-')) continue;
      const temporaryDirectory = path.join(this.#layout.assetsRoot, entry.name);
      try {
        if ((await stat(temporaryDirectory)).mtimeMs <= cutoff) {
          await rm(temporaryDirectory, { recursive: true, force: true });
        }
      } catch (error) {
        if (!isMissingPathError(error)) throw error;
      }
    }
  }

  #assetDirectory(assetId: string): string {
    const parsed = parseReferenceImageAssetId(assetId);
    if (parsed === null) throw new ReferenceImageStorageError('Invalid reference image asset ID.');
    return path.join(this.#layout.assetsRoot, parsed);
  }

  #mappingPath(localOwnerId: string, requestId: string): string {
    return referenceImageMappingPath(this.#layout, localOwnerId, requestId);
  }

  async #readMetadata(assetId: string): Promise<StoredReferenceImageMetadata | null> {
    try {
      return parseStoredReferenceImageMetadata(
        await readJson(path.join(this.#assetDirectory(assetId), 'metadata.json')),
      );
    } catch (error) {
      if (isMissingPathError(error)) return null;
      throw new ReferenceImageStorageError('Reference image metadata could not be read.', {
        cause: error,
      });
    }
  }

  async #writeFileAtomic(filePath: string, data: string): Promise<void> {
    const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await mkdir(path.dirname(filePath), {
        recursive: true,
        mode: REFERENCE_IMAGE_DIRECTORY_MODE,
      });
      await chmod(path.dirname(filePath), REFERENCE_IMAGE_DIRECTORY_MODE);
      handle = await open(temporaryPath, 'wx', REFERENCE_IMAGE_FILE_MODE);
      await handle.writeFile(data, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, filePath);
      await chmod(filePath, REFERENCE_IMAGE_FILE_MODE);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async #recoverByRequestId(
    localOwnerId: string,
    requestId: string,
  ): Promise<StoredReferenceImageMetadata | null> {
    const entries = await readdir(this.#layout.assetsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.tmp-')) continue;
      let metadata: StoredReferenceImageMetadata | null;
      try {
        metadata = await this.#readMetadata(entry.name);
      } catch (error) {
        if (isMalformedStoredJsonError(error)) continue;
        throw error;
      }
      if (metadata?.localOwnerId === localOwnerId && metadata.requestId === requestId) {
        await this.#persistMapping(metadata);
        return metadata;
      }
    }
    return null;
  }

  async #persistMapping(metadata: StoredReferenceImageMetadata): Promise<void> {
    await this.#writeFileAtomic(
      this.#mappingPath(metadata.localOwnerId, metadata.requestId),
      serializeReferenceImageIdempotencyMapping(metadata),
    );
  }

  async findByRequestId(
    localOwnerId: string,
    requestId: string,
  ): Promise<StoredReferenceImageMetadata | null> {
    await this.#initialize();
    let mapping: ReferenceImageIdempotencyMapping | undefined;
    try {
      mapping = parseReferenceImageIdempotencyMapping(
        await readJson(this.#mappingPath(localOwnerId, requestId)),
      );
    } catch (error) {
      if (!isMissingPathError(error) && !isReferenceImageCodecError(error)) {
        throw new ReferenceImageStorageError(
          'Reference image idempotency data could not be read.',
          { cause: error },
        );
      }
    }

    if (mapping?.localOwnerId === localOwnerId && mapping.requestId === requestId) {
      try {
        const metadata = await this.#readMetadata(mapping.assetId);
        if (metadata?.localOwnerId === localOwnerId && metadata.requestId === requestId) {
          return metadata;
        }
      } catch (error) {
        if (!isMalformedStoredJsonError(error)) throw error;
      }
    }

    try {
      return await this.#recoverByRequestId(localOwnerId, requestId);
    } catch (error) {
      if (error instanceof ReferenceImageStorageError) throw error;
      throw new ReferenceImageStorageError('Reference image idempotency recovery failed.', {
        cause: error,
      });
    }
  }

  async getMetadata(
    localOwnerId: string,
    assetId: string,
  ): Promise<StoredReferenceImageMetadata | null> {
    await this.#initialize();
    const metadata = await this.#readMetadata(assetId);
    return metadata?.localOwnerId === localOwnerId ? metadata : null;
  }

  async getContent(
    localOwnerId: string,
    assetId: string,
  ): Promise<StoredReferenceImageContent | null> {
    const metadata = await this.getMetadata(localOwnerId, assetId);
    if (metadata === null) return null;
    const expectedStorageKey = referenceImageStorageKey(metadata.assetId, metadata.mimeType);
    if (metadata.storageKey !== expectedStorageKey) {
      throw new ReferenceImageStorageError('Reference image storage metadata is inconsistent.');
    }
    try {
      const bytes = await readFile(
        path.join(this.#assetDirectory(assetId), path.basename(expectedStorageKey)),
      );
      if (bytes.byteLength !== metadata.byteSize) {
        throw new ReferenceImageStorageError('Reference image content size is inconsistent.');
      }
      return { metadata, bytes };
    } catch (error) {
      if (error instanceof ReferenceImageStorageError) throw error;
      if (isMissingPathError(error)) return null;
      throw new ReferenceImageStorageError('Reference image content could not be read.', {
        cause: error,
      });
    }
  }

  async store(input: StoreReferenceImageInput): Promise<StoredReferenceImageMetadata> {
    await this.#initialize();
    const existing = await this.findByRequestId(input.localOwnerId, input.requestId);
    if (existing !== null) return existing;

    const assetId = this.#createAssetId();
    const finalDirectory = this.#assetDirectory(assetId);
    const temporaryDirectory = path.join(
      this.#layout.assetsRoot,
      `.tmp-${assetId}-${randomUUID()}`,
    );
    const filename = referenceImageContentFilename(input.mimeType);
    const timestamp = this.#now().toISOString();
    const metadata = createStoredReferenceImageMetadata(input, assetId, timestamp);

    try {
      await mkdir(temporaryDirectory, { mode: REFERENCE_IMAGE_DIRECTORY_MODE });
      const contentHandle = await open(
        path.join(temporaryDirectory, filename),
        'wx',
        REFERENCE_IMAGE_FILE_MODE,
      );
      try {
        await contentHandle.writeFile(input.bytes);
        await contentHandle.sync();
      } finally {
        await contentHandle.close();
      }
      const metadataHandle = await open(
        path.join(temporaryDirectory, 'metadata.json'),
        'wx',
        REFERENCE_IMAGE_FILE_MODE,
      );
      try {
        await metadataHandle.writeFile(serializeStoredReferenceImageMetadata(metadata), 'utf8');
        await metadataHandle.sync();
      } finally {
        await metadataHandle.close();
      }
      await rename(temporaryDirectory, finalDirectory);
      await this.#persistMapping(metadata);
      return metadata;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      // A completed asset directory is intentionally retained if only the mapping write fails.
      // findByRequestId scans metadata and repairs that mapping, preventing rebilling on retry.
      throw new ReferenceImageStorageError('Reference image bytes could not be stored.', {
        cause: error,
      });
    }
  }
}
