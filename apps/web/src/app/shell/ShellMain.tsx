import { lazy, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { mainGridStyles } from '../../studio/StudioApp.styles';
import { focusesMainOnNavigation } from '../paths';
import type { ShellServices } from './useShellServices';

const ProjectRouteSurface = lazy(() =>
  import('../../features/projects/ProjectRouteSurface').then((module) => ({
    default: module.ProjectRouteSurface,
  })),
);
const CampaignRouteSurface = lazy(() =>
  import('../../features/campaigns/CampaignRouteSurface').then((module) => ({
    default: module.CampaignRouteSurface,
  })),
);
const DashboardRouteSurface = lazy(() =>
  import('../../features/dashboard/DashboardRouteSurface').then((module) => ({
    default: module.DashboardRouteSurface,
  })),
);
const AssetsRouteSurface = lazy(() =>
  import('../../features/assets/AssetsRouteSurface').then((module) => ({
    default: module.AssetsRouteSurface,
  })),
);
const LiveBetaRouteSurface = lazy(() =>
  import('../../features/beta/LiveBetaRouteSurface').then((module) => ({
    default: module.LiveBetaRouteSurface,
  })),
);

interface ShellMainProps {
  readonly services: ShellServices;
  readonly displayName: string;
  readonly liveBetaEnabled: boolean;
  readonly liveProviderConfigured: boolean;
  /**
   * The Studio's stage column, or nothing on a route that owns no live media. It renders inside
   * this `<main>` as a sibling of the route surfaces, which is what lets the Project workspace show
   * its controls beside a live stage without a second layout.
   */
  readonly studioRuntime: ReactNode;
}

/**
 * The one `<main>` every authenticated route shares, and the surfaces that need no live media.
 *
 * It belongs to the shell rather than the Studio because the skip link, the focus target and the
 * grid all have to exist on `/dashboard` and `/assets` as much as in Studio. The Project
 * *workspace* is deliberately absent here: it renders beside the stage and is the runtime's, while
 * the Project list and overview are ordinary reading surfaces and are ours.
 */
export const ShellMain = ({
  services,
  displayName,
  liveBetaEnabled,
  liveProviderConfigured,
  studioRuntime,
}: ShellMainProps) => {
  const location = useLocation();
  const { route, nav, creative, character, outfit, provider, ownerUserId, mainRef } = services;
  const { projectContextActive, dashboardRouteActive } = route;

  // Not a mount-time effect: the shell stays mounted, so arriving somewhere new is a change of
  // `location.key` rather than a remount. 'default' is a cold direct entry, where stealing focus
  // would move it away from the top of the document the operator just loaded.
  const focusMain = focusesMainOnNavigation(location.pathname) && location.key !== 'default';
  useLayoutEffect(() => {
    if (focusMain) mainRef.current?.focus();
  }, [focusMain, location.key, mainRef]);

  return (
    <main
      ref={mainRef}
      id="studio-main"
      tabIndex={-1}
      css={mainGridStyles(projectContextActive, dashboardRouteActive)}
    >
      {studioRuntime}

      {route.dashboardRouteActive ? (
        <Suspense fallback={<p role="status">Loading Dashboard…</p>}>
          <DashboardRouteSurface
            ownerUserId={ownerUserId}
            displayName={displayName}
            onCreateVideo={nav.openStudio}
            onCreateProject={nav.createProject}
            onCreateCampaign={nav.createCampaign}
            onOpenAssets={nav.openAssets}
            onOpenProjects={nav.openProjects}
            onOpenCampaigns={nav.openCampaigns}
            onOpenProject={nav.openProject}
            onOpenCampaign={nav.openCampaign}
            onOpenVideos={nav.openVideos}
            onOpenVideo={nav.openSavedVideo}
          />
        </Suspense>
      ) : null}

      {route.assetsRouteActive ? (
        <Suspense fallback={<p role="status">Loading Assets…</p>}>
          <AssetsRouteSurface
            characterCount={creative.store.savedCharacterPrompts.length}
            outfitCount={
              creative.store.savedPrompts.filter((item) => item.modelModeId === 'lucy-vton-latest')
                .length
            }
            onOpen={nav.openAssetLibrary}
            onUploadVideo={nav.uploadVideo}
          />
        </Suspense>
      ) : null}

      {route.liveRouteActive ? (
        <Suspense fallback={<p role="status">Checking Live AI Beta…</p>}>
          <LiveBetaRouteSurface
            capabilityState={provider.state}
            betaEnabled={liveBetaEnabled}
            providerConfigured={liveProviderConfigured}
            onOpenStudio={nav.openStudio}
            onOpenDashboard={nav.backToDashboard}
          />
        </Suspense>
      ) : null}

      {route.projectOverviewActive ? (
        <Suspense fallback={<p role="status">Loading Projects workspace…</p>}>
          <ProjectRouteSurface
            workspaceMode={false}
            ownerUserId={ownerUserId}
            creativeStore={creative.store}
            onCreateProjectCharacter={character.openNewForProject}
            onCreateProjectOutfit={outfit.openNewForProject}
          />
        </Suspense>
      ) : null}

      {route.campaignRouteActive ? (
        <Suspense fallback={<p role="status">Loading Campaigns workspace…</p>}>
          <CampaignRouteSurface />
        </Suspense>
      ) : null}
    </main>
  );
};
