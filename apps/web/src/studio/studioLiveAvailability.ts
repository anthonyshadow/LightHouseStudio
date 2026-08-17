import type { ProviderAvailability } from '../features/media-session';

/**
 * The single owner of whether Live AI is offered. Three independent facts have to agree — the beta
 * flag, a configured realtime provider, and the Decart capability — and the header's per-reason
 * status copy reads the same parts the gate does, so the two cannot drift apart.
 */
export const liveExperienceAvailability = (availability: ProviderAvailability) => {
  const betaEnabled = availability.realtimeBetaEnabled === true;
  const providerConfigured = availability.realtimeProviderConfigured ?? availability.decart;
  return {
    betaEnabled,
    providerConfigured,
    enabled: betaEnabled && providerConfigured && availability.decart,
  } as const;
};
