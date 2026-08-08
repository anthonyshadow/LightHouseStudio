import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import path from 'node:path';
import { z } from 'zod';
import { persistedTimestampSchema } from '../application/timestamps.js';

const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    assetId: z.uuid(),
    ownerUserId: z.uuid(),
    mimeType: z.string().trim().min(1).max(100),
    filename: z.string().trim().min(1).max(180),
    sizeBytes: z.number().int().positive(),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    createdAt: persistedTimestampSchema,
  })
  .strict();

export type StoredAssetManifest = z.infer<typeof manifestSchema>;

export interface AssetReadHandle {
  readonly manifest: StoredAssetManifest;
  createReadStream(range?: { readonly start: number; readonly end: number }): Readable;
}

export interface AssetByteStore {
  storeFile(input: {
    readonly assetId: string;
    readonly ownerUserId: string;
    readonly sourcePath: string;
    readonly checksumSha256?: string;
    readonly mimeType: string;
    readonly filename: string;
    readonly createdAt: string;
  }): Promise<StoredAssetManifest>;
  storeBytes(input: {
    readonly assetId: string;
    readonly ownerUserId: string;
    readonly bytes: Uint8Array;
    readonly mimeType: string;
    readonly filename: string;
    readonly createdAt: string;
  }): Promise<StoredAssetManifest>;
  storeStream?(input: {
    readonly assetId: string;
    readonly ownerUserId: string;
    readonly createReadStream: () => Readable;
    readonly sizeBytes: number;
    readonly checksumSha256: string;
    readonly mimeType: string;
    readonly filename: string;
    readonly createdAt: string;
  }): Promise<StoredAssetManifest>;
  open(ownerUserId: string, assetId: string): Promise<AssetReadHandle | null>;
  exists(ownerUserId: string, assetId: string): Promise<boolean>;
  delete(ownerUserId: string, assetId: string): Promise<void>;
}

const extensionForMimeType = (mimeType: string): string =>
  mimeType === 'video/mp4'
    ? 'mp4'
    : mimeType === 'video/quicktime'
      ? 'mov'
      : mimeType === 'image/webp'
        ? 'webp'
        : 'webm';

const fileSha256 = async (filePath: string): Promise<string> => {
  const handle = await open(filePath, 'r');
  const hash = createHash('sha256');
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk));
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
};

export class LocalAssetByteStore implements AssetByteStore {
  readonly #root: string;

  constructor(dataDirectory: string) {
    this.#root = path.resolve(dataDirectory, 'media', 'v1', 'assets');
  }

  #directory(assetId: string): string {
    return path.join(this.#root, z.uuid().parse(assetId));
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
    const finalDirectory = this.#directory(input.assetId);
    const temporaryDirectory = path.join(this.#root, `.tmp-${input.assetId}-${randomUUID()}`);
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    await chmod(this.#root, 0o700);
    const source = await stat(input.sourcePath);
    const manifest = manifestSchema.parse({
      schemaVersion: 1,
      assetId: input.assetId,
      ownerUserId: input.ownerUserId,
      mimeType: input.mimeType,
      filename: input.filename,
      sizeBytes: source.size,
      checksumSha256: input.checksumSha256 ?? (await fileSha256(input.sourcePath)),
      createdAt: input.createdAt,
    });
    try {
      await mkdir(temporaryDirectory, { mode: 0o700 });
      const contentPath = path.join(
        temporaryDirectory,
        `content.${extensionForMimeType(input.mimeType)}`,
      );
      await copyFile(input.sourcePath, contentPath);
      await chmod(contentPath, 0o600);
      const manifestPath = path.join(temporaryDirectory, 'manifest.json');
      const handle = await open(manifestPath, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(manifest)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryDirectory, finalDirectory);
      return manifest;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
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
    const finalDirectory = this.#directory(input.assetId);
    const temporaryDirectory = path.join(this.#root, `.tmp-${input.assetId}-${randomUUID()}`);
    const checksumSha256 = createHash('sha256').update(input.bytes).digest('hex');
    const manifest = manifestSchema.parse({
      schemaVersion: 1,
      assetId: input.assetId,
      ownerUserId: input.ownerUserId,
      mimeType: input.mimeType,
      filename: input.filename,
      sizeBytes: input.bytes.byteLength,
      checksumSha256,
      createdAt: input.createdAt,
    });
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    await chmod(this.#root, 0o700);
    try {
      await mkdir(temporaryDirectory, { mode: 0o700 });
      const contentPath = path.join(
        temporaryDirectory,
        `content.${extensionForMimeType(input.mimeType)}`,
      );
      const content = await open(contentPath, 'wx', 0o600);
      try {
        await content.writeFile(input.bytes);
        await content.sync();
      } finally {
        await content.close();
      }
      const manifestPath = path.join(temporaryDirectory, 'manifest.json');
      const manifestFile = await open(manifestPath, 'wx', 0o600);
      try {
        await manifestFile.writeFile(`${JSON.stringify(manifest)}\n`, 'utf8');
        await manifestFile.sync();
      } finally {
        await manifestFile.close();
      }
      await rename(temporaryDirectory, finalDirectory);
      return manifest;
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }

  async open(ownerUserId: string, assetId: string): Promise<AssetReadHandle | null> {
    try {
      const directory = this.#directory(assetId);
      const manifestPath = path.join(directory, 'manifest.json');
      const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
      const manifest = manifestSchema.parse(raw);
      if (manifest.ownerUserId !== ownerUserId) return null;
      const contentPath = path.join(
        directory,
        `content.${extensionForMimeType(manifest.mimeType)}`,
      );
      const file = await stat(contentPath);
      if (!file.isFile() || file.size !== manifest.sizeBytes) return null;
      if (JSON.stringify(raw) !== JSON.stringify(manifest)) {
        const temporaryPath = path.join(directory, `.manifest-${randomUUID()}.tmp`);
        try {
          const handle = await open(temporaryPath, 'wx', 0o600);
          try {
            await handle.writeFile(`${JSON.stringify(manifest)}\n`, 'utf8');
            await handle.sync();
          } finally {
            await handle.close();
          }
          await rename(temporaryPath, manifestPath);
        } catch (error) {
          await rm(temporaryPath, { force: true }).catch(() => undefined);
          throw error;
        }
      }
      return {
        manifest,
        createReadStream: (range) => createReadStream(contentPath, range),
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async exists(ownerUserId: string, assetId: string): Promise<boolean> {
    return (await this.open(ownerUserId, assetId)) !== null;
  }

  async delete(ownerUserId: string, assetId: string): Promise<void> {
    const asset = await this.open(ownerUserId, assetId);
    if (asset !== null) await rm(this.#directory(assetId), { recursive: true, force: true });
  }
}
