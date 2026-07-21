import { useCallback, useEffect, useState } from 'react';
import { fetchProviderAvailability } from '../adapters/api-client/apiClient';
import type { ProviderAvailability } from '../features/media-session';
import type { CapabilityState } from './StudioHeader';

const unavailableProviders: ProviderAvailability = {
  decart: false,
  elevenLabs: false,
  elevenLabsModel: null,
  referenceImages: false,
  referenceImageModel: null,
  referenceImageSizes: [],
  referenceImageOptimizerAvailable: false,
  referenceImageOptimizerModel: null,
  referenceImageOptimizerVersion: null,
};

/**
 * The web and API development servers start concurrently. Give the capability
 * broker a short, bounded window to come online before asking the user to retry.
 */
export const PROVIDER_AVAILABILITY_RETRY_DELAYS_MS = [250, 750, 1_500] as const;

export const useProviderAvailability = () => {
  const [availability, setAvailability] = useState<ProviderAvailability>(unavailableProviders);
  const [state, setState] = useState<CapabilityState>('loading');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let retryTimer: number | null = null;
    let controller: AbortController | null = null;
    setState('loading');

    const check = (attempt: number) => {
      controller = new AbortController();
      fetchProviderAvailability(controller.signal)
        .then((next) => {
          if (!active) return;
          setAvailability(next);
          setState('ready');
        })
        .catch((error: unknown) => {
          if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
          const delay = PROVIDER_AVAILABILITY_RETRY_DELAYS_MS[attempt];
          if (delay !== undefined) {
            retryTimer = window.setTimeout(() => check(attempt + 1), delay);
            return;
          }
          setAvailability(unavailableProviders);
          setState('error');
        });
    };

    check(0);
    return () => {
      active = false;
      controller?.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [revision]);

  const retry = useCallback(() => {
    setState('loading');
    setRevision((value) => value + 1);
  }, []);

  return { availability, state, retry } as const;
};
