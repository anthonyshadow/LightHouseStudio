import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { createDirectSavedVideoUploadRequestSchema } from '@studio/contracts';
import { toIsoTimestamp } from '../../application/timestamps.js';
import type {
  DirectUploadRepository,
  DirectUploadStatus,
  StoredDirectUpload,
} from '../../storage/direct-upload.js';
import type { LightframeDatabase } from './client.js';
import { directUploads } from './schema.js';

type DirectUploadRow = typeof directUploads.$inferSelect;

const toStoredUpload = (row: DirectUploadRow): StoredDirectUpload => ({
  id: row.id,
  ownerUserId: row.ownerUserId,
  assetId: row.assetId,
  idempotencyKey: row.idempotencyKey,
  storageKey: row.storageKey,
  providerUploadId: row.providerUploadId,
  status: row.status,
  expectedMimeType: row.expectedMimeType,
  expectedSizeBytes: row.expectedSizeBytes,
  filename: row.filename,
  request: createDirectSavedVideoUploadRequestSchema.parse(row.request),
  resultVideoId: row.resultVideoId,
  expiresAt: toIsoTimestamp(row.expiresAt),
  completedAt: row.completedAt === null ? null : toIsoTimestamp(row.completedAt),
  createdAt: toIsoTimestamp(row.createdAt),
  updatedAt: toIsoTimestamp(row.updatedAt),
});

export class DrizzleDirectUploadRepository implements DirectUploadRepository {
  constructor(private readonly db: LightframeDatabase) {}

  async findByIdempotency(
    ownerUserId: string,
    idempotencyKey: string,
  ): Promise<StoredDirectUpload | null> {
    const [row] = await this.db
      .select()
      .from(directUploads)
      .where(
        and(
          eq(directUploads.ownerUserId, ownerUserId),
          eq(directUploads.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row === undefined ? null : toStoredUpload(row);
  }

  async create(upload: StoredDirectUpload): Promise<StoredDirectUpload> {
    await this.db
      .insert(directUploads)
      .values({
        id: upload.id,
        ownerUserId: upload.ownerUserId,
        assetId: upload.assetId,
        idempotencyKey: upload.idempotencyKey,
        storageKey: upload.storageKey,
        providerUploadId: upload.providerUploadId,
        status: upload.status,
        expectedMimeType: upload.expectedMimeType,
        expectedSizeBytes: upload.expectedSizeBytes,
        filename: upload.filename,
        request: upload.request,
        resultVideoId: upload.resultVideoId,
        expiresAt: toIsoTimestamp(upload.expiresAt),
        completedAt: upload.completedAt,
        createdAt: toIsoTimestamp(upload.createdAt),
        updatedAt: toIsoTimestamp(upload.updatedAt),
      })
      .onConflictDoNothing();
    const stored = await this.findByIdempotency(upload.ownerUserId, upload.idempotencyKey);
    if (stored === null) throw new Error('The staged upload could not be created.');
    return stored;
  }

  async restart(upload: StoredDirectUpload): Promise<StoredDirectUpload | null> {
    const [updated] = await this.db
      .update(directUploads)
      .set({
        assetId: upload.assetId,
        storageKey: upload.storageKey,
        providerUploadId: null,
        status: 'pending',
        resultVideoId: null,
        expiresAt: toIsoTimestamp(upload.expiresAt),
        completedAt: null,
        createdAt: toIsoTimestamp(upload.createdAt),
        updatedAt: toIsoTimestamp(upload.updatedAt),
      })
      .where(
        and(
          eq(directUploads.ownerUserId, upload.ownerUserId),
          eq(directUploads.id, upload.id),
          inArray(directUploads.status, ['failed', 'aborted', 'expired']),
        ),
      )
      .returning();
    return updated === undefined ? null : toStoredUpload(updated);
  }

  async find(ownerUserId: string, uploadId: string): Promise<StoredDirectUpload | null> {
    const [row] = await this.db
      .select()
      .from(directUploads)
      .where(and(eq(directUploads.ownerUserId, ownerUserId), eq(directUploads.id, uploadId)))
      .limit(1);
    return row === undefined ? null : toStoredUpload(row);
  }

  async setProviderUploadId(
    ownerUserId: string,
    uploadId: string,
    providerUploadId: string,
    updatedAt: string,
  ): Promise<StoredDirectUpload | null> {
    const [updated] = await this.db
      .update(directUploads)
      .set({ providerUploadId, status: 'uploading', updatedAt: toIsoTimestamp(updatedAt) })
      .where(
        and(
          eq(directUploads.ownerUserId, ownerUserId),
          eq(directUploads.id, uploadId),
          eq(directUploads.status, 'pending'),
          isNull(directUploads.providerUploadId),
        ),
      )
      .returning();
    return updated === undefined ? this.find(ownerUserId, uploadId) : toStoredUpload(updated);
  }

  async markVerifying(
    ownerUserId: string,
    uploadId: string,
    updatedAt: string,
  ): Promise<StoredDirectUpload | null> {
    const [updated] = await this.db
      .update(directUploads)
      .set({ status: 'verifying', updatedAt: toIsoTimestamp(updatedAt) })
      .where(
        and(
          eq(directUploads.ownerUserId, ownerUserId),
          eq(directUploads.id, uploadId),
          eq(directUploads.status, 'uploading'),
        ),
      )
      .returning();
    return updated === undefined ? this.find(ownerUserId, uploadId) : toStoredUpload(updated);
  }

  async markReady(
    ownerUserId: string,
    uploadId: string,
    resultVideoId: string,
    completedAt: string,
  ): Promise<void> {
    await this.db
      .update(directUploads)
      .set({
        status: 'ready',
        resultVideoId,
        completedAt: toIsoTimestamp(completedAt),
        updatedAt: toIsoTimestamp(completedAt),
      })
      .where(and(eq(directUploads.ownerUserId, ownerUserId), eq(directUploads.id, uploadId)));
  }

  async returnToUploading(ownerUserId: string, uploadId: string, updatedAt: string): Promise<void> {
    await this.db
      .update(directUploads)
      .set({ status: 'uploading', updatedAt: toIsoTimestamp(updatedAt) })
      .where(
        and(
          eq(directUploads.ownerUserId, ownerUserId),
          eq(directUploads.id, uploadId),
          eq(directUploads.status, 'verifying'),
        ),
      );
  }

  async markTerminal(
    ownerUserId: string,
    uploadId: string,
    status: Extract<DirectUploadStatus, 'failed' | 'aborted' | 'expired'>,
    updatedAt: string,
  ): Promise<void> {
    await this.db
      .update(directUploads)
      .set({ status, updatedAt: toIsoTimestamp(updatedAt) })
      .where(
        and(
          eq(directUploads.ownerUserId, ownerUserId),
          eq(directUploads.id, uploadId),
          inArray(directUploads.status, ['pending', 'uploading', 'verifying']),
        ),
      );
  }

  async claimExpired(now: string, limit: number): Promise<readonly StoredDirectUpload[]> {
    const claimedAt = toIsoTimestamp(now);
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(directUploads)
        .where(
          and(
            inArray(directUploads.status, ['pending', 'uploading', 'verifying']),
            lte(directUploads.expiresAt, claimedAt),
          ),
        )
        .orderBy(asc(directUploads.updatedAt), asc(directUploads.expiresAt), asc(directUploads.id))
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];
      await tx
        .update(directUploads)
        .set({ updatedAt: claimedAt })
        .where(
          inArray(
            directUploads.id,
            rows.map(({ id }) => id),
          ),
        );
      return rows.map((row) => toStoredUpload({ ...row, updatedAt: claimedAt }));
    });
  }
}
