import { useRef } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../application/auth/AuthProvider';
import { RemoteStateProvider } from '../../application/remote-state/RemoteStateProvider';
import { StudioApp } from '../../studio/StudioApp';
import { useStudioNavigationActions } from '../../studio/useStudioNavigationActions';
import { useConfirmationRequest } from '../../ui';
import { isStudioRuntimePath } from '../paths';
import { ShellLifecycleDialogs } from './ShellLifecycleDialogs';
import { useAuthenticatedSessionLifecycle } from './useAuthenticatedSessionLifecycle';
import { useStudioHandoff } from './useStudioHandoff';

export interface AuthenticatedShellProps {
  readonly focusMainOnMount?: boolean;
  readonly initialIntent?: 'upload';
}

/**
 * What an authenticated operator has for as long as they stay signed in.
 *
 * The shell owns the remote-state cache and the session lifecycle because those outlive any one
 * surface: a query cache torn down by navigation would refetch every list on every trip, and a
 * teardown hold owned by the Studio would only protect in-memory work on Studio routes. Surfaces
 * mount and unmount inside it.
 */
const AuthenticatedShellSurfaces = ({
  focusMainOnMount,
  initialIntent,
}: AuthenticatedShellProps) => {
  const auth = useAuth();
  const location = useLocation();
  const nav = useStudioNavigationActions();
  const shellMainRef = useRef<HTMLElement>(null);
  const confirmation = useConfirmationRequest();
  const { registry, logout, sessionExpiry, sessionEnding } = useAuthenticatedSessionLifecycle(auth);
  const handoff = useStudioHandoff({
    runtimeRouteActive: isStudioRuntimePath(location.pathname),
    openStudio: nav.openStudio,
  });

  return (
    <>
      {/*
        Statically imported for now: the shell is already lazy from the router, so a second boundary
        would only split a chunk that always loads with it. It becomes a real route-gated boundary
        once the runtime stops mounting outside Studio.
      */}
      <StudioApp
        focusMainOnMount={focusMainOnMount ?? false}
        {...(initialIntent ? { initialIntent } : {})}
        runtimeRegistry={registry}
        studioHandoff={handoff}
        confirmation={confirmation}
        logout={logout}
        sessionEnding={sessionEnding}
        shellMainRef={shellMainRef}
      />

      <ShellLifecycleDialogs
        mainRef={shellMainRef}
        logout={logout}
        sessionExpiry={sessionExpiry}
        confirmation={confirmation}
      />
    </>
  );
};

export const AuthenticatedShell = (props: AuthenticatedShellProps) => (
  <RemoteStateProvider>
    <AuthenticatedShellSurfaces {...props} />
  </RemoteStateProvider>
);
