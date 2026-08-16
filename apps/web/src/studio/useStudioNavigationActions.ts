import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { APP_PATHS, campaignPath, projectPath } from '../app/paths';
import { useRouteBack } from '../app/useRouteBack';

type AssetDestination = 'videos' | 'characters' | 'outfits' | 'voices';

const ASSET_DESTINATION_PATHS: Readonly<Record<AssetDestination, string>> = {
  videos: APP_PATHS.videos,
  characters: APP_PATHS.characters,
  outfits: APP_PATHS.outfits,
  voices: APP_PATHS.voices,
};

/**
 * The Studio shell's outbound destinations in one place, so header, dashboard, asset cards and
 * overlays cannot drift onto different paths or intents for the same journey.
 *
 * Every handler is stable, which is what lets the surfaces below re-render only when their own data
 * changes rather than on every shell render.
 */
export const useStudioNavigationActions = () => {
  const navigate = useNavigate();
  const goBack = useRouteBack();

  return useMemo(
    () =>
      ({
        navigateTo: (path: string) => void navigate(path),
        openDashboard: () => void navigate(APP_PATHS.dashboard),
        openStudio: () => void navigate(APP_PATHS.create),
        /** Replaces the current entry — used when the Studio is a destination, not a step. */
        replaceWithStudio: () => void navigate(APP_PATHS.create, { replace: true }),
        openProjects: () => void navigate(APP_PATHS.projects),
        openCampaigns: () => void navigate(APP_PATHS.campaigns),
        openAssets: () => void navigate(APP_PATHS.assets),
        openVideos: () => void navigate(APP_PATHS.videos),
        openVoices: () => void navigate(APP_PATHS.voices),
        openOutfits: () => void navigate(APP_PATHS.outfits),
        openLive: () => void navigate(APP_PATHS.live),
        createProject: () =>
          void navigate(APP_PATHS.projects, { state: { createIntent: 'project' } }),
        createCampaign: () =>
          void navigate(APP_PATHS.campaigns, { state: { createIntent: 'campaign' } }),
        openProject: (projectId: string) => void navigate(projectPath(projectId)),
        openCampaign: (campaignId: string) => void navigate(campaignPath(campaignId)),
        openAssetLibrary: (destination: AssetDestination) =>
          void navigate(ASSET_DESTINATION_PATHS[destination]),
        uploadVideo: () => void navigate(APP_PATHS.create, { state: { creationIntent: 'upload' } }),
        /** Returns to the real previous entry, falling back to `path` on direct entry. */
        goBackTo: (path: string) => goBack(path),
        backToDashboard: () => goBack(APP_PATHS.dashboard),
      }) as const,
    [goBack, navigate],
  );
};
