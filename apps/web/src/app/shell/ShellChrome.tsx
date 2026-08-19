import { useTheme } from '@emotion/react';
import type { AuthenticatedUser } from '@studio/contracts';
import { useRef, useState } from 'react';
import { CreativeLibrarySyncNotice } from '../../features/creative-assets/CreativeLibrarySyncNotice';
import { AssetCreationLauncher } from '../../studio/AssetCreationLauncher';
import { headerRegionStyles } from '../../studio/StudioApp.styles';
import { StudioHeader } from '../../studio/StudioHeader';
import { StudioLibraryOverlays } from '../../studio/StudioLibraryOverlays';
import { ShellCreativeBuilders } from './ShellCreativeBuilders';
import type { useStudioLogoutController } from '../../studio/useStudioLogoutController';
import { studioCreatePath } from '../paths';
import type { ShellServices } from './useShellServices';

interface ShellChromeProps {
  readonly services: ShellServices;
  readonly user: AuthenticatedUser;
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
export const ShellChrome = ({ services, user, logout }: ShellChromeProps) => {
  const theme = useTheme();
  const [assetCreationLauncherOpen, setAssetCreationLauncherOpen] = useState(false);
  // Written only from the trigger's own click handler, so focus returns to the control the operator
  // actually used rather than to whichever one rendered last.
  const quickCreateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { route, nav, browser, provider, creative, character, outfit, libraryHandoff, mainRef } =
    services;
  const { availability, state: capabilityState } = provider;
  const { repository, store, sync } = creative;

  return (
    <>
      <div css={headerRegionStyles(theme)}>
        <StudioHeader
          availability={availability}
          browser={browser}
          capabilityState={capabilityState}
          user={user}
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
          onLogout={() => void logout.request()}
        />
        {/*
          One mount, in the chrome rather than on `/assets`. A paused library silently affects every
          Character and Outfit save wherever the operator is, the Asset libraries are fullscreen
          overlays that would hide a hub-level notice, and sitting outside the main grid keeps it
          clear of the Studio stage.
        */}
        <CreativeLibrarySyncNotice {...sync} />
      </div>

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

      <StudioLibraryOverlays
        pathname={route.pathname}
        mainRef={mainRef}
        repository={repository}
        store={store}
        creativeLibraryMirror={sync.mirror}
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

      <ShellCreativeBuilders services={services} />
    </>
  );
};
