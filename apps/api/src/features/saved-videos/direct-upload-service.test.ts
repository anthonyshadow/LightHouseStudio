import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CreateDirectSavedVideoUploadRequest, InspectedVideo } from '@studio/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalAssetByteStore } from '../../storage/asset-byte-store.js';
import type { DirectUploadRepository, StoredDirectUpload } from '../../storage/direct-upload.js';
import { FileSavedVideoRepository } from './saved-video-repository.js';
import { SavedVideoService } from './saved-video-service.js';
import { DirectSavedVideoUploadService } from './direct-upload-service.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const otherUserId = '9826fc75-4759-47cc-b07d-d7325ce0ad14';
const initialNow = new Date('2026-08-09T14:00:00.000Z');
const inspected: InspectedVideo = {
  mimeType: 'video/mp4',
  container: 'mp4',
  videoCodec: 'avc',
  audioCodec: 'aac',
  durationMs: 12_000,
  width: 1_280,
  height: 720,
  sizeBytes: 11,
  hasAudio: true,
};

const request = (idempotencyKey = crypto.randomUUID()): CreateDirectSavedVideoUploadRequest => ({
  idempotencyKey,
  mimeType: 'video/mp4',
  sizeBytes: inspected.sizeBytes,
  metadata: {
    title: 'Direct take',
    origin: 'recorded',
    characterName: null,
    characterVariantName: null,
    filename: '../direct take.mp4',
    sourceVideoId: null,
    sourceVersionId: null,
  },
  target: { kind: 'new' },
});

class MemoryDirectUploadRepository implements DirectUploadRepository {
  readonly rows = new Map<string, StoredDirectUpload>();

  create(upload: StoredDirectUpload): Promise<StoredDirectUpload> {
    const prior = [...this.rows.values()].find(
      (row) =>
        row.ownerUserId === upload.ownerUserId && row.idempotencyKey === upload.idempotencyKey,
    );
    if (prior !== undefined) return Promise.resolve(prior);
    this.rows.set(upload.id, upload);
    return Promise.resolve(upload);
  }

  findByIdempotency(
    ownerUserId: string,
    idempotencyKey: string,
  ): Promise<StoredDirectUpload | null> {
    return Promise.resolve(
      [...this.rows.values()].find(
        (row) => row.ownerUserId === ownerUserId && row.idempotencyKey === idempotencyKey,
      ) ?? null,
    );
  }

  restart(upload: StoredDirectUpload): Promise<StoredDirectUpload | null> {
    const prior = this.rows.get(upload.id);
    if (
      prior === undefined ||
      prior.ownerUserId !== upload.ownerUserId ||
      !['failed', 'aborted', 'expired'].includes(prior.status)
    ) {
      return Promise.resolve(null);
    }
    this.rows.set(upload.id, upload);
    return Promise.resolve(upload);
  }

  find(ownerUserId: string, uploadId: string): Promise<StoredDirectUpload | null> {
    const row = this.rows.get(uploadId);
    return Promise.resolve(row?.ownerUserId === ownerUserId ? row : null);
  }

  setProviderUploadId(
    ownerUserId: string,
    uploadId: string,
    providerUploadId: string,
    updatedAt: string,
  ): Promise<StoredDirectUpload | null> {
    return Promise.resolve(
      this.#update(ownerUserId, uploadId, (row) =>
        row.status === 'pending' && row.providerUploadId === null
          ? { ...row, providerUploadId, status: 'uploading', updatedAt }
          : row,
      ),
    );
  }

  markVerifying(
    ownerUserId: string,
    uploadId: string,
    updatedAt: string,
  ): Promise<StoredDirectUpload | null> {
    return Promise.resolve(
      this.#update(ownerUserId, uploadId, (row) =>
        row.status === 'uploading' ? { ...row, status: 'verifying', updatedAt } : row,
      ),
    );
  }

  returnToUploading(ownerUserId: string, uploadId: string, updatedAt: string): Promise<void> {
    this.#update(ownerUserId, uploadId, (row) =>
      row.status === 'verifying' ? { ...row, status: 'uploading', updatedAt } : row,
    );
    return Promise.resolve();
  }

  markReady(
    ownerUserId: string,
    uploadId: string,
    resultVideoId: string,
    completedAt: string,
  ): Promise<void> {
    this.#update(ownerUserId, uploadId, (row) => ({
      ...row,
      status: 'ready',
      resultVideoId,
      completedAt,
      updatedAt: completedAt,
    }));
    return Promise.resolve();
  }

  markTerminal(
    ownerUserId: string,
    uploadId: string,
    status: 'failed' | 'aborted' | 'expired',
    updatedAt: string,
  ): Promise<void> {
    this.#update(ownerUserId, uploadId, (row) =>
      ['pending', 'uploading', 'verifying'].includes(row.status)
        ? { ...row, status, updatedAt }
        : row,
    );
    return Promise.resolve();
  }

  claimExpired(now: string, limit: number): Promise<readonly StoredDirectUpload[]> {
    const claimed = [...this.rows.values()]
      .filter(
        (row) => ['pending', 'uploading', 'verifying'].includes(row.status) && row.expiresAt <= now,
      )
      .sort(
        (left, right) =>
          left.updatedAt.localeCompare(right.updatedAt) ||
          left.expiresAt.localeCompare(right.expiresAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map((row) => ({ ...row, updatedAt: now }));
    for (const row of claimed) this.rows.set(row.id, row);
    return Promise.resolve(claimed);
  }

  #update(
    ownerUserId: string,
    uploadId: string,
    update: (row: StoredDirectUpload) => StoredDirectUpload,
  ): StoredDirectUpload | null {
    const row = this.rows.get(uploadId);
    if (row === undefined || row.ownerUserId !== ownerUserId) return null;
    const updated = update(row);
    this.rows.set(uploadId, updated);
    return updated;
  }
}

describe('DirectSavedVideoUploadService', () => {
  let directory: string;
  let now: Date;
  let repository: MemoryDirectUploadRepository;
  let storage: ReturnType<typeof createStorage>;
  let service: DirectSavedVideoUploadService;

  const createStorage = () => ({
    directUploadKey: vi.fn((assetId: string) => `media/v1/${assetId.slice(0, 2)}/${assetId}`),
    createDirectMultipartUpload: vi.fn(() => Promise.resolve('provider-upload-id')),
    signDirectUploadPart: vi.fn(() => Promise.resolve('https://r2.example.test/signed-part')),
    listDirectUploadParts: vi.fn(() =>
      Promise.resolve([{ PartNumber: 1, Size: inspected.sizeBytes, ETag: '"part-1"' }]),
    ),
    completeDirectMultipartUpload: vi.fn(() => Promise.resolve('"complete-etag"')),
    abortDirectMultipartUpload: vi.fn((_assetId: string, _providerUploadId: string) =>
      Promise.resolve(),
    ),
    downloadDirectUpload: vi.fn(() =>
      Promise.resolve({
        sourcePath: path.join(directory, 'downloaded.mp4'),
        checksumSha256: 'a'.repeat(64),
        etag: '"complete-etag"',
        cleanup: vi.fn(() => Promise.resolve()),
      }),
    ),
    registerDirectUpload: vi.fn(() => Promise.resolve()),
    discardDirectUpload: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
  });

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-direct-upload-'));
    now = new Date(initialNow);
    repository = new MemoryDirectUploadRepository();
    storage = createStorage();
    const savedVideos = new SavedVideoService(
      new FileSavedVideoRepository(directory),
      new LocalAssetByteStore(directory),
      { now: () => now },
    );
    service = new DirectSavedVideoUploadService(repository, storage, savedVideos, {
      now: () => now,
      inspect: () => Promise.resolve(inspected),
    });
  });

  afterEach(async () => {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('authorizes exact parts and verifies an object before attaching the saved video', async () => {
    const uploadRequest = request();
    const staged = await service.stage(ownerUserId, uploadRequest);
    expect(staged.result).toBeNull();

    await expect(service.signPart(otherUserId, staged.uploadId, 1)).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found',
    });
    await expect(service.signPart(ownerUserId, staged.uploadId, 2)).resolves.toMatchObject({
      url: 'https://r2.example.test/signed-part',
      expiresAt: '2026-08-09T14:05:00.000Z',
    });
    await expect(service.listParts(ownerUserId, staged.uploadId)).resolves.toEqual([
      { PartNumber: 1, Size: inspected.sizeBytes, ETag: '"part-1"' },
    ]);

    const saved = await service.complete(ownerUserId, staged.uploadId, [
      { PartNumber: 2, ETag: '"part-2"' },
      { PartNumber: 1, ETag: '"part-1"' },
    ]);

    expect(saved).toMatchObject({
      title: 'Direct take',
      currentVersion: { filename: 'direct-take.mp4', sizeBytes: inspected.sizeBytes },
    });
    expect(storage.completeDirectMultipartUpload).toHaveBeenCalledWith(
      expect.any(String),
      'provider-upload-id',
      [
        { PartNumber: 1, ETag: '"part-1"' },
        { PartNumber: 2, ETag: '"part-2"' },
      ],
    );
    expect(storage.registerDirectUpload).toHaveBeenCalledOnce();
    expect(repository.rows.get(staged.uploadId)).toMatchObject({
      status: 'ready',
      resultVideoId: saved.id,
    });
    await expect(service.stage(ownerUserId, uploadRequest)).resolves.toMatchObject({
      uploadId: staged.uploadId,
      result: { id: saved.id },
    });
    expect(storage.createDirectMultipartUpload).toHaveBeenCalledOnce();
  });

  it('rejects a declaration mismatch and removes the untrusted object', async () => {
    await service.close();
    service = new DirectSavedVideoUploadService(
      repository,
      storage,
      new SavedVideoService(
        new FileSavedVideoRepository(directory),
        new LocalAssetByteStore(directory),
      ),
      {
        now: () => now,
        inspect: () => Promise.resolve({ ...inspected, sizeBytes: inspected.sizeBytes - 1 }),
      },
    );
    const uploadRequest = request();
    const staged = await service.stage(ownerUserId, uploadRequest);
    const failedAssetId = repository.rows.get(staged.uploadId)!.assetId;

    await expect(
      service.complete(ownerUserId, staged.uploadId, [{ PartNumber: 1, ETag: '"part-1"' }]),
    ).rejects.toMatchObject({ statusCode: 400, code: 'invalid_video' });

    expect(storage.registerDirectUpload).not.toHaveBeenCalled();
    expect(storage.discardDirectUpload).toHaveBeenCalledOnce();
    expect(repository.rows.get(staged.uploadId)?.status).toBe('failed');

    const retried = await service.stage(ownerUserId, uploadRequest);
    expect(retried.uploadId).toBe(staged.uploadId);
    expect(repository.rows.get(staged.uploadId)).toMatchObject({ status: 'uploading' });
    expect(repository.rows.get(staged.uploadId)?.assetId).not.toBe(failedAssetId);
    expect(storage.createDirectMultipartUpload).toHaveBeenCalledTimes(2);
  });

  it('aborts and discards expired multipart uploads', async () => {
    const staged = await service.stage(ownerUserId, request());
    now = new Date('2026-08-09T15:00:01.000Z');

    await service.cleanupExpired();

    expect(storage.abortDirectMultipartUpload).toHaveBeenCalledWith(
      expect.any(String),
      'provider-upload-id',
    );
    expect(storage.discardDirectUpload).toHaveBeenCalledOnce();
    expect(repository.rows.get(staged.uploadId)?.status).toBe('expired');
  });

  it('keeps failed cleanup claimable without starving later expired uploads', async () => {
    const failing = await service.stage(ownerUserId, request());
    const failingRow = repository.rows.get(failing.uploadId)!;
    repository.rows.set(failing.uploadId, {
      ...failingRow,
      providerUploadId: 'persistently-failing-upload',
      updatedAt: '2026-08-09T13:00:00.000Z',
    });
    for (let index = 0; index < 26; index += 1) {
      await service.stage(ownerUserId, request());
    }
    storage.abortDirectMultipartUpload.mockImplementation((_assetId, providerUploadId) =>
      providerUploadId === 'persistently-failing-upload'
        ? Promise.reject(new Error('R2 unavailable'))
        : Promise.resolve(),
    );

    now = new Date('2026-08-09T15:00:01.000Z');
    await service.cleanupExpired();
    const waitingAfterFirstPass = [...repository.rows.values()].filter(
      (row) => row.id !== failing.uploadId && row.status === 'uploading',
    );
    expect(waitingAfterFirstPass).toHaveLength(2);
    expect(repository.rows.get(failing.uploadId)?.status).toBe('uploading');

    now = new Date('2026-08-09T15:10:01.000Z');
    await service.cleanupExpired();

    expect(
      waitingAfterFirstPass.every((row) => repository.rows.get(row.id)?.status === 'expired'),
    ).toBe(true);
    expect(repository.rows.get(failing.uploadId)?.status).toBe('uploading');
  });
});
