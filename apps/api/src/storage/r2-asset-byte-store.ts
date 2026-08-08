import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { z } from 'zod';
import { persistedTimestampSchema } from '../application/timestamps.js';
import type { AssetLifecycleRegistry } from './asset-lifecycle.js';
import type { AssetByteStore, AssetReadHandle, StoredAssetManifest } from './asset-byte-store.js';

const sha256File = async (filePath: string): Promise<string> => {
  const handle = await open(filePath, 'r');
  const hash = createHash('sha256');
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
};

const missingObject = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'NotFound' ||
    error.name === 'NoSuchKey' ||
    ('$metadata' in error &&
      typeof error.$metadata === 'object' &&
      error.$metadata !== null &&
      'httpStatusCode' in error.$metadata &&
      error.$metadata.httpStatusCode === 404));

const encodeFilename = (filename: string): string =>
  Buffer.from(filename, 'utf8').toString('base64url');

const decodeFilename = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
};

const objectBody = (body: unknown): AsyncIterable<Uint8Array> => {
  if (
    typeof body === 'object' &&
    body !== null &&
    Symbol.asyncIterator in body &&
    typeof body[Symbol.asyncIterator] === 'function'
  ) {
    return body as AsyncIterable<Uint8Array>;
  }
  throw new Error('R2 returned an unsupported object stream.');
};

const verifiedUploadStream = (source: Readable, manifest: StoredAssetManifest): Readable => {
  const hash = createHash('sha256');
  let sizeBytes = 0;
  return source.pipe(
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.byteLength;
        hash.update(chunk);
        callback(null, chunk);
      },
      flush(callback) {
        if (sizeBytes !== manifest.sizeBytes || hash.digest('hex') !== manifest.checksumSha256) {
          callback(new Error('Asset changed while it was being uploaded.'));
          return;
        }
        callback();
      },
    }),
  );
};

export interface R2AssetByteStoreOptions {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
  readonly keyPrefix?: string;
  readonly client?: S3Client;
  readonly lifecycle?: AssetLifecycleRegistry;
}

export class R2AssetByteStore implements AssetByteStore {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #keyPrefix: string;
  readonly #lifecycle: AssetLifecycleRegistry | undefined;

  constructor(options: R2AssetByteStoreOptions) {
    this.#bucket = options.bucket;
    this.#keyPrefix = (options.keyPrefix ?? 'media/v1').replace(/^\/+|\/+$/gu, '');
    this.#lifecycle = options.lifecycle;
    this.#client =
      options.client ??
      new S3Client({
        region: 'auto',
        endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
        },
      });
  }

  #key(assetId: string): string {
    const id = z.uuid().parse(assetId);
    return `${this.#keyPrefix}/${id.slice(0, 2)}/${id}`;
  }

  #metadata(manifest: StoredAssetManifest): Record<string, string> {
    return {
      'owner-user-id': manifest.ownerUserId,
      'checksum-sha256': manifest.checksumSha256,
      'filename-base64url': encodeFilename(manifest.filename),
      'created-at': manifest.createdAt,
      'mime-type': manifest.mimeType,
      'schema-version': String(manifest.schemaVersion),
    };
  }

  async #uploadStream(manifest: StoredAssetManifest, body: Readable): Promise<StoredAssetManifest> {
    const key = this.#key(manifest.assetId);
    await this.#lifecycle?.prepare(manifest, { provider: 'r2', storageKey: key });
    try {
      const upload = new Upload({
        client: this.#client,
        params: {
          Bucket: this.#bucket,
          Key: key,
          Body: verifiedUploadStream(body, manifest),
          ContentLength: manifest.sizeBytes,
          ContentType: manifest.mimeType,
          Metadata: this.#metadata(manifest),
        },
        queueSize: 2,
        partSize: 8 * 1024 * 1024,
        leavePartsOnError: false,
      });
      const result = await upload.done();
      await this.#lifecycle?.markReady(manifest.assetId, result.ETag ?? null);
      return manifest;
    } catch (error) {
      await this.#client
        .send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }))
        .catch(() => undefined);
      await this.#lifecycle?.markFailed(manifest.assetId).catch(() => undefined);
      throw error;
    }
  }

  async storeFile(input: {
    readonly assetId: string;
    readonly ownerUserId: string;
    readonly sourcePath: string;
    readonly checksumSha256?: string;
    readonly mimeType: string;
    readonly filename: string;
    readonly createdAt: string;
  }): Promise<StoredAssetManifest> {
    const source = await stat(input.sourcePath);
    if (!source.isFile() || source.size <= 0) throw new Error('Stored asset source is empty.');
    const manifest: StoredAssetManifest = {
      schemaVersion: 1,
      assetId: z.uuid().parse(input.assetId),
      ownerUserId: z.uuid().parse(input.ownerUserId),
      mimeType: input.mimeType,
      filename: input.filename,
      sizeBytes: source.size,
      checksumSha256: input.checksumSha256 ?? (await sha256File(input.sourcePath)),
      createdAt: input.createdAt,
    };
    return this.#uploadStream(manifest, createReadStream(input.sourcePath));
  }

  async storeStream(input: {
    readonly assetId: string;
    readonly ownerUserId: string;
    readonly createReadStream: () => Readable;
    readonly sizeBytes: number;
    readonly checksumSha256: string;
    readonly mimeType: string;
    readonly filename: string;
    readonly createdAt: string;
  }): Promise<StoredAssetManifest> {
    const manifest: StoredAssetManifest = {
      schemaVersion: 1,
      assetId: z.uuid().parse(input.assetId),
      ownerUserId: z.uuid().parse(input.ownerUserId),
      mimeType: input.mimeType,
      filename: input.filename,
      sizeBytes: z.number().int().positive().parse(input.sizeBytes),
      checksumSha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/u)
        .parse(input.checksumSha256),
      createdAt: persistedTimestampSchema.parse(input.createdAt),
    };
    return this.#uploadStream(manifest, input.createReadStream());
  }

  async storeBytes(input: {
    readonly assetId: string;
    readonly ownerUserId: string;
    readonly bytes: Uint8Array;
    readonly mimeType: string;
    readonly filename: string;
    readonly createdAt: string;
  }): Promise<StoredAssetManifest> {
    if (input.bytes.byteLength === 0) throw new Error('Stored asset bytes cannot be empty.');
    const manifest: StoredAssetManifest = {
      schemaVersion: 1,
      assetId: z.uuid().parse(input.assetId),
      ownerUserId: z.uuid().parse(input.ownerUserId),
      mimeType: input.mimeType,
      filename: input.filename,
      sizeBytes: input.bytes.byteLength,
      checksumSha256: createHash('sha256').update(input.bytes).digest('hex'),
      createdAt: input.createdAt,
    };
    const key = this.#key(input.assetId);
    await this.#lifecycle?.prepare(manifest, { provider: 'r2', storageKey: key });
    try {
      const result = await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          Body: input.bytes,
          ContentLength: manifest.sizeBytes,
          ContentType: manifest.mimeType,
          Metadata: this.#metadata(manifest),
        }),
      );
      await this.#lifecycle?.markReady(manifest.assetId, result.ETag ?? null);
      return manifest;
    } catch (error) {
      await this.#client
        .send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }))
        .catch(() => undefined);
      await this.#lifecycle?.markFailed(manifest.assetId).catch(() => undefined);
      throw error;
    }
  }

  async open(ownerUserId: string, assetId: string): Promise<AssetReadHandle | null> {
    const key = this.#key(assetId);
    try {
      const registered = await this.#lifecycle?.findReady(ownerUserId, assetId);
      if (this.#lifecycle !== undefined && registered === null) return null;
      if (registered !== undefined && registered !== null) {
        if (registered.provider !== 'r2' || registered.storageKey !== key) {
          throw new Error('R2 asset registry location does not match the configured key.');
        }
      }
      const head = await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      const metadata = head.Metadata ?? {};
      if (metadata['owner-user-id'] !== ownerUserId) return null;
      const filename = decodeFilename(metadata['filename-base64url']);
      const sizeBytes = head.ContentLength;
      const checksumSha256 = metadata['checksum-sha256'];
      const mimeType = metadata['mime-type'] ?? head.ContentType;
      const createdAt = metadata['created-at'];
      if (
        filename === null ||
        sizeBytes === undefined ||
        sizeBytes <= 0 ||
        checksumSha256 === undefined ||
        !/^[a-f0-9]{64}$/u.test(checksumSha256) ||
        mimeType === undefined ||
        createdAt === undefined
      ) {
        throw new Error('R2 asset metadata is incomplete.');
      }
      const manifest: StoredAssetManifest = {
        schemaVersion: 1,
        assetId,
        ownerUserId,
        mimeType,
        filename,
        sizeBytes,
        checksumSha256,
        createdAt,
      };
      if (
        registered !== undefined &&
        registered !== null &&
        (registered.manifest.sizeBytes !== manifest.sizeBytes ||
          registered.manifest.checksumSha256 !== manifest.checksumSha256 ||
          registered.manifest.mimeType !== manifest.mimeType)
      ) {
        throw new Error('R2 asset metadata does not match the database registry.');
      }
      return {
        manifest,
        createReadStream: (range) =>
          Readable.from(
            (async function* (client: S3Client, bucket: string) {
              const response = await client.send(
                new GetObjectCommand({
                  Bucket: bucket,
                  Key: key,
                  ...(range === undefined ? {} : { Range: `bytes=${range.start}-${range.end}` }),
                }),
              );
              for await (const chunk of objectBody(response.Body)) yield chunk;
            })(this.#client, this.#bucket),
          ),
      };
    } catch (error) {
      if (missingObject(error)) return null;
      throw error;
    }
  }

  async exists(ownerUserId: string, assetId: string): Promise<boolean> {
    return (await this.open(ownerUserId, assetId)) !== null;
  }

  async delete(ownerUserId: string, assetId: string): Promise<void> {
    if (this.#lifecycle === undefined) {
      if ((await this.open(ownerUserId, assetId)) === null) return;
    } else {
      // `deleting` remains claimable so a failed R2 request can be retried idempotently.
      if (!(await this.#lifecycle.markDeleting(ownerUserId, assetId))) return;
    }
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.#bucket, Key: this.#key(assetId) }),
    );
    await this.#lifecycle?.markDeleted(ownerUserId, assetId);
  }
}
