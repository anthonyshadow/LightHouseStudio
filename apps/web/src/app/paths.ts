export const APP_PATHS = Object.freeze({
  entry: '/',
  dashboard: '/dashboard',
  studio: '/studio',
  create: '/studio/create',
  live: '/studio/create/live',
  projects: '/projects',
  campaigns: '/campaigns',
  assets: '/assets',
  videos: '/assets/videos',
  characters: '/assets/characters',
  outfits: '/assets/outfits',
  voices: '/assets/voices',
  /** Compatibility-only route. Recipe UI has no canonical destination. */
  recipes: '/studio/assets/recipes',
  legacyProjects: '/studio/projects',
  legacyCampaigns: '/studio/campaigns',
  /** Compatibility-only route. Campaigns were singular before every other collection was plural. */
  legacyCampaignsSingular: '/campaign',
  legacyAssets: '/studio/assets',
  legacyVideos: '/studio/videos',
  legacyCharacters: '/studio/characters',
  legacyOutfits: '/studio/outfits',
  legacyVoices: '/studio/assets/voices',
  legacyLive: '/studio/live',
} as const);

export type AssetDestination = 'videos' | 'characters' | 'outfits' | 'voices';
export type StudioCreationIntent = 'record' | 'upload';

const FOCUSED_SAVED_VIDEO_PARAM = 'video';

const PROJECT_DETAIL_PATH = /^\/projects\/([^/]+)$/u;
const PROJECT_WORKSPACE_PATH = /^\/projects\/([^/]+)\/workspace$/u;
const CAMPAIGN_DETAIL_PATH = /^\/campaigns\/([^/]+)$/u;
const STUDIO_VIDEO_PATH =
  /^\/studio\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;

const LEGACY_PROJECT_DETAIL_PATH = /^\/studio\/projects\/([^/]+)$/u;
const LEGACY_PROJECT_WORKSPACE_PATH = /^\/studio\/projects\/([^/]+)\/workspace$/u;
const LEGACY_CAMPAIGN_DETAIL_PATH = /^\/studio\/campaigns\/([^/]+)$/u;
/** The literal `/` after `campaign` is what keeps this from ever matching a canonical plural path. */
const LEGACY_CAMPAIGN_SINGULAR_DETAIL_PATH = /^\/campaign\/([^/]+)$/u;

export const projectPath = (projectId: string): string =>
  `${APP_PATHS.projects}/${encodeURIComponent(projectId)}`;

/**
 * The task rides in the query string rather than the path: `PROJECT_WORKSPACE_PATH` is anchored,
 * so a `/workspace/<task>` segment would break `projectIdFromPath`, `isProjectWorkspacePath`,
 * `isProtectedAppPath` and `canonicalizeLegacyAppPath` at once. A query param is also invisible to
 * `StudioExitGuard`, which keys on pathname alone — switching tasks must not read as leaving.
 */
export const projectWorkspacePath = (projectId: string, task?: string): string => {
  const base = `${projectPath(projectId)}/workspace`;
  return task ? `${base}?task=${encodeURIComponent(task)}` : base;
};

const decodedPathId = (match: RegExpExecArray | null): string | null => {
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

export const projectIdFromPath = (pathname: string): string | null =>
  decodedPathId(PROJECT_DETAIL_PATH.exec(pathname)) ??
  decodedPathId(PROJECT_WORKSPACE_PATH.exec(pathname));

export const isProjectWorkspacePath = (pathname: string): boolean =>
  decodedPathId(PROJECT_WORKSPACE_PATH.exec(pathname)) !== null;

export const isProjectsPath = (pathname: string): boolean =>
  pathname === APP_PATHS.projects || projectIdFromPath(pathname) !== null;

export const campaignPath = (campaignId: string): string =>
  `${APP_PATHS.campaigns}/${encodeURIComponent(campaignId)}`;

export const campaignIdFromPath = (pathname: string): string | null =>
  decodedPathId(CAMPAIGN_DETAIL_PATH.exec(pathname));

export const isCampaignsPath = (pathname: string): boolean =>
  pathname === APP_PATHS.campaigns || campaignIdFromPath(pathname) !== null;

export const ASSET_DESTINATION_PATHS: Readonly<Record<AssetDestination, string>> = {
  videos: APP_PATHS.videos,
  characters: APP_PATHS.characters,
  outfits: APP_PATHS.outfits,
  voices: APP_PATHS.voices,
};

/**
 * The Videos library focused on one Saved Video. A query parameter rather than a path segment: the
 * library is an overlay whose `open` prop compares `pathname` alone, so `/assets/videos/<id>` would
 * close the very overlay it is trying to focus.
 */
export const savedVideoLibraryPath = (videoId: string): string =>
  `${APP_PATHS.videos}?${FOCUSED_SAVED_VIDEO_PARAM}=${encodeURIComponent(videoId)}`;

export const requestedSavedVideoIdFromSearch = (search: string): string | null =>
  new URLSearchParams(search).get(FOCUSED_SAVED_VIDEO_PARAM);

export const isAssetsPath = (pathname: string): boolean =>
  pathname === APP_PATHS.assets ||
  pathname === APP_PATHS.videos ||
  pathname === APP_PATHS.characters ||
  pathname === APP_PATHS.outfits ||
  pathname === APP_PATHS.voices;

export const studioVideoPath = (videoId: string): string =>
  `${APP_PATHS.studio}/${encodeURIComponent(videoId)}`;

export const studioCreatePath = (
  input?: Readonly<{
    intent?: StudioCreationIntent;
    projectId?: string;
  }>,
): string => {
  if (!input?.intent && !input?.projectId) return APP_PATHS.create;
  const query = new URLSearchParams();
  if (input.intent) query.set('intent', input.intent);
  if (input.projectId) query.set('projectId', input.projectId);
  const suffix = query.toString();
  return suffix ? `${APP_PATHS.create}?${suffix}` : APP_PATHS.create;
};

export const studioVideoIdFromPath = (pathname: string): string | null =>
  decodedPathId(STUDIO_VIDEO_PATH.exec(pathname));

export const isStudioWorkspacePath = (pathname: string): boolean =>
  pathname === APP_PATHS.create ||
  pathname === APP_PATHS.live ||
  studioVideoIdFromPath(pathname) !== null;

const legacyProjectRedirect = (pathname: string): string | null => {
  const workspaceId = decodedPathId(LEGACY_PROJECT_WORKSPACE_PATH.exec(pathname));
  if (workspaceId !== null) return projectWorkspacePath(workspaceId);
  const projectId = decodedPathId(LEGACY_PROJECT_DETAIL_PATH.exec(pathname));
  return projectId === null ? null : projectPath(projectId);
};

const legacyCampaignRedirect = (pathname: string): string | null => {
  const campaignId =
    decodedPathId(LEGACY_CAMPAIGN_DETAIL_PATH.exec(pathname)) ??
    decodedPathId(LEGACY_CAMPAIGN_SINGULAR_DETAIL_PATH.exec(pathname));
  return campaignId === null ? null : campaignPath(campaignId);
};

/**
 * Retired pathnames and the canonical destination each one now resolves to.
 *
 * A table rather than a `switch` so the set of supported legacy entry points can be read, tested
 * and extended in one place — every one of these is a URL somebody may still have bookmarked.
 */
const LEGACY_PATH_REDIRECTS: Readonly<Record<string, string>> = {
  [APP_PATHS.studio]: APP_PATHS.dashboard,
  [APP_PATHS.legacyProjects]: APP_PATHS.projects,
  [APP_PATHS.legacyCampaigns]: APP_PATHS.campaigns,
  [APP_PATHS.legacyCampaignsSingular]: APP_PATHS.campaigns,
  [APP_PATHS.legacyAssets]: APP_PATHS.assets,
  '/studio/assets/videos': APP_PATHS.videos,
  [APP_PATHS.legacyVideos]: APP_PATHS.videos,
  '/studio/assets/characters': APP_PATHS.characters,
  [APP_PATHS.legacyCharacters]: APP_PATHS.characters,
  '/studio/assets/outfits': APP_PATHS.outfits,
  [APP_PATHS.legacyOutfits]: APP_PATHS.outfits,
  [APP_PATHS.legacyVoices]: APP_PATHS.voices,
  [APP_PATHS.recipes]: APP_PATHS.assets,
  [APP_PATHS.legacyLive]: APP_PATHS.live,
};

export const canonicalizeLegacyAppPath = (pathname: string): string | null => {
  const projectRedirect = legacyProjectRedirect(pathname);
  if (projectRedirect !== null) return projectRedirect;
  const campaignRedirect = legacyCampaignRedirect(pathname);
  if (campaignRedirect !== null) return campaignRedirect;

  return LEGACY_PATH_REDIRECTS[pathname] ?? null;
};

/**
 * The registration point for an authenticated destination.
 *
 * Everything that has to agree about "is this a route, and what is it called" derives from this
 * one list: the protected-path guard, the document title, and the route inventory that fails when
 * the two drift. Adding a destination is one entry here rather than several edits scattered across
 * `paths.ts` and `AppRouter.tsx`, none of which used to fail loudly when one was missed.
 *
 * Parameterised routes carry a `match` because their patterns are constrained beyond what a plain
 * segment expresses — a Saved Video id must be a UUID, so `/studio/anything` is not a route.
 */
export interface ProtectedRouteDefinition {
  readonly id: string;
  readonly title: string;
  /** A literal pathname, for routes with no parameters. */
  readonly path?: string;
  /** Recognises a parameterised pathname. Evaluated in table order, before the literal paths. */
  readonly match?: (pathname: string) => boolean;
}

export const PROTECTED_ROUTES: readonly ProtectedRouteDefinition[] = [
  { id: 'project-workspace', title: 'Project Studio · Lightframe', match: isProjectWorkspacePath },
  {
    id: 'project-detail',
    title: 'Project · Lightframe Studio',
    match: (pathname) => projectIdFromPath(pathname) !== null,
  },
  {
    id: 'campaign-detail',
    title: 'Campaign · Lightframe Studio',
    match: (pathname) => campaignIdFromPath(pathname) !== null,
  },
  {
    id: 'saved-video',
    title: 'Lightframe Studio',
    match: (pathname) => studioVideoIdFromPath(pathname) !== null,
  },
  { id: 'dashboard', title: 'Dashboard · Lightframe', path: APP_PATHS.dashboard },
  { id: 'create', title: 'Studio · Lightframe', path: APP_PATHS.create },
  { id: 'live', title: 'Live AI Beta · Lightframe', path: APP_PATHS.live },
  { id: 'projects', title: 'Projects · Lightframe Studio', path: APP_PATHS.projects },
  { id: 'campaigns', title: 'Campaigns · Lightframe Studio', path: APP_PATHS.campaigns },
  { id: 'assets', title: 'Assets · Lightframe', path: APP_PATHS.assets },
  { id: 'videos', title: 'Videos · Assets · Lightframe', path: APP_PATHS.videos },
  { id: 'characters', title: 'Characters · Assets · Lightframe', path: APP_PATHS.characters },
  { id: 'outfits', title: 'Outfits · Assets · Lightframe', path: APP_PATHS.outfits },
  { id: 'voices', title: 'Voices · Assets · Lightframe', path: APP_PATHS.voices },
];

const PROTECTED_LEAF_PATHS = new Set<string>(
  PROTECTED_ROUTES.flatMap(({ path }) => (path === undefined ? [] : [path])),
);

/**
 * The protected route a pathname resolves to, or `null` for anything outside the authenticated
 * app. Parameterised matchers are consulted first because a literal path can never be ambiguous.
 */
export const protectedRouteForPath = (pathname: string): ProtectedRouteDefinition | null =>
  PROTECTED_ROUTES.find(({ match }) => match?.(pathname) === true) ??
  PROTECTED_ROUTES.find(({ path }) => path === pathname) ??
  null;

/** Recognizes canonical protected routes and supported legacy destinations. */
export const isProtectedAppPath = (pathname: string): boolean =>
  PROTECTED_LEAF_PATHS.has(pathname) ||
  projectIdFromPath(pathname) !== null ||
  campaignIdFromPath(pathname) !== null ||
  studioVideoIdFromPath(pathname) !== null ||
  canonicalizeLegacyAppPath(pathname) !== null;

/** Safely restores an internal protected destination and normalizes legacy paths. */
export const canonicalizeProtectedDestination = (destination: string): string | null => {
  if (!destination.startsWith('/') || destination.startsWith('//')) return null;
  let parsed: URL;
  try {
    parsed = new URL(destination, 'http://lightframe.local');
  } catch {
    return null;
  }
  if (parsed.origin !== 'http://lightframe.local') return null;
  const pathname = canonicalizeLegacyAppPath(parsed.pathname) ?? parsed.pathname;
  if (!isProtectedAppPath(pathname) || canonicalizeLegacyAppPath(pathname) !== null) return null;
  return `${pathname}${parsed.search}${parsed.hash}`;
};

/** Classifies the actual Studio workspace subtree for lifecycle guards. */
export const isStudioPath = (pathname: string): boolean =>
  pathname === APP_PATHS.studio || pathname.startsWith(`${APP_PATHS.studio}/`);
