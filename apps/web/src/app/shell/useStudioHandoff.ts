import { useCallback, useMemo, useRef, useState } from 'react';
import type { RecipeSelection } from '../../features/creative-assets/RecipeShelf.types';
import type { StudioHandoff, StudioRuntimePorts } from './studioHandoff';

interface UseStudioHandoffOptions {
  /** True while the current route mounts the Studio runtime. */
  readonly runtimeRouteActive: boolean;
  readonly openStudio: () => void;
}

/**
 * One way to apply a creative selection, whether or not the Studio is currently mounted.
 *
 * Callers — the Asset libraries, the saved-character shelf, the wardrobe, the outfit selector — do
 * not branch on whether a runtime exists. They call `applyRecipe`, and it either reaches the live
 * session or is held for the one that is about to mount. Making every caller take the same path
 * means the cross-route case is exercised constantly rather than only on the rare trip in from
 * `/assets/characters`, which is what stops it rotting.
 *
 * Ports are read through a ref at call time, never captured. A Character created from the
 * Characters library sets its destination while no runtime exists and is saved minutes later inside
 * one; a closure captured at render would still be holding the `null`.
 */
export const useStudioHandoff = ({ runtimeRouteActive, openStudio }: UseStudioHandoffOptions) => {
  const portsRef = useRef<StudioRuntimePorts | null>(null);
  const [pending, setPending] = useState<StudioHandoff | null>(null);
  const [lastRuntimeRouteActive, setLastRuntimeRouteActive] = useState(runtimeRouteActive);

  const registerPorts = useCallback((ports: StudioRuntimePorts | null) => {
    portsRef.current = ports;
  }, []);

  // A selection the runtime never drained is stale once the operator has left Studio again: they
  // went somewhere else, and applying it on a later visit would be an action they did not ask for.
  // Adjusted during render rather than in an effect so the stale value is never handed out once —
  // the same pattern `RoutedApplication` uses for its first-protected-visit flag.
  if (lastRuntimeRouteActive !== runtimeRouteActive) {
    setLastRuntimeRouteActive(runtimeRouteActive);
    if (!runtimeRouteActive && pending !== null) setPending(null);
  }

  /**
   * Drops the held selection. The runtime calls this *before* acting on it: applying a recipe can
   * ask the operator a question, and a re-render while that question is open must not find the
   * handoff still pending and apply it a second time.
   */
  const clearPending = useCallback(() => setPending(null), []);

  const applyRecipe = useCallback(
    (selection: RecipeSelection) => {
      const ports = portsRef.current;
      if (ports) {
        // Applying before navigating keeps the Studio's first paint already carrying the selection.
        ports.applyRecipe(selection);
        openStudio();
        return;
      }
      setPending({ kind: 'use-recipe', selection });
      openStudio();
    },
    [openStudio],
  );

  const selectVoice = useCallback((voiceId: string, voiceName: string) => {
    const ports = portsRef.current;
    if (ports) {
      ports.selectVoice(voiceId, voiceName);
      return;
    }
    setPending({ kind: 'preselect-voice', voiceId, voiceName });
  }, []);

  return useMemo(
    () => ({ registerPorts, applyRecipe, selectVoice, pending, clearPending }) as const,
    [applyRecipe, clearPending, pending, registerPorts, selectVoice],
  );
};
