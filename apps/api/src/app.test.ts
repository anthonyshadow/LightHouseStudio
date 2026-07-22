import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createApp, REFERENCE_IMAGE_CONNECTION_TIMEOUT_MARGIN_MS } from './app.js';
import { FakeElevenLabsProvider, testConfig } from './test/fakes.js';

describe('API shell', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  it('reports local health and safe provider capability availability', async () => {
    const app = createApp({
      config: testConfig(),
      decartProvider: null,
      elevenLabsProvider: new FakeElevenLabsProvider(),
    });
    apps.push(app);

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });

    expect(health.json()).toEqual({ ok: true });
    expect(capabilities.json()).toEqual({
      realtimeVideo: { available: false, models: ['lucy-2.5', 'lucy-vton-3'] },
      elevenLabs: { available: true, modelId: 'eleven_multilingual_sts_v2' },
      referenceImages: {
        available: false,
        editAvailable: false,
        modelId: 'gpt-image-2',
        sizes: ['1024x1024', '1024x1536', '1536x1024'],
        quality: 'high',
        optimizer: {
          available: false,
          model: 'gpt-5.6',
          version: 'lucy-character-reference-v1',
        },
      },
    });
    expect(capabilities.body).not.toContain('apiKey');
  });

  it('keeps response sockets open beyond the configured image-generation timeout', () => {
    const config = testConfig({ referenceImageTimeoutMs: 12_345 });
    const app = createApp({ config });
    apps.push(app);

    expect(app.server.timeout).toBe(
      config.referenceImageTimeoutMs + REFERENCE_IMAGE_CONNECTION_TIMEOUT_MARGIN_MS,
    );
    expect(app.server.requestTimeout).toBe(100_000);
  });

  it('returns consistent JSON for unknown routes and parser errors', async () => {
    const app = createApp({ config: testConfig() });
    apps.push(app);
    const missing = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: {
        origin: 'http://localhost:5173',
        host: 'localhost:5173',
        'content-type': 'application/json',
      },
      payload: '{',
    });

    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({
      error: { code: 'bad_request', message: 'The request body is not valid.' },
    });
  });

  it.each(['/api', '/api?view=html'])(
    'keeps the API boundary as JSON for the unknown route %s when serving the SPA',
    async (url) => {
      const app = createApp({
        config: testConfig(),
        staticRoot: fileURLToPath(new URL('./test', import.meta.url)),
      });
      apps.push(app);

      const response = await app.inject({
        method: 'GET',
        url,
        headers: { accept: 'text/html' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.json()).toEqual({
        error: { code: 'not_found', message: 'No API route matches this request.' },
      });
    },
  );

  it('rejects non-loopback Host headers before routing', async () => {
    const app = createApp({ config: testConfig() });
    apps.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: 'studio.example.com' },
    });

    expect(response.statusCode).toBe(421);
    expect(response.json().error.code).toBe('forbidden_origin');
  });
});
