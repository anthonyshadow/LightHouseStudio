import { createEmptyCreativeAssetStore } from '@studio/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { ApplicationRuntime } from './application/application-runtime.js';
import { registerAuthRoutes } from './features/auth/routes.js';
import type { CreativeLibraryRepository } from './features/creative-libraries/creative-library-repository.js';
import { registerCreativeLibraryRoutes } from './features/creative-libraries/routes.js';
import { registerRealtimeRoutes } from './features/realtime/routes.js';
import { registerReferenceImageRoutes } from './features/reference-images/routes.js';
import { registerSavedVideoRoutes } from './features/saved-videos/routes.js';
import { registerSystemRoutes } from './features/system/routes.js';
import { registerVideoJobRoutes } from './features/video-jobs/routes.js';
import { registerVoiceRoutes } from './features/voices/routes.js';
import { testConfig } from './test/fakes.js';

type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
type Route = `${RouteMethod} ${string}`;

class RouteRecorder {
  readonly explicit: Route[] = [];
  readonly effective: Route[] = [];

  private register(method: Exclude<RouteMethod, 'HEAD'>, path: string): this {
    const route = `${method} ${path}` as Route;
    this.explicit.push(route);
    this.effective.push(route);
    if (method === 'GET') this.effective.push(`HEAD ${path}`);
    return this;
  }

  get(path: string, ..._registration: readonly unknown[]): this {
    return this.register('GET', path);
  }

  post(path: string, ..._registration: readonly unknown[]): this {
    return this.register('POST', path);
  }

  put(path: string, ..._registration: readonly unknown[]): this {
    return this.register('PUT', path);
  }

  patch(path: string, ..._registration: readonly unknown[]): this {
    return this.register('PATCH', path);
  }

  delete(path: string, ..._registration: readonly unknown[]): this {
    return this.register('DELETE', path);
  }
}

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

const recordRoutes = (cloudPersistence: boolean): RouteRecorder => {
  const recorder = new RouteRecorder();
  const app = recorder as unknown as ApplicationRuntime;
  registerAuthRoutes(app, {} as never, testConfig());
  registerSystemRoutes(app, {
    videoProcessing: {
      characterSwap: {},
      defaultCharacterSwapProvider: 'decart',
      virtualTryOn: null,
    },
  } as never);
  registerRealtimeRoutes(app, null);
  registerVideoJobRoutes(app, {} as never);
  registerSavedVideoRoutes(app, {} as never);
  registerCreativeLibraryRoutes(app, cloudPersistence ? ({} as never) : undefined);
  registerReferenceImageRoutes(app, {} as never);
  registerVoiceRoutes(app, null);
  return recorder;
};

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

  it('freezes the 38 explicit and 55 effective local method/path pairs', () => {
    const inventory = recordRoutes(false);

    expect(inventory.explicit).toHaveLength(38);
    expect(new Set(inventory.explicit).size).toBe(38);
    expect(sorted(inventory.explicit)).toEqual(sorted(alwaysRegisteredRoutes));
    expect(inventory.effective).toHaveLength(55);
    expect(new Set(inventory.effective).size).toBe(55);
    expect(sorted(inventory.effective)).toEqual(
      sorted(withExplicitHeadSiblings(alwaysRegisteredRoutes)),
    );
  });

  it('adds only the two cloud routes and the creative GET HEAD sibling', () => {
    const inventory = recordRoutes(true);
    const explicit = [...alwaysRegisteredRoutes, ...cloudOnlyRoutes];

    expect(inventory.explicit).toHaveLength(40);
    expect(new Set(inventory.explicit).size).toBe(40);
    expect(sorted(inventory.explicit)).toEqual(sorted(explicit));
    expect(inventory.effective).toHaveLength(58);
    expect(new Set(inventory.effective).size).toBe(58);
    expect(sorted(inventory.effective)).toEqual(sorted(withExplicitHeadSiblings(explicit)));
  });

  it('gives every GET an independently registered HEAD method/path pair', () => {
    const inventory = recordRoutes(true);
    const getPaths = inventory.explicit
      .filter((route) => route.startsWith('GET '))
      .map((route) => route.slice('GET '.length));

    expect(getPaths).toHaveLength(18);
    for (const path of getPaths) expect(inventory.effective).toContain(`HEAD ${path}`);
  });

  it('registers the complete local inventory in Elysia, including 17 explicit HEAD routes', () => {
    const app = createApp({ config: testConfig() });
    apps.push(app);
    const expected = withExplicitHeadSiblings(alwaysRegisteredRoutes);
    const actual = registeredElysiaRoutes(app);

    expect(actual).toHaveLength(55);
    expect(new Set(actual).size).toBe(55);
    expect(actual.filter((route) => route.startsWith('HEAD '))).toHaveLength(17);
    expect(sorted(actual)).toEqual(sorted(expected));
  });

  it('registers only the conditional creative routes in the cloud Elysia inventory', () => {
    const app = createApp({
      config: testConfig({ databaseMode: 'neon' }),
      persistence: { creativeLibraries },
    });
    apps.push(app);
    const explicit = [...alwaysRegisteredRoutes, ...cloudOnlyRoutes];
    const expected = withExplicitHeadSiblings(explicit);
    const actual = registeredElysiaRoutes(app);

    expect(actual).toHaveLength(58);
    expect(new Set(actual).size).toBe(58);
    expect(actual.filter((route) => route.startsWith('HEAD '))).toHaveLength(18);
    expect(sorted(actual)).toEqual(sorted(expected));
  });
});
