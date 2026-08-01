import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { listWorkspaceVoices } from '../../adapters/api-client/voicesApi';
import type { VoiceLibraryItem, WorkspaceVoicePage } from '../../application/types';

export type VoiceLibraryClient = {
  listWorkspaceVoices: (
    search: string,
    pageToken: string | null,
    signal: AbortSignal,
  ) => Promise<WorkspaceVoicePage>;
};

const defaultVoiceLibraryClient: VoiceLibraryClient = {
  listWorkspaceVoices,
};

export const useVoiceLibrary = (client: VoiceLibraryClient = defaultVoiceLibraryClient) => {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [voices, setVoices] = useState<VoiceLibraryItem[]>([]);
  const [selected, setSelected] = useState<VoiceLibraryItem | null>(null);
  const [settledRequest, setSettledRequest] = useState<object | null>(null);
  const [pageError, setPageError] = useState<{ request: object; message: string } | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [workspaceTokens, setWorkspaceTokens] = useState<Array<string | null>>([null]);
  const [workspaceIndex, setWorkspaceIndex] = useState(0);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const request = useMemo(
    () => ({
      client,
      revision,
      search,
      workspaceIndex,
      workspacePageToken: workspaceTokens[workspaceIndex] ?? null,
    }),
    [client, revision, search, workspaceIndex, workspaceTokens],
  );
  const loading = settledRequest !== request;
  const error = interactionError ?? (pageError?.request === request ? pageError.message : null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const page = await request.client.listWorkspaceVoices(
          request.search,
          request.workspacePageToken,
          controller.signal,
        );
        setVoices(page.voices);
        setHasMore(page.hasMore);
        setNextToken(page.nextPageToken);
        setPageError(null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setVoices([]);
        setHasMore(false);
        setNextToken(null);
        setPageError({
          request,
          message: caught instanceof Error ? caught.message : 'Voices could not be loaded.',
        });
      } finally {
        if (!controller.signal.aborted) setSettledRequest(request);
      }
    };
    void load();
    return () => controller.abort();
  }, [request]);

  const applySearch = (nextSearch: string) => {
    setWorkspaceTokens([null]);
    setWorkspaceIndex(0);
    setQuery(nextSearch);
    setSearch(nextSearch.trim());
    setInteractionError(null);
    setRevision((value) => value + 1);
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    applySearch(query);
  };

  const next = () => {
    if (nextToken) {
      setWorkspaceTokens((current) => [...current.slice(0, workspaceIndex + 1), nextToken]);
      setWorkspaceIndex((value) => value + 1);
    }
  };

  const previous = () => {
    setWorkspaceIndex((value) => Math.max(0, value - 1));
  };

  const refresh = () => setRevision((value) => value + 1);
  const resetSearch = () => {
    setQuery('');
    setSearch('');
    setWorkspaceTokens([null]);
    setWorkspaceIndex(0);
    setInteractionError(null);
    setRevision((value) => value + 1);
  };
  const setError = (nextError: string | null) => {
    setInteractionError(nextError);
    if (nextError === null) setPageError(null);
  };

  return {
    query,
    search,
    voices,
    selected,
    loading,
    error,
    hasMore,
    previousDisabled: workspaceIndex === 0,
    setQuery,
    setSelected,
    setError,
    applySearch,
    submitSearch,
    next,
    previous,
    refresh,
    resetSearch,
  } as const;
};
