// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
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

    const rendered = renderHook(() =>
      useCreativeLibraryCloudSync(repository, { initializeEmptyRemoteFromLocal: true }),
    );

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.method).toBe('PUT');
    await expect(requests[1]!.json()).resolves.toMatchObject({
      expectedRevision: 0,
      store: { savedPrompts: [{ title: 'Local look' }] },
    });
    expect(rendered.result.current.status).toEqual({ state: 'idle' });

    mockApiServer.use(serverConflictScenario('PUT', '/api/creative-library'));
    await repository.createSavedPrompt({
      title: 'Conflicting look',
      prompt: 'Conflicting look prompt',
      modelModeId: 'lucy-vton-latest',
    });
    await waitFor(() =>
      expect(rendered.result.current.status).toMatchObject({
        state: 'paused',
        reason: 'conflict',
      }),
    );
    expect(repository.getSnapshot().store.savedPrompts).toHaveLength(2);
    rendered.unmount();
  });

  it('clears stale local data when empty remote initialization is disabled', async () => {
    const repository = addPrompt('Stale development look');
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/creative-library',
        { body: { revision: 0, store: createEmptyCreativeAssetStore() } },
        observe,
      ),
    );

    const rendered = renderHook(() => useCreativeLibraryCloudSync(repository));

    await waitFor(() => expect(repository.getSnapshot().store.savedPrompts).toEqual([]));
    expect(requests).toHaveLength(1);
    expect(rendered.result.current.status).toEqual({ state: 'idle' });
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
      expect(rendered.result.current.status).toMatchObject({
        state: 'paused',
        reason: 'diverged',
      }),
    );
    expect(repository.getSnapshot().store.savedPrompts[0]?.title).toBe('Browser look');
    expect(requests).toHaveLength(1);
    rendered.unmount();
  });

  it('pushes the browser copy over the cloud on keep-local, against a freshly read revision', async () => {
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
      jsonScenario('PUT', '/api/creative-library', { body: { revision: 5 } }, observe),
    );

    const rendered = renderHook(() => useCreativeLibraryCloudSync(repository));
    await waitFor(() =>
      expect(rendered.result.current.status).toMatchObject({ state: 'paused', reason: 'diverged' }),
    );

    act(() => rendered.result.current.keepLocal());

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[1]!.method).toBe('GET');
    expect(requests[2]!.method).toBe('PUT');
    // The revision it paused holding is the one the server already rejected; only a fresh read works.
    await expect(requests[2]!.json()).resolves.toMatchObject({
      expectedRevision: 4,
      store: { savedPrompts: [{ title: 'Browser look' }] },
    });
    await waitFor(() => expect(rendered.result.current.status).toEqual({ state: 'idle' }));
    expect(repository.getSnapshot().store.savedPrompts[0]?.title).toBe('Browser look');
    rendered.unmount();
  });

  it('adopts the cloud copy on keep-cloud and resumes syncing', async () => {
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
    await waitFor(() =>
      expect(rendered.result.current.status).toMatchObject({ state: 'paused', reason: 'diverged' }),
    );

    act(() => rendered.result.current.keepCloud());

    await waitFor(() =>
      expect(repository.getSnapshot().store.savedPrompts[0]?.title).toBe('Cloud look'),
    );
    await waitFor(() => expect(rendered.result.current.status).toEqual({ state: 'idle' }));
    expect(requests).toHaveLength(2);
    rendered.unmount();
  });

  it('keeps mirroring after the library is replaced from an exported file', async () => {
    const repository = addPrompt('Local look');
    const imported = createCreativeAssetRepository({ storage: null });
    await imported.createSavedPrompt({
      title: 'Imported look',
      prompt: 'Imported look prompt',
      modelModeId: 'lucy-vton-latest',
    });
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/creative-library',
        { body: { revision: 0, store: createEmptyCreativeAssetStore() } },
        observe,
      ),
      jsonScenario(
        'PUT',
        '/api/creative-library',
        [{ body: { revision: 1 } }, { body: { revision: 2 } }],
        observe,
      ),
    );

    const rendered = renderHook(() =>
      useCreativeLibraryCloudSync(repository, { initializeEmptyRemoteFromLocal: true }),
    );
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(rendered.result.current.mirror).toBe('cloud');

    // Exactly what an import does: the repository's whole-store replace, nothing sync-specific.
    await repository.replaceFromRemote!(imported.getSnapshot().store);

    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]!.method).toBe('PUT');
    await expect(requests[2]!.json()).resolves.toMatchObject({
      expectedRevision: 1,
      store: { savedPrompts: [{ title: 'Imported look' }] },
    });
    expect(rendered.result.current.status).toEqual({ state: 'idle' });
    rendered.unmount();
  });

  it('reports a browser-only library when the deployment registers no cloud route', async () => {
    const repository = addPrompt('Local look');
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/creative-library',
        { body: { error: { code: 'not_found', message: 'Unknown route.' } }, status: 404 },
        observe,
      ),
    );

    const rendered = renderHook(() => useCreativeLibraryCloudSync(repository));

    // Idle means "nothing is wrong", not "there is a cloud copy" — only the mirror answers that.
    await waitFor(() => expect(rendered.result.current.mirror).toBe('browser-only'));
    expect(rendered.result.current.status).toEqual({ state: 'idle' });
    expect(repository.getSnapshot().store.savedPrompts).toHaveLength(1);
    expect(requests).toHaveLength(1);
    rendered.unmount();
  });

  it('recovers from an unavailable server when the operator retries', async () => {
    const repository = addPrompt('Browser look');
    const { requests, observe } = captureRequests();
    mockApiServer.use(http.get('*/api/creative-library', () => HttpResponse.error()));

    const rendered = renderHook(() => useCreativeLibraryCloudSync(repository));
    await waitFor(() =>
      expect(rendered.result.current.status).toMatchObject({
        state: 'paused',
        reason: 'unavailable',
      }),
    );

    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/creative-library',
        { body: { revision: 0, store: createEmptyCreativeAssetStore() } },
        observe,
      ),
      jsonScenario('PUT', '/api/creative-library', { body: { revision: 1 } }, observe),
    );
    act(() => rendered.result.current.retry());

    await waitFor(() => expect(rendered.result.current.status).toEqual({ state: 'idle' }));
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe('GET');

    // The subscription is live again, so an ordinary local edit reaches the cloud.
    await repository.createSavedPrompt({
      title: 'After recovery',
      prompt: 'After recovery prompt',
      modelModeId: 'lucy-vton-latest',
    });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]!.method).toBe('PUT');
    rendered.unmount();
  });
});
