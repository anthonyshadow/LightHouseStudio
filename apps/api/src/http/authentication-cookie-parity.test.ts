import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { testConfig } from '../test/fakes.js';

const trustedHeaders = {
  host: 'localhost:4173',
  origin: 'http://localhost:4173',
};

describe('authentication cookie parser parity', () => {
  const applications: ReturnType<typeof createApp>[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((application) => application.close()));
  });

  it('keeps the first duplicate session cookie, matching @fastify/cookie', async () => {
    const application = createApp({
      config: testConfig({ demoAuthEnabled: true }),
    });
    applications.push(application);

    const login = await application.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...trustedHeaders, 'content-type': 'application/json' },
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    const sessionCookie = String(login.headers['set-cookie']).split(';', 1)[0];
    expect(sessionCookie).toMatch(/^lightframe_session=.+/u);

    const validFirst = await application.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        host: trustedHeaders.host,
        cookie: `${sessionCookie}; lightframe_session=tampered`,
      },
    });
    const invalidFirst = await application.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        host: trustedHeaders.host,
        cookie: `lightframe_session=tampered; ${sessionCookie}`,
      },
    });

    expect(validFirst.statusCode).toBe(200);
    expect(invalidFirst.statusCode).toBe(401);
    expect(invalidFirst.headers['set-cookie']).toContain('lightframe_session=;');
  });
});
