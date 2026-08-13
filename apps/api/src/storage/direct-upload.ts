import type { CreateDirectSavedVideoUploadRequest } from '@studio/contracts';

export type DirectUploadStatus =
  'pending' | 'uploading' | 'verifying' | 'ready' | 'failed' | 'aborted' | 'expired';

export interface StoredDirectUpload {
  readonly id: string;
  readonly ownerUserId: string;
  readonly assetId: string;
  readonly idempotencyKey: string;
  readonly storageKey: string;
  readonly providerUploadId: string | null;
  readonly status: DirectUploadStatus;
  readonly expectedMimeType: string;
  readonly expectedSizeBytes: number;
  readonly filename: string;
  readonly request: CreateDirectSavedVideoUploadRequest;
  readonly resultVideoId: string | null;
  readonly expiresAt: string;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DirectUploadRepository {
  create(upload: StoredDirectUpload): Promise<StoredDirectUpload>;
  findByIdempotency(
    ownerUserId: string,
    idempotencyKey: string,
  ): Promise<StoredDirectUpload | null>;
  restart(upload: StoredDirectUpload): Promise<StoredDirectUpload | null>;
  find(ownerUserId: string, uploadId: string): Promise<StoredDirectUpload | null>;
  setProviderUploadId(
    ownerUserId: string,
    uploadId: string,
    providerUploadId: string,
    updatedAt: string,
  ): Promise<StoredDirectUpload | null>;
  markVerifying(
    ownerUserId: string,
    uploadId: string,
    updatedAt: string,
  ): Promise<StoredDirectUpload | null>;
  returnToUploading(ownerUserId: string, uploadId: string, updatedAt: string): Promise<void>;
  markReady(
    ownerUserId: string,
    uploadId: string,
    resultVideoId: string,
    completedAt: string,
  ): Promise<void>;
  markTerminal(
    ownerUserId: string,
    uploadId: string,
    status: 'failed' | 'aborted' | 'expired',
    updatedAt: string,
  ): Promise<void>;
  /** Claims the oldest eligible rows by advancing their retry order before cleanup begins. */
  claimExpired(now: string, limit: number): Promise<readonly StoredDirectUpload[]>;
}
