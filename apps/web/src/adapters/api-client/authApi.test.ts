// @vitest-environment jsdom

import type { AuthenticatedSessionResponse } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { ApiClientError } from './apiClient';
import { fetchCurrentSession, fetchDemoAuthConfig, login, logout } from './authApi';
import { captureRequests, jsonScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';

const session: AuthenticatedSessionResponse = {
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

describe('auth API client', () => {
  it('validates demo config, login, and current-session responses', async () => {
    const { requests: loginRequests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario('GET', '/api/auth/demo-config', {
        body: {
          enabled: true,
          prefill: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
        },
      }),
      jsonScenario('POST', '/api/auth/login', { body: session }, observe),
      jsonScenario('GET', '/api/auth/me', { body: session }),
    );

    await expect(fetchDemoAuthConfig()).resolves.toMatchObject({ enabled: true });
    await expect(
      login({ login: 'demo@lightframe.local', password: 'lightframe-demo' }),
    ).resolves.toEqual(session);
    await expect(fetchCurrentSession()).resolves.toEqual(session);

    expect(loginRequests[0]).toMatchObject({ method: 'POST', credentials: 'same-origin' });
    await expect(loginRequests[0]!.json()).resolves.toEqual({
      login: 'demo@lightframe.local',
      password: 'lightframe-demo',
    });
  });

  it('accepts idempotent logout and normalizes a failed logout', async () => {
    let requests = 0;
    mockApiServer.use(
      http.post('*/api/auth/logout', () => {
        requests += 1;
        return requests === 1
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json(
              { error: { code: 'internal_error', message: 'The request failed.' } },
              { status: 500 },
            );
      }),
    );

    await expect(logout()).resolves.toBeUndefined();
    await expect(logout()).rejects.toBeInstanceOf(ApiClientError);
  });
});
