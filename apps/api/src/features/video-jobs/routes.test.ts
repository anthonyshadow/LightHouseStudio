import type { ApiErrorResponse } from '@studio/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testConfig } from '../../test/fakes.js';

const trustedHeaders = {
  host: 'localhost:4173',
  origin: 'http://localhost:4173',
  'x-lightframe-provider-intent': 'video',
};

describe('video job route boundary', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('requires the exact trusted loopback origin on submit, status, content, and cleanup', async () => {
    const app = createApp({ config: testConfig(), decartVideoProvider: null });
    apps.push(app);
    const jobId = crypto.randomUUID();

    for (const request of [
      { method: 'PUT' as const, url: `/api/video-jobs/${jobId}` },
      { method: 'GET' as const, url: `/api/video-jobs/${jobId}` },
      { method: 'GET' as const, url: `/api/video-jobs/${jobId}/content` },
      { method: 'DELETE' as const, url: `/api/video-jobs/${jobId}` },
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
      message: 'Decart batch video processing is unavailable until DECART_API_KEY is configured.',
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
});
