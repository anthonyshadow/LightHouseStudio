import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testConfig } from '../../test/fakes.js';

const headers = { host: 'localhost:5173', origin: 'http://localhost:5173' };

describe('demo authentication API', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  const setup = () => {
    const app = createApp({ config: testConfig({ demoAuthEnabled: true }) });
    apps.push(app);
    return app;
  };

  it('validates the seeded password and issues a 24-hour host-only HTTP-only cookie', async () => {
    const app = setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { login: 'DEMO@lightframe.local', password: 'lightframe-demo' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
        username: 'demo',
        email: 'demo@lightframe.local',
        role: 'user',
        status: 'active',
        planId: 'free',
      },
      entitlements: { planId: 'free' },
    });
    const cookie = response.headers['set-cookie'];
    expect(cookie).toContain('lightframe_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Max-Age=86400');
    expect(cookie).not.toContain('Domain=');
  });

  it('restores, revokes, and rejects a session without exposing credential detail', async () => {
    const app = setup();
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { login: 'missing@lightframe.local', password: 'wrong' },
    });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.json()).toMatchObject({
      error: { code: 'invalid_credentials', message: 'The login or password is incorrect.' },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    const cookie = String(login.headers['set-cookie']).split(';', 1)[0]!;
    const restored = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { host: headers.host, cookie },
    });
    expect(restored.statusCode).toBe(200);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...headers, cookie },
    });
    expect(logout.statusCode).toBe(204);
    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { host: headers.host, cookie },
    });
    expect(afterLogout.statusCode).toBe(401);
    expect(afterLogout.headers['set-cookie']).toContain('lightframe_session=;');
  });

  it('serves development-only prefills while keeping every non-allowlisted API private', async () => {
    const app = setup();
    const config = await app.inject({
      method: 'GET',
      url: '/api/auth/demo-config',
      headers: { host: headers.host },
    });
    expect(config.statusCode).toBe(200);
    expect(config.json()).toEqual({
      enabled: true,
      prefill: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });

    const privateResponse = await app.inject({
      method: 'GET',
      url: '/api/videos',
      headers: { host: headers.host },
    });
    expect(privateResponse.statusCode).toBe(401);
    expect(privateResponse.json()).toMatchObject({
      error: { code: 'authentication_required', message: 'Log in to continue.' },
    });
    expect(privateResponse.headers['cache-control']).toBe('no-store');
  });

  it('rejects untrusted login origins and clears tampered session cookies', async () => {
    const app = setup();
    const untrusted = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: {
        host: headers.host,
        origin: 'https://malicious.example',
        'content-type': 'application/json',
      },
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    expect(untrusted.statusCode).toBe(403);

    const tampered = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { host: headers.host, cookie: 'lightframe_session=tampered' },
    });
    expect(tampered.statusCode).toBe(401);
    expect(tampered.headers['set-cookie']).toContain('lightframe_session=;');
  });

  it('fails closed when demo authentication is disabled outside the test harness', async () => {
    const app = createApp({
      config: testConfig({ nodeEnv: 'development', demoAuthEnabled: false }),
    });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/videos',
      headers: { host: headers.host },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'authentication_required' } });
  });
});
