// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderAvailability } from '../features/media-session';
import {
  PROVIDER_AVAILABILITY_RETRY_DELAYS_MS,
  useProviderAvailability,
} from './useProviderAvailability';

const fetchProviderAvailability = vi.hoisted(() => vi.fn());

vi.mock('../adapters/api-client/apiClient', () => ({
  fetchProviderAvailability,
}));

const availableProviders: ProviderAvailability = {
  decart: true,
  elevenLabs: true,
  elevenLabsModel: 'eleven_multilingual_sts_v2',
  referenceImages: true,
  referenceImageModel: 'gpt-image-2',
  referenceImageSizes: ['1024x1024', '1024x1536', '1536x1024'],
  referenceImageOptimizerAvailable: true,
  referenceImageOptimizerModel: 'gpt-5.6',
  referenceImageOptimizerVersion: 'lucy-character-reference-v1',
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  fetchProviderAvailability.mockReset();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useProviderAvailability', () => {
  it('recovers from one transient capability failure with one bounded automatic retry', async () => {
    fetchProviderAvailability
      .mockRejectedValueOnce(new TypeError('API is still starting'))
      .mockResolvedValueOnce(availableProviders);

    const { result, unmount } = renderHook(() => useProviderAvailability());

    await act(flushPromises);
    expect(fetchProviderAvailability).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.runAllTimersAsync();
      await flushPromises();
    });

    expect(fetchProviderAvailability).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('ready');
    expect(result.current.availability).toEqual(availableProviders);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(fetchProviderAvailability).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('lets a manual retry recover immediately and cancels the queued automatic retry', async () => {
    fetchProviderAvailability.mockRejectedValue(new TypeError('Capability request failed'));

    const { result, unmount } = renderHook(() => useProviderAvailability());

    await act(async () => {
      await flushPromises();
      await vi.runAllTimersAsync();
      await flushPromises();
    });
    expect(fetchProviderAvailability).toHaveBeenCalledTimes(
      PROVIDER_AVAILABILITY_RETRY_DELAYS_MS.length + 1,
    );
    expect(result.current.state).toBe('error');

    fetchProviderAvailability.mockResolvedValueOnce(availableProviders);
    act(() => result.current.retry());
    await act(flushPromises);

    expect(fetchProviderAvailability).toHaveBeenCalledTimes(
      PROVIDER_AVAILABILITY_RETRY_DELAYS_MS.length + 2,
    );
    expect(result.current.state).toBe('ready');
    expect(result.current.availability.decart).toBe(true);

    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(fetchProviderAvailability).toHaveBeenCalledTimes(
      PROVIDER_AVAILABILITY_RETRY_DELAYS_MS.length + 2,
    );
    unmount();
  });
});
