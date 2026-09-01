import type { SharedVoicesQuery } from '@studio/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listSharedVoices,
  listWorkspaceVoices,
  removeWorkspaceVoice,
  saveSharedVoice,
} from '../../adapters/api-client/voicesApi';
import type {
  SharedVoiceItem,
  SharedVoicePage,
  VoiceFilterCriteria,
  VoiceLibraryItem,
  WorkspaceVoiceItem,
  WorkspaceVoicePage,
} from '../../application/types';

export type VoiceLibraryTab = 'saved' | 'browse';

export type VoiceLibraryClient = {
  listWorkspaceVoices: (
    criteria: VoiceFilterCriteria,
    pageToken: string | null,
    signal: AbortSignal,
    refresh?: boolean,
  ) => Promise<WorkspaceVoicePage>;
  listSharedVoices: (
    criteria: VoiceFilterCriteria,
    page: number,
    sort: SharedVoicesQuery['sort'],
    signal: AbortSignal,
    refresh?: boolean,
  ) => Promise<SharedVoicePage>;
  saveSharedVoice: (
    item: SharedVoiceItem,
    signal: AbortSignal,
  ) => Promise<{ readonly status: string; readonly voiceId: string }>;
  removeWorkspaceVoice: (
    voiceId: string,
    signal: AbortSignal,
  ) => Promise<{ readonly status: string; readonly voiceId: string }>;
};

const defaultVoiceLibraryClient: VoiceLibraryClient = {
  listWorkspaceVoices,
  listSharedVoices,
  saveSharedVoice,
  removeWorkspaceVoice,
};

const EMPTY_CRITERIA: VoiceFilterCriteria = {
  search: '',
  language: '',
  gender: '',
  age: '',
  accent: '',
  useCase: '',
  descriptive: '',
};

const CLIENT_CACHE_TTL_MS = 5 * 60_000;

/**
 * The saved-voices count the Assets hub shows on its Voices tab.
 *
 * Exported from here because this hook owns the only two mutations that change it; the key value
 * predates this export and stays as it is so no cached entry is orphaned.
 */
export const savedVoiceCountQueryKey = ['voices', 'saved-count'] as const;

const voiceLibraryQueryKeys = {
  all: ['voice-library'] as const,
  saved: ['voice-library', 'saved'] as const,
  browse: ['voice-library', 'browse'] as const,
  savedScope: (clientScope: string) => ['voice-library', 'saved', clientScope] as const,
  browseScope: (clientScope: string) => ['voice-library', 'browse', clientScope] as const,
  savedPage: (clientScope: string, criteria: VoiceFilterCriteria, pageToken: string | null) =>
    ['voice-library', 'saved', clientScope, { criteria, pageToken }] as const,
  browsePage: (
    clientScope: string,
    criteria: VoiceFilterCriteria,
    sort: SharedVoicesQuery['sort'],
    page: number,
  ) => ['voice-library', 'browse', clientScope, { criteria, sort, page }] as const,
};

const customClientScopes = new WeakMap<VoiceLibraryClient, string>();
let customClientSequence = 0;

const scopeForClient = (client: VoiceLibraryClient): string => {
  if (client === defaultVoiceLibraryClient) return 'default';
  const existing = customClientScopes.get(client);
  if (existing) return existing;
  customClientSequence += 1;
  const scope = `custom-${customClientSequence}`;
  customClientScopes.set(client, scope);
  return scope;
};

const errorMessage = (caught: unknown): string =>
  caught instanceof Error ? caught.message : 'Voices could not be loaded.';

const aborted = (caught: unknown): boolean =>
  (caught instanceof DOMException && caught.name === 'AbortError') ||
  (caught instanceof Error && caught.name === 'AbortError');

const searchHintFor = (query: string): string | null => {
  const length = query.trim().length;
  return length > 0 && length < 3 ? 'Type at least 3 characters to search.' : null;
};

type VoiceMutationRequest =
  | Readonly<{ kind: 'add'; item: SharedVoiceItem; controller: AbortController }>
  | Readonly<{ kind: 'remove'; item: WorkspaceVoiceItem; controller: AbortController }>;

type VoiceMutationResult = Readonly<{
  request: VoiceMutationRequest;
  status: string;
}>;

export const useVoiceLibrary = (client: VoiceLibraryClient = defaultVoiceLibraryClient) => {
  const queryClient = useQueryClient();
  const clientScope = useMemo(() => scopeForClient(client), [client]);
  const [tab, setTab] = useState<VoiceLibraryTab>('saved');
  const [savedQuery, setSavedQuery] = useState('');
  const [browseQuery, setBrowseQuery] = useState('');
  const [savedCriteria, setSavedCriteria] = useState(EMPTY_CRITERIA);
  const [browseCriteria, setBrowseCriteria] = useState(EMPTY_CRITERIA);
  const [browseSort, setBrowseSort] = useState<SharedVoicesQuery['sort']>('trending');
  const [selected, setSelected] = useState<WorkspaceVoiceItem | null>(null);
  const [savedTokens, setSavedTokens] = useState<Array<string | null>>([null]);
  const [savedIndex, setSavedIndex] = useState(0);
  const [browsePage, setBrowsePage] = useState(0);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);

  const resetSavedPage = useCallback(() => {
    setSavedTokens([null]);
    setSavedIndex(0);
  }, []);
  const resetBrowsePage = useCallback(() => setBrowsePage(0), []);

  useEffect(() => {
    const search = savedQuery.trim();
    if (search.length > 0 && search.length < 3) return undefined;
    const apply = () => {
      setSavedCriteria((current) => {
        if (current.search === search) return current;
        resetSavedPage();
        return { ...current, search };
      });
    };
    if (search === '') {
      apply();
      return undefined;
    }
    const timer = window.setTimeout(apply, 300);
    return () => window.clearTimeout(timer);
  }, [resetSavedPage, savedQuery]);

  useEffect(() => {
    const search = browseQuery.trim();
    if (search.length > 0 && search.length < 3) return undefined;
    const apply = () => {
      setBrowseCriteria((current) => {
        if (current.search === search) return current;
        resetBrowsePage();
        return { ...current, search };
      });
    };
    if (search === '') {
      apply();
      return undefined;
    }
    const timer = window.setTimeout(apply, 300);
    return () => window.clearTimeout(timer);
  }, [browseQuery, resetBrowsePage]);

  const savedToken = savedTokens[savedIndex] ?? null;
  const savedPageQuery = useQuery({
    queryKey: voiceLibraryQueryKeys.savedPage(clientScope, savedCriteria, savedToken),
    queryFn: ({ signal }) => client.listWorkspaceVoices(savedCriteria, savedToken, signal, false),
    enabled: tab === 'saved',
    placeholderData: keepPreviousData,
    staleTime: CLIENT_CACHE_TTL_MS,
    gcTime: CLIENT_CACHE_TTL_MS,
  });
  const browsePageQuery = useQuery({
    queryKey: voiceLibraryQueryKeys.browsePage(clientScope, browseCriteria, browseSort, browsePage),
    queryFn: ({ signal }) =>
      client.listSharedVoices(browseCriteria, browsePage, browseSort, signal, false),
    enabled: tab === 'browse',
    placeholderData: keepPreviousData,
    staleTime: CLIENT_CACHE_TTL_MS,
    gcTime: CLIENT_CACHE_TTL_MS,
  });

  const mutation = useMutation({
    mutationFn: async (request: VoiceMutationRequest): Promise<VoiceMutationResult> => {
      const result =
        request.kind === 'add'
          ? await client.saveSharedVoice(request.item, request.controller.signal)
          : await client.removeWorkspaceVoice(
              request.item.voice.voiceId,
              request.controller.signal,
            );
      return { request, status: result.status };
    },
    onSuccess: ({ request, status }) => {
      if (request.kind === 'add') {
        queryClient.setQueriesData<SharedVoicePage>(
          { queryKey: voiceLibraryQueryKeys.browseScope(clientScope) },
          (page) =>
            page
              ? {
                  ...page,
                  voices: page.voices.map((candidate) =>
                    candidate.voice.voiceId === request.item.voice.voiceId
                      ? { ...candidate, voice: { ...candidate.voice, saved: true } }
                      : candidate,
                  ),
                }
              : page,
        );
        setMutationMessage(
          status === 'already-saved'
            ? `${request.item.voice.name} is already saved.`
            : `${request.item.voice.name} was added to Saved Voices.`,
        );
      } else {
        queryClient.setQueriesData<WorkspaceVoicePage>(
          { queryKey: voiceLibraryQueryKeys.savedScope(clientScope) },
          (page) =>
            page
              ? {
                  ...page,
                  voices: page.voices.filter(
                    (candidate) => candidate.voice.voiceId !== request.item.voice.voiceId,
                  ),
                }
              : page,
        );
        queryClient.setQueriesData<SharedVoicePage>(
          { queryKey: voiceLibraryQueryKeys.browseScope(clientScope) },
          (page) =>
            page
              ? {
                  ...page,
                  voices: page.voices.map((candidate) =>
                    candidate.voice.voiceId === request.item.voice.voiceId
                      ? { ...candidate, voice: { ...candidate.voice, saved: false } }
                      : candidate,
                  ),
                }
              : page,
        );
        setMutationMessage(
          status === 'already-removed'
            ? `${request.item.voice.name} was already removed.`
            : `${request.item.voice.name} was removed from Saved Voices.`,
        );
      }
      void queryClient.invalidateQueries({
        queryKey: voiceLibraryQueryKeys.all,
        refetchType: 'none',
      });
      // The Voices tab count changed with the membership. Unlike the pages above — which this
      // handler already rewrote in place — nothing rewrites the count, so it must actually refetch.
      void queryClient.invalidateQueries({ queryKey: savedVoiceCountQueryKey });
    },
  });

  useEffect(
    () => () => {
      mutationControllerRef.current?.abort();
    },
    [],
  );

  const setFilter = (field: Exclude<keyof VoiceFilterCriteria, 'search'>, value: string) => {
    setInteractionError(null);
    if (tab === 'saved') {
      resetSavedPage();
      setSavedCriteria((current) => ({ ...current, [field]: value }));
    } else {
      resetBrowsePage();
      setBrowseCriteria((current) => ({ ...current, [field]: value }));
    }
  };

  const clearFilters = () => {
    setInteractionError(null);
    if (tab === 'saved') {
      setSavedQuery('');
      resetSavedPage();
      setSavedCriteria(EMPTY_CRITERIA);
    } else {
      setBrowseQuery('');
      resetBrowsePage();
      setBrowseCriteria(EMPTY_CRITERIA);
    }
  };

  const next = () => {
    if (tab === 'saved') {
      const nextToken = savedPageQuery.data?.nextPageToken;
      if (!nextToken) return;
      setSavedTokens((current) => [...current.slice(0, savedIndex + 1), nextToken]);
      setSavedIndex((current) => current + 1);
    } else if (browsePageQuery.data?.hasMore) {
      setBrowsePage((current) => current + 1);
    }
  };

  const previous = () => {
    if (tab === 'saved') setSavedIndex((current) => Math.max(0, current - 1));
    else setBrowsePage((current) => Math.max(0, current - 1));
  };

  const refresh = () => {
    if (tab === 'saved') {
      void queryClient
        .invalidateQueries({
          queryKey: voiceLibraryQueryKeys.savedScope(clientScope),
          refetchType: 'none',
        })
        .then(() =>
          queryClient.fetchQuery({
            queryKey: voiceLibraryQueryKeys.savedPage(clientScope, savedCriteria, savedToken),
            queryFn: ({ signal }) =>
              client.listWorkspaceVoices(savedCriteria, savedToken, signal, true),
            staleTime: 0,
          }),
        )
        .catch(() => undefined);
    } else {
      void queryClient
        .invalidateQueries({
          queryKey: voiceLibraryQueryKeys.browseScope(clientScope),
          refetchType: 'none',
        })
        .then(() =>
          queryClient.fetchQuery({
            queryKey: voiceLibraryQueryKeys.browsePage(
              clientScope,
              browseCriteria,
              browseSort,
              browsePage,
            ),
            queryFn: ({ signal }) =>
              client.listSharedVoices(browseCriteria, browsePage, browseSort, signal, true),
            staleTime: 0,
          }),
        )
        .catch(() => undefined);
    }
  };

  const retry = () => {
    setInteractionError(null);
    if (tab === 'saved') void savedPageQuery.refetch();
    else void browsePageQuery.refetch();
  };

  const setError = (message: string | null) => {
    setInteractionError(message);
  };

  const runMutation = async (
    request: Omit<VoiceMutationRequest, 'controller'>,
  ): Promise<boolean> => {
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    setInteractionError(null);
    try {
      await mutation.mutateAsync({ ...request, controller } as VoiceMutationRequest);
      return true;
    } catch (caught) {
      if (!aborted(caught)) setInteractionError(errorMessage(caught));
      return false;
    } finally {
      if (mutationControllerRef.current === controller) mutationControllerRef.current = null;
    }
  };

  const addVoice = (item: SharedVoiceItem): Promise<boolean> => runMutation({ kind: 'add', item });
  const removeVoice = (item: WorkspaceVoiceItem): Promise<boolean> =>
    runMutation({ kind: 'remove', item });

  const activeCriteria = tab === 'saved' ? savedCriteria : browseCriteria;
  const query = tab === 'saved' ? savedQuery : browseQuery;
  const activePageQuery = tab === 'saved' ? savedPageQuery : browsePageQuery;
  const voices: readonly VoiceLibraryItem[] = activePageQuery.data?.voices ?? [];
  const loading = activePageQuery.isPending || activePageQuery.isFetching;
  const pageError = activePageQuery.error ? errorMessage(activePageQuery.error) : null;
  const hasMore = activePageQuery.data?.hasMore ?? false;
  const pageNumber = tab === 'saved' ? savedIndex + 1 : browsePage + 1;
  const mutationVoiceId = mutation.isPending ? mutation.variables.item.voice.voiceId : null;

  return {
    tab,
    query,
    criteria: activeCriteria,
    voices,
    selected,
    loading,
    error: interactionError ?? pageError,
    hasMore,
    pageNumber,
    previousDisabled: pageNumber === 1,
    searchHint: searchHintFor(query),
    announcement: `${voices.length} ${tab === 'saved' ? 'saved' : 'catalog'} voices shown.`,
    mutationMessage,
    mutationVoiceId,
    browseSort,
    setTab,
    setQuery: tab === 'saved' ? setSavedQuery : setBrowseQuery,
    setSelected,
    setFilter,
    setBrowseSort: (sort: SharedVoicesQuery['sort']) => {
      resetBrowsePage();
      setBrowseSort(sort);
    },
    setError,
    addVoice,
    removeVoice,
    next,
    previous,
    refresh,
    retry,
    clearFilters,
  } as const;
};
