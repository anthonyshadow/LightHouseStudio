// @vitest-environment jsdom

import type { AuthenticatedSessionResponse } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './apiClient';
import { fetchCurrentSession, fetchDemoAuthConfig, login, logout } from './authApi';

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

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('auth API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates demo config, login, and current-session responses', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          enabled: true,
          prefill: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(session))
      .mockResolvedValueOnce(jsonResponse(session));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDemoAuthConfig()).resolves.toMatchObject({ enabled: true });
    await expect(
      login({ login: 'demo@lightframe.local', password: 'lightframe-demo' }),
    ).resolves.toEqual(session);
    await expect(fetchCurrentSession()).resolves.toEqual(session);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({
          login: 'demo@lightframe.local',
          password: 'lightframe-demo',
        }),
      }),
    );
  });

  it('accepts idempotent logout and normalizes a failed logout', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'failed', message: 'private' } }, 500));
    vi.stubGlobal('fetch', fetchMock);

    await expect(logout()).resolves.toBeUndefined();
    await expect(logout()).rejects.toBeInstanceOf(ApiClientError);
  });
});
