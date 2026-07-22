// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  PublicVoiceItem,
  PublicVoicePage,
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

const emptyPublicPage = (overrides: Partial<PublicVoicePage> = {}): PublicVoicePage => ({
  voices: [],
  hasMore: false,
  nextPageToken: null,
  total: 0,
  ...overrides,
});

const publicVoice: PublicVoiceItem = {
  kind: 'public',
  voice: {
    voiceId: 'public-voice',
    publicOwnerId: 'public-owner',
    name: 'Studio Narrator',
    category: 'professional',
    description: 'A measured narration voice.',
    labels: { accent: 'neutral' },
    previewAvailable: true,
  },
};

const createClient = (): VoiceLibraryClient => ({
  listWorkspaceVoices: vi.fn().mockResolvedValue(emptyWorkspacePage()),
  listPublicVoices: vi.fn().mockResolvedValue(emptyPublicPage()),
  importPublicVoice: vi.fn().mockResolvedValue('workspace-voice'),
});

describe('useVoiceLibrary', () => {
  it('loads and searches workspace voices through the injected client', async () => {
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

  it('imports a public voice explicitly, selects the workspace copy, and reports success', async () => {
    const client = createClient();
    vi.mocked(client.listPublicVoices).mockResolvedValue(
      emptyPublicPage({ voices: [publicVoice] }),
    );
    const { result } = renderHook(() => useVoiceLibrary(client));

    act(() => result.current.changeKind('public'));
    await waitFor(() => expect(result.current.voices).toEqual([publicVoice]));

    let importedVoice: WorkspaceVoiceItem | null = null;
    await act(async () => {
      importedVoice = await result.current.importVoice(publicVoice);
    });

    expect(client.importPublicVoice).toHaveBeenCalledWith(publicVoice, expect.any(AbortSignal));
    const workspaceVoice: WorkspaceVoiceItem = {
      kind: 'workspace',
      voice: {
        voiceId: 'workspace-voice',
        name: publicVoice.voice.name,
        category: publicVoice.voice.category,
        description: publicVoice.voice.description,
        labels: publicVoice.voice.labels,
        previewAvailable: publicVoice.voice.previewAvailable,
      },
    };
    expect(importedVoice).toEqual(workspaceVoice);
    expect(result.current.kind).toBe('workspace');
    expect(result.current.selected).toEqual(workspaceVoice);
    expect(result.current.importSuccess).toContain('imported and is selected');
  });

  it('returns null without selecting a voice when a public import fails', async () => {
    const client = createClient();
    vi.mocked(client.importPublicVoice).mockRejectedValue(new Error('Voice capacity reached.'));
    const { result } = renderHook(() => useVoiceLibrary(client));

    await waitFor(() => expect(result.current.loading).toBe(false));

    let importedVoice: WorkspaceVoiceItem | null = null;
    await act(async () => {
      importedVoice = await result.current.importVoice(publicVoice);
    });

    expect(importedVoice).toBeNull();
    expect(result.current.selected).toBeNull();
    expect(result.current.error).toBe('Voice capacity reached.');
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
