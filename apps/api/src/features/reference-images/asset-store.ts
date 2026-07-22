import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  characterPromptOptimizationInputHashSchema,
  characterPromptOptimizationResultSchema,
  characterReferenceGeneratorSchema,
  characterReferenceOptionsSchema,
  REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH,
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_MODEL_ID,
  REFERENCE_IMAGE_PROMPT_MAX_LENGTH,
  REFERENCE_IMAGE_QUALITY,
  referenceImageSizeSchema,
  type CharacterPromptOptimizationResult,
  type CharacterReferenceGenerator,
  type CharacterReferenceOptions,
  type ReferenceImageSize,
} from '@studio/contracts';
import type { ValidReferenceImageMimeType } from './image-validation.js';

const ASSET_LAYOUT_VERSION = 1;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

const promptAuditSchema = z
  .object({
    optimizationEnabled: z.boolean(),
    result: characterPromptOptimizationResultSchema,
    options: characterReferenceOptionsSchema,
    requestedGenerator: characterReferenceGeneratorSchema.nullable(),
    optimizer: z
      .object({
        model: z.string().trim().min(1).max(128),
        version: z.string().trim().min(1).max(128),
      })
      .strict()
      .nullable(),
    inputHash: characterPromptOptimizationInputHashSchema.nullable(),
    manuallyEdited: z.boolean(),
  })
  .strict();

const internalDerivationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('generate') }).strict(),
  z
    .object({
      kind: z.literal('edit'),
      sourceAssetId: z.uuid(),
      changeInstructionsHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict(),
]);

const internalMetadataSchema = z
  .object({
    schemaVersion: z.literal(ASSET_LAYOUT_VERSION),
    assetId: z.uuid(),
    localOwnerId: z.string().regex(/^[a-f0-9]{64}$/u),
    storageKey: z.string().min(1),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    size: referenceImageSizeSchema.optional(),
    width: z.union([z.literal(1024), z.literal(1536)]),
    height: z.union([z.literal(1024), z.literal(1536)]),
    byteSize: z
      .number()
      .int()
      .positive()
      .max(REFERENCE_IMAGE_MAX_BYTES - 1),
    source: z.literal('generated'),
    provider: z.literal('openai'),
    model: z.string().trim().min(1).max(128),
    quality: z.enum(['high', 'medium']).optional(),
    originalPrompt: z.string().min(1).max(REFERENCE_IMAGE_PROMPT_MAX_LENGTH),
    derivedPrompt: z.string().min(1).max(REFERENCE_IMAGE_GENERATION_PROMPT_MAX_LENGTH),
    promptAudit: promptAuditSchema.optional(),
    promptHash: z.string().regex(/^[a-f0-9]{64}$/u),
    requestId: z.uuid(),
    requestFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    derivation: internalDerivationSchema.optional(),
    providerRequestId: z.string().min(1).max(500).optional(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const size = value.size ?? '1024x1024';
    const dimensions =
      size === '1024x1536'
        ? { width: 1024, height: 1536 }
        : size === '1536x1024'
          ? { width: 1536, height: 1024 }
          : { width: 1024, height: 1024 };
    if (value.width !== dimensions.width || value.height !== dimensions.height) {
      context.addIssue({ code: 'custom', message: 'Stored image dimensions do not match size.' });
    }
  });

const idempotencyMappingSchema = z
  .object({
    schemaVersion: z.literal(ASSET_LAYOUT_VERSION),
    localOwnerId: z.string().regex(/^[a-f0-9]{64}$/u),
    requestId: z.uuid(),
    assetId: z.uuid(),
  })
  .strict();

export type StoredReferenceImageMetadata = z.infer<typeof internalMetadataSchema>;

export interface StoreReferenceImageInput {
  readonly localOwnerId: string;
  readonly bytes: Buffer;
  readonly mimeType: ValidReferenceImageMimeType;
  readonly size: ReferenceImageSize;
  readonly width: 1024 | 1536;
  readonly height: 1024 | 1536;
  readonly model: string;
  readonly quality: 'high' | 'medium';
  readonly originalPrompt: string;
  readonly derivedPrompt: string;
  readonly promptAudit: {
    readonly optimizationEnabled: boolean;
    readonly result: CharacterPromptOptimizationResult;
    readonly options: CharacterReferenceOptions;
    readonly requestedGenerator: CharacterReferenceGenerator | null;
    readonly optimizer: { readonly model: string; readonly version: string } | null;
    readonly inputHash: string | null;
    readonly manuallyEdited: boolean;
  };
  readonly promptHash: string;
  readonly requestId: string;
  readonly requestFingerprint?: string;
  readonly derivation?:
    | { readonly kind: 'generate' }
    | {
        readonly kind: 'edit';
        readonly sourceAssetId: string;
        readonly changeInstructionsHash: string;
      };
  readonly providerRequestId?: string;
}

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

const digestPathSegment = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const extensionForMimeType = (mimeType: ValidReferenceImageMimeType): string => {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
};

const readJson = async (filePath: string): Promise<unknown> =>
  JSON.parse(await readFile(filePath, 'utf8')) as unknown;

const isMissingPathError = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

export class LocalReferenceImageAssetStore implements ReferenceImageAssetStore {
  readonly #root: string;
  readonly #assetsRoot: string;
  readonly #idempotencyRoot: string;
  readonly #createAssetId: () => string;
  readonly #now: () => Date;
  #initialized: Promise<void> | undefined;

  constructor(
    dataDirectory: string,
    options: { readonly createAssetId?: () => string; readonly now?: () => Date } = {},
  ) {
    this.#root = path.resolve(dataDirectory, 'reference-images', `v${ASSET_LAYOUT_VERSION}`);
    this.#assetsRoot = path.join(this.#root, 'assets');
    this.#idempotencyRoot = path.join(this.#root, 'idempotency');
    this.#createAssetId = options.createAssetId ?? randomUUID;
    this.#now = options.now ?? (() => new Date());
  }

  async #initialize(): Promise<void> {
    this.#initialized ??= (async () => {
      const paths = [
        path.dirname(path.dirname(this.#root)),
        path.dirname(this.#root),
        this.#root,
        this.#assetsRoot,
        this.#idempotencyRoot,
      ];
      for (const directory of paths) {
        await mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
        await chmod(directory, DIRECTORY_MODE);
      }
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

  #assetDirectory(assetId: string): string {
    const parsed = z.uuid().safeParse(assetId);
    if (!parsed.success) throw new ReferenceImageStorageError('Invalid reference image asset ID.');
    return path.join(this.#assetsRoot, parsed.data);
  }

  #mappingPath(localOwnerId: string, requestId: string): string {
    return path.join(
      this.#idempotencyRoot,
      digestPathSegment(localOwnerId),
      `${digestPathSegment(requestId)}.json`,
    );
  }

  async #readMetadata(assetId: string): Promise<StoredReferenceImageMetadata | null> {
    try {
      return internalMetadataSchema.parse(
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
      await mkdir(path.dirname(filePath), { recursive: true, mode: DIRECTORY_MODE });
      await chmod(path.dirname(filePath), DIRECTORY_MODE);
      handle = await open(temporaryPath, 'wx', FILE_MODE);
      await handle.writeFile(data, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, filePath);
      await chmod(filePath, FILE_MODE);
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
    const entries = await readdir(this.#assetsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.tmp-')) continue;
      const metadata = await this.#readMetadata(entry.name);
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
      `${JSON.stringify({
        schemaVersion: ASSET_LAYOUT_VERSION,
        localOwnerId: metadata.localOwnerId,
        requestId: metadata.requestId,
        assetId: metadata.assetId,
      })}\n`,
    );
  }

  async findByRequestId(
    localOwnerId: string,
    requestId: string,
  ): Promise<StoredReferenceImageMetadata | null> {
    await this.#initialize();
    try {
      const mapping = idempotencyMappingSchema.parse(
        await readJson(this.#mappingPath(localOwnerId, requestId)),
      );
      if (mapping.localOwnerId !== localOwnerId || mapping.requestId !== requestId) return null;
      const metadata = await this.#readMetadata(mapping.assetId);
      if (metadata?.localOwnerId === localOwnerId && metadata.requestId === requestId) {
        return metadata;
      }
      return await this.#recoverByRequestId(localOwnerId, requestId);
    } catch (error) {
      if (!isMissingPathError(error)) {
        if (error instanceof ReferenceImageStorageError) throw error;
        throw new ReferenceImageStorageError(
          'Reference image idempotency data could not be read.',
          {
            cause: error,
          },
        );
      }
      try {
        return await this.#recoverByRequestId(localOwnerId, requestId);
      } catch (recoveryError) {
        if (recoveryError instanceof ReferenceImageStorageError) throw recoveryError;
        throw new ReferenceImageStorageError('Reference image idempotency recovery failed.', {
          cause: recoveryError,
        });
      }
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
    const expectedStorageKey = path.posix.join(
      'reference-images',
      `v${ASSET_LAYOUT_VERSION}`,
      'assets',
      metadata.assetId,
      `content.${extensionForMimeType(metadata.mimeType)}`,
    );
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
    const temporaryDirectory = path.join(this.#assetsRoot, `.tmp-${assetId}-${randomUUID()}`);
    const filename = `content.${extensionForMimeType(input.mimeType)}`;
    const storageKey = path.posix.join(
      'reference-images',
      `v${ASSET_LAYOUT_VERSION}`,
      'assets',
      assetId,
      filename,
    );
    const timestamp = this.#now().toISOString();
    const metadata = internalMetadataSchema.parse({
      schemaVersion: ASSET_LAYOUT_VERSION,
      assetId,
      localOwnerId: input.localOwnerId,
      storageKey,
      mimeType: input.mimeType,
      size: input.size,
      width: input.width,
      height: input.height,
      byteSize: input.bytes.byteLength,
      source: 'generated',
      provider: 'openai',
      model: input.model || REFERENCE_IMAGE_MODEL_ID,
      quality: input.quality || REFERENCE_IMAGE_QUALITY,
      originalPrompt: input.originalPrompt,
      derivedPrompt: input.derivedPrompt,
      promptAudit: input.promptAudit,
      promptHash: input.promptHash,
      requestId: input.requestId,
      ...(input.requestFingerprint === undefined
        ? {}
        : { requestFingerprint: input.requestFingerprint }),
      ...(input.derivation === undefined ? {} : { derivation: input.derivation }),
      ...(input.providerRequestId === undefined
        ? {}
        : { providerRequestId: input.providerRequestId }),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    try {
      await mkdir(temporaryDirectory, { mode: DIRECTORY_MODE });
      const contentHandle = await open(path.join(temporaryDirectory, filename), 'wx', FILE_MODE);
      try {
        await contentHandle.writeFile(input.bytes);
        await contentHandle.sync();
      } finally {
        await contentHandle.close();
      }
      const metadataHandle = await open(
        path.join(temporaryDirectory, 'metadata.json'),
        'wx',
        FILE_MODE,
      );
      try {
        await metadataHandle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8');
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

export const storagePathMode = async (filePath: string): Promise<number> =>
  (await stat(filePath)).mode & 0o777;
