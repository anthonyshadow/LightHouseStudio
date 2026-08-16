// @vitest-environment jsdom

import type { AuthenticatedSessionResponse } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useEffect, useState } from 'react';
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

/** Stands in for the Studio shell: it holds session teardown for as long as it is mounted. */
const HoldingProbe = () => {
  const auth = useAuth();
  const holdSessionEnd = auth.holdSessionEnd;
  useEffect(() => holdSessionEnd(), [holdSessionEnd]);
  return (
    <div>
      <output aria-label="auth status">{auth.status}</output>
      <output aria-label="session user">{auth.session?.user.displayName ?? 'none'}</output>
      <output aria-label="session end reason">{auth.sessionEndReason ?? 'none'}</output>
      <button type="button" onClick={() => auth.completeSessionEnd()}>
        Finish
      </button>
      <button
        type="button"
        onClick={() => void auth.login('demo@lightframe.local', 'lightframe-demo')}
      >
        Login
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        Logout
      </button>
    </div>
  );
};

/** Sits outside the holder so it can observe the status after the holder has unmounted. */
const ReleaseControl = ({ onRelease }: { readonly onRelease: () => void }) => {
  const auth = useAuth();
  return (
    <div>
      <output aria-label="release status">{auth.status}</output>
      <button type="button" onClick={onRelease}>
        Release
      </button>
    </div>
  );
};

const AutoRestoreProbe = () => {
  const auth = useAuth();
  useEffect(() => {
    if (auth.status === 'unknown') void auth.restore();
  }, [auth]);
  return <output aria-label="auto restore status">{auth.status}</output>;
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

  it('keeps restoration alive through the Strict Mode effect lifecycle probe', async () => {
    const request = deferred<AuthenticatedSessionResponse>();
    api.fetchCurrentSession.mockReturnValue(request.promise);
    render(
      <StrictMode>
        <AuthProvider>
          <AutoRestoreProbe />
        </AuthProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(api.fetchCurrentSession).toHaveBeenCalledOnce());
    request.resolve(session);
    await waitFor(() =>
      expect(screen.getByLabelText('auto restore status')).toHaveTextContent('authenticated'),
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

  it('parks expiry while a holder is registered and keeps the session readable meanwhile', () => {
    render(
      <AuthProvider initialSession={session}>
        <HoldingProbe />
      </AuthProvider>,
    );

    fireEvent(window, new Event('lightframe:authentication-required'));

    expect(screen.getByLabelText('auth status')).toHaveTextContent('expiring');
    expect(screen.getByLabelText('session end reason')).toHaveTextContent('expired');
    // The holder still renders, so anything reading the session must not see null underneath it.
    expect(screen.getByLabelText('session user')).toHaveTextContent('Demo Creator');

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.getByLabelText('auth status')).toHaveTextContent('unauthenticated');
    expect(screen.getByLabelText('session user')).toHaveTextContent('none');
  });

  it('collapses repeated 401 signals from background pollers into one expiry', () => {
    render(
      <AuthProvider initialSession={session}>
        <HoldingProbe />
      </AuthProvider>,
    );

    fireEvent(window, new Event('lightframe:authentication-required'));
    fireEvent(window, new Event('lightframe:authentication-required'));
    fireEvent(window, new Event('lightframe:authentication-required'));

    expect(screen.getByLabelText('auth status')).toHaveTextContent('expiring');

    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.getByLabelText('auth status')).toHaveTextContent('unauthenticated');
  });

  it('finalizes a parked expiry when the last holder unmounts', () => {
    const Host = () => {
      const [held, setHeld] = useState(true);
      return (
        <AuthProvider initialSession={session}>
          {held ? <HoldingProbe /> : null}
          <ReleaseControl onRelease={() => setHeld(false)} />
        </AuthProvider>
      );
    };
    render(<Host />);

    fireEvent(window, new Event('lightframe:authentication-required'));
    expect(screen.getByLabelText('auth status')).toHaveTextContent('expiring');

    // A holder that goes away for any other reason — crash, error boundary — must not strand the
    // app in 'expiring' with no route to login.
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));

    expect(screen.getByLabelText('release status')).toHaveTextContent('unauthenticated');
  });

  it('lets a logout in flight finish rather than parking on its own 401', async () => {
    const request = deferred<void>();
    api.logout.mockReturnValue(request.promise);
    render(
      <AuthProvider initialSession={session}>
        <HoldingProbe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(screen.getByLabelText('auth status')).toHaveTextContent('logging-out');
    fireEvent(window, new Event('lightframe:authentication-required'));

    expect(screen.getByLabelText('auth status')).toHaveTextContent('unauthenticated');
    request.resolve();
    await request.promise;
  });

  it('clears the expiry reason once the user logs back in', async () => {
    api.login.mockResolvedValue(session);
    render(
      <AuthProvider initialSession={session}>
        <HoldingProbe />
      </AuthProvider>,
    );

    fireEvent(window, new Event('lightframe:authentication-required'));
    expect(screen.getByLabelText('session end reason')).toHaveTextContent('expired');
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() =>
      expect(screen.getByLabelText('auth status')).toHaveTextContent('authenticated'),
    );
    expect(screen.getByLabelText('session end reason')).toHaveTextContent('none');
  });

  it('prevents late restore and login results from reviving an expired or logging-out session', async () => {
    const restoreRequest = deferred<AuthenticatedSessionResponse>();
    api.fetchCurrentSession.mockReturnValue(restoreRequest.promise);
    const view = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(api.fetchCurrentSession).toHaveBeenCalledOnce());
    fireEvent(window, new Event('lightframe:authentication-required'));
    restoreRequest.resolve(session);
    await restoreRequest.promise;
    await waitFor(() =>
      expect(screen.getByLabelText('auth status')).toHaveTextContent('unauthenticated'),
    );

    view.unmount();
    const loginRequest = deferred<AuthenticatedSessionResponse>();
    const logoutRequest = deferred<void>();
    api.login.mockReturnValue(loginRequest.promise);
    api.logout.mockReturnValue(logoutRequest.promise);
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    await waitFor(() => expect(api.login).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    loginRequest.resolve(session);
    logoutRequest.resolve();
    await Promise.all([loginRequest.promise, logoutRequest.promise]);
    await waitFor(() =>
      expect(screen.getByLabelText('auth status')).toHaveTextContent('unauthenticated'),
    );
  });
});
