import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { LocalAssetByteStore } from '../../storage/asset-byte-store.js';
import { testConfig } from '../../test/fakes.js';
import {
  FileSavedVideoRepository,
  type StoredSavedVideoAggregate,
} from './saved-video-repository.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const browserHeaders = { host: 'localhost:5173', origin: 'http://localhost:5173' };
const createdAt = '2026-08-08T12:00:00.000Z';

describe('saved-video routes', () => {
  let directory: string;
  let repository: FileSavedVideoRepository;
  let bytes: LocalAssetByteStore;
  let app: ReturnType<typeof createApp>;
  let cookie: string;
  let videoId: string;
  let versionId: string;
  let assetId: string;
  let thumbnailAssetId: string;
  let videoBytes: Buffer;
  let thumbnailBytes: Buffer;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-saved-routes-'));
    repository = new FileSavedVideoRepository(directory);
    bytes = new LocalAssetByteStore(directory);
    videoId = randomUUID();
    versionId = randomUUID();
    assetId = randomUUID();
    thumbnailAssetId = randomUUID();
    videoBytes = Buffer.from('saved-video-route-bytes');
    thumbnailBytes = Buffer.from('saved-thumbnail-route-bytes');

    await bytes.storeBytes({
      assetId,
      ownerUserId,
      bytes: videoBytes,
      mimeType: 'video/mp4',
      filename: 'studio-take.mp4',
      createdAt,
    });
    await bytes.storeBytes({
      assetId: thumbnailAssetId,
      ownerUserId,
      bytes: thumbnailBytes,
      mimeType: 'image/webp',
      filename: 'thumbnail.webp',
      createdAt,
    });
    const aggregate: StoredSavedVideoAggregate = {
      video: {
        id: videoId,
        ownerUserId,
        title: 'Studio take',
        currentVersionId: versionId,
        sourceVideoId: null,
        status: 'ready',
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      },
      versions: [
        {
          id: versionId,
          videoId,
          ownerUserId,
          ordinal: 1,
          origin: 'recorded',
          characterName: 'Lucy',
          characterVariantName: null,
          sourceVersionId: null,
          assetId,
          thumbnailAssetId,
          mimeType: 'video/mp4',
          filename: 'studio-take.mp4',
          sizeBytes: videoBytes.byteLength,
          durationMs: 12_000,
          width: 1_280,
          height: 720,
          exportSpecification: null,
          createdAt,
        },
      ],
      revision: 1,
    };
    await repository.create(ownerUserId, aggregate, {
      idempotencyKey: randomUUID(),
      videoId,
      versionId,
      createdAt,
    });

    app = createApp({
      config: testConfig({ demoAuthEnabled: true, lightframeDataDir: directory }),
      persistence: { savedVideos: repository, assetBytes: bytes },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    expect(login.statusCode).toBe(200);
    cookie = String(login.headers['set-cookie']).split(';', 1)[0]!;
  });

  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('lists and retrieves owner-scoped metadata with explicit HEAD parity', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/videos?pageSize=1&sort=latest',
      headers: { host: browserHeaders.host, cookie },
    });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}`,
      headers: { host: browserHeaders.host, cookie },
    });
    const head = await app.inject({
      method: 'HEAD',
      url: `/api/videos/${videoId}`,
      headers: { host: browserHeaders.host, cookie },
    });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      videos: [{ id: videoId, title: 'Studio take', thumbnailAvailable: true }],
      total: 1,
      facets: { characterNames: ['Lucy'], formats: ['landscape'] },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ id: videoId, currentVersion: { id: versionId } });
    expect(detail.body).not.toContain(assetId);
    expect(detail.body).not.toContain(thumbnailAssetId);
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe(detail.headers['content-length']);
  });

  it('streams full, ranged, versioned, and thumbnail content with exact headers', async () => {
    const full = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/content`,
      headers: { host: browserHeaders.host, cookie },
    });
    const ranged = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/content?download=true`,
      headers: { host: browserHeaders.host, cookie, range: 'bytes=2-7' },
    });
    const versioned = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/versions/${versionId}/content`,
      headers: { host: browserHeaders.host, cookie },
    });
    const thumbnail = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}/thumbnail`,
      headers: { host: browserHeaders.host, cookie },
    });
    const head = await app.inject({
      method: 'HEAD',
      url: `/api/videos/${videoId}/content`,
      headers: { host: browserHeaders.host, cookie },
    });

    expect(full.statusCode).toBe(200);
    expect(full.rawPayload).toEqual(videoBytes);
    expect(full.headers).toMatchObject({
      'accept-ranges': 'bytes',
      'content-type': 'video/mp4',
      'content-length': String(videoBytes.byteLength),
      'content-disposition': 'inline; filename="studio-take.mp4"',
      'x-content-type-options': 'nosniff',
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.rawPayload).toEqual(videoBytes.subarray(2, 8));
    expect(ranged.headers).toMatchObject({
      'content-range': `bytes 2-7/${videoBytes.byteLength}`,
      'content-length': '6',
      'content-disposition': 'attachment; filename="studio-take.mp4"',
    });
    expect(versioned.rawPayload).toEqual(videoBytes);
    expect(thumbnail.rawPayload).toEqual(thumbnailBytes);
    expect(thumbnail.headers).toMatchObject({
      'content-type': 'image/webp',
      'content-length': String(thumbnailBytes.byteLength),
      'content-disposition': 'inline',
    });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe(String(videoBytes.byteLength));
  });

  it('serves suffix ranges and ignores ranges it does not support', async () => {
    const rangeRequest = (range: string) =>
      app.inject({
        method: 'GET',
        url: `/api/videos/${videoId}/content`,
        headers: { host: browserHeaders.host, cookie, range },
      });

    // A suffix range is the last N bytes — the form a player uses to read a trailing moov atom.
    const suffix = await rangeRequest('bytes=-5');
    expect(suffix.statusCode).toBe(206);
    expect(suffix.rawPayload).toEqual(videoBytes.subarray(videoBytes.byteLength - 5));
    expect(suffix.headers).toMatchObject({
      'content-range': `bytes ${videoBytes.byteLength - 5}-${videoBytes.byteLength - 1}/${videoBytes.byteLength}`,
      'content-length': '5',
    });

    // A suffix longer than the representation is satisfied by the whole of it.
    const oversizedSuffix = await rangeRequest(`bytes=-${videoBytes.byteLength + 10}`);
    expect(oversizedSuffix.statusCode).toBe(206);
    expect(oversizedSuffix.rawPayload).toEqual(videoBytes);

    // A form this server does not support is ignored rather than refused: the client still gets
    // the complete representation instead of a hard failure.
    for (const ignored of ['bytes=0-1,3-4', 'items=0-1', 'nonsense']) {
      const response = await rangeRequest(ignored);
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(videoBytes);
    }
  });

  it('refuses an unsatisfiable range and states the representation length', async () => {
    for (const range of [`bytes=${videoBytes.byteLength}-`, 'bytes=-0']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/videos/${videoId}/content`,
        headers: { host: browserHeaders.host, cookie, range },
      });
      expect(response.statusCode).toBe(416);
      expect(response.json()).toMatchObject({ error: { code: 'validation_error' } });
      expect(response.headers).toMatchObject({
        'content-range': `bytes */${videoBytes.byteLength}`,
      });
    }
  });

  it('renames and deletes through the trusted-origin boundary', async () => {
    const rejected = await app.inject({
      method: 'PATCH',
      url: `/api/videos/${videoId}`,
      headers: {
        host: browserHeaders.host,
        origin: 'http://127.0.0.1:5173',
        cookie,
        'content-type': 'application/json',
      },
      payload: { title: 'Wrong origin' },
    });
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/videos/${videoId}`,
      headers: { ...browserHeaders, cookie, 'content-type': 'application/json' },
      payload: { title: '  Final   cut  ' },
    });
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/videos/${videoId}`,
      headers: { ...browserHeaders, cookie },
    });
    const afterDelete = await app.inject({
      method: 'GET',
      url: `/api/videos/${videoId}`,
      headers: { host: browserHeaders.host, cookie },
    });

    expect(rejected.statusCode).toBe(403);
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ id: videoId, title: 'Final cut' });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    expect(afterDelete.statusCode).toBe(404);
    expect(await bytes.exists(ownerUserId, assetId)).toBe(true);
  });

  it('covers upload and version guards before media inspection or mutation', async () => {
    const invalidUpload = await app.inject({
      method: 'POST',
      url: '/api/videos',
      headers: {
        ...browserHeaders,
        cookie,
        'content-type': 'video/mp4',
        'idempotency-key': randomUUID(),
        'x-lightframe-video-metadata': '%7Bnot-json',
      },
      payload: Buffer.from('not-a-video'),
    });
    const invalidVersion = await app.inject({
      method: 'POST',
      url: `/api/videos/${videoId}/versions`,
      headers: {
        ...browserHeaders,
        cookie,
        'content-type': 'video/mp4',
        'idempotency-key': randomUUID(),
        'if-match': 'not-a-version',
        'x-lightframe-video-metadata': encodeURIComponent(
          JSON.stringify({
            title: 'Version',
            origin: 'editor',
            characterName: null,
            characterVariantName: null,
            filename: 'version.mp4',
            sourceVideoId: null,
            sourceVersionId: null,
          }),
        ),
      },
      payload: Buffer.from('not-a-video'),
    });
    const emptyThumbnail = await app.inject({
      method: 'PUT',
      url: `/api/videos/${videoId}/versions/${versionId}/thumbnail`,
      headers: { ...browserHeaders, cookie, 'content-type': 'image/webp' },
      payload: Buffer.alloc(0),
    });

    expect(invalidUpload.statusCode).toBe(400);
    expect(invalidUpload.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(invalidVersion.statusCode).toBe(400);
    expect(invalidVersion.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(emptyThumbnail.statusCode).toBe(400);
    expect(emptyThumbnail.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(await repository.get(ownerUserId, videoId)).toMatchObject({ revision: 1 });
  });

  it('keeps GET and HEAD siblings private under real session authentication', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/videos', headers: browserHeaders });
    const head = await app.inject({ method: 'HEAD', url: '/api/videos', headers: browserHeaders });

    expect(get.statusCode).toBe(401);
    expect(get.json()).toMatchObject({ error: { code: 'authentication_required' } });
    expect(head.statusCode).toBe(401);
    expect(head.body).toBe('');
  });
});
