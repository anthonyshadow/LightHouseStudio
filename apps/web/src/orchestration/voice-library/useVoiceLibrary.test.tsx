// @vitest-environment jsdom

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteStateQueryClient } from '../../application/remote-state/RemoteStateProvider';
import type {
  SharedVoiceItem,
  WorkspaceVoiceItem,
  WorkspaceVoicePage,
} from '../../application/types';
import { useVoiceLibrary, type VoiceLibraryClient } from './useVoiceLibrary';

const emptyWorkspacePage = (overrides: Partial<WorkspaceVoicePage> = {}): WorkspaceVoicePage => ({
  voices: [],
  hasMore: false,
  nextPageToken: null,
  total: 0,
  ...overrides,
});

const createClient = (): VoiceLibraryClient => ({
  listWorkspaceVoices: vi.fn().mockResolvedValue(emptyWorkspacePage()),
  listSharedVoices: vi.fn().mockResolvedValue({
    voices: [],
    hasMore: false,
    page: 0,
    total: 0,
  }),
  saveSharedVoice: vi.fn().mockResolvedValue({ status: 'saved', voiceId: 'shared-one' }),
  removeWorkspaceVoice: vi.fn().mockResolvedValue({ status: 'removed', voiceId: 'voice-one' }),
});

const savedVoice: WorkspaceVoiceItem = {
  kind: 'workspace',
  voice: {
    voiceId: 'northstar',
    name: 'Northstar',
    category: 'professional',
    description: 'Grounded narration',
    labels: {},
    traits: {
      language: 'en',
      gender: 'female',
      age: 'middle-aged',
      accent: 'Canadian',
      useCase: 'narration',
      descriptive: 'grounded',
    },
    previewAvailable: true,
    removable: true,
  },
};

const secondSavedVoice: WorkspaceVoiceItem = {
  ...savedVoice,
  voice: {
    ...savedVoice.voice,
    voiceId: 'daybreak',
    name: 'Daybreak',
  },
};

const sharedVoice: SharedVoiceItem = {
  kind: 'shared',
  voice: {
    ...savedVoice.voice,
    publicOwnerId: 'owner-one',
    saved: false,
  },
};

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const queryClients: QueryClient[] = [];

const renderVoiceLibrary = (client: VoiceLibraryClient) => {
  const queryClient = createRemoteStateQueryClient();
  queryClients.push(queryClient);
  return renderHook(() => useVoiceLibrary(client), {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
};

afterEach(async () => {
  cleanup();
  for (const queryClient of queryClients.splice(0)) queryClient.clear();
  if (vi.isFakeTimers()) await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

describe('useVoiceLibrary', () => {
  it('debounces searches for 300 ms after the third character', async () => {
    vi.useFakeTimers();
    const client = createClient();
    const { result } = renderVoiceLibrary(client);
    await act(() => Promise.resolve());

    expect(client.listWorkspaceVoices).toHaveBeenCalledTimes(1);
    act(() => result.current.setQuery('na'));
    expect(result.current.searchHint).toBe('Type at least 3 characters to search.');
    await act(async () => vi.advanceTimersByTimeAsync(400));
    expect(client.listWorkspaceVoices).toHaveBeenCalledTimes(1);

    act(() => result.current.setQuery('  narrator  '));
    await act(async () => vi.advanceTimersByTimeAsync(299));
    expect(client.listWorkspaceVoices).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(client.listWorkspaceVoices).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'narrator' }),
      null,
      expect.any(AbortSignal),
      false,
    );
  });

  it('applies clearing immediately and keeps the last settled page for short searches', async () => {
    vi.useFakeTimers();
    const client = createClient();
    vi.mocked(client.listWorkspaceVoices).mockResolvedValue(
      emptyWorkspacePage({ voices: [savedVoice] }),
    );
    const { result } = renderVoiceLibrary(client);
    await act(() => Promise.resolve());

    act(() => result.current.setQuery('north'));
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(result.current.voices).toEqual([savedVoice]);
    act(() => result.current.setQuery('no'));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(result.current.voices).toEqual([savedVoice]);

    act(() => result.current.setQuery(''));
    await act(() => Promise.resolve());
    expect(result.current.criteria.search).toBe('');
    expect(result.current.searchHint).toBeNull();
  });

  it('aborts an active library request when the owner unmounts', async () => {
    let requestSignal: AbortSignal | undefined;
    const client = createClient();
    vi.mocked(client.listWorkspaceVoices).mockImplementation((_criteria, _token, signal) => {
      requestSignal = signal;
      return new Promise<WorkspaceVoicePage>(() => undefined);
    });
    const { unmount } = renderVoiceLibrary(client);

    await waitFor(() => expect(requestSignal).toBeDefined());
    unmount();

    expect(requestSignal?.aborted).toBe(true);
  });

  it('ignores an older response after criteria start a newer request', async () => {
    const first = deferred<WorkspaceVoicePage>();
    const second = deferred<WorkspaceVoicePage>();
    const client = createClient();
    vi.mocked(client.listWorkspaceVoices)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderVoiceLibrary(client);

    await waitFor(() => expect(client.listWorkspaceVoices).toHaveBeenCalledTimes(1));
    act(() => result.current.setFilter('language', 'en'));
    await waitFor(() => expect(client.listWorkspaceVoices).toHaveBeenCalledTimes(2));

    await act(async () => {
      second.resolve(emptyWorkspacePage({ voices: [secondSavedVoice] }));
      await second.promise;
    });
    await waitFor(() => expect(result.current.voices).toEqual([secondSavedVoice]));

    await act(async () => {
      first.resolve(emptyWorkspacePage({ voices: [savedVoice] }));
      await first.promise;
    });
    expect(result.current.voices).toEqual([secondSavedVoice]);
  });

  it('reuses a cached Saved page when paging backward', async () => {
    const client = createClient();
    vi.mocked(client.listWorkspaceVoices)
      .mockResolvedValueOnce(
        emptyWorkspacePage({
          voices: [savedVoice],
          hasMore: true,
          nextPageToken: 'page-two',
        }),
      )
      .mockResolvedValueOnce(emptyWorkspacePage({ voices: [secondSavedVoice] }));
    const { result } = renderVoiceLibrary(client);

    await waitFor(() => expect(result.current.voices).toEqual([savedVoice]));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.voices).toEqual([secondSavedVoice]));
    act(() => result.current.previous());
    await waitFor(() => expect(result.current.voices).toEqual([savedVoice]));

    expect(client.listWorkspaceVoices).toHaveBeenCalledTimes(2);
  });

  it('preserves the chosen voice and each tab state while results change', async () => {
    const client = createClient();
    vi.mocked(client.listWorkspaceVoices).mockResolvedValue(
      emptyWorkspacePage({ voices: [savedVoice], total: 1 }),
    );
    const { result } = renderVoiceLibrary(client);

    await waitFor(() => expect(result.current.voices).toEqual([savedVoice]));
    act(() => result.current.setSelected(savedVoice));
    act(() => result.current.setFilter('language', 'en'));
    act(() => result.current.setTab('browse'));
    await waitFor(() => expect(result.current.tab).toBe('browse'));
    act(() => result.current.setFilter('gender', 'female'));
    act(() => result.current.setTab('saved'));

    expect(result.current.criteria.language).toBe('en');
    expect(result.current.selected).toEqual(savedVoice);
  });

  it('updates catalog metadata and invalidates saved pages after adding a voice', async () => {
    const client = createClient();
    vi.mocked(client.listSharedVoices).mockResolvedValue({
      voices: [sharedVoice],
      hasMore: false,
      page: 0,
      total: 1,
    });
    const { result } = renderVoiceLibrary(client);
    await waitFor(() => expect(client.listWorkspaceVoices).toHaveBeenCalledOnce());

    act(() => result.current.setTab('browse'));
    await waitFor(() => expect(result.current.voices).toEqual([sharedVoice]));
    await act(async () => {
      await expect(result.current.addVoice(sharedVoice)).resolves.toBe(true);
    });

    expect(client.saveSharedVoice).toHaveBeenCalledWith(sharedVoice, expect.any(AbortSignal));
    expect(result.current.voices[0]).toMatchObject({ kind: 'shared', voice: { saved: true } });
    act(() => result.current.setTab('saved'));
    await waitFor(() => expect(client.listWorkspaceVoices).toHaveBeenCalledTimes(2));
  });
});
