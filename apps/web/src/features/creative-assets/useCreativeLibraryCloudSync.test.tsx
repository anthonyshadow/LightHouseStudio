// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCreativeAssetStore } from '@studio/domain';
import { createCreativeAssetRepository } from './repository';
import { useCreativeLibraryCloudSync } from './useCreativeLibraryCloudSync';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const addPrompt = (title: string) => {
  const repository = createCreativeAssetRepository({ storage: null });
  void repository.createSavedPrompt({
    title,
    prompt: `${title} prompt`,
    modelModeId: 'lucy-vton-latest',
  });
  return repository;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useCreativeLibraryCloudSync', () => {
  it('backfills a non-empty local library when the cloud revision is empty', async () => {
    const repository = addPrompt('Local look');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ revision: 0, store: createEmptyCreativeAssetStore() }))
      .mockResolvedValueOnce(jsonResponse({ revision: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const rendered = renderHook(() => useCreativeLibraryCloudSync(repository));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(request.method).toBe('PUT');
    expect(typeof request.body).toBe('string');
    if (typeof request.body !== 'string') throw new Error('Expected a JSON request body.');
    expect(JSON.parse(request.body)).toMatchObject({
      expectedRevision: 0,
      store: { savedPrompts: [{ title: 'Local look' }] },
    });
    expect(repository.getSnapshot().notice).toBeNull();
    rendered.unmount();
  });

  it('preserves the browser copy and pauses when both sides contain different data', async () => {
    const repository = addPrompt('Browser look');
    const remoteRepository = addPrompt('Cloud look');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ revision: 4, store: remoteRepository.getSnapshot().store }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const rendered = renderHook(() => useCreativeLibraryCloudSync(repository));

    await act(async () => Promise.resolve());
    await waitFor(() =>
      expect(repository.getSnapshot().notice).toContain('local copy was preserved'),
    );
    expect(repository.getSnapshot().store.savedPrompts[0]?.title).toBe('Browser look');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });
});
