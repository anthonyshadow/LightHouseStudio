// @vitest-environment jsdom

import type { AuthenticatedSessionResponse } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createMemoryRouter, RouterProvider, useLocation, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../application/auth/AuthProvider';
import type { AuthenticatedShellProps } from './shell/AuthenticatedShell';
import { focusesMainOnNavigation } from './paths';
import { StudioDesignProvider } from '../ui';

const appHarness = vi.hoisted(() => ({
  mountCount: 0,
  latestProps: null as AuthenticatedShellProps | null,
}));

const authApi = vi.hoisted(() => ({
  fetchCurrentSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../adapters/api-client/authApi', () => authApi);

vi.mock('../features/auth/LoginDialog', () => {
  return {
    LoginDialog: ({
      message,
      onClose,
      onSuccess,
    }: {
      message?: string | null;
      onClose: () => void;
      onSuccess: () => void;
    }) => {
      const auth = useAuth();
      return (
        <div role="dialog" aria-label="Log in to Lightframe">
          {message ? <p role="status">{message}</p> : null}
          <button type="button" onClick={onClose}>
            Cancel login
          </button>
          <button
            type="button"
            onClick={() => {
              void auth.login('demo@lightframe.local', 'password').then(onSuccess);
            }}
          >
            Complete login
          </button>
        </div>
      );
    },
  };
});

// The router's contract is with the authenticated shell, not with the Studio runtime inside it.
// Standing in for the shell also keeps the session-expiry cases honest: the real shell registers a
// teardown hold, which is exactly the condition "nothing holding it" is meant to exclude.
vi.mock('./shell/AuthenticatedShell', () => ({
  AuthenticatedShell: (props: AuthenticatedShellProps) => {
    appHarness.latestProps = props;
    const location = useLocation();
    const mainRef = useRef<HTMLElement>(null);
    useEffect(() => {
      appHarness.mountCount += 1;
    }, []);
    // Mirrors the real shell: focus follows the history entry, not a mount.
    useLayoutEffect(() => {
      if (focusesMainOnNavigation(location.pathname) && location.key !== 'default') {
        mainRef.current?.focus();
      }
    }, [location.key, location.pathname]);
    return (
      <main ref={mainRef} id="studio-main" tabIndex={-1}>
        Studio route
      </main>
    );
  },
}));

import { RoutedApplication } from './AppRouter';

const testSession: AuthenticatedSessionResponse = {
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

const renderApplication = (
  initialEntry: InitialEntry = '/',
  initialSession: AuthenticatedSessionResponse | null = testSession,
) => {
  const router = createMemoryRouter([{ path: '*', element: <RoutedApplication /> }], {
    initialEntries: [initialEntry],
  });
  const view = render(
    <StudioDesignProvider>
      <AuthProvider initialSession={initialSession}>
        <RouterProvider router={router} />
      </AuthProvider>
    </StudioDesignProvider>,
  );
  return { ...view, router };
};

describe('AppRouter', () => {
  beforeEach(() => {
    document.title = 'Fallback title';
    document.head.querySelector('meta[name="description"]')?.remove();
    const description = document.createElement('meta');
    description.name = 'description';
    document.head.append(description);
    appHarness.mountCount = 0;
    appHarness.latestProps = null;
    authApi.fetchCurrentSession.mockReset();
    authApi.login.mockReset().mockResolvedValue(testSession);
    authApi.logout.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the public entry provider-free while session restoration is pending', () => {
    authApi.fetchCurrentSession.mockReturnValue(new Promise(() => undefined));
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    renderApplication('/', null);

    expect(screen.getByRole('heading', { name: 'Lightframe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restoring…' })).toBeDisabled();
    expect(screen.queryByText('Studio route')).not.toBeInTheDocument();
    expect(appHarness.mountCount).toBe(0);
    expect(document.title).toBe('Enter Lightframe Studio');
    expect(description?.content).toContain('Record or upload a video');
  });

  it('restores an authenticated entry directly to Dashboard', async () => {
    const { router } = renderApplication();

    expect(await screen.findByText('Studio route')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(appHarness.mountCount).toBe(1);
    expect(document.title).toBe('Dashboard · Lightframe');
  });

  it('shows login after an unauthenticated restore and logs in to Dashboard', async () => {
    authApi.fetchCurrentSession.mockRejectedValue(new Error('No session'));
    const { router } = renderApplication('/', null);

    fireEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete login' }));

    expect(await screen.findByText('Studio route')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('clears a protected-route login request when login is dismissed', async () => {
    authApi.fetchCurrentSession.mockRejectedValue(new Error('No session'));
    const { router } = renderApplication('/assets/videos?sort=latest', null);

    expect(await screen.findByText('Your session is required to continue.')).toHaveAttribute(
      'role',
      'status',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel login' }));

    await waitFor(() => expect(router.state.location.state).toBeNull());
    expect(router.state.location.pathname).toBe('/');
  });

  it('returns to entry immediately when a session expires with nothing holding it', async () => {
    // The shell is mocked here, so no holder registers — the same situation as an expiry during
    // lazy-load or an error boundary. Teardown must stay immediate rather than parking with no
    // route to login.
    const { router } = renderApplication('/dashboard');
    await screen.findByText('Studio route');

    fireEvent(window, new Event('lightframe:authentication-required'));

    expect(
      await screen.findByText('Your session ended. Log in again to pick up where you left off.'),
    ).toHaveAttribute('role', 'status');
    expect(router.state.location.pathname).toBe('/');
  });

  it('restores and canonicalizes a protected destination after login', async () => {
    authApi.fetchCurrentSession.mockRejectedValue(new Error('No session'));
    const { router } = renderApplication('/studio/videos?sort=latest', null);

    fireEvent.click(await screen.findByRole('button', { name: 'Complete login' }));

    expect(await screen.findByText('Studio route')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/assets/videos');
    expect(router.state.location.search).toBe('?sort=latest');
  });

  it('keeps one authenticated shell while navigating between canonical surfaces', async () => {
    const { router } = renderApplication('/dashboard');
    await screen.findByText('Studio route');

    await router.navigate('/projects');
    await waitFor(() => expect(document.title).toBe('Projects · Lightframe Studio'));

    // The shell is what persists: its query cache, session hold and navigation chrome must survive
    // a route change even though the Studio inside it does not.
    expect(appHarness.mountCount).toBe(1);
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'studio-main'));
  });

  it.each([
    ['/studio', '/dashboard'],
    ['/studio/projects', '/projects'],
    [
      '/studio/projects/18b120ac-1578-46e3-8c3d-42307772f391/workspace',
      '/projects/18b120ac-1578-46e3-8c3d-42307772f391/workspace',
    ],
    ['/studio/campaigns', '/campaigns'],
    ['/campaign', '/campaigns'],
    [
      '/campaign/20ce94fa-15d1-42c6-abd3-77ff61516b48',
      '/campaigns/20ce94fa-15d1-42c6-abd3-77ff61516b48',
    ],
    ['/studio/assets', '/assets'],
    ['/studio/videos', '/assets/videos'],
    ['/studio/assets/recipes', '/assets'],
  ])('redirects the legacy route %s to %s', async (path, target) => {
    const { router } = renderApplication(path);

    expect(await screen.findByText('Studio route')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(target));
    expect(appHarness.mountCount).toBe(1);
  });

  it.each([
    ['/projects', 'Projects · Lightframe Studio'],
    ['/projects/18b120ac-1578-46e3-8c3d-42307772f391', 'Project · Lightframe Studio'],
    ['/projects/18b120ac-1578-46e3-8c3d-42307772f391/workspace', 'Project Studio · Lightframe'],
    ['/campaigns', 'Campaigns · Lightframe Studio'],
    ['/studio/create', 'Studio · Lightframe'],
    ['/assets', 'Assets · Lightframe'],
  ])('protects canonical route %s with the authenticated shell', async (path, title) => {
    renderApplication(path);

    expect(await screen.findByText('Studio route')).toBeInTheDocument();
    expect(appHarness.mountCount).toBe(1);
    expect(document.title).toBe(title);
  });

  it.each([
    '/advanced',
    '/guided',
    '/projects/project-42/history',
    '/studio/not-a-route',
    '/assets/recipes',
    '/not-a-route?project=untrusted',
  ])('replaces the noncanonical path %s with the entry page', async (path) => {
    authApi.fetchCurrentSession.mockRejectedValue(new Error('No session'));
    const { router } = renderApplication(path, null);

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('');
    expect(appHarness.mountCount).toBe(0);
  });
});
