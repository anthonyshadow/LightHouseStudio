import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { and, eq } from 'drizzle-orm';
import type {
  ReferenceImageAssetStore,
  StoredReferenceImageContent,
  StoredReferenceImageStream,
} from '../../features/reference-images/asset-store.js';
import { ReferenceImageStorageError } from '../../features/reference-images/asset-store.js';
import {
  createStoredReferenceImageMetadata,
  parseStoredReferenceImageMetadata,
  referenceImageContentFilename,
  type StoredReferenceImageMetadata,
  type StoreReferenceImageInput,
} from '../../features/reference-images/asset-layout.js';
import type { AssetByteStore } from '../../storage/asset-byte-store.js';
import type { LightframeDatabase } from './client.js';
import { referenceImageAssets } from './schema.js';

export class DrizzleReferenceImageAssetStore implements ReferenceImageAssetStore {
  constructor(
    private readonly db: LightframeDatabase,
    private readonly bytes: AssetByteStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async findByRequestId(
    localOwnerId: string,
    requestId: string,
  ): Promise<StoredReferenceImageMetadata | null> {
    const [row] = await this.db
      .select({ metadata: referenceImageAssets.metadata })
      .from(referenceImageAssets)
      .where(
        and(
          eq(referenceImageAssets.ownerUserId, localOwnerId),
          eq(referenceImageAssets.requestId, requestId),
        ),
      )
      .limit(1);
    return row === undefined ? null : parseStoredReferenceImageMetadata(row.metadata);
  }

  async getMetadata(
    localOwnerId: string,
    assetId: string,
  ): Promise<StoredReferenceImageMetadata | null> {
    const [row] = await this.db
      .select({ metadata: referenceImageAssets.metadata })
      .from(referenceImageAssets)
      .where(
        and(
          eq(referenceImageAssets.ownerUserId, localOwnerId),
          eq(referenceImageAssets.id, assetId),
        ),
      )
      .limit(1);
    return row === undefined ? null : parseStoredReferenceImageMetadata(row.metadata);
  }

  async getContentStream(
    localOwnerId: string,
    assetId: string,
  ): Promise<StoredReferenceImageStream | null> {
    const metadata = await this.getMetadata(localOwnerId, assetId);
    if (metadata === null) return null;
    const asset = await this.bytes.open(localOwnerId, metadata.assetId);
    if (asset === null) return null;
    if (
      asset.manifest.sizeBytes !== metadata.byteSize ||
      asset.manifest.mimeType !== metadata.mimeType
    ) {
      throw new ReferenceImageStorageError('Reference image content metadata is inconsistent.');
    }
    return { metadata, createReadStream: () => asset.createReadStream() };
  }

  async getContent(
    localOwnerId: string,
    assetId: string,
  ): Promise<StoredReferenceImageContent | null> {
    const content = await this.getContentStream(localOwnerId, assetId);
    if (content === null) return null;
    const bytes = await buffer(content.createReadStream());
    if (bytes.byteLength !== content.metadata.byteSize) {
      throw new ReferenceImageStorageError('Reference image content size is inconsistent.');
    }
    return { metadata: content.metadata, bytes };
  }

  async store(input: StoreReferenceImageInput): Promise<StoredReferenceImageMetadata> {
    const existing = await this.findByRequestId(input.localOwnerId, input.requestId);
    if (existing !== null) return existing;
    const assetId = randomUUID();
    const timestamp = this.now().toISOString();
    const metadata = createStoredReferenceImageMetadata(input, assetId, timestamp);
    try {
      await this.bytes.storeBytes({
        assetId,
        ownerUserId: input.localOwnerId,
        bytes: input.bytes,
        mimeType: input.mimeType,
        filename: referenceImageContentFilename(input.mimeType),
        createdAt: timestamp,
      });
      await this.db.insert(referenceImageAssets).values({
        id: assetId,
        ownerUserId: input.localOwnerId,
        requestId: input.requestId,
        requestFingerprint: input.requestFingerprint,
        mediaAssetId: assetId,
        metadata,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return metadata;
    } catch (error) {
      const duplicate = await this.findByRequestId(input.localOwnerId, input.requestId).catch(
        () => null,
      );
      await this.bytes.delete(input.localOwnerId, assetId).catch(() => undefined);
      if (duplicate !== null) return duplicate;
      throw new ReferenceImageStorageError('Reference image bytes could not be stored.', {
        cause: error,
      });
    }
  }

  async importExisting(
    metadataInput: StoredReferenceImageMetadata,
    content: Uint8Array,
  ): Promise<StoredReferenceImageMetadata> {
    const metadata = parseStoredReferenceImageMetadata(metadataInput);
    const existing = await this.findByRequestId(metadata.localOwnerId, metadata.requestId);
    if (existing !== null) return existing;
    let createdBytes = false;
    try {
      const stored = await this.bytes.open(metadata.localOwnerId, metadata.assetId);
      if (stored === null) {
        await this.bytes.storeBytes({
          assetId: metadata.assetId,
          ownerUserId: metadata.localOwnerId,
          bytes: content,
          mimeType: metadata.mimeType,
          filename: referenceImageContentFilename(metadata.mimeType),
          createdAt: metadata.createdAt,
        });
        createdBytes = true;
      } else if (
        stored.manifest.sizeBytes !== metadata.byteSize ||
        stored.manifest.mimeType !== metadata.mimeType
      ) {
        throw new Error('Existing reference image asset does not match its migration metadata.');
      }
      await this.db.insert(referenceImageAssets).values({
        id: metadata.assetId,
        ownerUserId: metadata.localOwnerId,
        requestId: metadata.requestId,
        requestFingerprint: metadata.requestFingerprint ?? '0'.repeat(64),
        mediaAssetId: metadata.assetId,
        metadata,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt ?? metadata.createdAt,
      });
      return metadata;
    } catch (error) {
      const duplicate = await this.findByRequestId(metadata.localOwnerId, metadata.requestId).catch(
        () => null,
      );
      if (createdBytes) {
        await this.bytes.delete(metadata.localOwnerId, metadata.assetId).catch(() => undefined);
      }
      if (duplicate !== null) return duplicate;
      throw new ReferenceImageStorageError('Reference image migration could not be stored.', {
        cause: error,
      });
    }
  }
}
