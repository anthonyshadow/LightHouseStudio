// @vitest-environment jsdom

import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { CapabilitiesResponse } from '@studio/contracts';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRemoteStateQueryClient } from '../application/remote-state/RemoteStateProvider';
import type { ProviderAvailability } from '../features/media-session';
import {
  PROVIDER_AVAILABILITY_RETRY_DELAYS_MS,
  useProviderAvailability,
} from './useProviderAvailability';
import { providerAvailabilityScenario } from '../test/msw/handlers';
import { mockApiServer } from '../test/msw/server';

const capabilityPayload: CapabilitiesResponse = {
  realtimeVideo: { available: true, betaEnabled: true },
  videoProcessing: {
    characterSwap: {
      available: true,
      inputPreparation: 'h264-mp4',
      referencePolicy: 'required',
      promptInput: 'server-default',
      promptEnhancement: false,
      terminalFailureRelease: 'explicit-user',
      outputResolutions: ['720p', '1080p'],
    },
    virtualTryOn: {
      available: true,
      inputPreparation: 'none',
      referencePolicy: 'optional',
      promptInput: 'editable',
      promptEnhancement: true,
      terminalFailureRelease: 'automatic',
      outputResolutions: ['720p'],
    },
  },
  elevenLabs: { available: true, modelId: 'eleven_multilingual_sts_v2' },
  referenceImages: {
    available: true,
    editAvailable: true,
    providerId: 'openai',
    modelId: 'gpt-image-2',
    sizes: ['1024x1024', '1024x1536', '1536x1024'],
    optimizer: {
      available: true,
      model: 'gpt-5.6',
      version: 'lucy-character-reference-v1',
    },
  },
  wardrobe: { addOutfitAvailable: true },
  savedVideos: { directMultipartUpload: true },
};

const availableProviders: ProviderAvailability = {
  decart: true,
  realtimeBetaEnabled: true,
  realtimeProviderConfigured: true,
  videoProcessing: capabilityPayload.videoProcessing,
  elevenLabs: true,
  elevenLabsModel: 'eleven_multilingual_sts_v2',
  referenceImages: true,
  referenceImageEditAvailable: true,
  referenceImageProvider: 'openai',
  referenceImageModel: 'gpt-image-2',
  referenceImageSizes: ['1024x1024', '1024x1536', '1536x1024'],
  referenceImageOptimizerAvailable: true,
  referenceImageOptimizerModel: 'gpt-5.6',
  referenceImageOptimizerVersion: 'lucy-character-reference-v1',
  wardrobeAddOutfitAvailable: true,
  directSavedVideoUploadAvailable: true,
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createWrapper = () => {
  const client = createRemoteStateQueryClient();
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useProviderAvailability', () => {
  it('recovers from one transient capability failure with one bounded automatic retry', async () => {
    let requests = 0;
    mockApiServer.use(
      providerAvailabilityScenario([{ kind: 'network-error' }, { body: capabilityPayload }], () => {
        requests += 1;
      }),
    );

    const { result, unmount } = renderHook(() => useProviderAvailability(), {
      wrapper: createWrapper(),
    });

    await act(flushPromises);
    expect(requests).toBe(1);

    await act(async () => {
      await vi.runAllTimersAsync();
      await flushPromises();
    });

    expect(requests).toBe(2);
    expect(result.current.state).toBe('ready');
    expect(result.current.availability).toEqual(availableProviders);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(requests).toBe(2);
    unmount();
  });

  it('lets a manual retry recover immediately and cancels the queued automatic retry', async () => {
    let requests = 0;
    mockApiServer.use(
      providerAvailabilityScenario({ kind: 'network-error' }, () => {
        requests += 1;
      }),
    );

    const { result, unmount } = renderHook(() => useProviderAvailability(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await flushPromises();
      await vi.runAllTimersAsync();
      await flushPromises();
    });
    expect(requests).toBe(PROVIDER_AVAILABILITY_RETRY_DELAYS_MS.length + 1);
    expect(result.current.state).toBe('error');

    mockApiServer.use(
      providerAvailabilityScenario({ body: capabilityPayload }, () => {
        requests += 1;
      }),
    );
    await act(async () => {
      result.current.retry();
      await vi.runAllTimersAsync();
      await flushPromises();
    });

    expect(requests).toBe(PROVIDER_AVAILABILITY_RETRY_DELAYS_MS.length + 2);
    expect(result.current.state).toBe('ready');
    expect(result.current.availability.decart).toBe(true);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(requests).toBe(PROVIDER_AVAILABILITY_RETRY_DELAYS_MS.length + 2);
    unmount();
  });
});
