import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  APP_PATHS,
  ASSET_DESTINATION_PATHS,
  type AssetDestination,
  campaignPath,
  projectPath,
  savedVideoLibraryPath,
} from '../app/paths';
import { useRouteBack } from '../app/useRouteBack';

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
        openProjects: () => void navigate(APP_PATHS.projects),
        openCampaigns: () => void navigate(APP_PATHS.campaigns),
        openAssets: () => void navigate(APP_PATHS.assets),
        openVideos: () => void navigate(APP_PATHS.videos),
        /** The Videos library with one Saved Video's preview open, rather than the whole shelf. */
        openSavedVideo: (videoId: string) => void navigate(savedVideoLibraryPath(videoId)),
        /** Drops `?video=` once the library has acted on it, so Back cannot re-open the preview. */
        clearFocusedSavedVideo: () => void navigate(APP_PATHS.videos, { replace: true }),
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
        /**
         * Library overlays are entered by pushing their path, so they must be left by consuming that
         * entry. Pushing `/assets` instead made every open/close pair cost two Back presses.
         */
        closeAssetLibrary: () => goBack(APP_PATHS.assets),
      }) as const,
    [goBack, navigate],
  );
};
