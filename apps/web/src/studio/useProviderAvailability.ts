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
};

export const useProviderAvailability = () => {
  const [availability, setAvailability] = useState<ProviderAvailability>(unavailableProviders);
  const [state, setState] = useState<CapabilityState>('loading');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    fetchProviderAvailability(controller.signal)
      .then((next) => {
        setAvailability(next);
        setState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setAvailability(unavailableProviders);
        setState('error');
      });
    return () => controller.abort();
  }, [revision]);

  const retry = useCallback(() => {
    setState('loading');
    setRevision((value) => value + 1);
  }, []);

  return { availability, state, retry } as const;
};
