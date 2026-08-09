// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createEmptyCreativeAssetStore } from '@studio/domain';
import { createCreativeAssetRepository } from './repository';
import { useCreativeLibraryCloudSync } from './useCreativeLibraryCloudSync';
import { captureRequests, jsonScenario, serverConflictScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';

const addPrompt = (title: string) => {
  const repository = createCreativeAssetRepository({ storage: null });
  void repository.createSavedPrompt({
    title,
    prompt: `${title} prompt`,
    modelModeId: 'lucy-vton-latest',
  });
  return repository;
};

describe('useCreativeLibraryCloudSync', () => {
  it('backfills an empty cloud and pauses safely on a later server conflict', async () => {
    const repository = addPrompt('Local look');
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/creative-library',
        { body: { revision: 0, store: createEmptyCreativeAssetStore() } },
        observe,
      ),
      jsonScenario('PUT', '/api/creative-library', { body: { revision: 1 } }, observe),
    );

    const rendered = renderHook(() => useCreativeLibraryCloudSync(repository));

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.method).toBe('PUT');
    await expect(requests[1]!.json()).resolves.toMatchObject({
      expectedRevision: 0,
      store: { savedPrompts: [{ title: 'Local look' }] },
    });
    expect(repository.getSnapshot().notice).toBeNull();

    mockApiServer.use(serverConflictScenario('PUT', '/api/creative-library'));
    await repository.createSavedPrompt({
      title: 'Conflicting look',
      prompt: 'Conflicting look prompt',
      modelModeId: 'lucy-vton-latest',
    });
    await waitFor(() =>
      expect(repository.getSnapshot().notice).toContain('another session changed the library'),
    );
    expect(repository.getSnapshot().store.savedPrompts).toHaveLength(2);
    rendered.unmount();
  });

  it('preserves the browser copy and pauses when both sides contain different data', async () => {
    const repository = addPrompt('Browser look');
    const remoteRepository = addPrompt('Cloud look');
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/creative-library',
        { body: { revision: 4, store: remoteRepository.getSnapshot().store } },
        observe,
      ),
    );

    const rendered = renderHook(() => useCreativeLibraryCloudSync(repository));

    await act(async () => Promise.resolve());
    await waitFor(() =>
      expect(repository.getSnapshot().notice).toContain('local copy was preserved'),
    );
    expect(repository.getSnapshot().store.savedPrompts[0]?.title).toBe('Browser look');
    expect(requests).toHaveLength(1);
    rendered.unmount();
  });
});
