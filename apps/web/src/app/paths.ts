export const APP_PATHS = Object.freeze({
  entry: '/',
  studio: '/studio',
  dashboard: '/studio',
  create: '/studio/create',
  live: '/studio/create/live',
  projects: '/studio/projects',
  campaigns: '/studio/campaigns',
  assets: '/studio/assets',
  videos: '/studio/assets/videos',
  characters: '/studio/assets/characters',
  outfits: '/studio/assets/outfits',
  voices: '/studio/assets/voices',
  recipes: '/studio/assets/recipes',
  legacyVideos: '/studio/videos',
  legacyCharacters: '/studio/characters',
  legacyOutfits: '/studio/outfits',
  legacyLive: '/studio/live',
} as const);

const STUDIO_LEAF_PATHS = new Set<string>([
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
  APP_PATHS.recipes,
  APP_PATHS.legacyVideos,
  APP_PATHS.legacyCharacters,
  APP_PATHS.legacyOutfits,
  APP_PATHS.legacyLive,
]);

const PROJECT_DETAIL_PATH = /^\/studio\/projects\/([^/]+)$/u;
const PROJECT_WORKSPACE_PATH = /^\/studio\/projects\/([^/]+)\/workspace$/u;
const CAMPAIGN_DETAIL_PATH = /^\/studio\/campaigns\/([^/]+)$/u;

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

export const projectIdFromPath = (pathname: string): string | null => {
  return (
    decodedPathId(PROJECT_DETAIL_PATH.exec(pathname)) ??
    decodedPathId(PROJECT_WORKSPACE_PATH.exec(pathname))
  );
};

export const isProjectWorkspacePath = (pathname: string): boolean =>
  decodedPathId(PROJECT_WORKSPACE_PATH.exec(pathname)) !== null;

export const isProjectsPath = (pathname: string): boolean =>
  pathname === APP_PATHS.projects || projectIdFromPath(pathname) !== null;

export const campaignPath = (campaignId: string): string =>
  `${APP_PATHS.campaigns}/${encodeURIComponent(campaignId)}`;

export const campaignIdFromPath = (pathname: string): string | null => {
  return decodedPathId(CAMPAIGN_DETAIL_PATH.exec(pathname));
};

export const isCampaignsPath = (pathname: string): boolean =>
  pathname === APP_PATHS.campaigns || campaignIdFromPath(pathname) !== null;

export const isAssetsPath = (pathname: string): boolean =>
  pathname === APP_PATHS.assets || pathname.startsWith(`${APP_PATHS.assets}/`);

export const legacyStudioRedirect = (pathname: string): string | null => {
  switch (pathname) {
    case APP_PATHS.legacyVideos:
      return APP_PATHS.videos;
    case APP_PATHS.legacyCharacters:
      return APP_PATHS.characters;
    case APP_PATHS.legacyOutfits:
      return APP_PATHS.outfits;
    case APP_PATHS.legacyLive:
      return APP_PATHS.live;
    default:
      return null;
  }
};

/** Classifies the whole Studio subtree for lifecycle guards, including future child routes. */
export const isStudioPath = (pathname: string): boolean =>
  pathname === APP_PATHS.studio || pathname.startsWith(`${APP_PATHS.studio}/`);

/** Recognizes only the authenticated route topology the current Studio can restore. */
export const isRestorableStudioPath = (pathname: string): boolean =>
  STUDIO_LEAF_PATHS.has(pathname) ||
  projectIdFromPath(pathname) !== null ||
  campaignIdFromPath(pathname) !== null;
