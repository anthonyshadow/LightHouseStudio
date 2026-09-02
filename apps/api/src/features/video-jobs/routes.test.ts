import type { ApiErrorResponse } from '@studio/contracts';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { ApplicationRuntime, type HttpRequest } from '../../application/application-runtime.js';
import { installErrorHandling } from '../../http/errors.js';
import { testConfig } from '../../test/fakes.js';
import { registerVideoJobRoutes } from './routes.js';
import type { VideoJobService } from './video-job-service.js';
import { createPhaseOneEntitlements } from '@studio/domain';

const trustedHeaders = {
  host: 'localhost:4173',
  origin: 'http://localhost:4173',
  'x-lightframe-provider-intent': 'video',
};

const installRouteTestAuth = (app: ApplicationRuntime) => {
  installErrorHandling(app);
  app.addHook('onRequest', async (request: HttpRequest) => {
    await Promise.resolve();
    request.auth = {
      user: {
        id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
        login: 'demo@lightframe.local',
        username: 'demo',
        email: 'demo@lightframe.local',
        displayName: 'Demo Creator',
        avatarUrl: null,
        planId: 'free',
        role: 'user',
        status: 'active',
        createdAt: '2026-08-05T12:00:00.000Z',
        updatedAt: '2026-08-05T12:00:00.000Z',
        lastLoginAt: '2026-08-05T12:00:00.000Z',
      },
      entitlements: createPhaseOneEntitlements('free', '2026-08-05T12:00:00.000Z'),
      expiresAt: '2026-08-06T12:00:00.000Z',
    };
  });
};

describe('video job route boundary', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('requires the exact trusted loopback origin on submit, status, content, and cleanup', async () => {
    const app = createApp({ config: testConfig(), decartVideoProvider: null });
    apps.push(app);
    const jobId = crypto.randomUUID();

    for (const request of [
      { method: 'PUT' as const, url: `/api/video-jobs/${jobId}` },
      { method: 'GET' as const, url: '/api/video-jobs' },
      { method: 'GET' as const, url: `/api/video-jobs/${jobId}` },
      { method: 'GET' as const, url: `/api/video-jobs/${jobId}/content` },
      { method: 'DELETE' as const, url: `/api/video-jobs/${jobId}` },
      { method: 'POST' as const, url: `/api/video-jobs/${jobId}/abandon` },
    ]) {
      const response = await app.inject({
        ...request,
        headers: {
          host: 'localhost:4173',
          origin: 'https://malicious.example',
          'x-lightframe-provider-intent': 'video',
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json<ApiErrorResponse>().error.code).toBe('forbidden_origin');
    }
  });

  it('accepts browser same-origin reads that omit Origin while rejecting unverified reads', async () => {
    const app = createApp({ config: testConfig(), decartVideoProvider: null });
    apps.push(app);
    const jobId = crypto.randomUUID();

    const sameOriginMetadata = await app.inject({
      method: 'GET',
      url: `/api/video-jobs/${jobId}`,
      headers: {
        host: trustedHeaders.host,
        'sec-fetch-site': 'same-origin',
        'x-lightframe-provider-intent': 'video',
      },
    });
    expect(sameOriginMetadata.statusCode).toBe(404);

    const sameOriginReferrer = await app.inject({
      method: 'GET',
      url: `/api/video-jobs/${jobId}/content`,
      headers: {
        host: trustedHeaders.host,
        referer: `${trustedHeaders.origin}/studio`,
        'x-lightframe-provider-intent': 'video',
      },
    });
    expect(sameOriginReferrer.statusCode).toBe(404);

    for (const headers of [
      {
        host: trustedHeaders.host,
        'x-lightframe-provider-intent': 'video',
      },
      {
        host: trustedHeaders.host,
        referer: 'https://malicious.example/studio',
        'sec-fetch-site': 'cross-site',
        'x-lightframe-provider-intent': 'video',
      },
    ]) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/video-jobs/${jobId}`,
        headers,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json<ApiErrorResponse>().error.code).toBe('forbidden_origin');
    }
  });

  it('continues to require an explicit Origin for provider mutations', async () => {
    const app = createApp({ config: testConfig(), decartVideoProvider: null });
    apps.push(app);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/video-jobs/${crypto.randomUUID()}`,
      headers: {
        host: trustedHeaders.host,
        referer: `${trustedHeaders.origin}/studio`,
        'sec-fetch-site': 'same-origin',
        'x-lightframe-provider-intent': 'video',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<ApiErrorResponse>().error.code).toBe('forbidden_origin');
  });

  it('lists owner jobs and requires an explicit upstream-cost acknowledgement to abandon one', async () => {
    const jobId = crypto.randomUUID();
    const listActiveJobs = vi.fn().mockResolvedValue({ jobs: [] });
    const abandon = vi.fn().mockResolvedValue(undefined);
    const service = {
      available: true,
      listActiveJobs,
      abandon,
    } as unknown as VideoJobService;
    const app = new ApplicationRuntime();
    installRouteTestAuth(app);
    registerVideoJobRoutes(app, service);
    apps.push(app);

    const list = await app.inject({
      method: 'GET',
      url: '/api/video-jobs',
      headers: trustedHeaders,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({ jobs: [] });
    expect(listActiveJobs).toHaveBeenCalledWith('2d7914b2-f912-4b96-b17d-54100a2ffea3');

    const unacknowledged = await app.inject({
      method: 'POST',
      url: `/api/video-jobs/${jobId}/abandon`,
      headers: { ...trustedHeaders, 'content-type': 'application/json' },
      payload: { acknowledgeProviderMayContinue: false },
    });
    expect(unacknowledged.statusCode).toBe(400);
    expect(unacknowledged.json<ApiErrorResponse>().error.code).toBe('validation_error');
    expect(abandon).not.toHaveBeenCalled();

    const acknowledged = await app.inject({
      method: 'POST',
      url: `/api/video-jobs/${jobId}/abandon`,
      headers: { ...trustedHeaders, 'content-type': 'application/json' },
      payload: { acknowledgeProviderMayContinue: true },
    });
    expect(acknowledged.statusCode).toBe(204);
    expect(abandon).toHaveBeenCalledWith(jobId, '2d7914b2-f912-4b96-b17d-54100a2ffea3');
  });

  it('requires explicit video intent and reports provider unavailability without parsing media', async () => {
    const app = createApp({ config: testConfig(), decartVideoProvider: null });
    apps.push(app);
    const jobId = crypto.randomUUID();
    const missingIntent = await app.inject({
      method: 'PUT',
      url: `/api/video-jobs/${jobId}`,
      headers: { host: trustedHeaders.host, origin: trustedHeaders.origin },
    });
    expect(missingIntent.statusCode).toBe(403);

    const unavailable = await app.inject({
      method: 'PUT',
      url: `/api/video-jobs/${jobId}`,
      headers: trustedHeaders,
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json<ApiErrorResponse>().error).toEqual({
      code: 'provider_unavailable',
      message: 'Visual processing is unavailable until its server configuration is complete.',
    });
  });

  it('rejects malformed job ids before allocating temporary upload state', async () => {
    const app = createApp({ config: testConfig(), decartVideoProvider: null });
    apps.push(app);
    const response = await app.inject({
      method: 'PUT',
      url: '/api/video-jobs/not-a-uuid',
      headers: trustedHeaders,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.code).toBe('validation_error');
  });

  it('streams an ordered multipart recipe and video through the Busboy boundary', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-video-multipart-route-'));
    directories.push(directory);
    const jobId = crypto.randomUUID();
    const inputPath = path.join(directory, 'input.video');
    const referencePath = path.join(directory, 'reference.image');
    const start = vi.fn((_input: Parameters<VideoJobService['start']>[0]) =>
      Promise.resolve({ jobId, status: 'queued' } as Awaited<ReturnType<VideoJobService['start']>>),
    );
    const service = {
      available: true,
      existing: vi.fn().mockResolvedValue(null),
      prepareJobDirectory: vi.fn().mockResolvedValue({ directory, inputPath, referencePath }),
      start,
    } as unknown as VideoJobService;
    const app = new ApplicationRuntime();
    installRouteTestAuth(app);
    registerVideoJobRoutes(app, service);
    apps.push(app);
    const form = new FormData();
    form.append(
      'request',
      JSON.stringify({
        operation: 'character-swap',
        inputKind: 'character',
        prompt: 'Change the lighting',
        enhancePrompt: false,
        hasReferenceImage: false,
        outputResolution: '720p',
      }),
    );
    form.append('data', new Blob(['video-bytes'], { type: 'video/mp4' }), 'source.mp4');

    const response = await app.inject({
      method: 'PUT',
      url: `/api/video-jobs/${jobId}`,
      headers: trustedHeaders,
      payload: form,
    });

    expect(response.statusCode).toBe(202);
    expect(await readFile(inputPath, 'utf8')).toBe('video-bytes');
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId,
        inputPath,
        referencePath: null,
        referenceMimeType: null,
      }),
    );
    expect(start.mock.calls[0]?.[0].recipe).toMatchObject({
      operation: 'character-swap',
      hasReferenceImage: false,
    });
  });

  it('settles an admitted content lease exactly once after a successful response', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-video-route-'));
    directories.push(directory);
    const outputPath = path.join(directory, 'result.video');
    await writeFile(outputPath, 'result-bytes');
    const settle = vi.fn().mockResolvedValue(undefined);
    const content = vi.fn().mockResolvedValue({
      path: outputPath,
      media: {
        mimeType: 'video/mp4',
        container: 'mp4',
        videoCodec: 'avc',
        audioCodec: null,
        durationMs: 1_000,
        width: 1_280,
        height: 720,
        sizeBytes: 12,
        hasAudio: false,
      },
      settle,
    });
    const service = {
      available: true,
      content,
    } as unknown as VideoJobService;
    const app = new ApplicationRuntime();
    installRouteTestAuth(app);
    registerVideoJobRoutes(app, service);
    apps.push(app);
    const jobId = crypto.randomUUID();

    const response = await app.inject({
      method: 'GET',
      url: '/api/video-jobs/' + jobId + '/content',
      headers: trustedHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.toString()).toBe('result-bytes');
    expect(content).toHaveBeenCalledWith(jobId, expect.any(String));
    await vi.waitFor(() => expect(settle).toHaveBeenCalledOnce());
    expect(settle).toHaveBeenCalledWith(true);
  });

  it('settles and closes a content lease exactly once for explicit HEAD parity', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-video-head-route-'));
    directories.push(directory);
    const outputPath = path.join(directory, 'result.video');
    await writeFile(outputPath, 'result-bytes');
    const settle = vi.fn().mockResolvedValue(undefined);
    const service = {
      available: true,
      content: vi.fn().mockResolvedValue({
        path: outputPath,
        media: { mimeType: 'video/mp4', sizeBytes: 12 },
        settle,
      }),
    } as unknown as VideoJobService;
    const app = new ApplicationRuntime();
    installRouteTestAuth(app);
    registerVideoJobRoutes(app, service);
    apps.push(app);

    const response = await app.inject({
      method: 'HEAD',
      url: `/api/video-jobs/${crypto.randomUUID()}/content`,
      headers: trustedHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toHaveLength(0);
    expect(response.headers['content-length']).toBe('12');
    expect(settle).toHaveBeenCalledOnce();
    expect(settle).toHaveBeenCalledWith(true);
  });

  it('returns an expired duplicate tombstone before allocating or parsing another upload', async () => {
    const jobId = crypto.randomUUID();
    const existing = vi.fn().mockResolvedValue({
      jobId,
      operation: 'character-swap',
      status: 'expired',
      createdAt: '2026-08-02T12:00:00.000Z',
      updatedAt: '2026-08-02T13:00:00.000Z',
      expiresAt: '2026-08-02T13:00:00.000Z',
      result: null,
      error: {
        code: 'job_expired',
        message: 'This temporary video job expired. Submit a new job explicitly to retry.',
      },
    });
    const prepareJobDirectory = vi.fn();
    const start = vi.fn();
    const service = {
      available: true,
      existing,
      prepareJobDirectory,
      start,
    } as unknown as VideoJobService;
    const app = new ApplicationRuntime();
    installRouteTestAuth(app);
    registerVideoJobRoutes(app, service);
    apps.push(app);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/video-jobs/' + jobId,
      headers: trustedHeaders,
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ jobId, status: 'expired' });
    expect(existing).toHaveBeenCalledOnce();
    expect(prepareJobDirectory).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
});
