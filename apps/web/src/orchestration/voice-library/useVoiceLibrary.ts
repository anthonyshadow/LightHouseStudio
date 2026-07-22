import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  importPublicVoice,
  listPublicVoices,
  listWorkspaceVoices,
} from '../../adapters/api-client/voicesApi';
import type {
  PublicVoiceItem,
  PublicVoicePage,
  VoiceLibraryItem,
  VoiceLibraryKind,
  WorkspaceVoiceItem,
  WorkspaceVoicePage,
} from '../../application/types';

export type VoiceLibraryClient = {
  listWorkspaceVoices: (
    search: string,
    pageToken: string | null,
    signal: AbortSignal,
  ) => Promise<WorkspaceVoicePage>;
  listPublicVoices: (search: string, page: number, signal: AbortSignal) => Promise<PublicVoicePage>;
  importPublicVoice: (voice: PublicVoiceItem, signal: AbortSignal) => Promise<string>;
};

const defaultVoiceLibraryClient: VoiceLibraryClient = {
  listWorkspaceVoices,
  listPublicVoices,
  importPublicVoice,
};

export const useVoiceLibrary = (client: VoiceLibraryClient = defaultVoiceLibraryClient) => {
  const [kind, setKind] = useState<VoiceLibraryKind>('workspace');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [voices, setVoices] = useState<VoiceLibraryItem[]>([]);
  const [selected, setSelected] = useState<VoiceLibraryItem | null>(null);
  const [settledRequest, setSettledRequest] = useState<object | null>(null);
  const [pageError, setPageError] = useState<{ request: object; message: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [workspaceTokens, setWorkspaceTokens] = useState<Array<string | null>>([null]);
  const [workspaceIndex, setWorkspaceIndex] = useState(0);
  const [publicPage, setPublicPage] = useState(0);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [importingVoiceKey, setImportingVoiceKey] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const request = useMemo(
    () => ({
      client,
      kind,
      publicPage,
      revision,
      search,
      workspaceIndex,
      workspacePageToken: workspaceTokens[workspaceIndex] ?? null,
    }),
    [client, kind, publicPage, revision, search, workspaceIndex, workspaceTokens],
  );
  const loading = settledRequest !== request;
  const error = actionError ?? (pageError?.request === request ? pageError.message : null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const page =
          request.kind === 'workspace'
            ? await request.client.listWorkspaceVoices(
                request.search,
                request.workspacePageToken,
                controller.signal,
              )
            : await request.client.listPublicVoices(
                request.search,
                request.publicPage,
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

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setWorkspaceTokens([null]);
    setWorkspaceIndex(0);
    setPublicPage(0);
    setSearch(query.trim());
    setSelected(null);
    setImportSuccess(null);
    setRevision((value) => value + 1);
  };

  const changeKind = (nextKind: VoiceLibraryKind) => {
    setKind(nextKind);
    setSelected(null);
    setImportSuccess(null);
  };

  const next = () => {
    setSelected(null);
    if (kind === 'workspace' && nextToken) {
      setWorkspaceTokens((current) => [...current.slice(0, workspaceIndex + 1), nextToken]);
      setWorkspaceIndex((value) => value + 1);
    } else if (kind === 'public' && hasMore) {
      setPublicPage((value) => value + 1);
    }
  };

  const previous = () => {
    setSelected(null);
    if (kind === 'workspace') setWorkspaceIndex((value) => Math.max(0, value - 1));
    else setPublicPage((value) => Math.max(0, value - 1));
  };

  const importVoice = async (item: PublicVoiceItem): Promise<WorkspaceVoiceItem | null> => {
    importAbortRef.current?.abort();
    const controller = new AbortController();
    const { voice } = item;
    const voiceKey = `${voice.publicOwnerId}:${voice.voiceId}`;
    importAbortRef.current = controller;
    setImportingVoiceKey(voiceKey);
    setImportSuccess(null);
    setActionError(null);
    try {
      const voiceId = await client.importPublicVoice(item, controller.signal);
      controller.signal.throwIfAborted();
      if (importAbortRef.current !== controller) return null;
      const importedVoice: WorkspaceVoiceItem = {
        kind: 'workspace',
        voice: {
          voiceId,
          name: voice.name,
          category: voice.category,
          description: voice.description,
          labels: voice.labels,
          previewAvailable: voice.previewAvailable,
        },
      };
      setSelected(importedVoice);
      setKind('workspace');
      setWorkspaceTokens([null]);
      setWorkspaceIndex(0);
      setImportSuccess(`${voice.name} was imported and is selected for this take.`);
      return importedVoice;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return null;
      setActionError(
        caught instanceof Error ? caught.message : 'The public voice could not be imported.',
      );
      return null;
    } finally {
      if (importAbortRef.current === controller) {
        importAbortRef.current = null;
        setImportingVoiceKey(null);
      }
    }
  };

  useEffect(
    () => () => {
      importAbortRef.current?.abort();
      importAbortRef.current = null;
    },
    [],
  );

  const refresh = () => setRevision((value) => value + 1);
  const clearError = (nextError: string | null) => {
    setActionError(nextError);
    if (nextError === null) setPageError(null);
  };

  return {
    kind,
    query,
    voices,
    selected,
    loading,
    error,
    hasMore,
    importingVoiceKey,
    importSuccess,
    previousDisabled: kind === 'workspace' ? workspaceIndex === 0 : publicPage === 0,
    setQuery,
    setSelected,
    setError: clearError,
    changeKind,
    submitSearch,
    next,
    previous,
    importVoice,
    refresh,
  } as const;
};
