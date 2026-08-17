import { useTheme } from '@emotion/react';
import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../application/auth/AuthProvider';
import { RemoteStateProvider } from '../../application/remote-state/RemoteStateProvider';
import { pageStyles, shellStyles, skipLinkStyles } from '../../studio/StudioApp.styles';
import { useStudioNavigationActions } from '../../studio/useStudioNavigationActions';
import { useConfirmationRequest } from '../../ui';
import { isStudioRuntimePath } from '../paths';
import { ShellChrome } from './ShellChrome';
import { ShellMain } from './ShellMain';
import { ShellLifecycleDialogs } from './ShellLifecycleDialogs';
import { useAuthenticatedSessionLifecycle } from './useAuthenticatedSessionLifecycle';
import { useShellServices } from './useShellServices';
import { useStudioHandoff } from './useStudioHandoff';

export interface AuthenticatedShellProps {
  readonly initialIntent?: 'upload';
}

/**
 * What an authenticated operator has for as long as they stay signed in.
 *
 * The shell owns everything whose lifetime is the session rather than the surface: the remote-state
 * cache, the session lifecycle, the navigation chrome, the creative library, and the Asset library
 * overlays. A query cache torn down by navigation would refetch every list on every trip; a
 * teardown hold owned by the Studio would only protect in-memory work on Studio routes. Surfaces —
 * including the Studio's capture runtime — mount and unmount inside it.
 */
const StudioRuntime = lazy(() =>
  import('../../studio/StudioApp').then((module) => ({ default: module.StudioApp })),
);

/**
 * Deliberately not a `<main>`: the shell already renders one, and a second would make
 * `getByRole('main')` ambiguous for the focus assertions that guard the skip link.
 */
const StudioRuntimeLoading = () => <p role="status">Loading Studio…</p>;

const AuthenticatedShellSurfaces = ({ initialIntent }: AuthenticatedShellProps) => {
  const theme = useTheme();
  const auth = useAuth();
  const location = useLocation();
  const nav = useStudioNavigationActions();
  const confirmation = useConfirmationRequest();
  const user = auth.session!.user;
  const { registry, logout, sessionExpiry, sessionEnding, creativeLocks, work } =
    useAuthenticatedSessionLifecycle(auth);
  const runtimeRouteActive = isStudioRuntimePath(location.pathname);
  const handoff = useStudioHandoff({ runtimeRouteActive, openStudio: nav.openStudio });
  const services = useShellServices({
    ownerUserId: user.id,
    ...(initialIntent ? { initialIntent } : {}),
    confirmation,
    handoff,
    creativeLocks,
    projectSession: work.projectSession,
  });

  return (
    <div css={pageStyles(theme)}>
      <a href="#studio-main" css={skipLinkStyles(theme)}>
        Skip to studio
      </a>
      <div css={shellStyles()}>
        <ShellChrome services={services} user={user} logout={logout} />

        <ShellMain
          services={services}
          displayName={user.displayName}
          liveBetaEnabled={Boolean(services.provider.availability.realtimeBetaEnabled)}
          liveProviderConfigured={Boolean(
            services.provider.availability.realtimeProviderConfigured,
          )}
          studioRuntime={
            // The change this whole boundary exists for: no capture graph is fetched, parsed or
            // mounted on a route that owns no live media.
            runtimeRouteActive ? (
              <Suspense fallback={<StudioRuntimeLoading />}>
                <StudioRuntime
                  services={services}
                  runtimeRegistry={registry}
                  sessionEnding={sessionEnding}
                />
              </Suspense>
            ) : null
          }
        />

        <ShellLifecycleDialogs
          mainRef={services.mainRef}
          logout={logout}
          sessionExpiry={sessionExpiry}
          confirmation={confirmation}
        />
      </div>
    </div>
  );
};

export const AuthenticatedShell = (props: AuthenticatedShellProps) => (
  <RemoteStateProvider>
    <AuthenticatedShellSurfaces {...props} />
  </RemoteStateProvider>
);
