// @vitest-environment jsdom

import type { AuthenticatedSessionResponse } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchCurrentSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../adapters/api-client/authApi', () => api);

import { AuthProvider, useAuth } from '../application/auth/AuthProvider';
import { ProtectedRoute } from './ProtectedRoute';

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

/** Stands in for the Studio shell: holds session teardown while mounted. */
const HoldingShell = () => {
  const auth = useAuth();
  const holdSessionEnd = auth.holdSessionEnd;
  useEffect(() => holdSessionEnd(), [holdSessionEnd]);
  return (
    <div>
      <output aria-label="shell">in-memory work</output>
      <output aria-label="shell status">{auth.status}</output>
      <button type="button" onClick={() => auth.completeSessionEnd()}>
        Finish
      </button>
    </div>
  );
};

const EntryProbe = () => {
  const location = useLocation();
  const state = location.state as { loginRequired?: unknown; from?: unknown } | null;
  return (
    <div>
      <output aria-label="entry">entry</output>
      <output aria-label="login required">{state?.loginRequired === true ? 'true' : 'none'}</output>
      <output aria-label="from">{typeof state?.from === 'string' ? state.from : 'none'}</output>
    </div>
  );
};

const renderProtected = (initialSession: AuthenticatedSessionResponse | null) =>
  render(
    <AuthProvider {...(initialSession ? { initialSession } : {})}>
      <RouterProvider
        router={createMemoryRouter(
          [
            { path: '/', element: <EntryProbe /> },
            {
              path: '/studio/create',
              element: (
                <ProtectedRoute>
                  <HoldingShell />
                </ProtectedRoute>
              ),
            },
          ],
          { initialEntries: ['/studio/create'] },
        )}
      />
    </AuthProvider>,
  );

describe('ProtectedRoute', () => {
  afterEach(cleanup);

  beforeEach(() => {
    api.fetchCurrentSession.mockReset();
    api.login.mockReset();
    api.logout.mockReset();
    api.fetchCurrentSession.mockReturnValue(new Promise(() => undefined));
  });

  it('keeps rendering the shell while a held session is expiring', () => {
    renderProtected(session);

    expect(screen.getByLabelText('shell')).toBeVisible();

    fireEvent(window, new Event('lightframe:authentication-required'));

    // Unmounting here is precisely what used to discard in-memory work with no prompt.
    expect(screen.getByLabelText('shell')).toBeVisible();
    expect(screen.getByLabelText('shell status')).toHaveTextContent('expiring');
  });

  it('returns to entry with the requested destination once the expiry is finalized', () => {
    renderProtected(session);

    fireEvent(window, new Event('lightframe:authentication-required'));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.getByLabelText('entry')).toBeVisible();
    expect(screen.getByLabelText('login required')).toHaveTextContent('true');
    expect(screen.getByLabelText('from')).toHaveTextContent('/studio/create');
  });

  it('shows the restoring notice instead of the shell before the session is known', () => {
    renderProtected(null);

    expect(screen.getByRole('status')).toHaveTextContent('Restoring your Studio session');
    expect(screen.queryByLabelText('shell')).not.toBeInTheDocument();
  });
});
