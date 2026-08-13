import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  VIDEO_RESULT_MAX_BYTES,
  type CreateDirectSavedVideoUploadRequest,
  type DirectSavedVideoUploadPart,
  type SavedVideoDetail,
} from '@studio/contracts';
import { AppError } from '../../http/app-error.js';
import { withWorkflowSpan } from '../../observability/telemetry.js';
import type { StoredAssetManifest } from '../../storage/asset-byte-store.js';
import type { DirectUploadRepository, StoredDirectUpload } from '../../storage/direct-upload.js';
import type {
  R2AssetByteStore,
  DirectR2UploadDraft,
  DirectR2DownloadedObject,
} from '../../storage/r2-asset-byte-store.js';
import { inspectSavedVideoFile } from './saved-video-inspection.js';
import { safeSavedVideoFilename, type SavedVideoService } from './saved-video-service.js';

const UPLOAD_TTL_MS = 60 * 60 * 1_000;
const PART_URL_TTL_SECONDS = 5 * 60;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1_000;

const terminalStatus = (status: StoredDirectUpload['status']): boolean =>
  status === 'failed' || status === 'aborted' || status === 'expired';

const matchesRequest = (
  upload: StoredDirectUpload,
  request: CreateDirectSavedVideoUploadRequest,
): boolean =>
  upload.expectedMimeType === request.mimeType &&
  upload.expectedSizeBytes === request.sizeBytes &&
  isDeepStrictEqual(upload.request, request);

const safeStorageFailure = (message: string, cause: unknown): AppError =>
  new AppError(503, 'storage_failure', message, { cause });

const receiptLookupKey = (ownerUserId: string, idempotencyKey: string): string =>
  `${ownerUserId}:${idempotencyKey}`;

type DirectUploadStorage = Pick<
  R2AssetByteStore,
  | 'directUploadKey'
  | 'createDirectMultipartUpload'
  | 'signDirectUploadPart'
  | 'listDirectUploadParts'
  | 'completeDirectMultipartUpload'
  | 'abortDirectMultipartUpload'
  | 'downloadDirectUpload'
  | 'registerDirectUpload'
  | 'discardDirectUpload'
  | 'delete'
>;

export interface DirectSavedVideoUploadServiceOptions {
  readonly now?: () => Date;
  readonly inspect?: typeof inspectSavedVideoFile;
}

export class DirectSavedVideoUploadService {
  readonly #repository: DirectUploadRepository;
  readonly #storage: DirectUploadStorage;
  readonly #savedVideos: SavedVideoService;
  readonly #now: () => Date;
  readonly #inspect: typeof inspectSavedVideoFile;
  readonly #cleanupTimer: ReturnType<typeof setInterval>;

  constructor(
    repository: DirectUploadRepository,
    storage: DirectUploadStorage,
    savedVideos: SavedVideoService,
    options: DirectSavedVideoUploadServiceOptions = {},
  ) {
    this.#repository = repository;
    this.#storage = storage;
    this.#savedVideos = savedVideos;
    this.#now = options.now ?? (() => new Date());
    this.#inspect = options.inspect ?? inspectSavedVideoFile;
    this.#cleanupTimer = setInterval(() => {
      void this.cleanupExpired().catch(() => undefined);
    }, CLEANUP_INTERVAL_MS);
    this.#cleanupTimer.unref?.();
  }

  #draft(upload: StoredDirectUpload): DirectR2UploadDraft {
    return {
      assetId: upload.assetId,
      ownerUserId: upload.ownerUserId,
      mimeType: upload.expectedMimeType,
      sizeBytes: upload.expectedSizeBytes,
      filename: upload.filename,
      createdAt: upload.createdAt,
    };
  }

  async #ownedUpload(ownerUserId: string, uploadId: string): Promise<StoredDirectUpload> {
    const upload = await this.#repository.find(ownerUserId, uploadId);
    if (upload === null)
      throw new AppError(404, 'not_found', 'That staged video upload is unavailable.');
    return upload;
  }

  #requireUploading(upload: StoredDirectUpload): string {
    if (upload.expiresAt <= this.#now().toISOString()) {
      throw new AppError(409, 'conflict', 'That staged video upload has expired. Start it again.');
    }
    if (terminalStatus(upload.status)) {
      throw new AppError(409, 'conflict', 'That staged video upload is no longer active.');
    }
    if (upload.status !== 'uploading' || upload.providerUploadId === null) {
      throw new AppError(409, 'conflict', 'That staged video upload is not ready for parts.');
    }
    return upload.providerUploadId;
  }

  async stage(
    ownerUserId: string,
    request: CreateDirectSavedVideoUploadRequest,
  ): Promise<{ uploadId: string; expiresAt: string; result: SavedVideoDetail | null }> {
    if (request.sizeBytes > VIDEO_RESULT_MAX_BYTES) {
      throw new AppError(413, 'payload_too_large', 'The saved video must be 300 MB or smaller.');
    }
    const prior = await this.#savedVideos.findByIdempotencyKey(ownerUserId, request.idempotencyKey);
    if (prior !== null) {
      const existing = await this.#repository.findByIdempotency(
        ownerUserId,
        request.idempotencyKey,
      );
      if (existing === null) {
        throw new AppError(409, 'conflict', 'That completed staged upload is unavailable.');
      }
      if (!matchesRequest(existing, request)) {
        throw new AppError(409, 'conflict', 'The idempotency key belongs to another upload.');
      }
      await this.#repository.markReady(
        ownerUserId,
        existing.id,
        prior.id,
        this.#now().toISOString(),
      );
      return { uploadId: existing.id, expiresAt: existing.expiresAt, result: prior };
    }
    if (request.target.kind === 'version') {
      const target = await this.#savedVideos.get(ownerUserId, request.target.videoId);
      if (target.currentVersion.id !== request.target.expectedVersionId) {
        throw new AppError(
          409,
          'conflict',
          'The saved video changed before this version could be uploaded.',
        );
      }
    }
    await this.cleanupExpired().catch(() => undefined);

    const createdAt = this.#now().toISOString();
    const assetId = randomUUID();
    const uploadId = randomUUID();
    let stored = await withWorkflowSpan('db.direct_upload.create', {}, () =>
      this.#repository.create({
        id: uploadId,
        ownerUserId,
        assetId,
        idempotencyKey: request.idempotencyKey,
        storageKey: this.#storage.directUploadKey(assetId),
        providerUploadId: null,
        status: 'pending',
        expectedMimeType: request.mimeType,
        expectedSizeBytes: request.sizeBytes,
        filename: safeSavedVideoFilename(request.metadata.filename, request.mimeType),
        request,
        resultVideoId: null,
        expiresAt: new Date(this.#now().getTime() + UPLOAD_TTL_MS).toISOString(),
        completedAt: null,
        createdAt,
        updatedAt: createdAt,
      }),
    );
    if (!matchesRequest(stored, request)) {
      throw new AppError(409, 'conflict', 'The idempotency key belongs to another upload.');
    }
    const completed = await this.#savedVideos.findByIdempotencyKey(
      ownerUserId,
      stored.idempotencyKey,
    );
    if (completed !== null) {
      await this.#repository.markReady(
        ownerUserId,
        stored.id,
        completed.id,
        this.#now().toISOString(),
      );
      return { uploadId: stored.id, expiresAt: stored.expiresAt, result: completed };
    }
    if (terminalStatus(stored.status)) {
      stored =
        (await this.#repository.restart({
          ...stored,
          assetId,
          storageKey: this.#storage.directUploadKey(assetId),
          providerUploadId: null,
          status: 'pending',
          resultVideoId: null,
          expiresAt: new Date(this.#now().getTime() + UPLOAD_TTL_MS).toISOString(),
          completedAt: null,
          createdAt,
          updatedAt: createdAt,
        })) ?? stored;
      if (terminalStatus(stored.status)) {
        throw new AppError(409, 'conflict', 'That staged video upload is no longer active.');
      }
    }
    if (stored.status === 'ready' && stored.resultVideoId !== null) {
      return {
        uploadId: stored.id,
        expiresAt: stored.expiresAt,
        result: await this.#savedVideos.get(ownerUserId, stored.resultVideoId),
      };
    }
    if (stored.providerUploadId !== null) {
      return { uploadId: stored.id, expiresAt: stored.expiresAt, result: null };
    }

    let providerUploadId: string;
    try {
      providerUploadId = await withWorkflowSpan('r2.multipart.create', {}, () =>
        this.#storage.createDirectMultipartUpload(this.#draft(stored)),
      );
    } catch (error) {
      await this.#repository
        .markTerminal(ownerUserId, stored.id, 'failed', this.#now().toISOString())
        .catch(() => undefined);
      throw safeStorageFailure('The staged video upload could not be started.', error);
    }
    const active = await this.#repository.setProviderUploadId(
      ownerUserId,
      stored.id,
      providerUploadId,
      this.#now().toISOString(),
    );
    if (active?.providerUploadId !== providerUploadId) {
      await this.#storage
        .abortDirectMultipartUpload(stored.assetId, providerUploadId)
        .catch(() => undefined);
    }
    if (active?.providerUploadId === null || active === null) {
      throw new AppError(409, 'conflict', 'That staged video upload is unavailable.');
    }
    return { uploadId: active.id, expiresAt: active.expiresAt, result: null };
  }

  async signPart(
    ownerUserId: string,
    uploadId: string,
    partNumber: number,
  ): Promise<{ url: string; expiresAt: string }> {
    const upload = await this.#ownedUpload(ownerUserId, uploadId);
    const providerUploadId = this.#requireUploading(upload);
    try {
      const url = await this.#storage.signDirectUploadPart(
        upload.assetId,
        providerUploadId,
        partNumber,
        PART_URL_TTL_SECONDS,
      );
      return {
        url,
        expiresAt: new Date(this.#now().getTime() + PART_URL_TTL_SECONDS * 1_000).toISOString(),
      };
    } catch (error) {
      throw safeStorageFailure('That upload part could not be authorized.', error);
    }
  }

  async listParts(
    ownerUserId: string,
    uploadId: string,
  ): Promise<readonly DirectSavedVideoUploadPart[]> {
    const upload = await this.#ownedUpload(ownerUserId, uploadId);
    const providerUploadId = this.#requireUploading(upload);
    try {
      return await this.#storage.listDirectUploadParts(upload.assetId, providerUploadId);
    } catch (error) {
      throw safeStorageFailure('The uploaded video parts could not be listed.', error);
    }
  }

  async abort(ownerUserId: string, uploadId: string): Promise<void> {
    const upload = await this.#ownedUpload(ownerUserId, uploadId);
    if (upload.status === 'ready' || terminalStatus(upload.status)) return;
    if (upload.status === 'verifying') {
      throw new AppError(409, 'conflict', 'The staged video upload is already being finalized.');
    }
    try {
      if (upload.providerUploadId !== null) {
        await this.#storage.abortDirectMultipartUpload(upload.assetId, upload.providerUploadId);
      }
      await this.#repository.markTerminal(
        ownerUserId,
        upload.id,
        'aborted',
        this.#now().toISOString(),
      );
    } catch (error) {
      throw safeStorageFailure('The staged video upload could not be cancelled.', error);
    }
  }

  async complete(
    ownerUserId: string,
    uploadId: string,
    parts: readonly { PartNumber: number; ETag: string }[],
  ): Promise<SavedVideoDetail> {
    let upload = await this.#ownedUpload(ownerUserId, uploadId);
    const prior = await this.#savedVideos.findByIdempotencyKey(ownerUserId, upload.idempotencyKey);
    if (prior !== null) {
      await this.#repository.markReady(ownerUserId, upload.id, prior.id, this.#now().toISOString());
      return prior;
    }
    if (upload.status === 'ready' && upload.resultVideoId !== null) {
      return this.#savedVideos.get(ownerUserId, upload.resultVideoId);
    }
    const providerUploadId = this.#requireUploading(upload);
    const orderedParts = [...parts].sort((left, right) => left.PartNumber - right.PartNumber);
    if (
      orderedParts.some(
        (part, index) => index > 0 && part.PartNumber === orderedParts[index - 1]?.PartNumber,
      )
    ) {
      throw new AppError(400, 'validation_error', 'Provide each uploaded part exactly once.');
    }
    upload =
      (await this.#repository.markVerifying(ownerUserId, upload.id, this.#now().toISOString())) ??
      upload;
    if (upload.status !== 'verifying') {
      throw new AppError(409, 'conflict', 'That staged video upload is already being finalized.');
    }

    try {
      await withWorkflowSpan(
        'r2.multipart.complete',
        { 'lightframe.part_count': orderedParts.length },
        () =>
          this.#storage.completeDirectMultipartUpload(
            upload.assetId,
            providerUploadId,
            orderedParts,
          ),
      );
    } catch (error) {
      await this.#repository
        .returnToUploading(ownerUserId, upload.id, this.#now().toISOString())
        .catch(() => undefined);
      throw safeStorageFailure('The uploaded video parts could not be finalized.', error);
    }

    let registered = false;
    let attached = false;
    let downloaded: DirectR2DownloadedObject | undefined;
    try {
      downloaded = await withWorkflowSpan('r2.object.verify_download', {}, () =>
        this.#storage.downloadDirectUpload(this.#draft(upload)),
      );
      const inspected = await this.#inspect(downloaded.sourcePath);
      if (
        inspected.sizeBytes !== upload.expectedSizeBytes ||
        inspected.mimeType !== upload.expectedMimeType
      ) {
        throw new AppError(
          400,
          'invalid_video',
          'The uploaded video did not match its declaration.',
        );
      }
      const manifest: StoredAssetManifest = {
        schemaVersion: 1,
        assetId: upload.assetId,
        ownerUserId,
        mimeType: inspected.mimeType,
        filename: upload.filename,
        sizeBytes: inspected.sizeBytes,
        checksumSha256: downloaded.checksumSha256,
        createdAt: upload.createdAt,
      };
      await withWorkflowSpan('r2.object.finalize', {}, () =>
        this.#storage.registerDirectUpload(manifest, downloaded!.etag),
      );
      registered = true;
      const result = await withWorkflowSpan('db.saved_video.attach_upload', {}, () =>
        upload.request.target.kind === 'new'
          ? this.#savedVideos.saveNewFromStagedAsset(
              ownerUserId,
              upload.idempotencyKey,
              upload.assetId,
              upload.request.metadata,
              inspected,
              upload.createdAt,
            )
          : this.#savedVideos.appendVersionFromStagedAsset(
              ownerUserId,
              upload.request.target.videoId,
              upload.request.target.expectedVersionId,
              upload.idempotencyKey,
              upload.assetId,
              upload.request.metadata,
              inspected,
              upload.createdAt,
            ),
      );
      attached = true;
      await this.#repository.markReady(
        ownerUserId,
        upload.id,
        result.id,
        this.#now().toISOString(),
      );
      return result;
    } catch (error) {
      if (!attached) {
        let removed = false;
        try {
          if (registered) await this.#storage.delete(ownerUserId, upload.assetId);
          else await this.#storage.discardDirectUpload(upload.assetId);
          removed = true;
        } catch {
          // Keep the expired active row claimable by the abandoned-upload cleanup retry.
        }
        if (removed) {
          await this.#repository
            .markTerminal(ownerUserId, upload.id, 'failed', this.#now().toISOString())
            .catch(() => undefined);
        }
      }
      if (error instanceof AppError) throw error;
      throw safeStorageFailure('The uploaded video could not be verified safely.', error);
    } finally {
      await downloaded?.cleanup().catch(() => undefined);
    }
  }

  async cleanupExpired(): Promise<void> {
    const expired = await this.#repository.claimExpired(this.#now().toISOString(), 25);
    const activeReceipts = await this.#savedVideos.findActiveReceipts(
      expired.map(({ ownerUserId, idempotencyKey }) => ({ ownerUserId, idempotencyKey })),
    );
    const attachedVideoIds = new Map(
      activeReceipts.map(({ ownerUserId, idempotencyKey, videoId }) => [
        receiptLookupKey(ownerUserId, idempotencyKey),
        videoId,
      ]),
    );
    for (const upload of expired) {
      try {
        const attachedVideoId = attachedVideoIds.get(
          receiptLookupKey(upload.ownerUserId, upload.idempotencyKey),
        );
        if (attachedVideoId !== undefined) {
          await this.#repository.markReady(
            upload.ownerUserId,
            upload.id,
            attachedVideoId,
            this.#now().toISOString(),
          );
          continue;
        }
        if (upload.providerUploadId !== null) {
          await this.#storage.abortDirectMultipartUpload(upload.assetId, upload.providerUploadId);
        }
        await this.#storage.delete(upload.ownerUserId, upload.assetId);
        await this.#storage.discardDirectUpload(upload.assetId);
        await this.#repository.markTerminal(
          upload.ownerUserId,
          upload.id,
          'expired',
          this.#now().toISOString(),
        );
      } catch {
        // Leave the active expired row for the next bounded cleanup pass.
      }
    }
  }

  async close(): Promise<void> {
    clearInterval(this.#cleanupTimer);
    await this.cleanupExpired().catch(() => undefined);
  }
}
