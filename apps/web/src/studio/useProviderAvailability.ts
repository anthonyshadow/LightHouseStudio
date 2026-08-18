import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchProviderAvailability } from '../adapters/api-client/apiClient';
import type { ProviderAvailability } from '../features/media-session';
import type { CapabilityState } from './StudioHeader';

const unavailableProviders: ProviderAvailability = {
  decart: false,
  realtimeBetaEnabled: false,
  realtimeProviderConfigured: false,
  videoProcessing: {
    characterSwap: {
      available: false,
      inputPreparation: 'none',
      referencePolicy: 'optional',
      promptInput: 'editable',
      promptEnhancement: false,
      terminalFailureRelease: 'automatic',
      outputResolutions: ['720p'],
    },
    virtualTryOn: {
      available: false,
      inputPreparation: 'none',
      referencePolicy: 'optional',
      promptInput: 'editable',
      promptEnhancement: false,
      terminalFailureRelease: 'automatic',
      outputResolutions: ['720p'],
    },
  },
  elevenLabs: false,
  elevenLabsModel: null,
  referenceImages: false,
  referenceImageEditAvailable: false,
  referenceImageProvider: null,
  referenceImageModel: null,
  referenceImageSizes: [],
  referenceImageOptimizerAvailable: false,
  referenceImageOptimizerModel: null,
  referenceImageOptimizerVersion: null,
  wardrobeAddOutfitAvailable: false,
  directSavedVideoUploadAvailable: false,
};

/**
 * The web and API development servers start concurrently. Give the capability
 * broker a short, bounded window to come online before asking the user to retry.
 */
export const PROVIDER_AVAILABILITY_RETRY_DELAYS_MS = [250, 750, 1_500] as const;

export const useProviderAvailability = () => {
  const query = useQuery({
    queryKey: ['provider-availability'],
    queryFn: ({ signal }) => fetchProviderAvailability(signal),
    // This authenticated configuration read is local, non-billable, and safe to retry while the
    // concurrently started API becomes ready. Provider-facing reads retain the global no-retry default.
    retry: PROVIDER_AVAILABILITY_RETRY_DELAYS_MS.length,
    retryDelay: (attempt) => PROVIDER_AVAILABILITY_RETRY_DELAYS_MS[attempt] ?? 0,
  });
  const state: CapabilityState = query.isFetching ? 'loading' : query.isError ? 'error' : 'ready';

  const refetch = query.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);
  const availability = query.data ?? unavailableProviders;

  // Stable across renders: the shell passes this to every authenticated surface.
  return useMemo(() => ({ availability, state, retry }) as const, [availability, retry, state]);
};
