// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceVoicePage } from '../../application/types';
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
});

describe('useVoiceLibrary', () => {
  it('loads and searches saved voices through the injected client', async () => {
    const client = createClient();
    const { result } = renderHook(() => useVoiceLibrary(client));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(client.listWorkspaceVoices).toHaveBeenCalledWith('', null, expect.any(AbortSignal));

    act(() => result.current.setQuery('  narrator  '));
    act(() => result.current.submitSearch({ preventDefault: vi.fn() } as never));

    await waitFor(() =>
      expect(client.listWorkspaceVoices).toHaveBeenLastCalledWith(
        'narrator',
        null,
        expect.any(AbortSignal),
      ),
    );
  });

  it('aborts an active library request when the owner unmounts', async () => {
    let requestSignal: AbortSignal | undefined;
    const client = createClient();
    vi.mocked(client.listWorkspaceVoices).mockImplementation((_search, _token, signal) => {
      requestSignal = signal;
      return new Promise<WorkspaceVoicePage>(() => undefined);
    });
    const { unmount } = renderHook(() => useVoiceLibrary(client));

    await waitFor(() => expect(requestSignal).toBeDefined());
    unmount();

    expect(requestSignal?.aborted).toBe(true);
  });
});
