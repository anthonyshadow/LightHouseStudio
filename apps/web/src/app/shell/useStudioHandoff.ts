import type { SavedVideoSummary } from '@studio/contracts';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RecipeSelection } from '../../features/creative-assets/RecipeShelf.types';
import type { StudioRuntimePorts } from './studioHandoff';

interface UseStudioHandoffOptions {
  /** True while the current route mounts the Studio runtime. */
  readonly runtimeRouteActive: boolean;
  readonly openStudio: () => void;
}

/** A call into the Studio runtime, made now if one is mounted or when the next one arrives. */
type DeferredRuntimeCall = (ports: StudioRuntimePorts) => void;

/**
 * One way to reach the Studio runtime, whether or not it is currently mounted.
 *
 * Callers — the Asset libraries, the saved-character shelf, the wardrobe, the outfit selector — do
 * not branch on whether a runtime exists. They call `applyRecipe`, and it either reaches the live
 * session or is held for the one that is about to mount. Making every caller take the same path
 * means the cross-route case is exercised constantly rather than only on the rare trip in from
 * `/assets/characters`, which is what stops it rotting.
 *
 * A held call is the *same* call, deferred — not a description of one. Encoding the wait as a
 * parallel union of intents meant every operation existed twice, once as a port and once as a
 * variant to replay, and the two drifted: the replay of a Voice opened the upload panel and the
 * direct path did not. One function, invoked late, cannot disagree with itself.
 *
 * Ports are read at call time, never captured. A Character created from the Characters library sets
 * its destination while no runtime exists and is saved minutes later inside one; a closure captured
 * at render would still be holding the `null`.
 */
export const useStudioHandoff = ({ runtimeRouteActive, openStudio }: UseStudioHandoffOptions) => {
  const portsRef = useRef<StudioRuntimePorts | null>(null);
  const pendingRef = useRef<DeferredRuntimeCall | null>(null);

  // A call the runtime never drained is stale once the operator has left Studio again: they went
  // somewhere else, and running it on a later visit would be an action they did not ask for. The
  // runtime has already withdrawn its ports by this point, so nothing can drain in between.
  useEffect(() => {
    if (!runtimeRouteActive) pendingRef.current = null;
  }, [runtimeRouteActive]);

  /**
   * Publishes the runtime's ports, draining anything held for it. Passing `null` withdraws them.
   *
   * The held call is cleared *before* it runs: applying a recipe can ask the operator a question,
   * and a re-entrant registration while that question is open must not run it a second time.
   */
  const registerPorts = useCallback((ports: StudioRuntimePorts | null) => {
    portsRef.current = ports;
    if (ports === null) return;
    const deferred = pendingRef.current;
    pendingRef.current = null;
    deferred?.(ports);
  }, []);

  /** Reads the live ports. Always call this at the moment of use — never capture the result. */
  const readPorts = useCallback((): StudioRuntimePorts | null => portsRef.current, []);

  const callRuntime = useCallback((call: DeferredRuntimeCall) => {
    const ports = portsRef.current;
    if (ports) {
      call(ports);
      return;
    }
    pendingRef.current = call;
  }, []);

  const applyRecipe = useCallback(
    (selection: RecipeSelection) => {
      // Applying before navigating keeps the Studio's first paint already carrying the selection.
      callRuntime((ports) => ports.applyRecipe(selection));
      openStudio();
    },
    [callRuntime, openStudio],
  );

  const useSavedVideo = useCallback(
    async (video: SavedVideoSummary, intent: 'play' | 'edit') => {
      const ports = portsRef.current;
      if (ports) {
        // Awaited rather than deferred: the gallery reports a load failure to the operator, and the
        // runtime's loader navigates on its own. A held call has not started, so it has none to
        // report yet.
        await ports.useSavedVideo(video, intent);
        return;
      }
      pendingRef.current = (deferred) => void deferred.useSavedVideo(video, intent);
      openStudio();
    },
    [openStudio],
  );

  const selectVoice = useCallback(
    (voiceId: string, voiceName: string) => {
      // No navigation here: a Voice is chosen alongside a source, and the caller decides where next.
      callRuntime((ports) => ports.selectVoice(voiceId, voiceName));
    },
    [callRuntime],
  );

  return useMemo(
    () => ({ registerPorts, readPorts, applyRecipe, selectVoice, useSavedVideo }) as const,
    [applyRecipe, readPorts, registerPorts, selectVoice, useSavedVideo],
  );
};
