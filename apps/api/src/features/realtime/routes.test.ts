import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiErrorResponse, RealtimeTokenResponse } from '@studio/contracts';
import { createApp } from '../../app.js';
import type {
  DecartTokenProvider,
  TokenRequestScope,
} from '../../providers/decart/token-provider.js';
import { testConfig } from '../../test/fakes.js';

const localOriginHeaders = { origin: 'http://localhost:5173', host: 'localhost:5173' };

describe('realtime token API', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  const setup = () => {
    const scopes: TokenRequestScope[] = [];
    const createToken = vi.fn((scope: TokenRequestScope) => {
      scopes.push(scope);
      return Promise.resolve({
        apiKey: 'temporary-client-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
      });
    });
    const provider: DecartTokenProvider = {
      createToken,
    };
    const app = createApp({ config: testConfig(), decartProvider: provider });
    apps.push(app);
    return { app, createToken, scopes };
  };

  it('defaults to Lucy 2.5 and issues an exact five-minute model/origin scope', async () => {
    const { app, scopes } = setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: localOriginHeaders,
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      apiKey: 'temporary-client-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
      constraints: {
        model: 'lucy-2.5',
        maxSessionDurationSeconds: 300,
        applicationOrigin: 'http://localhost:5173',
      },
    });
    expect(scopes).toHaveLength(1);
    expect(scopes[0]).toMatchObject({
      model: 'lucy-2.5',
      origin: 'http://localhost:5173',
      expiresInSeconds: 300,
      maxSessionDurationSeconds: 300,
    });
  });

  it('allows only the two contract model ids and never local', async () => {
    const { app, createToken } = setup();
    const vton = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: localOriginHeaders,
      payload: { model: 'lucy-vton-3' },
    });
    const local = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: localOriginHeaders,
      payload: { model: 'local' },
    });
    const legacy = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: localOriginHeaders,
      payload: { model: 'lucy-2.1' },
    });

    expect(vton.statusCode).toBe(200);
    expect(local.statusCode).toBe(400);
    expect(legacy.statusCode).toBe(400);
    expect(createToken).toHaveBeenCalledTimes(1);
  });

  it('issues a seven-minute active session only for the guided recording profile', async () => {
    const { app, scopes } = setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: localOriginHeaders,
      payload: { model: 'lucy-2.5', sessionProfile: 'guided' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<RealtimeTokenResponse>().constraints?.maxSessionDurationSeconds).toBe(420);
    expect(scopes[0]).toMatchObject({
      expiresInSeconds: 300,
      maxSessionDurationSeconds: 420,
    });
  });

  it('requires a canonical loopback browser origin', async () => {
    const { app, createToken } = setup();
    const missing = await app.inject({ method: 'POST', url: '/api/realtime-token', payload: {} });
    const remote = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: { origin: 'https://example.com' },
      payload: {},
    });
    const wrongLoopbackPort = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: { origin: 'http://localhost:9000', host: 'localhost:5173' },
      payload: {},
    });
    const spoofedForwardedHost = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: {
        origin: 'http://127.0.0.1:4173',
        host: '127.0.0.1:4100',
        'x-forwarded-host': '127.0.0.1:4173',
      },
      payload: {},
    });

    expect(missing.statusCode).toBe(403);
    expect(remote.statusCode).toBe(403);
    expect(wrongLoopbackPort.statusCode).toBe(403);
    expect(spoofedForwardedHost.statusCode).toBe(403);
    expect(createToken).not.toHaveBeenCalled();
  });

  it('disables only realtime video when its server key is absent', async () => {
    const app = createApp({ config: testConfig(), decartProvider: null });
    apps.push(app);
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    const token = await app.inject({
      method: 'POST',
      url: '/api/realtime-token',
      headers: localOriginHeaders,
      payload: {},
    });

    expect(health.statusCode).toBe(200);
    expect(token.statusCode).toBe(503);
    expect(token.json<ApiErrorResponse>().error.code).toBe('feature_unavailable');
  });
});
