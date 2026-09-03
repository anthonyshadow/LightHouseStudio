import { createEmptyCreativeAssetStore } from '@studio/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { ApplicationRuntime } from './application/application-runtime.js';
import type { CreativeLibraryRepository } from './features/creative-libraries/creative-library-repository.js';
import { FileProjectRepository } from './features/projects/file-project-repository.js';
import type { DirectUploadRepository } from './storage/direct-upload.js';
import { R2AssetByteStore } from './storage/r2-asset-byte-store.js';
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
  'GET /api/campaigns',
  'POST /api/campaigns',
  'GET /api/campaigns/:campaignId',
  'PATCH /api/campaigns/:campaignId',
  'POST /api/campaigns/:campaignId/archive',
  'POST /api/campaigns/:campaignId/restore',
  'POST /api/campaigns/:campaignId/tombstone',
  'GET /api/projects',
  'POST /api/projects',
  'GET /api/projects/:projectId',
  'PATCH /api/projects/:projectId',
  'POST /api/projects/:projectId/duplicate',
  'GET /api/projects/:projectId/assets',
  'POST /api/projects/:projectId/assets',
  'DELETE /api/projects/:projectId/assets/:membershipId',
  'POST /api/projects/:projectId/archive',
  'POST /api/projects/:projectId/restore',
  'POST /api/projects/:projectId/tombstone',
  'POST /api/projects/:projectId/campaign',
  'POST /api/projects/:projectId/revisions',
  'POST /api/projects/:projectId/processing/submit',
  'GET /api/projects/:projectId/processing/current',
  'POST /api/projects/:projectId/processing/reconcile',
  'POST /api/projects/:projectId/processing/retry',
  'POST /api/projects/:projectId/processing/cancel',
  'GET /api/projects/:projectId/processing/history',
  'GET /api/projects/:projectId/processing/:operationId/result/content',
  'POST /api/realtime-token',
  'GET /api/video-jobs',
  'PUT /api/video-jobs/:jobId',
  'GET /api/video-jobs/:jobId',
  'GET /api/video-jobs/:jobId/content',
  'DELETE /api/video-jobs/:jobId',
  'POST /api/video-jobs/:jobId/abandon',
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
  'GET /api/videos/:videoId/versions/:versionId/thumbnail',
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
  'GET /api/elevenlabs/voices/saved-count',
  'GET /api/elevenlabs/voices/:voiceId/relationship',
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

/** Registered only when `persistence.directVideoUploads` supplies a repository and R2 store. */
const directUploadRoutes: readonly Route[] = [
  'POST /api/videos/uploads',
  'GET /api/videos/uploads/:uploadId/parts',
  'POST /api/videos/uploads/:uploadId/parts/:partNumber',
  'POST /api/videos/uploads/:uploadId/complete',
  'DELETE /api/videos/uploads/:uploadId',
];

const projectSourceRoutes: readonly Route[] = [
  'GET /api/projects/:projectId/source',
  'GET /api/projects/:projectId/source/content',
  'GET /api/projects/:projectId/working-media',
  'GET /api/projects/:projectId/working-media/:revisionId/content',
  'POST /api/projects/:projectId/source',
  'POST /api/projects/:projectId/source/remove',
  'POST /api/projects/:projectId/source/reuse',
  'POST /api/projects/:projectId/working-media',
  'POST /api/projects/:projectId/working-media/reuse',
  'POST /api/projects/:projectId/outputs',
  'POST /api/projects/:projectId/outputs/renditions',
  'GET /api/projects/:projectId/history',
  'GET /api/projects/:projectId/outputs',
  'GET /api/projects/:projectId/outputs/:videoVersionId',
  'GET /api/projects/:projectId/outputs/:videoVersionId/content',
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

/**
 * Registration is what this oracle asserts, so the fakes only need to exist: nothing here is ever
 * called. `claimExpired` alone must resolve, because closing the app runs one cleanup pass.
 */
const unreachable = () => Promise.reject(new Error('The route oracle never performs uploads.'));
const directUploadRepository: DirectUploadRepository = {
  create: unreachable,
  findByIdempotency: unreachable,
  restart: unreachable,
  find: unreachable,
  setProviderUploadId: unreachable,
  markVerifying: unreachable,
  returnToUploading: unreachable,
  markReady: unreachable,
  markTerminal: unreachable,
  claimExpired: () => Promise.resolve([]),
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
    const expected = withExplicitHeadSiblings([...alwaysRegisteredRoutes, ...projectSourceRoutes]);
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

  it('registers the full inventory a real cloud deployment serves', () => {
    // What neon actually looks like: one repository object serving the Project surfaces, direct
    // multipart uploads into R2, and the creative-library mirror — not the creative routes alone.
    // The prior cloud case asserted a persistence bag no deployment passes, so the five upload
    // routes were inventoried nowhere and a registration regression there was invisible.
    const config = testConfig({ databaseMode: 'neon' });
    const app = createApp({
      config,
      persistence: {
        creativeLibraries,
        projects: new FileProjectRepository(config.lightframeDataDir),
        directVideoUploads: {
          repository: directUploadRepository,
          // Never contacted: registration only needs the store to exist, and the class is
          // nominally typed, so a real instance with inert credentials is the honest fake.
          storage: new R2AssetByteStore({
            accountId: 'route-oracle',
            accessKeyId: 'route-oracle',
            secretAccessKey: 'route-oracle',
            bucket: 'route-oracle',
          }),
        },
      },
    });
    apps.push(app);
    const explicit = [
      ...alwaysRegisteredRoutes,
      ...cloudOnlyRoutes,
      ...projectSourceRoutes,
      ...directUploadRoutes,
    ];
    const expected = withExplicitHeadSiblings(explicit);
    const actual = registeredElysiaRoutes(app);

    expect(new Set(actual).size).toBe(actual.length);
    expect(sorted(actual)).toEqual(sorted(expected));
  });
});
