import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { APP_PATHS } from '../app/paths';
import type { ModelMode } from '../application/types';
import {
  MODE_REPLACEMENT_CONFIRMATION,
  modeReplacementNeedsConfirmation,
  type StudioMode,
} from '../features/media-session';
import type { ProviderAvailability } from '../features/media-session';
import type { useStudioSession } from '../orchestration/session';
import type { CapabilityState } from './StudioHeader';
import { liveExperienceAvailability } from './studioLiveAvailability';
import type { useStudioOverlayController } from './useStudioOverlayController';
import type { ConfirmationRequest } from '../ui';

interface UseStudioLiveExperienceOptions {
  readonly availability: ProviderAvailability;
  readonly capabilityState: CapabilityState;
  readonly liveRouteActive: boolean;
  readonly projectContextActive: boolean;
  readonly session: ReturnType<typeof useStudioSession>;
  readonly openOverlay: ReturnType<typeof useStudioOverlayController>['open'];
  readonly closeOverlay: ReturnType<typeof useStudioOverlayController>['close'];
  /** Clears a pending capture handoff so a realtime session never inherits one. */
  readonly onClearExistingVideoIntent: () => void;
  readonly confirmation: ConfirmationRequest;
}

/**
 * Gate and entry points for the realtime (live AI) experience.
 *
 * The beta flag, the provider being configured, and the provider being reachable are three separate
 * facts; live is only offered when all three hold. A Project context never starts a realtime
 * session — Project visual work goes through the recoverable Project command instead.
 */
export const useStudioLiveExperience = ({
  availability,
  capabilityState,
  liveRouteActive,
  projectContextActive,
  session,
  openOverlay,
  closeOverlay,
  onClearExistingVideoIntent,
  confirmation,
}: UseStudioLiveExperienceOptions) => {
  const navigate = useNavigate();
  const {
    betaEnabled,
    providerConfigured,
    enabled: liveEnabled,
  } = liveExperienceAvailability(availability);

  useEffect(() => {
    if (!liveRouteActive || capabilityState !== 'ready' || !liveEnabled) return;
    openOverlay('ai-experience');
    void navigate(APP_PATHS.create, { replace: true, state: null });
  }, [capabilityState, liveEnabled, liveRouteActive, navigate, openOverlay]);

  const openLiveAiExperience = useCallback(() => {
    if (!liveEnabled) return;
    openOverlay('ai-experience');
  }, [liveEnabled, openOverlay]);

  const startAdvancedModel = useCallback(() => {
    if (projectContextActive || !liveEnabled) return Promise.resolve();
    onClearExistingVideoIntent();
    return session.startModel();
  }, [liveEnabled, onClearExistingVideoIntent, projectContextActive, session]);

  const advancedLiveSession = useMemo(
    () => ({ ...session, startModel: startAdvancedModel }),
    [session, startAdvancedModel],
  );

  const selectExperienceMode = async (mode: StudioMode): Promise<boolean> => {
    if (
      modeReplacementNeedsConfirmation(session.draft, mode) &&
      !(await confirmation.ask(MODE_REPLACEMENT_CONFIRMATION))
    ) {
      return false;
    }
    return session.selectMode(mode);
  };

  const configureVirtualTryOn = async () => {
    if (!liveEnabled) return;
    if (!(await selectExperienceMode('lucy-vton-latest'))) return;
    openOverlay('ai-settings');
  };

  const startPreparedAi = async (mode: ModelMode) => {
    if (projectContextActive || !liveEnabled) return;
    if (!(await selectExperienceMode(mode))) return;
    closeOverlay();
    void startAdvancedModel();
  };

  return {
    betaEnabled,
    providerConfigured,
    liveEnabled,
    advancedLiveSession,
    openLiveAiExperience,
    configureVirtualTryOn,
    startPreparedAi,
  } as const;
};
