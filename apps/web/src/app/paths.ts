export const APP_PATHS = Object.freeze({
  entry: '/',
  studio: '/studio',
  projects: '/studio/projects',
  videos: '/studio/videos',
  characters: '/studio/characters',
  outfits: '/studio/outfits',
} as const);

const STUDIO_LEAF_PATHS = new Set<string>([
  APP_PATHS.studio,
  APP_PATHS.projects,
  APP_PATHS.videos,
  APP_PATHS.characters,
  APP_PATHS.outfits,
]);

const PROJECT_DETAIL_PATH = /^\/studio\/projects\/([^/]+)$/u;

export const projectPath = (projectId: string): string =>
  `${APP_PATHS.projects}/${encodeURIComponent(projectId)}`;

export const projectIdFromPath = (pathname: string): string | null => {
  const match = PROJECT_DETAIL_PATH.exec(pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

export const isProjectsPath = (pathname: string): boolean =>
  pathname === APP_PATHS.projects || projectIdFromPath(pathname) !== null;

/** Classifies the whole Studio subtree for lifecycle guards, including future child routes. */
export const isStudioPath = (pathname: string): boolean =>
  pathname === APP_PATHS.studio || pathname.startsWith(`${APP_PATHS.studio}/`);

/** Recognizes only the authenticated route topology the current Studio can restore. */
export const isRestorableStudioPath = (pathname: string): boolean =>
  STUDIO_LEAF_PATHS.has(pathname) || projectIdFromPath(pathname) !== null;
