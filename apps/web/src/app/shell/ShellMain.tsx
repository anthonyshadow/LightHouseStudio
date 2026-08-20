import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { mainGridStyles } from '../../studio/StudioApp.styles';
import type { AssetCountState } from '../../features/assets/AssetsRouteSurface';
import { APP_PATHS, focusesMainOnNavigation } from '../paths';
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

/**
 * The Live AI Beta entry point. It is a destination, not a workspace: when the beta is actually
 * available it hands straight over to Studio with the chooser open, and when it is not the sibling
 * surface explains why. Being a component rather than an effect in shell-wide code is the point —
 * it cannot run on a route it was not rendered for.
 */
const LiveBetaEntry = ({
  ready,
  onEnter,
}: {
  readonly ready: boolean;
  readonly onEnter: () => void;
}) => {
  useEffect(() => {
    if (ready) onEnter();
  }, [onEnter, ready]);
  return null;
};

interface ShellMainProps {
  readonly services: ShellServices;
  readonly displayName: string;
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
export const ShellMain = ({ services, displayName, studioRuntime }: ShellMainProps) => {
  const location = useLocation();
  const {
    route,
    nav,
    creative,
    character,
    outfit,
    provider,
    ownerUserId,
    mainRef,
    projectProcessing,
    reportProjectSession,
    liveAvailability,
    overlay,
  } = services;
  const { projectContextActive, dashboardRouteActive } = route;
  const navigate = useNavigate();
  const openOverlay = overlay.open;
  const openLiveExperience = useCallback(() => {
    openOverlay('ai-experience');
    void navigate(APP_PATHS.create, { replace: true, state: null });
  }, [navigate, openOverlay]);
  /*
   * Both browser-held libraries answer from the same store, so they share one state: unread until
   * IndexedDB has loaded, and unavailable — with a reopen — when it could not be opened at all.
   */
  const creativeReopen = creative.reopen;
  const creativeCount = useCallback(
    (count: number): AssetCountState =>
      creative.health === 'session-only'
        ? { status: 'error', retry: creativeReopen }
        : creative.hydrated
          ? { status: 'ready', count }
          : { status: 'loading' },
    [creative.health, creative.hydrated, creativeReopen],
  );

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
            characters={creativeCount(creative.store.savedCharacterPrompts.length)}
            outfits={creativeCount(
              creative.store.savedPrompts.filter((item) => item.modelModeId === 'lucy-vton-latest')
                .length,
            )}
            creativeLibraryMirror={creative.sync.mirror}
            onOpen={nav.openAssetLibrary}
            onUploadVideo={nav.uploadVideo}
          />
        </Suspense>
      ) : null}

      {route.liveRouteActive ? (
        <>
          {/* Mounting is the guard: this only exists on the Live route, so no path predicate. */}
          <LiveBetaEntry
            ready={provider.state === 'ready' && liveAvailability.enabled}
            onEnter={openLiveExperience}
          />
          <Suspense fallback={<p role="status">Checking Live AI Beta…</p>}>
            <LiveBetaRouteSurface
              capabilityState={provider.state}
              betaEnabled={liveAvailability.betaEnabled}
              providerConfigured={liveAvailability.providerConfigured}
              onOpenStudio={nav.openStudio}
              onOpenDashboard={nav.backToDashboard}
            />
          </Suspense>
        </>
      ) : null}

      {route.projectOverviewActive ? (
        <Suspense fallback={<p role="status">Loading Projects workspace…</p>}>
          <ProjectRouteSurface
            workspaceMode={false}
            ownerUserId={ownerUserId}
            processing={projectProcessing}
            onSessionChange={reportProjectSession}
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
