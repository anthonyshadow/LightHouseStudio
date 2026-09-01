// @vitest-environment jsdom

import type { AuthenticatedSessionResponse } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createMemoryRouter, RouterProvider, useLocation, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../application/auth/AuthProvider';
import { RouteErrorBoundary } from './AppRouter';
import {
  CLIENT_DIAGNOSTIC_LIMIT,
  clearClientDiagnostics,
  readClientDiagnostics,
} from './clientDiagnostics';
import { focusesMainOnNavigation } from './paths';
import { StudioDesignProvider } from '../ui';

const appHarness = vi.hoisted(() => ({
  mountCount: 0,
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
  AuthenticatedShell: () => {
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
    expect(description?.content).toContain('finished, platform-ready video');
  });

  it('introduces the product as make, edit, deliver — with AI last', () => {
    // The order is the claim. Leading with restyling described a tool that changes videos; this
    // describes the one that finishes them, and puts AI where it belongs: optional, and after.
    authApi.fetchCurrentSession.mockReturnValue(new Promise(() => undefined));
    renderApplication('/', null);

    expect(
      screen.getByText('Turn your footage into finished, platform-ready video.'),
    ).toBeVisible();
    const capabilities = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(capabilities).toHaveLength(4);
    expect(capabilities[0]).toContain('footage you already shot');
    expect(capabilities[1]).toContain('Trim, crop, rotate');
    expect(capabilities[2]).toContain('shape each placement needs');
    expect(capabilities[3]).toContain('Optionally change who is on screen');
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
    '/studio/assets/recipes',
    '/not-a-route?project=untrusted',
  ])('replaces the noncanonical path %s with the entry page', async (path) => {
    authApi.fetchCurrentSession.mockRejectedValue(new Error('No session'));
    const { router } = renderApplication(path, null);

    expect(await screen.findByRole('button', { name: 'Log in' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('');
    expect(appHarness.mountCount).toBe(0);
  });

  it.each(['/advanced', '/studio/not-a-route', '/not-a-route?project=untrusted'])(
    'tells a signed-in operator that %s does not exist instead of moving them',
    async (path) => {
      const { router } = renderApplication(path);

      expect(
        await screen.findByRole('heading', { name: 'That page doesn’t exist' }),
      ).toBeInTheDocument();
      // The address is left alone: a silent redirect is what hides the typo in the first place.
      expect(router.state.location.pathname).toBe(path.split('?')[0]);
      expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute(
        'href',
        '/dashboard',
      );
      expect(appHarness.mountCount).toBe(0);
      expect(document.title).toBe('Page not found · Lightframe');
    },
  );

  it('waits for session restoration before deciding an unknown path is a typo', async () => {
    // Deciding while the session is unknown would bounce a signed-in operator to the entry page,
    // which then forwards them to the Dashboard — the silent redirect, restored by the back door.
    authApi.fetchCurrentSession.mockResolvedValue(testSession);
    const { router } = renderApplication('/advanced', null);

    expect(screen.getByRole('status')).toHaveTextContent('Restoring your Studio session…');
    expect(
      await screen.findByRole('heading', { name: 'That page doesn’t exist' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/advanced');
  });

  describe('route error boundary', () => {
    const Boom = ({ error }: { readonly error: Error }) => {
      throw error;
    };

    const renderBoundary = (error: Error) => {
      // React logs a caught render error itself; the assertion is about what we record, not that.
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <StudioDesignProvider>
          <RouteErrorBoundary resetKey="k">
            <Boom error={error} />
          </RouteErrorBoundary>
        </StudioDesignProvider>,
      );
      return consoleError;
    };

    beforeEach(() => {
      clearClientDiagnostics();
    });

    it('shows the generic fallback and records one local diagnostic for a crash', () => {
      const consoleError = renderBoundary(new Error('exploded while rendering'));

      expect(screen.getByRole('heading', { name: 'Studio could not load' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Copy diagnostic details' })).toBeVisible();
      // The raw message stays out of the UI; it is only retrievable on request.
      expect(screen.queryByText(/exploded while rendering/u)).not.toBeInTheDocument();

      const recorded = readClientDiagnostics();
      expect(recorded).toHaveLength(1);
      expect(recorded[0]?.message).toBe('exploded while rendering');
      expect(recorded[0]?.componentStack).toContain('Boom');
      consoleError.mockRestore();
    });

    it('tells the operator a stale chunk needs a reload rather than reporting a crash', () => {
      const consoleError = renderBoundary(
        new Error('Failed to fetch dynamically imported module: /assets/shell-a1b2c3.js'),
      );

      expect(
        screen.getByRole('heading', { name: 'A newer version of Lightframe is available' }),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
      consoleError.mockRestore();
    });

    it('bounds the diagnostic buffer so a crash loop cannot grow it', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      for (let attempt = 0; attempt < CLIENT_DIAGNOSTIC_LIMIT + 3; attempt += 1) {
        render(
          <StudioDesignProvider>
            <RouteErrorBoundary resetKey={`k${attempt}`}>
              <Boom error={new Error(`crash ${attempt}`)} />
            </RouteErrorBoundary>
          </StudioDesignProvider>,
        );
      }

      const recorded = readClientDiagnostics();
      expect(recorded).toHaveLength(CLIENT_DIAGNOSTIC_LIMIT);
      expect(recorded.at(-1)?.message).toBe(`crash ${CLIENT_DIAGNOSTIC_LIMIT + 2}`);
      consoleError.mockRestore();
    });
  });
});
