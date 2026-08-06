export const APP_PATHS = Object.freeze({
  entry: '/',
  studio: '/studio',
  videos: '/studio/videos',
  characters: '/studio/characters',
  outfits: '/studio/outfits',
} as const);

export const isStudioPath = (pathname: string): boolean =>
  pathname === APP_PATHS.studio || pathname.startsWith(`${APP_PATHS.studio}/`);
