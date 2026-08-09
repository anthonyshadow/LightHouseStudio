import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createEmptyCreativeAssetStore } from '@studio/domain';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { createApp } from '../app.js';
import type { CreativeLibraryRepository } from '../features/creative-libraries/creative-library-repository.js';
import type { ReferenceImageAssetStore } from '../features/reference-images/asset-store.js';
import { testConfig } from '../test/fakes.js';

const HOST = 'localhost:5173';
const ORIGIN = `http://${HOST}`;
const INDEX_MARKER = 'head-security-spa-marker';
const MISSING_ASSET_ID = '726fbcfb-1a91-4430-abec-ffcd418788bf';

describe('explicit HEAD and API security parity', () => {
  let directory: string;
  let app: ReturnType<typeof createApp>;
  let cookie: string;
  let loadCreativeLibrary: Mock<CreativeLibraryRepository['load']>;
  let purgeExpiredReferenceImages: Mock<() => Promise<number>>;
  let getReferenceImageMetadata: Mock<ReferenceImageAssetStore['getMetadata']>;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-head-security-'));
    await mkdir(path.join(directory, 'static'));
    await writeFile(
      path.join(directory, 'static', 'index.html'),
      `<!doctype html><title>${INDEX_MARKER}</title>`,
    );

    loadCreativeLibrary = vi.fn(() =>
      Promise.resolve({
        revision: 0,
        store: createEmptyCreativeAssetStore(),
        updatedAt: '2026-08-08T12:00:00.000Z',
      }),
    );
    purgeExpiredReferenceImages = vi.fn(() => Promise.resolve(0));
    getReferenceImageMetadata = vi.fn(() => Promise.resolve(null));

    const creativeLibraries: CreativeLibraryRepository = {
      load: loadCreativeLibrary,
      replace: () => Promise.resolve('conflict'),
    };
    const referenceImages: ReferenceImageAssetStore = {
      findByRequestId: () => Promise.resolve(null),
      getMetadata: getReferenceImageMetadata,
      getContent: () => Promise.resolve(null),
      store: () => Promise.reject(new Error('Unexpected reference image store call.')),
      purgeExpiredUnreferenced: purgeExpiredReferenceImages,
    };

    app = createApp({
      config: testConfig({
        databaseMode: 'neon',
        demoAuthEnabled: true,
        lightframeDataDir: directory,
      }),
      staticRoot: path.join(directory, 'static'),
      referenceImageAssetStore: referenceImages,
      persistence: { creativeLibraries },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/json' },
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    expect(login.statusCode).toBe(200);
    cookie = String(login.headers['set-cookie']).split(';', 1)[0]!;
  });

  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('keeps public GET routes private for HEAD until the session is verified', async () => {
    for (const url of ['/api/health', '/api/auth/demo-config']) {
      const publicGet = await app.inject({ method: 'GET', url, headers: { host: HOST } });
      const anonymousHead = await app.inject({ method: 'HEAD', url, headers: { host: HOST } });
      const authenticatedHead = await app.inject({
        method: 'HEAD',
        url,
        headers: { host: HOST, cookie },
      });

      expect(publicGet.statusCode).toBe(200);
      expect(anonymousHead.statusCode).toBe(401);
      expect(anonymousHead.body).toBe('');
      expect(anonymousHead.headers['cache-control']).toBe('no-store');
      expect(authenticatedHead.statusCode).toBe(publicGet.statusCode);
      expect(authenticatedHead.headers['content-length']).toBe(publicGet.headers['content-length']);
      expect(authenticatedHead.body).toBe('');
    }
  });

  it('runs authenticated static, dynamic, and conditional GET handlers once for HEAD', async () => {
    const authenticatedHeaders = { host: HOST, cookie };

    const capabilitiesGet = await app.inject({
      method: 'GET',
      url: '/api/capabilities',
      headers: authenticatedHeaders,
    });
    const capabilitiesHead = await app.inject({
      method: 'HEAD',
      url: '/api/capabilities',
      headers: authenticatedHeaders,
    });
    expect(capabilitiesHead.statusCode).toBe(capabilitiesGet.statusCode);
    expect(capabilitiesHead.headers['content-length']).toBe(
      capabilitiesGet.headers['content-length'],
    );
    expect(capabilitiesHead.body).toBe('');

    getReferenceImageMetadata.mockClear();
    const metadataGet = await app.inject({
      method: 'GET',
      url: `/api/reference-images/${MISSING_ASSET_ID}`,
      headers: authenticatedHeaders,
    });
    expect(getReferenceImageMetadata).toHaveBeenCalledOnce();
    getReferenceImageMetadata.mockClear();
    const metadataHead = await app.inject({
      method: 'HEAD',
      url: `/api/reference-images/${MISSING_ASSET_ID}`,
      headers: authenticatedHeaders,
    });
    expect(getReferenceImageMetadata).toHaveBeenCalledOnce();
    expect(metadataHead.statusCode).toBe(metadataGet.statusCode);
    expect(metadataHead.headers['content-length']).toBe(metadataGet.headers['content-length']);
    expect(metadataHead.body).toBe('');

    loadCreativeLibrary.mockClear();
    purgeExpiredReferenceImages.mockClear();
    const creativeGet = await app.inject({
      method: 'GET',
      url: '/api/creative-library',
      headers: authenticatedHeaders,
    });
    expect(loadCreativeLibrary).toHaveBeenCalledOnce();
    expect(purgeExpiredReferenceImages).toHaveBeenCalledOnce();
    loadCreativeLibrary.mockClear();
    purgeExpiredReferenceImages.mockClear();
    const creativeHead = await app.inject({
      method: 'HEAD',
      url: '/api/creative-library',
      headers: authenticatedHeaders,
    });
    expect(loadCreativeLibrary).toHaveBeenCalledOnce();
    expect(purgeExpiredReferenceImages).toHaveBeenCalledOnce();
    expect(creativeHead.statusCode).toBe(creativeGet.statusCode);
    expect(creativeHead.headers['content-length']).toBe(creativeGet.headers['content-length']);
    expect(creativeHead.body).toBe('');
  });

  it('keeps unknown API, OPTIONS, and trailing-slash requests private and outside SPA fallback', async () => {
    const cases = [
      { method: 'GET' as const, url: '/api/not-registered' },
      { method: 'OPTIONS' as const, url: '/api/health' },
      { method: 'GET' as const, url: '/api/health/' },
    ];

    for (const request of cases) {
      const anonymous = await app.inject({
        ...request,
        headers: { host: HOST, accept: 'text/html' },
      });
      const authenticated = await app.inject({
        ...request,
        headers: { host: HOST, accept: 'text/html', cookie },
      });

      expect(anonymous.statusCode).toBe(401);
      expect(authenticated.statusCode).toBe(404);
      expect(authenticated.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(authenticated.headers['access-control-allow-origin']).toBeUndefined();
      expect(authenticated.body).not.toContain(INDEX_MARKER);
    }

    const unknownHead = await app.inject({
      method: 'HEAD',
      url: '/api/not-registered',
      headers: { host: HOST, accept: 'text/html', cookie },
    });
    expect(unknownHead.statusCode).toBe(404);
    expect(unknownHead.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(unknownHead.body).toBe('');
  });
});
