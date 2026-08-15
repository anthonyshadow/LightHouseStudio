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
import { EntryPage } from './EntryPage';
import {
  APP_PATHS,
  campaignIdFromPath,
  isAssetsPath,
  isCampaignsPath,
  isProjectWorkspacePath,
  isProjectsPath,
  isRestorableStudioPath,
  isStudioPath,
  legacyStudioRedirect,
  projectIdFromPath,
} from './paths';
import { ProtectedRoute } from './ProtectedRoute';

const LazyStudioApp = lazy(() =>
  import('../studio/StudioApp').then((module) => ({ default: module.StudioApp })),
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
  if (isProjectWorkspacePath(pathname)) return 'Project Studio · Lightframe';
  if (projectIdFromPath(pathname) !== null) return 'Project · Lightframe Studio';
  if (campaignIdFromPath(pathname) !== null) return 'Campaign · Lightframe Studio';

  switch (pathname) {
    case APP_PATHS.dashboard:
      return 'Dashboard · Lightframe';
    case APP_PATHS.create:
      return 'Studio · Lightframe';
    case APP_PATHS.live:
      return 'Live AI Beta · Lightframe';
    case APP_PATHS.projects:
      return 'Projects · Lightframe Studio';
    case APP_PATHS.campaigns:
      return 'Campaigns · Lightframe Studio';
    case APP_PATHS.assets:
      return 'Assets · Lightframe';
    case APP_PATHS.videos:
      return 'Videos · Assets · Lightframe';
    case APP_PATHS.characters:
      return 'Characters · Assets · Lightframe';
    case APP_PATHS.outfits:
      return 'Outfits · Assets · Lightframe';
    case APP_PATHS.voices:
      return 'Voices · Assets · Lightframe';
    case APP_PATHS.recipes:
      return 'Recipes · Assets · Lightframe';
    default:
      return isRestorableStudioPath(pathname) ? 'Lightframe Studio' : 'Enter Lightframe Studio';
  }
};

const RouteMetadata = () => {
  const location = useLocation();
  const studioRoute = isRestorableStudioPath(location.pathname);
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

const RouteErrorFallback = () => (
  <main role="alert" css={routeSurfaceStyles}>
    <div>
      <h1>Studio could not load</h1>
      <p>Reload Lightframe to try again. Your saved account content is unchanged.</p>
      <Button variant="primary" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  </main>
);

interface RouteErrorBoundaryProps extends PropsWithChildren {
  readonly resetKey: string;
}

interface RouteErrorBoundaryState {
  readonly failed: boolean;
}

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  override state: RouteErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // The route fallback intentionally avoids exposing raw runtime errors.
  }

  override componentDidUpdate(previousProps: RouteErrorBoundaryProps): void {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  override render(): ReactNode {
    return this.state.failed ? <RouteErrorFallback /> : this.props.children;
  }
}

interface EntryRouteProps {
  readonly focusEnterOnMount: boolean;
}

const EntryRoute = ({ focusEnterOnMount }: EntryRouteProps) => (
  <EntryPage focusEnterOnMount={focusEnterOnMount} />
);

interface StudioRouteProps {
  readonly focusMainOnMount: boolean;
}

const StudioRoute = ({ focusMainOnMount }: StudioRouteProps) => {
  const location = useLocation();
  const routeState = location.state as { creationIntent?: unknown } | null;
  const initialIntent = routeState?.creationIntent === 'upload' ? 'upload' : undefined;
  return (
    <Suspense fallback={<StudioLoading />}>
      <LazyStudioApp
        focusMainOnMount={focusMainOnMount}
        {...(initialIntent ? { initialIntent } : {})}
      />
    </Suspense>
  );
};

export const RoutedApplication = () => {
  const location = useLocation();
  const [hasVisitedStudio, setHasVisitedStudio] = useState(() => isStudioPath(location.pathname));
  if (!hasVisitedStudio && isStudioPath(location.pathname)) {
    setHasVisitedStudio(true);
  }
  const focusMainOnMount =
    (location.pathname === APP_PATHS.dashboard ||
      location.pathname === APP_PATHS.create ||
      isAssetsPath(location.pathname) ||
      isProjectsPath(location.pathname) ||
      isCampaignsPath(location.pathname)) &&
    location.key !== 'default';
  const legacyRedirect = legacyStudioRedirect(location.pathname);

  return (
    <>
      <RouteMetadata />
      <RouteErrorBoundary resetKey={location.key}>
        <Routes>
          <Route
            path={APP_PATHS.entry}
            element={<EntryRoute focusEnterOnMount={hasVisitedStudio} />}
          />
          <Route
            path={`${APP_PATHS.studio}/*`}
            element={
              isRestorableStudioPath(location.pathname) ? (
                <ProtectedRoute>
                  {legacyRedirect ? (
                    <Navigate replace to={legacyRedirect} />
                  ) : (
                    <StudioRoute focusMainOnMount={focusMainOnMount} />
                  )}
                </ProtectedRoute>
              ) : (
                <Navigate replace to={APP_PATHS.entry} />
              )
            }
          />
          <Route path="*" element={<Navigate replace to={APP_PATHS.entry} />} />
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
