import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  importPublicVoice,
  listPublicVoices,
  listWorkspaceVoices,
} from '../../adapters/api-client/voicesApi';
import type { VoiceLibraryKind, VoicePage, VoiceSummary } from '../../application/types';

export type VoiceLibraryClient = {
  listWorkspaceVoices(
    search: string,
    pageToken: string | null,
    signal: AbortSignal,
  ): Promise<VoicePage>;
  listPublicVoices(search: string, page: number, signal: AbortSignal): Promise<VoicePage>;
  importPublicVoice(voice: VoiceSummary, signal: AbortSignal): Promise<string>;
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
  const [voices, setVoices] = useState<VoiceSummary[]>([]);
  const [selected, setSelected] = useState<VoiceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [workspaceTokens, setWorkspaceTokens] = useState<Array<string | null>>([null]);
  const [workspaceIndex, setWorkspaceIndex] = useState(0);
  const [publicPage, setPublicPage] = useState(0);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [importingVoiceKey, setImportingVoiceKey] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        const page =
          kind === 'workspace'
            ? await client.listWorkspaceVoices(
                search,
                workspaceTokens[workspaceIndex] ?? null,
                controller.signal,
              )
            : await client.listPublicVoices(search, publicPage, controller.signal);
        setVoices(page.voices);
        setHasMore(page.hasMore);
        setNextToken(page.nextPageToken);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setVoices([]);
        setHasMore(false);
        setNextToken(null);
        setError(caught instanceof Error ? caught.message : 'Voices could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [client, kind, publicPage, revision, search, workspaceIndex, workspaceTokens]);

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

  const importVoice = async (voice: VoiceSummary): Promise<VoiceSummary | null> => {
    importAbortRef.current?.abort();
    const controller = new AbortController();
    const voiceKey = `${voice.publicOwnerId ?? 'public'}:${voice.voiceId}`;
    importAbortRef.current = controller;
    setImportingVoiceKey(voiceKey);
    setImportSuccess(null);
    setError(null);
    try {
      const voiceId = await client.importPublicVoice(voice, controller.signal);
      controller.signal.throwIfAborted();
      if (importAbortRef.current !== controller) return null;
      const importedVoice = { ...voice, voiceId };
      setSelected(importedVoice);
      setKind('workspace');
      setWorkspaceTokens([null]);
      setWorkspaceIndex(0);
      setImportSuccess(`${voice.name} was imported and is selected for this take.`);
      return importedVoice;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return null;
      setError(
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
    setError,
    changeKind,
    submitSearch,
    next,
    previous,
    importVoice,
    refresh,
  } as const;
};
