import { createEmptyCreativeAssetStore } from '@studio/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { ApplicationRuntime } from './application/application-runtime.js';
import type { CreativeLibraryRepository } from './features/creative-libraries/creative-library-repository.js';
import { testConfig } from './test/fakes.js';

type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
type Route = `${RouteMethod} ${string}`;

const alwaysRegisteredRoutes: readonly Route[] = [
  'GET /api/auth/demo-config',
  'POST /api/auth/login',
  'GET /api/auth/me',
  'POST /api/auth/logout',
  'GET /api/health',
  'GET /api/capabilities',
  'POST /api/realtime-token',
  'PUT /api/video-jobs/:jobId',
  'GET /api/video-jobs/:jobId',
  'GET /api/video-jobs/:jobId/content',
  'DELETE /api/video-jobs/:jobId',
  'POST /api/videos',
  'POST /api/videos/:videoId/versions',
  'GET /api/videos',
  'GET /api/videos/:videoId',
  'PATCH /api/videos/:videoId',
  'DELETE /api/videos/:videoId',
  'GET /api/videos/:videoId/content',
  'GET /api/videos/:videoId/versions/:versionId/content',
  'PUT /api/videos/:videoId/versions/:versionId/thumbnail',
  'GET /api/videos/:videoId/thumbnail',
  'POST /api/reference-images/:sourceAssetId/outfit-try-ons',
  'POST /api/reference-images/import',
  'POST /api/reference-images/optimize',
  'POST /api/reference-images',
  'POST /api/reference-images/uploads',
  'POST /api/reference-images/:sourceAssetId/edits',
  'POST /api/reference-images/:sourceAssetId/compositions',
  'GET /api/reference-images/:assetId',
  'DELETE /api/reference-images/:assetId',
  'GET /api/reference-images/:assetId/content',
  'GET /api/elevenlabs/voices',
  'GET /api/elevenlabs/voices/:voiceId/preview',
  'GET /api/elevenlabs/shared-voices',
  'GET /api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/preview',
  'POST /api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/save',
  'DELETE /api/elevenlabs/voices/:voiceId',
  'POST /api/elevenlabs/voice-changer/recording',
];

const cloudOnlyRoutes: readonly Route[] = [
  'GET /api/creative-library',
  'PUT /api/creative-library',
];

const withExplicitHeadSiblings = (routes: readonly Route[]): Route[] =>
  routes.flatMap((route) => {
    const separator = route.indexOf(' ');
    const method = route.slice(0, separator);
    const path = route.slice(separator + 1);
    return method === 'GET' ? [route, `HEAD ${path}` as Route] : [route];
  });

const sorted = (routes: readonly Route[]): Route[] => [...routes].sort();

const creativeLibraries: CreativeLibraryRepository = {
  load: () =>
    Promise.resolve({
      revision: 0,
      store: createEmptyCreativeAssetStore(),
      updatedAt: '2026-08-08T12:00:00.000Z',
    }),
  replace: () => Promise.resolve('conflict'),
};

const registeredElysiaRoutes = (app: ApplicationRuntime): Route[] =>
  (
    app as unknown as {
      readonly elysia: {
        readonly routes: readonly { readonly method: string; readonly path: string }[];
      };
    }
  ).elysia.routes.map(({ method, path }) => `${method} ${path}` as Route);

describe('API route inventory oracle', () => {
  const apps: ApplicationRuntime[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  it('registers the exact local Elysia inventory with a HEAD sibling for every GET', () => {
    const app = createApp({ config: testConfig() });
    apps.push(app);
    const expected = withExplicitHeadSiblings(alwaysRegisteredRoutes);
    const actual = registeredElysiaRoutes(app);

    expect(new Set(actual).size).toBe(actual.length);
    expect(sorted(actual)).toEqual(sorted(expected));
  });

  it('adds only the conditional creative routes and GET HEAD sibling in cloud mode', () => {
    const app = createApp({
      config: testConfig({ databaseMode: 'neon' }),
      persistence: { creativeLibraries },
    });
    apps.push(app);
    const explicit = [...alwaysRegisteredRoutes, ...cloudOnlyRoutes];
    const expected = withExplicitHeadSiblings(explicit);
    const actual = registeredElysiaRoutes(app);

    expect(new Set(actual).size).toBe(actual.length);
    expect(sorted(actual)).toEqual(sorted(expected));
  });
});
