import { projectIdSchema, savedVideoIdSchema } from '@studio/contracts';
import { useMemo } from 'react';
import { useLocation } from 'react-router';
import {
  APP_PATHS,
  isAssetsPath,
  isCampaignsPath,
  isProjectWorkspacePath,
  isProjectsPath,
  projectIdFromPath,
  requestedSavedVideoIdFromSearch,
  studioVideoIdFromPath,
  type StudioCreationIntent,
} from '../app/paths';

export type StudioRouteContext = Readonly<{
  pathname: string;
  /**
   * Intent carried by `?intent=`, kept separate from the resolved intent so redirects can rebuild
   * the query string without inventing one the URL never had.
   */
  queryCreationIntent: StudioCreationIntent | null;
  creationIntent: StudioCreationIntent | null;
  /** Raw `?projectId=`, retained so an unparseable value can still be detected and dropped. */
  requestedCreationProjectId: string | null;
  validCreationProjectId: string | null;
  directVideoId: string | null;
  /** `/assets/videos?video=<uuid>` — the Saved Video whose preview the Videos library should open. */
  focusedSavedVideoId: string | null;
  routeOriginProjectId: string | null;
  activeProjectId: string | null;
  projectRouteActive: boolean;
  campaignRouteActive: boolean;
  dashboardRouteActive: boolean;
  assetsRouteActive: boolean;
  liveRouteActive: boolean;
  projectWorkspaceActive: boolean;
  projectOverviewActive: boolean;
  projectContextActive: boolean;
}>;

/**
 * Reads the current location into the destinations and identifiers the authenticated app acts on.
 * Derivation only — nothing here navigates, fetches or holds state.
 */
export const useStudioRouteContext = (initialIntent?: StudioCreationIntent): StudioRouteContext => {
  const location = useLocation();
  const createQuery = useMemo(
    () => (location.pathname === APP_PATHS.create ? new URLSearchParams(location.search) : null),
    [location.pathname, location.search],
  );
  const queryCreationIntent =
    createQuery?.get('intent') === 'record' || createQuery?.get('intent') === 'upload'
      ? (createQuery.get('intent') as StudioCreationIntent)
      : null;
  const creationIntent = queryCreationIntent ?? initialIntent ?? null;
  const requestedCreationProjectId = createQuery?.get('projectId') ?? null;
  const parsedCreationProjectId = requestedCreationProjectId
    ? projectIdSchema.safeParse(requestedCreationProjectId)
    : null;
  const validCreationProjectId = parsedCreationProjectId?.success
    ? parsedCreationProjectId.data
    : null;
  const directVideoId = studioVideoIdFromPath(location.pathname);
  const focusedSavedVideoId = useMemo(() => {
    if (location.pathname !== APP_PATHS.videos) return null;
    const parsed = savedVideoIdSchema.safeParse(requestedSavedVideoIdFromSearch(location.search));
    return parsed.success ? parsed.data : null;
  }, [location.pathname, location.search]);
  const routeOriginProjectId = useMemo(() => {
    const state = location.state as { readonly fromProjectId?: unknown } | null;
    const parsed = projectIdSchema.safeParse(state?.fromProjectId);
    return parsed.success ? parsed.data : null;
  }, [location.state]);
  const projectRouteActive = isProjectsPath(location.pathname);
  const campaignRouteActive = isCampaignsPath(location.pathname);
  const dashboardRouteActive = location.pathname === APP_PATHS.dashboard;
  const assetsRouteActive = isAssetsPath(location.pathname);
  const liveRouteActive = location.pathname === APP_PATHS.live;
  const projectWorkspaceActive = isProjectWorkspacePath(location.pathname);
  const projectOverviewActive = projectRouteActive && !projectWorkspaceActive;
  const activeProjectId = projectIdFromPath(location.pathname);
  const projectContextActive = projectWorkspaceActive && activeProjectId !== null;

  // Memoized because the authenticated shell hands this object to every surface: a fresh
  // identity each render would defeat every memo above it.
  return useMemo(
    () => ({
      pathname: location.pathname,
      queryCreationIntent,
      creationIntent,
      requestedCreationProjectId,
      validCreationProjectId,
      directVideoId,
      focusedSavedVideoId,
      routeOriginProjectId,
      activeProjectId,
      projectRouteActive,
      campaignRouteActive,
      dashboardRouteActive,
      assetsRouteActive,
      liveRouteActive,
      projectWorkspaceActive,
      projectOverviewActive,
      projectContextActive,
    }),
    [
      activeProjectId,
      assetsRouteActive,
      campaignRouteActive,
      creationIntent,
      dashboardRouteActive,
      directVideoId,
      focusedSavedVideoId,
      liveRouteActive,
      location.pathname,
      projectContextActive,
      projectOverviewActive,
      projectRouteActive,
      projectWorkspaceActive,
      queryCreationIntent,
      requestedCreationProjectId,
      routeOriginProjectId,
      validCreationProjectId,
    ],
  );
};
