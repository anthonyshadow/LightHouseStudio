export const APP_PATHS = Object.freeze({
  entry: '/',
  dashboard: '/dashboard',
  studio: '/studio',
  create: '/studio/create',
  live: '/studio/create/live',
  projects: '/projects',
  campaigns: '/campaign',
  assets: '/assets',
  videos: '/assets/videos',
  characters: '/assets/characters',
  outfits: '/assets/outfits',
  voices: '/assets/voices',
  /** Compatibility-only route. Recipe UI has no canonical destination. */
  recipes: '/studio/assets/recipes',
  legacyProjects: '/studio/projects',
  legacyCampaigns: '/studio/campaigns',
  legacyAssets: '/studio/assets',
  legacyVideos: '/studio/videos',
  legacyCharacters: '/studio/characters',
  legacyOutfits: '/studio/outfits',
  legacyVoices: '/studio/assets/voices',
  legacyLive: '/studio/live',
} as const);

export type AssetLibraryKind = 'video' | 'character' | 'outfit' | 'voice';
export type StudioCreationIntent = 'record' | 'upload';

const PROTECTED_LEAF_PATHS = new Set<string>([
  APP_PATHS.dashboard,
  APP_PATHS.create,
  APP_PATHS.live,
  APP_PATHS.projects,
  APP_PATHS.campaigns,
  APP_PATHS.assets,
  APP_PATHS.videos,
  APP_PATHS.characters,
  APP_PATHS.outfits,
  APP_PATHS.voices,
]);

const PROJECT_DETAIL_PATH = /^\/projects\/([^/]+)$/u;
const PROJECT_WORKSPACE_PATH = /^\/projects\/([^/]+)\/workspace$/u;
const CAMPAIGN_DETAIL_PATH = /^\/campaign\/([^/]+)$/u;
const STUDIO_VIDEO_PATH =
  /^\/studio\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/iu;

const LEGACY_PROJECT_DETAIL_PATH = /^\/studio\/projects\/([^/]+)$/u;
const LEGACY_PROJECT_WORKSPACE_PATH = /^\/studio\/projects\/([^/]+)\/workspace$/u;
const LEGACY_CAMPAIGN_DETAIL_PATH = /^\/studio\/campaigns\/([^/]+)$/u;

export const projectPath = (projectId: string): string =>
  `${APP_PATHS.projects}/${encodeURIComponent(projectId)}`;

export const projectWorkspacePath = (projectId: string): string =>
  `${projectPath(projectId)}/workspace`;

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

export const assetLibraryPath = (kind: AssetLibraryKind): string => {
  switch (kind) {
    case 'video':
      return APP_PATHS.videos;
    case 'character':
      return APP_PATHS.characters;
    case 'outfit':
      return APP_PATHS.outfits;
    case 'voice':
      return APP_PATHS.voices;
  }
};

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
  const campaignId = decodedPathId(LEGACY_CAMPAIGN_DETAIL_PATH.exec(pathname));
  return campaignId === null ? null : campaignPath(campaignId);
};

export const canonicalizeLegacyAppPath = (pathname: string): string | null => {
  const projectRedirect = legacyProjectRedirect(pathname);
  if (projectRedirect !== null) return projectRedirect;
  const campaignRedirect = legacyCampaignRedirect(pathname);
  if (campaignRedirect !== null) return campaignRedirect;

  switch (pathname) {
    case APP_PATHS.studio:
      return APP_PATHS.dashboard;
    case APP_PATHS.legacyProjects:
      return APP_PATHS.projects;
    case APP_PATHS.legacyCampaigns:
      return APP_PATHS.campaigns;
    case APP_PATHS.legacyAssets:
      return APP_PATHS.assets;
    case '/studio/assets/videos':
    case APP_PATHS.legacyVideos:
      return APP_PATHS.videos;
    case '/studio/assets/characters':
    case APP_PATHS.legacyCharacters:
      return APP_PATHS.characters;
    case '/studio/assets/outfits':
    case APP_PATHS.legacyOutfits:
      return APP_PATHS.outfits;
    case APP_PATHS.legacyVoices:
      return APP_PATHS.voices;
    case APP_PATHS.recipes:
      return APP_PATHS.assets;
    case APP_PATHS.legacyLive:
      return APP_PATHS.live;
    default:
      return null;
  }
};

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
