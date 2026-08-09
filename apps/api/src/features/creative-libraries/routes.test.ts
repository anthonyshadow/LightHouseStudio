import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createEmptyCreativeAssetStore, type CreativeAssetStore } from '@studio/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import {
  LocalReferenceImageAssetStore,
  type ReferenceImageAssetStore,
} from '../reference-images/asset-store.js';
import { testConfig } from '../../test/fakes.js';
import type {
  CreativeLibraryRepository,
  CreativeLibrarySnapshot,
} from './creative-library-repository.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const browserHeaders = { host: 'localhost:5173', origin: 'http://localhost:5173' };

class MemoryCreativeLibraryRepository implements CreativeLibraryRepository {
  snapshot: CreativeLibrarySnapshot = {
    revision: 0,
    store: createEmptyCreativeAssetStore(),
    updatedAt: '2026-08-08T12:00:00.000Z',
  };
  readonly loads: string[] = [];
  readonly replacements: Array<{
    readonly ownerUserId: string;
    readonly expectedRevision: number;
    readonly store: CreativeAssetStore;
    readonly updatedAt: string;
  }> = [];

  load(requestOwnerUserId: string): Promise<CreativeLibrarySnapshot> {
    this.loads.push(requestOwnerUserId);
    return Promise.resolve(this.snapshot);
  }

  replace(
    requestOwnerUserId: string,
    expectedRevision: number,
    store: CreativeAssetStore,
    updatedAt: string,
  ): Promise<CreativeLibrarySnapshot | 'conflict'> {
    this.replacements.push({
      ownerUserId: requestOwnerUserId,
      expectedRevision,
      store,
      updatedAt,
    });
    if (expectedRevision !== this.snapshot.revision) return Promise.resolve('conflict');
    this.snapshot = { revision: expectedRevision + 1, store, updatedAt };
    return Promise.resolve(this.snapshot);
  }
}

describe('creative-library routes', () => {
  let directory: string;
  let repository: MemoryCreativeLibraryRepository;
  let referenceImages: ReferenceImageAssetStore;
  let purgeExpired: () => Promise<number>;
  let app: ReturnType<typeof createApp>;
  let cookie: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-creative-routes-'));
    repository = new MemoryCreativeLibraryRepository();
    purgeExpired = vi.fn(() => Promise.resolve(0));
    referenceImages = Object.assign(
      new LocalReferenceImageAssetStore(directory, { legacyOwnerUserId: ownerUserId }),
      { purgeExpiredUnreferenced: purgeExpired },
    );
    app = createApp({
      config: testConfig({
        demoAuthEnabled: true,
        databaseMode: 'neon',
        lightframeDataDir: directory,
      }),
      referenceImageAssetStore: referenceImages,
      persistence: { creativeLibraries: repository },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    cookie = String(login.headers['set-cookie']).split(';', 1)[0]!;
  });

  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('loads the owner-scoped snapshot and preserves GET side effects for explicit HEAD', async () => {
    const get = await app.inject({
      method: 'GET',
      url: '/api/creative-library',
      headers: { host: browserHeaders.host, cookie },
    });
    const head = await app.inject({
      method: 'HEAD',
      url: '/api/creative-library',
      headers: { host: browserHeaders.host, cookie },
    });

    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual(repository.snapshot);
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe(get.headers['content-length']);
    expect(repository.loads).toEqual([ownerUserId, ownerUserId]);
    expect(purgeExpired).toHaveBeenCalledTimes(2);
  });

  it('replaces only a canonical snapshot at the expected revision', async () => {
    const store = createEmptyCreativeAssetStore();
    const response = await app.inject({
      method: 'PUT',
      url: '/api/creative-library',
      headers: { ...browserHeaders, cookie, 'content-type': 'application/json' },
      payload: { expectedRevision: 0, store },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ revision: 1, store });
    expect(repository.replacements).toHaveLength(1);
    expect(repository.replacements[0]).toMatchObject({
      ownerUserId,
      expectedRevision: 0,
      store,
    });
    expect(Date.parse(repository.replacements[0]!.updatedAt)).not.toBeNaN();
    expect(purgeExpired).toHaveBeenCalledOnce();
  });

  it('maps revision conflicts without replacing or purging the current snapshot', async () => {
    repository.snapshot = { ...repository.snapshot, revision: 3 };
    const response = await app.inject({
      method: 'PUT',
      url: '/api/creative-library',
      headers: { ...browserHeaders, cookie, 'content-type': 'application/json' },
      payload: { expectedRevision: 2, store: createEmptyCreativeAssetStore() },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: 'conflict',
        message: 'The creative library changed in another session. Refresh before retrying.',
      },
    });
    expect(repository.replacements).toHaveLength(1);
    expect(purgeExpired).not.toHaveBeenCalled();
  });

  it('rejects recovered, non-canonical, and cross-origin replacements before persistence', async () => {
    const malformed = await app.inject({
      method: 'PUT',
      url: '/api/creative-library',
      headers: { ...browserHeaders, cookie, 'content-type': 'application/json' },
      payload: { expectedRevision: 0, store: { schemaVersion: 999 } },
    });
    const crossOrigin = await app.inject({
      method: 'PUT',
      url: '/api/creative-library',
      headers: {
        host: browserHeaders.host,
        origin: 'http://127.0.0.1:5173',
        cookie,
        'content-type': 'application/json',
      },
      payload: { expectedRevision: 0, store: createEmptyCreativeAssetStore() },
    });

    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(crossOrigin.statusCode).toBe(403);
    expect(repository.replacements).toHaveLength(0);
  });

  it('does not register cloud synchronization routes without cloud persistence', async () => {
    const localApp = createApp({ config: testConfig({ lightframeDataDir: directory }) });
    try {
      const response = await localApp.inject({ method: 'GET', url: '/api/creative-library' });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: 'not_found' } });
    } finally {
      await localApp.close();
    }
  });
});
