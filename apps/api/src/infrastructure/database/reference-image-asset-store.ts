import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { and, eq, inArray, lte } from 'drizzle-orm';
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
import type { ProjectRetentionPolicy } from '../../features/projects/project-repository.js';
import type { LightframeDatabase } from './client.js';
import { creativeAssets, referenceImageAssets } from './schema.js';

export const TEMPORARY_REFERENCE_IMAGE_INACTIVITY_MS = 24 * 60 * 60 * 1_000;

const REFERENCE_IMAGE_ID_FIELDS = new Set([
  'referenceImageAssetId',
  'uploadedReferenceImageAssetId',
  'sourceReferenceImageAssetId',
  'garmentReferenceImageAssetId',
]);

const collectReferenceImageAssetIds = (value: unknown, result = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) collectReferenceImageAssetIds(item, result);
    return result;
  }
  if (typeof value !== 'object' || value === null) return result;
  for (const [key, candidate] of Object.entries(value)) {
    if (REFERENCE_IMAGE_ID_FIELDS.has(key) && typeof candidate === 'string') {
      result.add(candidate);
      continue;
    }
    collectReferenceImageAssetIds(candidate, result);
  }
  return result;
};

export class DrizzleReferenceImageAssetStore implements ReferenceImageAssetStore {
  constructor(
    private readonly db: LightframeDatabase,
    private readonly bytes: AssetByteStore,
    private readonly now: () => Date = () => new Date(),
    private readonly projectRetention?: ProjectRetentionPolicy,
  ) {}

  async #savedReferenceImageAssetIds(localOwnerId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ payload: creativeAssets.payload })
      .from(creativeAssets)
      .where(eq(creativeAssets.ownerUserId, localOwnerId));
    return collectReferenceImageAssetIds(rows.map((row) => row.payload));
  }

  async #touch(localOwnerId: string, assetId: string): Promise<void> {
    await this.db
      .update(referenceImageAssets)
      .set({ updatedAt: this.now().toISOString() })
      .where(
        and(
          eq(referenceImageAssets.ownerUserId, localOwnerId),
          eq(referenceImageAssets.id, assetId),
        ),
      );
  }

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
    if (row === undefined) return null;
    const metadata = parseStoredReferenceImageMetadata(row.metadata);
    await this.#touch(localOwnerId, metadata.assetId);
    return metadata;
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
    if (row === undefined) return null;
    const metadata = parseStoredReferenceImageMetadata(row.metadata);
    await this.#touch(localOwnerId, metadata.assetId);
    return metadata;
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

  async discardIfUnreferenced(localOwnerId: string, assetId: string): Promise<boolean> {
    return (await this.discardManyIfUnreferenced(localOwnerId, [assetId])) > 0;
  }

  async #discardCandidates(
    localOwnerId: string,
    assetIds: readonly string[],
  ): Promise<{ readonly deletedCount: number; readonly failure?: unknown }> {
    const candidates = [...new Set(assetIds)];
    if (candidates.length === 0) return { deletedCount: 0 };
    const rows = await this.db
      .select({ id: referenceImageAssets.id })
      .from(referenceImageAssets)
      .where(
        and(
          eq(referenceImageAssets.ownerUserId, localOwnerId),
          inArray(referenceImageAssets.id, candidates),
        ),
      );
    if (rows.length === 0) return { deletedCount: 0 };
    const savedAssetIds = await this.#savedReferenceImageAssetIds(localOwnerId);
    const unretainedByLibrary = rows.map(({ id }) => id).filter((id) => !savedAssetIds.has(id));
    const projectRetainedIds =
      unretainedByLibrary.length === 0
        ? new Set<string>()
        : ((await this.projectRetention?.retainedAssetIds(localOwnerId, unretainedByLibrary)) ??
          new Set<string>());
    const deletableIds = unretainedByLibrary.filter((id) => !projectRetainedIds.has(id));
    const deletedIds: string[] = [];
    let failure: unknown;
    for (const id of deletableIds) {
      try {
        await this.bytes.delete(localOwnerId, id);
        deletedIds.push(id);
      } catch (error) {
        failure ??= error;
      }
    }
    if (deletedIds.length > 0) {
      await this.db
        .delete(referenceImageAssets)
        .where(
          and(
            eq(referenceImageAssets.ownerUserId, localOwnerId),
            inArray(referenceImageAssets.id, deletedIds),
          ),
        );
    }
    return failure === undefined
      ? { deletedCount: deletedIds.length }
      : { deletedCount: deletedIds.length, failure };
  }

  async discardManyIfUnreferenced(
    localOwnerId: string,
    assetIds: readonly string[],
  ): Promise<number> {
    const result = await this.#discardCandidates(localOwnerId, assetIds);
    if ('failure' in result) throw result.failure;
    return result.deletedCount;
  }

  async purgeExpiredUnreferenced(): Promise<number> {
    const cutoff = new Date(this.now().getTime() - TEMPORARY_REFERENCE_IMAGE_INACTIVITY_MS);
    const candidates = await this.db
      .select({ id: referenceImageAssets.id, ownerUserId: referenceImageAssets.ownerUserId })
      .from(referenceImageAssets)
      .where(lte(referenceImageAssets.updatedAt, cutoff.toISOString()));
    const candidatesByOwner = new Map<string, string[]>();
    for (const candidate of candidates) {
      const ownerCandidates = candidatesByOwner.get(candidate.ownerUserId) ?? [];
      ownerCandidates.push(candidate.id);
      candidatesByOwner.set(candidate.ownerUserId, ownerCandidates);
    }
    let deleted = 0;
    for (const [ownerUserId, assetIds] of candidatesByOwner) {
      try {
        const result = await this.#discardCandidates(ownerUserId, assetIds);
        deleted += result.deletedCount;
        // A later creative-library read/write retries any failed storage cleanup.
      } catch {
        // A later purge retries database or policy failures for this owner.
      }
    }
    return deleted;
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
