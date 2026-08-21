import type { AccountCapabilityRow } from '../features/account/AccountPanel';
import type { BrowserCapabilities, ProviderAvailability } from '../features/media-session';
import { liveExperienceAvailability } from './studioLiveAvailability';

export type CapabilityState = 'loading' | 'ready' | 'error';

const capabilityLabel = (
  state: CapabilityState,
  available: boolean,
  unavailableLabel: string,
): string => {
  if (state === 'loading') return 'checking';
  if (state === 'error') return 'configuration unavailable';
  return available ? 'configured' : unavailableLabel;
};

const systemStatusLabel = (
  capabilityState: CapabilityState,
  localCaptureAvailable: boolean,
): string => {
  if (capabilityState === 'loading') return 'Checking integrations';
  if (capabilityState === 'error') return 'Integration status unavailable';
  return localCaptureAvailable ? 'Core Studio ready' : 'Studio limited';
};

export interface StudioAvailabilityPresentation {
  readonly systemState: 'loading' | 'ready' | 'limited';
  readonly systemLabel: string;
  readonly localCaptureState: string;
  readonly liveAiState: string;
  readonly existingVideoAiState: string;
  readonly voiceCloudState: string;
  /** The same rows and wording the header's status menu shows, for reuse elsewhere. */
  readonly rows: readonly AccountCapabilityRow[];
  readonly footnote: string;
}

/**
 * The one derivation of user-facing integration availability wording. The header's status menu
 * and the account panel both read from here so the same state never grows two vocabularies.
 */
export const deriveStudioAvailability = ({
  availability,
  browser,
  capabilityState,
}: {
  readonly availability: ProviderAvailability;
  readonly browser: BrowserCapabilities;
  readonly capabilityState: CapabilityState;
}): StudioAvailabilityPresentation => {
  const localCaptureAvailable = browser.mediaDevices && browser.secureContext;
  const localCaptureState = localCaptureAvailable ? 'available' : 'unavailable';
  const { betaEnabled: liveBetaEnabled, providerConfigured: liveProviderConfigured } =
    liveExperienceAvailability(availability);
  const liveAiState =
    capabilityState === 'loading'
      ? 'checking'
      : !liveBetaEnabled
        ? 'disabled'
        : liveProviderConfigured
          ? 'enabled'
          : 'not configured';
  const existingVideoAiState = capabilityLabel(
    capabilityState,
    Boolean(
      availability.videoProcessing?.characterSwap.available ||
      availability.videoProcessing?.virtualTryOn.available,
    ),
    'not configured',
  );
  const voiceCloudState = capabilityLabel(
    capabilityState,
    availability.elevenLabs,
    'not configured (optional)',
  );
  return {
    systemState:
      capabilityState === 'loading'
        ? 'loading'
        : capabilityState === 'error' || !localCaptureAvailable
          ? 'limited'
          : 'ready',
    systemLabel: systemStatusLabel(capabilityState, localCaptureAvailable),
    localCaptureState,
    liveAiState,
    existingVideoAiState,
    voiceCloudState,
    rows: [
      { id: 'local-capture', label: 'Local capture', state: localCaptureState },
      { id: 'existing-video-ai', label: 'Existing-video AI', state: existingVideoAiState },
      { id: 'live-ai', label: 'Live AI Beta', state: liveAiState },
      { id: 'voice-cloud', label: 'Voice cloud', state: voiceCloudState },
    ],
    footnote: 'Configuration does not verify live provider health.',
  };
};
