import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  createReferenceImageLayout,
  createStoredReferenceImageMetadata,
  isReferenceImageCodecError,
  parseReferenceImageAssetIndex,
  parseReferenceImageAssetId,
  parseReferenceImageIdempotencyMapping,
  parseStoredReferenceImageMetadata,
  REFERENCE_IMAGE_INDEX_VERSION,
  REFERENCE_IMAGE_DIRECTORY_MODE,
  REFERENCE_IMAGE_FILE_MODE,
  referenceImageContentFilename,
  type ReferenceImageLayout,
  referenceImageMappingPath,
  referenceImageStorageKey,
  serializeReferenceImageAssetIndex,
  serializeReferenceImageIdempotencyMapping,
  serializeStoredReferenceImageMetadata,
  STALE_REFERENCE_IMAGE_TEMP_AGE_MS,
  type StoredReferenceImageMetadata,
  type StoreReferenceImageInput,
} from './asset-layout.js';

export type {
  StoredReferenceImageMetadata,
  StoreGeneratedReferenceImageInput,
  StoreReferenceImageInput,
} from './asset-layout.js';

export interface StoredReferenceImageContent {
  readonly metadata: StoredReferenceImageMetadata;
  readonly bytes: Buffer;
}

export interface StoredReferenceImageFile {
  readonly metadata: StoredReferenceImageMetadata;
  readonly path: string;
}

export interface ReferenceImageAssetStore {
  findByRequestId(
    localOwnerId: string,
    requestId: string,
  ): Promise<StoredReferenceImageMetadata | null>;
  getMetadata(localOwnerId: string, assetId: string): Promise<StoredReferenceImageMetadata | null>;
  getContent(localOwnerId: string, assetId: string): Promise<StoredReferenceImageContent | null>;
  getContentFile?(localOwnerId: string, assetId: string): Promise<StoredReferenceImageFile | null>;
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
  readonly #legacyOwnerUserId: string | undefined;
  readonly #requestIndex = new Map<string, string>();
  readonly #metadataIndex = new Map<string, StoredReferenceImageMetadata>();
  #initialized: Promise<void> | undefined;

  constructor(
    dataDirectory: string,
    options: {
      readonly createAssetId?: () => string;
      readonly now?: () => Date;
      readonly legacyOwnerUserId?: string;
    } = {},
  ) {
    this.#layout = createReferenceImageLayout(dataDirectory);
    this.#createAssetId = options.createAssetId ?? randomUUID;
    this.#now = options.now ?? (() => new Date());
    this.#legacyOwnerUserId = options.legacyOwnerUserId;
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
      if (!(await this.#loadPersistedIndex())) {
        await this.#rebuildIndexFromLegacyAssets();
      }
    })();
    try {
      await this.#initialized;
    } catch (error) {
      this.#initialized = undefined;
      if (error instanceof ReferenceImageStorageError) throw error;
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

  #requestKey(localOwnerId: string, requestId: string): string {
    return `${localOwnerId}\0${requestId}`;
  }

  async #readMetadataFile(assetId: string): Promise<StoredReferenceImageMetadata | null> {
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
      const directoryHandle = await open(path.dirname(filePath), 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  #replaceIndexes(assets: Iterable<StoredReferenceImageMetadata>): void {
    this.#requestIndex.clear();
    this.#metadataIndex.clear();
    for (const metadata of assets) {
      this.#metadataIndex.set(metadata.assetId, metadata);
      this.#requestIndex.set(
        this.#requestKey(metadata.localOwnerId, metadata.requestId),
        metadata.assetId,
      );
    }
  }

  async #claimLegacyAssets(
    assets: readonly StoredReferenceImageMetadata[],
  ): Promise<readonly StoredReferenceImageMetadata[]> {
    if (this.#legacyOwnerUserId === undefined) return assets;
    let changed = false;
    const claimed: StoredReferenceImageMetadata[] = [];
    for (const metadata of assets) {
      if (!/^[a-f0-9]{64}$/u.test(metadata.localOwnerId)) {
        claimed.push(metadata);
        continue;
      }
      changed = true;
      const next = { ...metadata, localOwnerId: this.#legacyOwnerUserId };
      const parsed = parseStoredReferenceImageMetadata(next);
      claimed.push(parsed);
      await this.#writeFileAtomic(
        path.join(this.#assetDirectory(parsed.assetId), 'metadata.json'),
        serializeStoredReferenceImageMetadata(parsed),
      );
      await this.#repairMappingIfNeeded(parsed);
    }
    if (changed) await this.#persistIndex(claimed);
    return claimed;
  }

  async #loadPersistedIndex(): Promise<boolean> {
    try {
      await stat(this.#layout.indexDirtyPath);
      return false;
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
    }
    try {
      const index = parseReferenceImageAssetIndex(await readJson(this.#layout.indexPath));
      this.#replaceIndexes(await this.#claimLegacyAssets(index.assets));
      return true;
    } catch (error) {
      if (isMissingPathError(error) || isReferenceImageCodecError(error)) return false;
      throw error;
    }
  }

  async #persistIndex(
    assets: Iterable<StoredReferenceImageMetadata> = this.#metadataIndex.values(),
  ): Promise<void> {
    await this.#writeFileAtomic(this.#layout.indexPath, serializeReferenceImageAssetIndex(assets));
    await rm(this.#layout.indexDirtyPath, { force: true });
    const rootHandle = await open(this.#layout.root, 'r');
    try {
      await rootHandle.sync();
    } finally {
      await rootHandle.close();
    }
  }

  async #markIndexDirty(): Promise<void> {
    await this.#writeFileAtomic(
      this.#layout.indexDirtyPath,
      `${JSON.stringify({ schemaVersion: REFERENCE_IMAGE_INDEX_VERSION })}\n`,
    );
  }

  async #rebuildIndexFromLegacyAssets(): Promise<void> {
    const metadataByAssetId = new Map<string, StoredReferenceImageMetadata>();
    const entries = (await readdir(this.#layout.assetsRoot, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.tmp-')) continue;
      let metadata: StoredReferenceImageMetadata | null;
      try {
        metadata = await this.#readMetadataFile(entry.name);
      } catch (error) {
        if (isMalformedStoredJsonError(error)) continue;
        throw error;
      }
      if (metadata === null) continue;
      if (metadata.assetId !== entry.name) continue;
      const [claimed] = await this.#claimLegacyAssets([metadata]);
      if (claimed === undefined) continue;
      metadataByAssetId.set(claimed.assetId, claimed);
      await this.#repairMappingIfNeeded(claimed);
    }
    await this.#persistIndex(metadataByAssetId.values());
    this.#replaceIndexes(metadataByAssetId.values());
  }

  async #repairMappingIfNeeded(metadata: StoredReferenceImageMetadata): Promise<void> {
    try {
      const mapping = parseReferenceImageIdempotencyMapping(
        await readJson(this.#mappingPath(metadata.localOwnerId, metadata.requestId)),
      );
      if (
        mapping.localOwnerId === metadata.localOwnerId &&
        mapping.requestId === metadata.requestId &&
        mapping.assetId === metadata.assetId
      ) {
        return;
      }
    } catch (error) {
      if (!isMissingPathError(error) && !isReferenceImageCodecError(error)) throw error;
    }
    await this.#persistMapping(metadata);
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
    const assetId = this.#requestIndex.get(this.#requestKey(localOwnerId, requestId));
    if (assetId === undefined) return null;
    const metadata = this.#metadataIndex.get(assetId) ?? null;
    return metadata?.localOwnerId === localOwnerId && metadata.requestId === requestId
      ? metadata
      : null;
  }

  async getMetadata(
    localOwnerId: string,
    assetId: string,
  ): Promise<StoredReferenceImageMetadata | null> {
    await this.#initialize();
    const metadata = this.#metadataIndex.get(assetId) ?? null;
    return metadata?.localOwnerId === localOwnerId ? metadata : null;
  }

  async getContent(
    localOwnerId: string,
    assetId: string,
  ): Promise<StoredReferenceImageContent | null> {
    const file = await this.getContentFile(localOwnerId, assetId);
    if (file === null) return null;
    try {
      const bytes = await readFile(file.path);
      if (bytes.byteLength !== file.metadata.byteSize) {
        throw new ReferenceImageStorageError('Reference image content size is inconsistent.');
      }
      return { metadata: file.metadata, bytes };
    } catch (error) {
      if (error instanceof ReferenceImageStorageError) throw error;
      if (isMissingPathError(error)) return null;
      throw new ReferenceImageStorageError('Reference image content could not be read.', {
        cause: error,
      });
    }
  }

  async getContentFile(
    localOwnerId: string,
    assetId: string,
  ): Promise<StoredReferenceImageFile | null> {
    const metadata = await this.getMetadata(localOwnerId, assetId);
    if (metadata === null) return null;
    const expectedStorageKey = referenceImageStorageKey(metadata.assetId, metadata.mimeType);
    if (metadata.storageKey !== expectedStorageKey) {
      throw new ReferenceImageStorageError('Reference image storage metadata is inconsistent.');
    }
    const contentPath = path.join(this.#assetDirectory(assetId), path.basename(expectedStorageKey));
    try {
      if ((await stat(contentPath)).size !== metadata.byteSize) {
        throw new ReferenceImageStorageError('Reference image content size is inconsistent.');
      }
      return { metadata, path: contentPath };
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
      await this.#markIndexDirty();
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
      this.#requestIndex.set(this.#requestKey(input.localOwnerId, input.requestId), assetId);
      this.#metadataIndex.set(assetId, metadata);
      await this.#persistIndex();
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
