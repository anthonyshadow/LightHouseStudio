import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  APP_PATHS,
  ASSET_DESTINATION_PATHS,
  assetDestinationFromPath,
  type AssetDestination,
  campaignPath,
  projectPath,
  savedVideoLibraryPath,
} from '../app/paths';
import { useRouteBack } from '../app/useRouteBack';
import type { StudioHeaderDestination } from './StudioHeader';

/**
 * The Studio shell's outbound destinations in one place, so header, dashboard, asset cards and
 * overlays cannot drift onto different paths or intents for the same journey.
 *
 * Every handler is stable, which is what lets the surfaces below re-render only when their own data
 * changes rather than on every shell render.
 */
export const useStudioNavigationActions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useRouteBack();
  const lastAssetDestinationRef = useRef<AssetDestination>('videos');
  const currentAssetDestination = assetDestinationFromPath(location.pathname);
  useEffect(() => {
    if (currentAssetDestination !== null) {
      lastAssetDestinationRef.current = currentAssetDestination;
    }
  }, [currentAssetDestination]);

  return useMemo(
    () =>
      ({
        navigateTo: (path: string) => void navigate(path),
        /**
         * Where each primary destination lives, so the navigation can be real links.
         *
         * A function rather than a value: Assets resolves to the library last used, which lives in
         * a ref this memo does not depend on, and a frozen record would send every operator back to
         * the shelf they opened first.
         */
        destinationPaths: (): Readonly<Record<StudioHeaderDestination, string>> => ({
          dashboard: APP_PATHS.dashboard,
          studio: APP_PATHS.create,
          projects: APP_PATHS.projects,
          campaigns: APP_PATHS.campaigns,
          assets: ASSET_DESTINATION_PATHS[lastAssetDestinationRef.current],
        }),
        openStudio: () => void navigate(APP_PATHS.create),
        openProjects: () => void navigate(APP_PATHS.projects),
        openCampaigns: () => void navigate(APP_PATHS.campaigns),
        /** Opens the most recently used library, with Videos as the first-run retrieval default. */
        openAssets: () => void navigate(ASSET_DESTINATION_PATHS[lastAssetDestinationRef.current]),
        /** Resolves the compatibility `/assets` entry without adding a history hop. */
        assetEntryPath: () => ASSET_DESTINATION_PATHS[lastAssetDestinationRef.current],
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
        /** Tab changes stay within the one history entry that opened the library overlay. */
        switchAssetLibrary: (destination: AssetDestination) =>
          void navigate(ASSET_DESTINATION_PATHS[destination], { replace: true }),
        /** Returns to the real previous entry, falling back to `path` on direct entry. */
        goBackTo: (path: string) => goBack(path),
        backToDashboard: () => goBack(APP_PATHS.dashboard),
        /**
         * Library overlays are entered by pushing their path, so they must be left by consuming that
         * entry. Pushing `/assets` instead made every open/close pair cost two Back presses.
         */
        closeAssetLibrary: () => goBack(APP_PATHS.dashboard),
      }) as const,
    [goBack, navigate],
  );
};
