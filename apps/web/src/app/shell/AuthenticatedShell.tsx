import { useTheme } from '@emotion/react';
import { useLocation } from 'react-router';
import { useAuth } from '../../application/auth/AuthProvider';
import { RemoteStateProvider } from '../../application/remote-state/RemoteStateProvider';
import { StudioApp } from '../../studio/StudioApp';
import { pageStyles, shellStyles, skipLinkStyles } from '../../studio/StudioApp.styles';
import { useStudioNavigationActions } from '../../studio/useStudioNavigationActions';
import { useConfirmationRequest } from '../../ui';
import { isStudioRuntimePath } from '../paths';
import { ShellChrome } from './ShellChrome';
import { ShellLifecycleDialogs } from './ShellLifecycleDialogs';
import { useAuthenticatedSessionLifecycle } from './useAuthenticatedSessionLifecycle';
import { useShellServices } from './useShellServices';
import { useStudioHandoff } from './useStudioHandoff';

export interface AuthenticatedShellProps {
  readonly focusMainOnMount?: boolean;
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
const AuthenticatedShellSurfaces = ({
  focusMainOnMount,
  initialIntent,
}: AuthenticatedShellProps) => {
  const theme = useTheme();
  const auth = useAuth();
  const location = useLocation();
  const nav = useStudioNavigationActions();
  const confirmation = useConfirmationRequest();
  const user = auth.session!.user;
  const { registry, logout, sessionExpiry, sessionEnding, creativeLocks } =
    useAuthenticatedSessionLifecycle(auth);
  const handoff = useStudioHandoff({
    runtimeRouteActive: isStudioRuntimePath(location.pathname),
    openStudio: nav.openStudio,
  });
  const services = useShellServices({
    ownerUserId: user.id,
    ...(initialIntent ? { initialIntent } : {}),
    confirmation,
    handoff,
    creativeLocks,
  });

  return (
    <div css={pageStyles(theme)}>
      <a href="#studio-main" css={skipLinkStyles(theme)}>
        Skip to studio
      </a>
      <div css={shellStyles()}>
        <ShellChrome services={services} user={user} logout={logout} />

        {/*
          Statically imported for now: the shell is already lazy from the router, so a second
          boundary would only split a chunk that always loads with it. It becomes a real
          route-gated boundary once the runtime stops mounting outside Studio.
        */}
        <StudioApp
          services={services}
          focusMainOnMount={focusMainOnMount ?? false}
          runtimeRegistry={registry}
          sessionEnding={sessionEnding}
        />

        <ShellLifecycleDialogs
          mainRef={services.refs.main}
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
