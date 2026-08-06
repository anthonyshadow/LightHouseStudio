// @vitest-environment jsdom

import type { AuthenticatedSessionResponse } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchCurrentSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../adapters/api-client/authApi', () => api);

import { AuthProvider, useAuth } from './AuthProvider';

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
  expiresAt: '2099-08-06T12:00:00.000Z',
};

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const Probe = () => {
  const auth = useAuth();
  const [error, setError] = useState('');
  return (
    <div>
      <output aria-label="auth status">{auth.status}</output>
      <output aria-label="auth error">{error}</output>
      <button type="button" onClick={() => void auth.restore()}>
        Restore
      </button>
      <button
        type="button"
        onClick={() =>
          void auth
            .login('demo@lightframe.local', 'lightframe-demo')
            .catch(() => setError('failed'))
        }
      >
        Login
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        Logout
      </button>
    </div>
  );
};

describe('AuthProvider', () => {
  afterEach(cleanup);

  beforeEach(() => {
    api.fetchCurrentSession.mockReset();
    api.login.mockReset();
    api.logout.mockReset();
  });

  it('coalesces session restoration and publishes the authenticated snapshot only after success', async () => {
    const request = deferred<AuthenticatedSessionResponse>();
    api.fetchCurrentSession.mockReturnValue(request.promise);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(api.fetchCurrentSession).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('auth status')).toHaveTextContent('unknown');
    request.resolve(session);

    await waitFor(() =>
      expect(screen.getByLabelText('auth status')).toHaveTextContent('authenticated'),
    );
  });

  it('shows authentication progress and returns to unauthenticated after a generic failure', async () => {
    const request = deferred<AuthenticatedSessionResponse>();
    api.login.mockReturnValue(request.promise);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(screen.getByLabelText('auth status')).toHaveTextContent('authenticating');
    await waitFor(() => expect(api.login).toHaveBeenCalledOnce());
    request.reject(new Error('private diagnostic'));

    await waitFor(() =>
      expect(screen.getByLabelText('auth status')).toHaveTextContent('unauthenticated'),
    );
    expect(screen.getByLabelText('auth error')).toHaveTextContent('failed');
  });

  it('coalesces logout, clears only in-memory auth, and accepts global 401 expiry signals', async () => {
    const request = deferred<void>();
    api.logout.mockReturnValue(request.promise);
    const view = render(
      <AuthProvider initialSession={session}>
        <Probe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await waitFor(() => expect(api.logout).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('auth status')).toHaveTextContent('logging-out');
    request.resolve();
    await waitFor(() =>
      expect(screen.getByLabelText('auth status')).toHaveTextContent('unauthenticated'),
    );

    view.unmount();
    render(
      <AuthProvider initialSession={session}>
        <Probe />
      </AuthProvider>,
    );
    fireEvent(window, new Event('lightframe:authentication-required'));
    expect(screen.getByLabelText('auth status')).toHaveTextContent('unauthenticated');
  });
});
