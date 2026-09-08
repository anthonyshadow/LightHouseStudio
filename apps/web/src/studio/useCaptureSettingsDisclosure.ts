import { useCallback, useEffect, useRef, useState } from 'react';
import { isStudioFormError } from './studioStageNotices';
import type { StudioSessionController } from '../features/media-session';
import type { useStudioOverlayController } from './useStudioOverlayController';

const focusDesktopCaptureSettings = () => {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[data-desktop-capture-settings]')?.focus();
  });
};

interface UseCaptureSettingsDisclosureOptions {
  readonly desktopStudioLayout: boolean;
  readonly recordingActive: boolean;
  readonly sessionError: StudioSessionController['error'];
  readonly clearSessionError: () => void;
  readonly openOverlay: ReturnType<typeof useStudioOverlayController>['open'];
  readonly closeOverlayIf: ReturnType<typeof useStudioOverlayController>['closeIf'];
}

/**
 * Owns when the capture-settings panel is disclosed and when it takes focus.
 *
 * Docked on desktop and an overlay elsewhere, so opening it means two different things, and the
 * two effects below have to run in that order: the panel steps aside for a stage notice before
 * focus can follow it becoming focusable.
 *
 * A third effect — the one collapsing the overlay once the layout turns desktop — deliberately
 * stays in `StudioApp`. It writes shell overlay state, and moving it here would drop it behind
 * every effect the hooks in between contribute, which is an observable reordering.
 *
 * Runtime-local — capture settings mean nothing on a route without live media.
 */
export const useCaptureSettingsDisclosure = ({
  desktopStudioLayout,
  recordingActive,
  sessionError,
  clearSessionError,
  openOverlay,
  closeOverlayIf,
}: UseCaptureSettingsDisclosureOptions) => {
  // The docked desktop panel rests collapsed so the stage and the two primary actions own the
  // surface.
  const [expanded, setExpanded] = useState(false);
  const focusRequestRef = useRef(false);

  // A non-form session error is reported as a stage notice, so the capture panel steps aside to
  // keep that notice reachable. AI Settings deliberately stays open: it owns Start/Apply/Reset, so
  // it is the surface the disconnect recovery copy points at, and mode switching is locked while
  // local media is live — closing it would strand a disconnected session with no way back.
  useEffect(() => {
    if (!sessionError || isStudioFormError(sessionError)) return;
    closeOverlayIf(['capture-settings']);
  }, [closeOverlayIf, sessionError]);

  // Focus follows the panel becoming focusable, not the request: a collapsed panel is inside a
  // `hidden` subtree, so recovery has to expand it first and focus it once React has committed.
  useEffect(() => {
    if (!expanded || !focusRequestRef.current) return;
    focusRequestRef.current = false;
    focusDesktopCaptureSettings();
  }, [expanded]);

  const openDocked = useCallback(() => {
    if (expanded) {
      focusDesktopCaptureSettings();
      return;
    }
    focusRequestRef.current = true;
    setExpanded(true);
  }, [expanded]);

  const toggle = useCallback(() => setExpanded((current) => !current), []);

  const reveal = useCallback(() => {
    if (desktopStudioLayout) {
      openDocked();
      return;
    }
    openOverlay('capture-settings');
  }, [desktopStudioLayout, openDocked, openOverlay]);

  const openForRecovery = useCallback(() => {
    clearSessionError();
    reveal();
  }, [clearSessionError, reveal]);

  const open = () => {
    if (recordingActive) return;
    reveal();
  };

  return { expanded, open, openForRecovery, toggle };
};
