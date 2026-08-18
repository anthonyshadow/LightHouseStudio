import {
  Component,
  lazy,
  Suspense,
  useLayoutEffect,
  useState,
  type ErrorInfo,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  createBrowserRouter,
  Navigate,
  Route,
  RouterProvider,
  Routes,
  useLocation,
} from 'react-router';
import { Button } from '../ui/primitives/Button';
import { formatClientDiagnostics, isChunkLoadError, recordClientError } from './clientDiagnostics';
import { EntryPage } from './EntryPage';
import {
  APP_PATHS,
  isProtectedAppPath,
  canonicalizeLegacyAppPath,
  protectedRouteForPath,
} from './paths';
import { ProtectedRoute } from './ProtectedRoute';

const LazyAuthenticatedShell = lazy(() =>
  import('./shell/AuthenticatedShell').then((module) => ({ default: module.AuthenticatedShell })),
);

const ENTRY_DESCRIPTION = 'Record or upload a video, then review and edit it in Lightframe Studio.';
const STUDIO_DESCRIPTION =
  'Lightframe is a local-first browser studio for recording, uploads, post-recording edits, and advanced live AI.';

const routeSurfaceStyles = {
  width: '100%',
  height: '100%',
  minHeight: '100%',
  display: 'grid',
  placeItems: 'center',
  padding:
    'max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))',
  textAlign: 'center' as const,
};

const titleForPath = (pathname: string): string => {
  const route = protectedRouteForPath(pathname);
  if (route !== null) return route.title;
  // Legacy paths are protected but redirect before they render, so they never keep a title.
  return isProtectedAppPath(pathname) ? 'Lightframe Studio' : 'Enter Lightframe Studio';
};

const RouteMetadata = () => {
  const location = useLocation();
  const studioRoute = isProtectedAppPath(location.pathname);
  const title = titleForPath(location.pathname);

  useLayoutEffect(() => {
    document.title = title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    description?.setAttribute('content', studioRoute ? STUDIO_DESCRIPTION : ENTRY_DESCRIPTION);
  }, [studioRoute, title]);

  return null;
};

const StudioLoading = () => (
  <main role="status" aria-live="polite" css={routeSurfaceStyles}>
    Loading Lightframe…
  </main>
);

const RouteErrorFallback = ({ stale }: { readonly stale: boolean }) => {
  const [copied, setCopied] = useState(false);

  return (
    <main role="alert" css={routeSurfaceStyles}>
      <div>
        <h1>{stale ? 'A newer version of Lightframe is available' : 'Studio could not load'}</h1>
        <p>
          {stale
            ? 'Reload to continue with the current version. Your saved account content is unchanged.'
            : 'Reload Lightframe to try again. Your saved account content is unchanged.'}
        </p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
        {/*
          The copy is deliberately generic — see `componentDidCatch`. This hands the operator the
          detail on request instead, so a report is possible without devtools and without the
          fallback screen putting a raw error on the page.
        */}
        <Button
          onClick={() => {
            void navigator.clipboard?.writeText(formatClientDiagnostics()).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          Copy diagnostic details
        </Button>
        <span role="status" aria-live="polite">
          {copied ? 'Diagnostic details copied.' : ''}
        </span>
      </div>
    </main>
  );
};

interface RouteErrorBoundaryProps extends PropsWithChildren {
  readonly resetKey: string;
}

/** One discriminant: `{failed: false, stale: true}` was a state that could never mean anything. */
interface RouteErrorBoundaryState {
  readonly failure: 'crash' | 'stale' | null;
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  override state: RouteErrorBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): RouteErrorBoundaryState {
    return { failure: isChunkLoadError(error) ? 'stale' : 'crash' };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // The fallback still avoids exposing raw runtime errors. Recording them locally is not the
    // same thing: nothing is rendered, nothing is sent, and the operator chooses to copy it.
    recordClientError(error, errorInfo.componentStack);
    console.error('Lightframe route error', error);
  }

  override componentDidUpdate(previousProps: RouteErrorBoundaryProps): void {
    if (this.state.failure !== null && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failure: null });
    }
  }

  override render(): ReactNode {
    return this.state.failure === null ? (
      this.props.children
    ) : (
      <RouteErrorFallback stale={this.state.failure === 'stale'} />
    );
  }
}

interface EntryRouteProps {
  readonly focusEnterOnMount: boolean;
}

const EntryRoute = ({ focusEnterOnMount }: EntryRouteProps) => (
  <EntryPage focusEnterOnMount={focusEnterOnMount} />
);

const AuthenticatedShellRoute = () => {
  const location = useLocation();
  const routeState = location.state as { creationIntent?: unknown } | null;
  const initialIntent = routeState?.creationIntent === 'upload' ? 'upload' : undefined;
  return (
    <Suspense fallback={<StudioLoading />}>
      <LazyAuthenticatedShell {...(initialIntent ? { initialIntent } : {})} />
    </Suspense>
  );
};

export const RoutedApplication = () => {
  const location = useLocation();
  const [hasVisitedProtectedApp, setHasVisitedProtectedApp] = useState(() =>
    isProtectedAppPath(location.pathname),
  );
  if (!hasVisitedProtectedApp && isProtectedAppPath(location.pathname)) {
    setHasVisitedProtectedApp(true);
  }
  const legacyRedirect = canonicalizeLegacyAppPath(location.pathname);

  return (
    <>
      <RouteMetadata />
      <RouteErrorBoundary resetKey={location.key}>
        <Routes>
          <Route
            path={APP_PATHS.entry}
            element={<EntryRoute focusEnterOnMount={hasVisitedProtectedApp} />}
          />
          <Route
            path="*"
            element={
              isProtectedAppPath(location.pathname) ? (
                <ProtectedRoute>
                  {legacyRedirect ? (
                    <Navigate replace to={legacyRedirect} />
                  ) : (
                    <AuthenticatedShellRoute />
                  )}
                </ProtectedRoute>
              ) : (
                <Navigate replace to={APP_PATHS.entry} />
              )
            }
          />
        </Routes>
      </RouteErrorBoundary>
    </>
  );
};

const browserRouter = createBrowserRouter([
  {
    path: '*',
    element: <RoutedApplication />,
  },
]);

export const AppRouter = () => <RouterProvider router={browserRouter} />;
