export type StudioInitialOverlay = {
  readonly kind: 'legacy-projects';
  readonly focusProjectId: string | null;
} | null;

export interface LegacyEntryResolution {
  readonly canonicalPath: '/';
  readonly canonicalSearch: '';
  readonly shouldReplace: boolean;
  readonly initialOverlay: StudioInitialOverlay;
}

const normalizedPathname = (pathname: string): string => pathname.replace(/\/+$/u, '') || '/';

const focusedProjectId = (params: URLSearchParams): string | null => {
  const value = params.get('project')?.trim();
  return value && value.length <= 256 ? value : null;
};

/**
 * Maps every retired or unknown SPA entry to the sole canonical Studio URL.
 * The returned overlay is an initialization hint; applying the history
 * replacement must not remount Studio.
 */
export const resolveLegacyEntry = (
  location: Pick<Location, 'pathname' | 'search'>,
): LegacyEntryResolution => {
  const pathname = normalizedPathname(location.pathname);
  const params = new URLSearchParams(location.search);
  const projectId = focusedProjectId(params);
  const opensLegacyProjects =
    pathname === '/projects' ||
    (projectId !== null && (pathname === '/' || pathname === '/guided'));

  return {
    canonicalPath: '/',
    canonicalSearch: '',
    shouldReplace: location.pathname !== '/' || location.search !== '',
    initialOverlay: opensLegacyProjects
      ? { kind: 'legacy-projects', focusProjectId: projectId }
      : null,
  };
};
