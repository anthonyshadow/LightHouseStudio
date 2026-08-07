import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { ApiErrorResponse } from '@studio/contracts';
import { createApp, OPENAI_CONNECTION_TIMEOUT_MARGIN_MS } from './app.js';
import { ReferenceImageStorageError } from './features/reference-images/asset-store.js';
import { ProviderError } from './providers/provider-error.js';
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
      realtimeVideo: { available: false },
      videoProcessing: {
        characterSwap: {
          available: false,
          inputPreparation: 'none',
          referencePolicy: 'optional',
          promptInput: 'editable',
          promptEnhancement: false,
          terminalFailureRelease: 'automatic',
          outputResolutions: ['720p'],
        },
        virtualTryOn: {
          available: false,
          inputPreparation: 'none',
          referencePolicy: 'optional',
          promptInput: 'editable',
          promptEnhancement: false,
          terminalFailureRelease: 'automatic',
          outputResolutions: ['720p'],
        },
      },
      elevenLabs: { available: true, modelId: 'eleven_multilingual_sts_v2' },
      referenceImages: {
        available: false,
        editAvailable: false,
        providerId: 'openai',
        modelId: 'gpt-image-2',
        sizes: ['1024x1024', '1024x1536', '1536x1024'],
        optimizer: {
          available: false,
          model: 'gpt-5.6',
          version: 'lucy-character-reference-v1',
        },
      },
      wardrobe: { addOutfitAvailable: false },
    });
    expect(capabilities.body).not.toContain('apiKey');
  });

  it('reports Add Outfit only when its server-selected adapter is enabled', async () => {
    const app = createApp({
      config: testConfig({
        prunaImageTryOnEnabled: true,
        prunaApiKey: 'server-only-test-key',
        prunaImageTryOnModel: 'p-image-try-on',
      }),
      prunaImageTryOnProvider: {
        modelId: 'p-image-try-on',
        tryOn: vi.fn(() => Promise.reject(new Error('not called'))),
      },
    });
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/capabilities' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ wardrobe: { addOutfitAvailable: true } });
    expect(response.body).not.toContain('p-image-try-on');
  });

  it('keeps response sockets open beyond the longest configured OpenAI timeout', () => {
    const config = testConfig({
      referenceImageTimeoutMs: 12_345,
      openAiPromptOptimizerTimeoutMs: 23_456,
    });
    const app = createApp({ config });
    apps.push(app);

    expect(app.server.timeout).toBe(
      config.openAiPromptOptimizerTimeoutMs + OPENAI_CONNECTION_TIMEOUT_MARGIN_MS,
    );
    expect(app.server.requestTimeout).toBe(100_000);
  });

  it('reports exact batch video capability independently from realtime availability', async () => {
    const app = createApp({
      config: testConfig({ decartApiKey: 'server-only-secret' }),
      decartProvider: null,
    });
    apps.push(app);

    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });

    expect(capabilities.json()).toMatchObject({
      realtimeVideo: { available: false },
      videoProcessing: {
        characterSwap: {
          available: true,
          inputPreparation: 'none',
          referencePolicy: 'optional',
          promptInput: 'editable',
          promptEnhancement: true,
          terminalFailureRelease: 'automatic',
          outputResolutions: ['720p'],
        },
        virtualTryOn: {
          available: true,
          inputPreparation: 'none',
          referencePolicy: 'optional',
          promptInput: 'editable',
          promptEnhancement: true,
          terminalFailureRelease: 'automatic',
          outputResolutions: ['720p'],
        },
      },
    });
    expect(capabilities.body).not.toContain('server-only-secret');
  });

  it('reports operation-specific Pruna requirements without exposing provider selection', async () => {
    const provider = {} as NonNullable<Parameters<typeof createApp>[0]['prunaVideoProvider']>;
    const app = createApp({
      config: testConfig({
        existingVideoCharacterSwapProvider: 'pruna',
        prunaVideoReplaceEnabled: true,
        prunaApiKey: 'pruna-server-secret',
        prunaVideoReplaceModel: 'p-video-replace',
      }),
      prunaVideoProvider: provider,
      decartVideoProvider: null,
    });
    apps.push(app);

    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });

    expect(capabilities.json()).toMatchObject({
      videoProcessing: {
        characterSwap: {
          available: true,
          inputPreparation: 'h264-mp4',
          referencePolicy: 'required',
          promptInput: 'server-default',
          promptEnhancement: false,
          terminalFailureRelease: 'explicit-user',
          outputResolutions: ['720p', '1080p'],
        },
        virtualTryOn: { available: false },
      },
    });
    expect(capabilities.body.toLowerCase()).not.toContain('pruna');
    expect(capabilities.body.toLowerCase()).not.toContain('decart');
    expect(capabilities.body).not.toContain('p-video-replace');
    expect(capabilities.body).not.toContain('pruna-server-secret');
  });

  it('reports the selected BFL image provider while keeping OpenAI optimization independent', async () => {
    const app = createApp({
      config: testConfig({
        referenceImageProvider: 'bfl',
        bflApiKey: 'bfl-secret',
        openAiApiKey: 'optimizer-secret',
      }),
    });
    apps.push(app);

    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });

    expect(capabilities.json()).toMatchObject({
      referenceImages: {
        available: true,
        editAvailable: true,
        providerId: 'bfl',
        modelId: 'flux-2-pro',
        optimizer: { available: true, model: 'gpt-5.6' },
      },
    });
  });

  it('does not fall back to OpenAI images when selected BFL credentials are missing', async () => {
    const app = createApp({
      config: testConfig({
        referenceImageProvider: 'bfl',
        openAiApiKey: 'optimizer-secret',
      }),
    });
    apps.push(app);

    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });

    expect(capabilities.json()).toMatchObject({
      referenceImages: {
        available: false,
        editAvailable: false,
        providerId: 'bfl',
        modelId: 'flux-2-pro',
        optimizer: { available: true },
      },
    });
  });

  it('reports Wiro availability without coupling it to OpenAI prompt optimization', async () => {
    const app = createApp({
      config: testConfig({
        referenceImageProvider: 'wiro',
        wiroApiKey: 'wiro-key',
        wiroApiSecret: 'wiro-secret',
      }),
    });
    apps.push(app);

    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });

    expect(capabilities.json()).toMatchObject({
      referenceImages: {
        available: true,
        editAvailable: true,
        providerId: 'wiro',
        modelId: 'seedream-v5-lite-uncensored',
        optimizer: { available: false },
      },
    });
  });

  it('does not fall back when either selected Wiro signature credential is missing', async () => {
    const app = createApp({
      config: testConfig({
        referenceImageProvider: 'wiro',
        openAiApiKey: 'optimizer-secret',
        wiroApiKey: 'wiro-key-without-secret',
      }),
    });
    apps.push(app);

    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });

    expect(capabilities.json()).toMatchObject({
      referenceImages: {
        available: false,
        editAvailable: false,
        providerId: 'wiro',
        modelId: 'seedream-v5-lite-uncensored',
        optimizer: { available: true },
      },
    });
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
    expect(missing.json<ApiErrorResponse>().error.code).toBe('not_found');
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({
      error: { code: 'bad_request', message: 'The request body is not valid.' },
    });
  });

  it('classifies unexpected failures as internal and logs only structured safe diagnostics', async () => {
    const app = createApp({ config: testConfig() });
    apps.push(app);
    const logError = vi.spyOn(app.log, 'error');
    app.get('/api/test-internal-error', () => {
      throw new Error('private prompt and provider URL must not be logged');
    });

    const response = await app.inject({ method: 'GET', url: '/api/test-internal-error' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'internal_error', message: 'The server could not complete the request.' },
    });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        route: '/api/test-internal-error',
        statusCode: 500,
        code: 'internal_error',
        errorClass: 'InternalError',
      }),
      'API request failed',
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain('private prompt');
    expect(JSON.stringify(logError.mock.calls)).not.toContain('provider URL');
  });

  it.each([
    {
      route: '/api/test-storage-error',
      error: new ReferenceImageStorageError('private storage path must not be logged'),
      statusCode: 500,
      code: 'storage_failure',
      errorClass: 'ReferenceImageStorageError',
      forbidden: 'private storage path',
    },
    {
      route: '/api/test-provider-error',
      error: Object.assign(new ProviderError('models', 'upstream', 503), {
        message: 'private provider response must not be logged',
      }),
      statusCode: 502,
      code: 'provider_failure',
      errorClass: 'ProviderError',
      forbidden: 'private provider response',
    },
  ] as const)(
    'translates and safely logs the owned failure $errorClass',
    async ({ route, error, statusCode, code, errorClass, forbidden }) => {
      const app = createApp({ config: testConfig() });
      apps.push(app);
      const logError = vi.spyOn(app.log, 'error');
      app.get(route, () => {
        throw error;
      });

      const response = await app.inject({ method: 'GET', url: route });

      expect(response.statusCode).toBe(statusCode);
      expect(response.json<ApiErrorResponse>().error.code).toBe(code);
      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({ route, statusCode, code, errorClass }),
        'API request failed',
      );
      expect(JSON.stringify(logError.mock.calls)).not.toContain(forbidden);
    },
  );

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
    expect(response.json<ApiErrorResponse>().error.code).toBe('forbidden_origin');
  });
});
