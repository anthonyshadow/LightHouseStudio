import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useProjectProcessingController } from '../../features/projects/useProjectProcessingController';
import type { ProjectSessionPort } from '../../features/projects/useProjectSession';
import { detectBrowserCapabilities } from '../../adapters/browser-media/browserMedia';
import type { StudioCreativeLocks } from './studioRuntimeWork';
import { useStudioCharacterWorkflow } from '../../studio/useStudioCharacterWorkflow';
import { useStudioCreativeRepository } from '../../studio/useStudioCreativeRepository';
import { useStudioLibraryHandoff } from '../../studio/useStudioLibraryHandoff';
import { useStudioNavigationActions } from '../../studio/useStudioNavigationActions';
import { useStudioOutfitWorkflow } from '../../studio/useStudioOutfitWorkflow';
import { useStudioOverlayController } from '../../studio/useStudioOverlayController';
import { useStudioRouteContext } from '../../studio/useStudioRouteContext';
import { useDesktopStudioLayout } from '../../studio/useDesktopStudioLayout';
import { useProviderAvailability } from '../../studio/useProviderAvailability';
import { liveExperienceAvailability } from '../../studio/studioLiveAvailability';
import { APP_PATHS } from '../paths';
import type { ConfirmationRequest } from '../../ui';
import type { useStudioHandoff } from './useStudioHandoff';

interface UseShellServicesOptions {
  readonly ownerUserId: string;
  readonly initialIntent?: 'upload';
  readonly confirmation: ConfirmationRequest;
  readonly handoff: ReturnType<typeof useStudioHandoff>;
  readonly creativeLocks: StudioCreativeLocks;
  /** The runtime's Project session, or null when no Studio is mounted. */
  readonly projectSession: ProjectSessionPort | null;
}

/**
 * Everything the authenticated shell owns on behalf of whatever surface is showing.
 *
 * The grouping is by lifetime, not by feature: each of these has to survive a route change, so none
 * of them can live in the Studio runtime. The creative library is the clearest case — the Assets
 * hub reads its counts, the library overlays read its contents, and Project detail attaches from it,
 * none of which involve a camera. Re-opening its IndexedDB handle and re-running its cloud sync on
 * every trip into Studio and back would be pure waste.
 *
 * The Character and Outfit workflows are here for a different reason: Quick Create opens their
 * builders in place on a Project route. What the live session forbids still reaches them, through
 * `creativeLocks`, which the runtime reports and which is empty when no runtime is mounted.
 */
export const useShellServices = ({
  ownerUserId,
  initialIntent,
  confirmation,
  handoff,
  creativeLocks,
  projectSession,
}: UseShellServicesOptions) => {
  const route = useStudioRouteContext(initialIntent);
  const nav = useStudioNavigationActions();
  const desktopStudioLayout = useDesktopStudioLayout();
  const browser = useMemo(() => detectBrowserCapabilities(), []);
  const provider = useProviderAvailability();
  const creative = useStudioCreativeRepository(ownerUserId);

  const overlay = useStudioOverlayController(
    route.creationIntent === 'upload' ? 'video-upload' : null,
  );
  const { open: openOverlay, close: closeOverlay } = overlay;

  const mainRef = useRef<HTMLElement>(null);
  const characterSelectorRef = useRef<HTMLButtonElement>(null);
  const outfitToggleRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const editVideoToggleRef = useRef<HTMLButtonElement>(null);
  const uploadToggleRef = useRef<HTMLButtonElement>(null);
  const fullscreenWorkspaceRef = useRef<HTMLDivElement>(null);

  const outfit = useStudioOutfitWorkflow({
    blockedReason: creativeLocks.characterOpen,
    openOverlay,
    closeOverlay,
    onOpenLibrary: nav.openOutfits,
    // The shell's channel, so an outfit chosen from the library reaches a Studio that may not be
    // mounted yet by the same path as one chosen inside it.
    applySavedOutfit: handoff.applyRecipe,
    confirmation,
  });
  const character = useStudioCharacterWorkflow({
    ownerUserId,
    repository: creative.repository,
    store: creative.store,
    readPorts: handoff.readPorts,
    activityBlockedReason: creativeLocks.characterActivity,
    openBlockedReason: creativeLocks.characterOpen,
    studioSaveBlockedReason: creativeLocks.characterSave,
    openOverlay,
    closeOverlay,
    confirmation,
  });

  // Server state about the Project, not about a camera: whether an accepted provider operation
  // blocks archiving has to be known on the Project overview, which mounts no Studio. The
  // controller scopes itself to a live Project session, and each surface owns one — the workspace's
  // arrives through the runtime, the overview reports its own here — so it follows whichever
  // surface is showing rather than resetting when the Studio unmounts.
  const [overviewProjectSession, setOverviewProjectSession] = useState<ProjectSessionPort | null>(
    null,
  );
  const readPorts = handoff.readPorts;
  const checkpointProjectCreative = useCallback(
    () => readPorts()?.checkpointProjectCreative() ?? Promise.resolve(false),
    [readPorts],
  );
  const projectProcessing = useProjectProcessingController({
    projectId: route.activeProjectId,
    session: projectSession ?? overviewProjectSession,
    checkpointCreative: checkpointProjectCreative,
  });

  // `/studio/create/live` is an entry point, not a workspace: it has never shown a stage. When the
  // beta is actually available it hands straight over to Studio with the chooser open, and the
  // overlay survives the navigation because the overlay controller is the shell's. When it is not,
  // `ShellMain` renders the capability card and no capture graph is fetched at all.
  const navigate = useNavigate();
  const { enabled: liveEnabled } = liveExperienceAvailability(provider.availability);
  useEffect(() => {
    if (!route.liveRouteActive || provider.state !== 'ready' || !liveEnabled) return;
    openOverlay('ai-experience');
    void navigate(APP_PATHS.create, { replace: true, state: null });
  }, [liveEnabled, navigate, openOverlay, provider.state, route.liveRouteActive]);

  const openVideoUpload = useMemo(() => () => openOverlay('video-upload'), [openOverlay]);
  const libraryHandoff = useStudioLibraryHandoff({
    nav,
    character,
    outfit,
    applyRecipe: handoff.applyRecipe,
    selectVoice: handoff.selectVoice,
    useSavedVideo: handoff.useSavedVideo,
    openVideoUpload,
  });

  return useMemo(
    () =>
      ({
        ownerUserId,
        route,
        nav,
        desktopStudioLayout,
        browser,
        provider,
        creative,
        overlay,
        outfit,
        character,
        libraryHandoff,
        projectProcessing,
        reportOverviewProjectSession: setOverviewProjectSession,
        openVideoUpload,
        confirmation,
        handoff,
        creativeLocks,
        // Refs stay top-level rather than grouped: they are already stable, and nesting them in a
        // memo reads to the compiler as holding ref values across a render.
        mainRef,
        characterSelectorRef,
        outfitToggleRef,
        workshopToggleRef,
        editVideoToggleRef,
        uploadToggleRef,
        fullscreenWorkspaceRef,
      }) as const,
    [
      browser,
      character,
      confirmation,
      creative,
      creativeLocks,
      desktopStudioLayout,
      handoff,
      libraryHandoff,
      nav,
      openVideoUpload,
      outfit,
      projectProcessing,
      overlay,
      ownerUserId,
      provider,
      route,
    ],
  );
};

export type ShellServices = ReturnType<typeof useShellServices>;
