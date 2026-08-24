import { describe, expect, it } from 'vitest';
import {
  APP_PATHS,
  ASSET_DESTINATION_PATHS,
  assetDestinationFromPath,
  campaignIdFromPath,
  campaignPath,
  canonicalizeLegacyAppPath,
  canonicalizeProtectedDestination,
  focusesMainOnNavigation,
  isAssetsPath,
  isCampaignsPath,
  isProjectWorkspacePath,
  isProjectsPath,
  isProtectedAppPath,
  isStudioPath,
  isStudioRuntimePath,
  PROTECTED_ROUTES,
  projectIdFromPath,
  projectPath,
  projectWorkspacePath,
  requestedSavedVideoIdFromSearch,
  savedVideoLibraryPath,
  studioCreatePath,
  studioVideoIdFromPath,
  studioVideoPath,
} from './paths';

describe('authenticated application paths', () => {
  const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
  const campaignId = '20ce94fa-15d1-42c6-abd3-77ff61516b48';
  const videoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';

  it('builds and recognizes the canonical route topology', () => {
    expect(projectPath(projectId)).toBe(`/projects/${projectId}`);
    expect(projectIdFromPath(projectPath(projectId))).toBe(projectId);
    expect(projectWorkspacePath(projectId)).toBe(`/projects/${projectId}/workspace`);
    expect(projectIdFromPath(projectWorkspacePath(projectId))).toBe(projectId);
    expect(isProjectWorkspacePath(projectWorkspacePath(projectId))).toBe(true);
    expect(isProjectsPath(APP_PATHS.projects)).toBe(true);
    expect(isProjectsPath(projectPath(projectId))).toBe(true);
    expect(campaignPath(campaignId)).toBe(`/campaigns/${campaignId}`);
    expect(campaignIdFromPath(campaignPath(campaignId))).toBe(campaignId);
    expect(isCampaignsPath(APP_PATHS.campaigns)).toBe(true);
    expect(isCampaignsPath(campaignPath(campaignId))).toBe(true);
    expect(studioVideoPath(videoId)).toBe(`/studio/${videoId}`);
    expect(studioVideoIdFromPath(studioVideoPath(videoId))).toBe(videoId);
    expect(studioCreatePath({ intent: 'record', projectId })).toBe(
      `/studio/create?intent=record&projectId=${projectId}`,
    );
    expect(studioCreatePath({ intent: 'upload' })).toBe('/studio/create?intent=upload');
    expect(studioCreatePath()).toBe(APP_PATHS.create);
    expect(isStudioRuntimePath(studioVideoPath(videoId))).toBe(true);
    expect(ASSET_DESTINATION_PATHS.videos).toBe(APP_PATHS.videos);
    expect(ASSET_DESTINATION_PATHS.characters).toBe(APP_PATHS.characters);
    expect(ASSET_DESTINATION_PATHS.outfits).toBe(APP_PATHS.outfits);
    expect(ASSET_DESTINATION_PATHS.voices).toBe(APP_PATHS.voices);
    expect(assetDestinationFromPath(APP_PATHS.videos)).toBe('videos');
    expect(assetDestinationFromPath(APP_PATHS.characters)).toBe('characters');
    expect(assetDestinationFromPath(APP_PATHS.assets)).toBeNull();
    expect(savedVideoLibraryPath(videoId)).toBe(`${APP_PATHS.videos}?video=${videoId}`);
    expect(requestedSavedVideoIdFromSearch(`?video=${videoId}`)).toBe(videoId);
    expect(requestedSavedVideoIdFromSearch('?sort=latest')).toBeNull();

    for (const path of [
      APP_PATHS.dashboard,
      APP_PATHS.create,
      APP_PATHS.live,
      APP_PATHS.assets,
      APP_PATHS.projects,
      projectPath(projectId),
      projectWorkspacePath(projectId),
      APP_PATHS.campaigns,
      campaignPath(campaignId),
      APP_PATHS.videos,
      APP_PATHS.characters,
      APP_PATHS.outfits,
      APP_PATHS.voices,
      studioVideoPath(videoId),
      APP_PATHS.legacyCampaignsSingular,
      `/campaign/${campaignId}`,
    ]) {
      expect(isProtectedAppPath(path)).toBe(true);
    }
    expect(isAssetsPath(APP_PATHS.assets)).toBe(true);
    expect(isAssetsPath(APP_PATHS.voices)).toBe(true);
  });

  /**
   * An oracle over the runtime split, in the spirit of `route-inventory.test.ts`.
   *
   * "Does this destination mount the capture graph" is the question the Studio runtime boundary
   * exists to answer, so it must not be answerable by accident. Registering a destination fails
   * this table until someone states which side of the boundary it is on.
   */
  it('classifies every registered destination against the Studio runtime boundary', () => {
    const parameterizedSamplePaths: Readonly<Record<string, string>> = {
      'project-workspace': projectWorkspacePath(projectId),
      'project-detail': projectPath(projectId),
      'campaign-detail': campaignPath(campaignId),
      'saved-video': studioVideoPath(videoId),
    };
    const expected: Readonly<
      Record<string, { readonly studioRuntime: boolean; readonly focusesMain: boolean }>
    > = {
      'project-workspace': { studioRuntime: true, focusesMain: true },
      'project-detail': { studioRuntime: false, focusesMain: true },
      'campaign-detail': { studioRuntime: false, focusesMain: true },
      'saved-video': { studioRuntime: true, focusesMain: false },
      dashboard: { studioRuntime: false, focusesMain: true },
      create: { studioRuntime: true, focusesMain: true },
      // The Live AI Beta route has never shown a stage: `useStudioRouteContext` groups it with the
      // organization routes, which hide the stage column. It renders a capability card, or hands
      // off to `/studio/create`, so it never needs the capture graph.
      live: { studioRuntime: false, focusesMain: false },
      projects: { studioRuntime: false, focusesMain: true },
      campaigns: { studioRuntime: false, focusesMain: true },
      assets: { studioRuntime: false, focusesMain: true },
      videos: { studioRuntime: false, focusesMain: true },
      characters: { studioRuntime: false, focusesMain: true },
      outfits: { studioRuntime: false, focusesMain: true },
      voices: { studioRuntime: false, focusesMain: true },
    };

    expect(Object.keys(expected).toSorted()).toEqual(
      PROTECTED_ROUTES.map(({ id }) => id).toSorted(),
    );

    for (const { id, path } of PROTECTED_ROUTES) {
      const pathname = path ?? parameterizedSamplePaths[id];
      if (pathname === undefined) {
        throw new Error(`Register a sample pathname for the parameterised route "${id}".`);
      }
      expect({ id, ...expected[id] }).toEqual({
        id,
        studioRuntime: isStudioRuntimePath(pathname),
        focusesMain: focusesMainOnNavigation(pathname),
      });
    }
  });

  it('normalizes every supported legacy organization route', () => {
    expect(canonicalizeLegacyAppPath('/studio')).toBe(APP_PATHS.dashboard);
    expect(canonicalizeLegacyAppPath('/studio/projects')).toBe(APP_PATHS.projects);
    expect(canonicalizeLegacyAppPath(`/studio/projects/${projectId}`)).toBe(projectPath(projectId));
    expect(canonicalizeLegacyAppPath(`/studio/projects/${projectId}/workspace`)).toBe(
      projectWorkspacePath(projectId),
    );
    expect(canonicalizeLegacyAppPath('/studio/campaigns')).toBe(APP_PATHS.campaigns);
    expect(canonicalizeLegacyAppPath(`/studio/campaigns/${campaignId}`)).toBe(
      campaignPath(campaignId),
    );
    expect(canonicalizeLegacyAppPath('/campaign')).toBe(APP_PATHS.campaigns);
    expect(canonicalizeLegacyAppPath(`/campaign/${campaignId}`)).toBe(campaignPath(campaignId));
    expect(canonicalizeLegacyAppPath(APP_PATHS.campaigns)).toBeNull();
    expect(canonicalizeLegacyAppPath(campaignPath(campaignId))).toBeNull();
    expect(canonicalizeLegacyAppPath('/studio/assets')).toBe(APP_PATHS.assets);
    expect(canonicalizeLegacyAppPath('/studio/assets/videos')).toBe(APP_PATHS.videos);
    expect(canonicalizeLegacyAppPath('/studio/videos')).toBe(APP_PATHS.videos);
    expect(canonicalizeLegacyAppPath('/studio/assets/characters')).toBe(APP_PATHS.characters);
    expect(canonicalizeLegacyAppPath('/studio/characters')).toBe(APP_PATHS.characters);
    expect(canonicalizeLegacyAppPath('/studio/assets/outfits')).toBe(APP_PATHS.outfits);
    expect(canonicalizeLegacyAppPath('/studio/outfits')).toBe(APP_PATHS.outfits);
    expect(canonicalizeLegacyAppPath('/studio/assets/voices')).toBe(APP_PATHS.voices);
    expect(canonicalizeLegacyAppPath('/studio/live')).toBe(APP_PATHS.live);
  });

  it('restores only normalized, internal protected destinations', () => {
    expect(canonicalizeProtectedDestination('/studio/videos?sort=latest')).toBe(
      '/assets/videos?sort=latest',
    );
    expect(canonicalizeProtectedDestination(`/projects/${projectId}#assets`)).toBe(
      `/projects/${projectId}#assets`,
    );
    expect(canonicalizeProtectedDestination('/campaign?lifecycle=archived')).toBe(
      `${APP_PATHS.campaigns}?lifecycle=archived`,
    );
    expect(canonicalizeProtectedDestination(`/campaign/${campaignId}`)).toBe(
      campaignPath(campaignId),
    );
    expect(canonicalizeProtectedDestination('//example.com/projects')).toBeNull();
    expect(canonicalizeProtectedDestination('https://example.com/projects')).toBeNull();
    expect(canonicalizeProtectedDestination('/not-a-route')).toBeNull();
  });

  it('rejects unknown, nested, malformed, and non-UUID Studio video paths', () => {
    for (const path of [
      '/studio/unknown',
      '/projects/id/history',
      '/projects/%E0%A4%A',
      '/advanced',
      '/assets/recipes',
      '/studio/assets/recipes',
      `/campaigns/${campaignId}/projects`,
    ]) {
      expect(isProtectedAppPath(path)).toBe(false);
    }
    expect(isStudioPath('/studio/future-child')).toBe(true);
    expect(isStudioPath('/projects')).toBe(false);
    expect(studioVideoIdFromPath('/studio/not-a-uuid')).toBeNull();
  });
});
