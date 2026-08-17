import { describe, expect, it } from 'vitest';
import {
  APP_PATHS,
  PROTECTED_ROUTES,
  campaignPath,
  canonicalizeLegacyAppPath,
  isProtectedAppPath,
  projectPath,
  projectWorkspacePath,
  protectedRouteForPath,
  studioVideoPath,
} from './paths';

/**
 * The web counterpart of `apps/api/src/route-inventory.test.ts`: an oracle, not a behaviour test.
 *
 * Adding or removing an authenticated destination fails this file until the expected list is
 * updated. That is deliberate — the point of `PROTECTED_ROUTES` is that route registration, the
 * protected-path guard and the document title cannot drift apart silently, and this is what turns
 * "cannot" into a failing test rather than a convention.
 */
const EXPECTED_ROUTES: readonly (readonly [id: string, title: string])[] = [
  ['project-workspace', 'Project Studio · Lightframe'],
  ['project-detail', 'Project · Lightframe Studio'],
  ['campaign-detail', 'Campaign · Lightframe Studio'],
  ['saved-video', 'Lightframe Studio'],
  ['dashboard', 'Dashboard · Lightframe'],
  ['create', 'Studio · Lightframe'],
  ['live', 'Live AI Beta · Lightframe'],
  ['projects', 'Projects · Lightframe Studio'],
  ['campaigns', 'Campaigns · Lightframe Studio'],
  ['assets', 'Assets · Lightframe'],
  ['videos', 'Videos · Assets · Lightframe'],
  ['characters', 'Characters · Assets · Lightframe'],
  ['outfits', 'Outfits · Assets · Lightframe'],
  ['voices', 'Voices · Assets · Lightframe'],
];

const SAMPLE_PROJECT_ID = '18b120ac-1578-46e3-8c3d-42307772f391';
const SAMPLE_CAMPAIGN_ID = '8565ab6c-70ee-409c-bb0a-ff08b7c98070';
const SAMPLE_VIDEO_ID = 'f2f4a1cb-0b0e-4a1a-9a0e-2f1c3d4e5f60';

describe('protected route inventory', () => {
  it('registers exactly the expected authenticated destinations', () => {
    expect(PROTECTED_ROUTES.map(({ id, title }) => [id, title])).toEqual(
      EXPECTED_ROUTES.map(([id, title]) => [id, title]),
    );
  });

  it('gives every route exactly one way in: matcher or literal path, never neither', () => {
    for (const route of PROTECTED_ROUTES) {
      expect(
        route.path !== undefined || route.match !== undefined,
        `${route.id} is unreachable: it declares neither a path nor a matcher`,
      ).toBe(true);
    }
  });

  it('resolves every literal route to its own definition and guards it as protected', () => {
    for (const route of PROTECTED_ROUTES) {
      if (route.path === undefined) continue;
      expect(protectedRouteForPath(route.path)?.id, route.path).toBe(route.id);
      expect(isProtectedAppPath(route.path), route.path).toBe(true);
    }
  });

  it('resolves every parameterised route from a representative pathname', () => {
    const samples: readonly (readonly [id: string, pathname: string])[] = [
      ['project-workspace', projectWorkspacePath(SAMPLE_PROJECT_ID)],
      ['project-detail', projectPath(SAMPLE_PROJECT_ID)],
      ['campaign-detail', campaignPath(SAMPLE_CAMPAIGN_ID)],
      ['saved-video', studioVideoPath(SAMPLE_VIDEO_ID)],
    ];
    const parameterised = PROTECTED_ROUTES.filter(({ path }) => path === undefined).map(
      ({ id }) => id,
    );
    expect(samples.map(([id]) => id)).toEqual(parameterised);
    for (const [id, pathname] of samples) {
      expect(protectedRouteForPath(pathname)?.id, pathname).toBe(id);
      expect(isProtectedAppPath(pathname), pathname).toBe(true);
    }
  });

  it('lands every legacy redirect on a registered route', () => {
    const legacy = [
      APP_PATHS.studio,
      APP_PATHS.legacyProjects,
      APP_PATHS.legacyCampaigns,
      APP_PATHS.legacyCampaignsSingular,
      APP_PATHS.legacyAssets,
      APP_PATHS.legacyVideos,
      APP_PATHS.legacyCharacters,
      APP_PATHS.legacyOutfits,
      APP_PATHS.legacyVoices,
      APP_PATHS.legacyLive,
      APP_PATHS.recipes,
      '/studio/assets/videos',
      '/studio/assets/characters',
      '/studio/assets/outfits',
      `/studio/projects/${SAMPLE_PROJECT_ID}`,
      `/studio/projects/${SAMPLE_PROJECT_ID}/workspace`,
      `/studio/campaigns/${SAMPLE_CAMPAIGN_ID}`,
      `/campaign/${SAMPLE_CAMPAIGN_ID}`,
    ];
    for (const pathname of legacy) {
      const destination = canonicalizeLegacyAppPath(pathname);
      expect(destination, `${pathname} must redirect somewhere`).not.toBeNull();
      expect(
        protectedRouteForPath(destination!)?.id,
        `${pathname} -> ${destination}`,
      ).toBeDefined();
    }
  });

  it('treats an unregistered pathname as unprotected', () => {
    expect(protectedRouteForPath('/nope')).toBeNull();
    expect(isProtectedAppPath('/nope')).toBe(false);
    // A non-UUID under /studio is not a Saved Video route.
    expect(protectedRouteForPath('/studio/not-a-uuid')).toBeNull();
  });
});
