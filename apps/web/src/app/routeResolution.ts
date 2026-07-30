import { APP_PATHS } from './paths';

export type StudioInitialOverlay = {
  readonly kind: 'legacy-projects';
  readonly focusProjectId: string | null;
} | null;

export interface StudioNavigationState {
  readonly initialOverlay: Exclude<StudioInitialOverlay, null>;
}

export interface LegacyEntryResolution {
  readonly canonicalPath: (typeof APP_PATHS)[keyof typeof APP_PATHS];
  readonly canonicalSearch: '';
  readonly shouldReplace: boolean;
  readonly initialOverlay: StudioInitialOverlay;
}

const normalizedPathname = (pathname: string): string => pathname.replace(/\/+$/u, '') || '/';

const focusedProjectId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 256 ? normalized : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const readStudioNavigationState = (value: unknown): StudioNavigationState | null => {
  if (!isRecord(value) || !isRecord(value.initialOverlay)) return null;
  const overlay = value.initialOverlay;
  if (overlay.kind !== 'legacy-projects') return null;
  if (overlay.focusProjectId !== null && typeof overlay.focusProjectId !== 'string') return null;

  const focusProjectId = focusedProjectId(overlay.focusProjectId);
  if (overlay.focusProjectId !== null && focusProjectId === null) return null;

  return {
    initialOverlay: {
      kind: 'legacy-projects',
      focusProjectId,
    },
  };
};

export const toStudioNavigationState = (
  initialOverlay: StudioInitialOverlay,
): StudioNavigationState | undefined => (initialOverlay ? { initialOverlay } : undefined);

/**
 * Resolves canonical application entries without mutating browser history.
 * Only known retired Studio entries may bypass the new entry page.
 */
export const resolveLegacyEntry = (
  location: Pick<Location, 'pathname' | 'search'>,
): LegacyEntryResolution => {
  const pathname = normalizedPathname(location.pathname);
  const params = new URLSearchParams(location.search);
  const projectId = focusedProjectId(params.get('project'));
  const isProjectsEntry = pathname === '/projects';
  const isProjectDeepLink =
    projectId !== null && (pathname === APP_PATHS.entry || pathname === '/guided');
  const opensLegacyProjects = isProjectsEntry || isProjectDeepLink;
  const isRetiredStudioEntry =
    pathname === '/advanced' ||
    pathname === '/guided' ||
    isProjectsEntry ||
    (pathname === APP_PATHS.entry &&
      (params.get('new') === '1' || params.get('characterFlow') === 'guided')) ||
    isProjectDeepLink;
  const isStudioEntry = pathname === APP_PATHS.studio;
  const canonicalPath = isStudioEntry || isRetiredStudioEntry ? APP_PATHS.studio : APP_PATHS.entry;

  return {
    canonicalPath,
    canonicalSearch: '',
    shouldReplace: location.pathname !== canonicalPath || location.search !== '',
    initialOverlay: opensLegacyProjects
      ? { kind: 'legacy-projects', focusProjectId: projectId }
      : null,
  };
};
