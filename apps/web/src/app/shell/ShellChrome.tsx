import { useTheme } from '@emotion/react';
import type { AuthenticatedSessionResponse, AuthenticatedUser } from '@studio/contracts';
import { lazy, Suspense, useRef, useState } from 'react';
import type { AssetCountState } from '../../features/assets/AssetLibraryTabs';
import { CreativeLibrarySyncNotice } from '../../features/creative-assets/CreativeLibrarySyncNotice';
import { AssetCreationLauncher } from '../../studio/AssetCreationLauncher';
import { HowLightframeWorksPanel } from '../../studio/HowLightframeWorksPanel';
import { creativeSyncNoticeRegionStyles, headerRegionStyles } from '../../studio/StudioApp.styles';
import { StudioHeader } from '../../studio/StudioHeader';
import { ShellCreativeBuilders } from './ShellCreativeBuilders';
import type { useStudioLogoutController } from '../../studio/useStudioLogoutController';
import { studioCreatePath } from '../paths';
import type { ShellServices } from './useShellServices';

const StudioLibraryOverlays = lazy(() =>
  import('../../studio/StudioLibraryOverlays').then((module) => ({
    default: module.StudioLibraryOverlays,
  })),
);

interface ShellChromeProps {
  readonly services: ShellServices;
  readonly user: AuthenticatedUser;
  /** The full session in memory, for the read-only account details panel. */
  readonly session?: AuthenticatedSessionResponse | undefined;
  readonly logout: ReturnType<typeof useStudioLogoutController>;
}

/**
 * The navigation and library surfaces every authenticated route shows.
 *
 * All of it outlives the Studio: the rail is how you leave Studio, the Asset libraries are
 * `/assets/*` routes that own no capture graph, and Quick Create opens the Character and Outfit
 * builders in place on a Project. Rendering them here rather than inside the runtime is what lets
 * the runtime go away.
 */
export const ShellChrome = ({ services, user, session, logout }: ShellChromeProps) => {
  const theme = useTheme();
  const [assetCreationLauncherOpen, setAssetCreationLauncherOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Written only from the trigger's own click handler, so focus returns to the control the operator
  // actually used rather than to whichever one rendered last.
  const quickCreateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const helpTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { route, nav, browser, provider, creative, character, outfit, libraryHandoff, mainRef } =
    services;
  const { availability, state: capabilityState } = provider;
  const { repository, store, sync } = creative;
  const creativeCount = (count: number): AssetCountState =>
    creative.health === 'session-only'
      ? { status: 'error', retry: creative.reopen }
      : creative.hydrated
        ? { status: 'ready', count }
        : { status: 'loading' };

  return (
    <>
      <div css={headerRegionStyles(theme)}>
        <StudioHeader
          availability={availability}
          browser={browser}
          capabilityState={capabilityState}
          user={user}
          {...(session ? { session } : {})}
          accountBusy={logout.busy || logout.preparing}
          activeDestination={
            route.dashboardRouteActive
              ? 'dashboard'
              : route.campaignRouteActive
                ? 'campaigns'
                : route.projectRouteActive
                  ? 'projects'
                  : route.assetsRouteActive
                    ? 'assets'
                    : 'studio'
          }
          onOpenDashboard={nav.openDashboard}
          onOpenStudio={nav.openStudio}
          onOpenProjects={nav.openProjects}
          onOpenCampaigns={nav.openCampaigns}
          onOpenAssets={nav.openAssets}
          onCreateProject={nav.createProject}
          onCreateCampaign={nav.createCampaign}
          onCreateAsset={(trigger) => {
            quickCreateTriggerRef.current = trigger;
            setAssetCreationLauncherOpen(true);
          }}
          onOpenLive={nav.openLive}
          onOpenHelp={(trigger) => {
            helpTriggerRef.current = trigger;
            setHelpOpen(true);
          }}
          onLogout={() => void logout.request()}
        />
      </div>
      {/*
        One mount, in the chrome rather than on `/assets`. A paused library silently affects every
        Character and Outfit save wherever the operator is, the Asset libraries are fullscreen
        overlays that would hide a hub-level notice, and the dedicated shell row keeps it clear of
        both the navigation and the active surface.
      */}
      <div css={creativeSyncNoticeRegionStyles(theme)} data-creative-sync-notice-region="">
        <CreativeLibrarySyncNotice {...sync} />
      </div>

      <HowLightframeWorksPanel
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        returnFocusRef={helpTriggerRef}
      />

      <AssetCreationLauncher
        open={assetCreationLauncherOpen}
        projectId={route.projectRouteActive ? route.activeProjectId : null}
        returnFocusRef={quickCreateTriggerRef}
        onClose={() => setAssetCreationLauncherOpen(false)}
        onCreateVideo={(intent, projectId) => {
          setAssetCreationLauncherOpen(false);
          nav.navigateTo(
            studioCreatePath({
              ...(intent === 'new' ? {} : { intent }),
              ...(projectId ? { projectId } : {}),
            }),
          );
        }}
        onCreateCharacter={(projectId) => {
          setAssetCreationLauncherOpen(false);
          if (projectId) {
            character.openNewForProject(projectId);
            return;
          }
          nav.openStudio();
          character.openNew();
        }}
        onCreateOutfit={(projectId) => {
          setAssetCreationLauncherOpen(false);
          if (projectId) {
            outfit.openNewForProject(projectId);
            return;
          }
          nav.openStudio();
          outfit.openNew(false, 'library');
        }}
        onOpenVoiceLibrary={nav.openVoices}
      />

      {route.assetsRouteActive ? (
        <Suspense fallback={<p role="status">Loading Assets…</p>}>
          <StudioLibraryOverlays
            pathname={route.pathname}
            mainRef={mainRef}
            repository={repository}
            store={store}
            charactersCount={creativeCount(store.savedCharacterPrompts.length)}
            outfitsCount={creativeCount(
              store.savedPrompts.filter((item) => item.modelModeId === 'lucy-vton-latest').length,
            )}
            creativeLibraryMirror={sync.mirror}
            onSwitchLibrary={nav.switchAssetLibrary}
            onClose={nav.closeAssetLibrary}
            focusedSavedVideoId={route.focusedSavedVideoId}
            onFocusedSavedVideoConsumed={nav.clearFocusedSavedVideo}
            onUseVideo={libraryHandoff.useVideo}
            onCreateCharacter={libraryHandoff.createCharacter}
            onCopyCharacter={libraryHandoff.copyCharacter}
            onOpenWardrobe={libraryHandoff.openWardrobe}
            onUseCharacter={libraryHandoff.useCharacter}
            onCreateOutfit={libraryHandoff.createOutfit}
            onUseOutfit={libraryHandoff.useOutfit}
            voiceLibraryUnavailableReason={
              availability.elevenLabs
                ? null
                : 'Saving, removing, and using voices needs a configured ElevenLabs provider. Browsing and previewing stay available.'
            }
            onUseVoice={libraryHandoff.useVoice}
          />
        </Suspense>
      ) : null}

      <ShellCreativeBuilders services={services} />
    </>
  );
};
