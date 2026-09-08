import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  directSavedVideoUploadPartsResponseSchema,
  directSavedVideoUploadPartUrlSchema,
  directSavedVideoUploadResponseSchema,
  savedVideoDetailSchema,
  savedVideosResponseSchema,
  type CreateDirectSavedVideoUploadRequest,
} from '@studio/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { LocalAssetByteStore, type StoredAssetManifest } from '../../storage/asset-byte-store.js';
import {
  R2AssetByteStore,
  type DirectR2DownloadedObject,
  type DirectR2UploadDraft,
} from '../../storage/r2-asset-byte-store.js';
import { MemoryDirectUploadRepository, testConfig } from '../../test/fakes.js';
import { loadDecodableH264VideoFixture } from '../../test/videoFixtures.js';

const browserHeaders = { host: 'localhost:5173', origin: 'http://localhost:5173' };
const jsonHeaders = { ...browserHeaders, 'content-type': 'application/json' };

/** One stable name for a blob of bytes, used as the part and object ETag the routes carry. */
const etagOf = (bytes: Buffer): string =>
  `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`;

/**
 * A byte-holding stand-in for the direct-upload half of the R2 store.
 *
 * Subclassed rather than shaped by hand because the application types this dependency as the class
 * itself. Every method the upload service calls is overridden, so the inert credentials below never
 * reach anything; the parent contributes only `directUploadKey`, which is pure.
 *
 * It models what a multipart upload holds — parts by number, then one assembled object — and
 * nothing about R2 itself. What R2 returns from ListParts, whether a re-PUT under the same part
 * number replaces or duplicates, and how long an upload survives its own TTL stay unproven here.
 */
class ByteHoldingDirectUploadStorage extends R2AssetByteStore {
  /** Parts still in flight, keyed by asset and multipart upload. */
  readonly #parts = new Map<string, Map<number, Buffer>>();
  /** Objects a completed multipart upload assembled, keyed by asset. */
  readonly #objects = new Map<string, Buffer>();
  /** What each authorized part URL is authority over, so an unsigned PUT cannot land. */
  readonly #authorized = new Map<
    string,
    { readonly assetId: string; readonly providerUploadId: string; readonly partNumber: number }
  >();
  readonly #assets: LocalAssetByteStore;
  #multipartUploads = 0;
  readonly abortedUploadIds: string[] = [];

  constructor(assets: LocalAssetByteStore) {
    super({
      accountId: 'byte-holding-fake',
      accessKeyId: 'byte-holding-fake',
      secretAccessKey: 'byte-holding-fake',
      bucket: 'byte-holding-fake',
    });
    this.#assets = assets;
  }

  get multipartUploadsCreated(): number {
    return this.#multipartUploads;
  }

  #held(assetId: string, providerUploadId: string): Map<number, Buffer> {
    const held = this.#parts.get(`${assetId}:${providerUploadId}`);
    if (held === undefined) throw new Error('That multipart upload does not exist.');
    return held;
  }

  /** What the browser does with the URL the server authorized, and the only way bytes get in. */
  putSignedPart(url: string, bytes: Buffer): string {
    const target = this.#authorized.get(url);
    if (target === undefined) throw new Error('That upload part URL was never authorized.');
    this.#held(target.assetId, target.providerUploadId).set(target.partNumber, bytes);
    return etagOf(bytes);
  }

  override createDirectMultipartUpload(draft: DirectR2UploadDraft): Promise<string> {
    this.#multipartUploads += 1;
    const providerUploadId = `multipart-${this.#multipartUploads}`;
    this.#parts.set(`${draft.assetId}:${providerUploadId}`, new Map());
    return Promise.resolve(providerUploadId);
  }

  override signDirectUploadPart(
    assetId: string,
    providerUploadId: string,
    partNumber: number,
    _expiresInSeconds: number,
  ): Promise<string> {
    const url = `https://byte-holding.invalid/${assetId}/${providerUploadId}/${partNumber}`;
    this.#authorized.set(url, { assetId, providerUploadId, partNumber });
    return Promise.resolve(url);
  }

  override listDirectUploadParts(
    assetId: string,
    providerUploadId: string,
  ): Promise<readonly { PartNumber: number; Size: number; ETag: string }[]> {
    return Promise.resolve(
      [...this.#held(assetId, providerUploadId)]
        .sort(([left], [right]) => left - right)
        .map(([partNumber, bytes]) => ({
          PartNumber: partNumber,
          Size: bytes.byteLength,
          ETag: etagOf(bytes),
        })),
    );
  }

  override completeDirectMultipartUpload(
    assetId: string,
    providerUploadId: string,
    parts: readonly { PartNumber: number; ETag: string }[],
  ): Promise<string | null> {
    const held = this.#held(assetId, providerUploadId);
    const assembled = Buffer.concat(
      parts.map((part) => {
        const bytes = held.get(part.PartNumber);
        if (bytes === undefined) throw new Error('That part was never uploaded.');
        if (etagOf(bytes) !== part.ETag) throw new Error('That part ETag names other bytes.');
        return bytes;
      }),
    );
    this.#objects.set(assetId, assembled);
    this.#parts.delete(`${assetId}:${providerUploadId}`);
    return Promise.resolve(etagOf(assembled));
  }

  override abortDirectMultipartUpload(assetId: string, providerUploadId: string): Promise<void> {
    this.abortedUploadIds.push(providerUploadId);
    this.#parts.delete(`${assetId}:${providerUploadId}`);
    return Promise.resolve();
  }

  override async downloadDirectUpload(
    draft: DirectR2UploadDraft,
  ): Promise<DirectR2DownloadedObject> {
    const object = this.#objects.get(draft.assetId);
    if (object === undefined) throw new Error('No completed object exists for that asset.');
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-direct-upload-verify-'));
    const sourcePath = path.join(directory, 'content');
    await writeFile(sourcePath, object, { mode: 0o600 });
    return {
      sourcePath,
      checksumSha256: createHash('sha256').update(object).digest('hex'),
      etag: etagOf(object),
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  }

  override async registerDirectUpload(
    manifest: StoredAssetManifest,
    _etag: string | null,
  ): Promise<void> {
    const object = this.#objects.get(manifest.assetId);
    if (object === undefined) throw new Error('No completed object exists for that asset.');
    // In R2 the completed object already sits at the key the asset store reads from, and
    // registration only records its lifecycle. The local store's unit is a manifested asset, so
    // this is the first moment the same thing can be said here.
    await this.#assets.storeBytes({
      assetId: manifest.assetId,
      ownerUserId: manifest.ownerUserId,
      bytes: object,
      mimeType: manifest.mimeType,
      filename: manifest.filename,
      createdAt: manifest.createdAt,
    });
  }

  override discardDirectUpload(assetId: string): Promise<void> {
    this.#objects.delete(assetId);
    return Promise.resolve();
  }

  override async delete(ownerUserId: string, assetId: string): Promise<void> {
    this.#objects.delete(assetId);
    await this.#assets.delete(ownerUserId, assetId);
  }
}

describe('direct saved-video upload routes', () => {
  let directory: string;
  let repository: MemoryDirectUploadRepository;
  let storage: ByteHoldingDirectUploadStorage;
  let app: ReturnType<typeof createApp>;
  let fixture: Buffer;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-direct-upload-routes-'));
    repository = new MemoryDirectUploadRepository();
    storage = new ByteHoldingDirectUploadStorage(new LocalAssetByteStore(directory));
    // Real bytes, because the route's verification really inspects what it downloaded: a stub
    // would let the declaration check below pass over anything at all.
    fixture = await loadDecodableH264VideoFixture();
    app = createApp({
      config: testConfig({ lightframeDataDir: directory }),
      persistence: { directVideoUploads: { repository, storage } },
    });
  });

  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  const uploadRequest = (idempotencyKey: string): CreateDirectSavedVideoUploadRequest => ({
    idempotencyKey,
    mimeType: 'video/mp4',
    sizeBytes: fixture.byteLength,
    metadata: {
      title: 'Direct upload take',
      origin: 'recorded',
      characterName: null,
      characterVariantName: null,
      filename: 'direct upload take.mp4',
      sourceVideoId: null,
      sourceVersionId: null,
    },
    target: { kind: 'new' },
  });

  const stage = async (request: CreateDirectSavedVideoUploadRequest) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/videos/uploads',
      headers: jsonHeaders,
      payload: request,
    });
    expect(response.statusCode).toBe(201);
    return directSavedVideoUploadResponseSchema.parse(response.json());
  };

  const signPart = async (uploadId: string, partNumber: number) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/videos/uploads/${uploadId}/parts/${partNumber}`,
      headers: browserHeaders,
    });
    expect(response.statusCode).toBe(200);
    return directSavedVideoUploadPartUrlSchema.parse(response.json());
  };

  const listParts = (uploadId: string) =>
    app.inject({
      method: 'GET',
      url: `/api/videos/uploads/${uploadId}/parts`,
      headers: browserHeaders,
    });

  it('resumes a partly uploaded video from the parts the server already holds', async () => {
    const request = uploadRequest(randomUUID());
    const staged = await stage(request);
    expect(staged.result).toBeNull();

    // The probe a client makes right after staging. The server holds nothing yet, and answering it
    // at all is what lets a later run tell which parts it may skip.
    const beforeAnyPart = await listParts(staged.uploadId);
    expect(beforeAnyPart.statusCode).toBe(200);
    expect(directSavedVideoUploadPartsResponseSchema.parse(beforeAnyPart.json())).toEqual({
      parts: [],
    });

    const firstPart = fixture.subarray(0, 2_048);
    const secondPart = fixture.subarray(2_048);
    const firstETag = storage.putSignedPart(
      (await signPart(staged.uploadId, 1)).url,
      Buffer.from(firstPart),
    );
    // The interruption: one part is up, nothing was completed, and the tab is gone. On the reload
    // the same idempotency key returns the same staged upload rather than opening a second
    // multipart upload beside the one that already holds a part.
    const resumed = await stage(request);
    expect(resumed.uploadId).toBe(staged.uploadId);
    expect(storage.multipartUploadsCreated).toBe(1);

    const held = await listParts(resumed.uploadId);
    expect(held.statusCode).toBe(200);
    expect(directSavedVideoUploadPartsResponseSchema.parse(held.json())).toEqual({
      parts: [{ PartNumber: 1, Size: firstPart.byteLength, ETag: firstETag }],
    });

    const secondETag = storage.putSignedPart(
      (await signPart(resumed.uploadId, 2)).url,
      Buffer.from(secondPart),
    );

    const completed = await app.inject({
      method: 'POST',
      url: `/api/videos/uploads/${resumed.uploadId}/complete`,
      headers: jsonHeaders,
      payload: {
        parts: [
          { PartNumber: 2, ETag: secondETag },
          { PartNumber: 1, ETag: firstETag },
        ],
      },
    });
    expect(completed.statusCode).toBe(200);
    const saved = savedVideoDetailSchema.parse(completed.json());
    expect(saved).toMatchObject({
      title: 'Direct upload take',
      currentVersion: {
        filename: 'direct-upload-take.mp4',
        mimeType: 'video/mp4',
        sizeBytes: fixture.byteLength,
        width: 1_280,
        height: 720,
      },
    });
    expect(repository.rows.get(resumed.uploadId)).toMatchObject({
      status: 'ready',
      resultVideoId: saved.id,
    });

    // The whole point of the two halves: what the account can now play back is the original file,
    // reassembled from parts that were authorized one at a time and never sent together.
    const content = await app.inject({
      method: 'GET',
      url: `/api/videos/${saved.id}/content`,
      headers: browserHeaders,
    });
    expect(content.statusCode).toBe(200);
    expect(content.rawPayload).toEqual(fixture);
  });

  it('cancels a staged upload and refuses to authorize or list its parts afterwards', async () => {
    const staged = await stage(uploadRequest(randomUUID()));
    storage.putSignedPart(
      (await signPart(staged.uploadId, 1)).url,
      Buffer.from(fixture.subarray(0, 1_024)),
    );

    const cancelled = await app.inject({
      method: 'DELETE',
      url: `/api/videos/uploads/${staged.uploadId}`,
      headers: browserHeaders,
    });

    expect(cancelled.statusCode).toBe(204);
    expect(storage.abortedUploadIds).toEqual(['multipart-1']);
    const refusedPart = await app.inject({
      method: 'POST',
      url: `/api/videos/uploads/${staged.uploadId}/parts/2`,
      headers: browserHeaders,
    });
    expect(refusedPart.statusCode).toBe(409);
    expect(refusedPart.json()).toMatchObject({
      error: { code: 'conflict', message: 'That staged video upload is no longer active.' },
    });
    expect((await listParts(staged.uploadId)).statusCode).toBe(409);
    // A cancelled upload leaves no half-saved video behind for the gallery to offer.
    const gallery = await app.inject({
      method: 'GET',
      url: '/api/videos',
      headers: browserHeaders,
    });
    expect(savedVideosResponseSchema.parse(gallery.json())).toMatchObject({
      videos: [],
      total: 0,
    });
  });

  it('refuses a staged upload that belongs to no session of this owner', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: `/api/videos/uploads/${randomUUID()}/parts/1`,
      headers: browserHeaders,
    });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({
      error: { code: 'not_found', message: 'That staged video upload is unavailable.' },
    });
    expect(storage.multipartUploadsCreated).toBe(0);
  });
});
