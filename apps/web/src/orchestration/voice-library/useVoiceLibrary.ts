import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SharedVoicesQuery } from '@studio/contracts';
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
const CLIENT_CACHE_LIMIT = 40;

type CachedPage =
  | { readonly tab: 'saved'; readonly page: WorkspaceVoicePage }
  | { readonly tab: 'browse'; readonly page: SharedVoicePage };

type CacheEntry = Readonly<{ value: CachedPage; expiresAt: number }>;

const readCache = (cache: Map<string, CacheEntry>, key: string): CachedPage | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
};

const writeCache = (cache: Map<string, CacheEntry>, key: string, value: CachedPage): void => {
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
  while (cache.size > CLIENT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (!oldest) return;
    cache.delete(oldest);
  }
};

const invalidateCacheTab = (cache: Map<string, CacheEntry>, tab: VoiceLibraryTab): void => {
  for (const key of cache.keys()) {
    if (key.startsWith(`${tab}:`)) cache.delete(key);
  }
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

export const useVoiceLibrary = (client: VoiceLibraryClient = defaultVoiceLibraryClient) => {
  const [tab, setTab] = useState<VoiceLibraryTab>('saved');
  const [savedQuery, setSavedQuery] = useState('');
  const [browseQuery, setBrowseQuery] = useState('');
  const [savedCriteria, setSavedCriteria] = useState(EMPTY_CRITERIA);
  const [browseCriteria, setBrowseCriteria] = useState(EMPTY_CRITERIA);
  const [browseSort, setBrowseSort] = useState<SharedVoicesQuery['sort']>('trending');
  const [savedVoices, setSavedVoices] = useState<WorkspaceVoiceItem[]>([]);
  const [browseVoices, setBrowseVoices] = useState<SharedVoiceItem[]>([]);
  const [selected, setSelected] = useState<WorkspaceVoiceItem | null>(null);
  const [savedLoading, setSavedLoading] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [savedHasMore, setSavedHasMore] = useState(false);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [savedTokens, setSavedTokens] = useState<Array<string | null>>([null]);
  const [savedIndex, setSavedIndex] = useState(0);
  const [savedNextToken, setSavedNextToken] = useState<string | null>(null);
  const [browsePage, setBrowsePage] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [browseRevision, setBrowseRevision] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [mutationVoiceId, setMutationVoiceId] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, CacheEntry>());
  const generationRef = useRef(0);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const savedRefreshRef = useRef(false);
  const browseRefreshRef = useRef(false);

  const resetSavedPage = useCallback(() => {
    setSavedTokens([null]);
    setSavedIndex(0);
    setSavedNextToken(null);
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
  const savedRequest = useMemo(
    () => ({
      tab: 'saved' as const,
      key: `saved:${JSON.stringify(savedCriteria)}:${savedToken ?? 'first'}`,
      criteria: savedCriteria,
      token: savedToken,
      revision: savedRevision,
    }),
    [savedCriteria, savedRevision, savedToken],
  );
  const browseRequest = useMemo(
    () => ({
      tab: 'browse' as const,
      key: `browse:${JSON.stringify(browseCriteria)}:${browseSort}:${browsePage}`,
      criteria: browseCriteria,
      page: browsePage,
      sort: browseSort,
      revision: browseRevision,
    }),
    [browseCriteria, browsePage, browseRevision, browseSort],
  );
  const request = tab === 'saved' ? savedRequest : browseRequest;

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const controller = new AbortController();
    const refresh = request.tab === 'saved' ? savedRefreshRef.current : browseRefreshRef.current;
    if (request.tab === 'saved') savedRefreshRef.current = false;
    else browseRefreshRef.current = false;
    const cached = refresh ? null : readCache(cacheRef.current, request.key);

    if (cached?.tab === 'saved') {
      setSavedVoices(cached.page.voices);
      setSavedHasMore(cached.page.hasMore);
      setSavedNextToken(cached.page.nextPageToken);
      setSavedError(null);
      setSavedLoading(false);
      setAnnouncement(`${cached.page.voices.length} saved voices shown.`);
      return () => controller.abort();
    }
    if (cached?.tab === 'browse') {
      setBrowseVoices(cached.page.voices);
      setBrowseHasMore(cached.page.hasMore);
      setBrowseError(null);
      setBrowseLoading(false);
      setAnnouncement(`${cached.page.voices.length} catalog voices shown.`);
      return () => controller.abort();
    }

    if (request.tab === 'saved') setSavedLoading(true);
    else setBrowseLoading(true);
    setInteractionError(null);

    const load = async () => {
      try {
        if (request.tab === 'saved') {
          const page = await client.listWorkspaceVoices(
            request.criteria,
            request.token,
            controller.signal,
            refresh,
          );
          if (controller.signal.aborted || generationRef.current !== generation) return;
          writeCache(cacheRef.current, request.key, { tab: 'saved', page });
          setSavedVoices(page.voices);
          setSavedHasMore(page.hasMore);
          setSavedNextToken(page.nextPageToken);
          setSavedError(null);
          setAnnouncement(`${page.voices.length} saved voices shown.`);
        } else {
          const page = await client.listSharedVoices(
            request.criteria,
            request.page,
            request.sort,
            controller.signal,
            refresh,
          );
          if (controller.signal.aborted || generationRef.current !== generation) return;
          writeCache(cacheRef.current, request.key, { tab: 'browse', page });
          setBrowseVoices(page.voices);
          setBrowseHasMore(page.hasMore);
          setBrowseError(null);
          setAnnouncement(`${page.voices.length} catalog voices shown.`);
        }
      } catch (caught) {
        if (controller.signal.aborted || generationRef.current !== generation || aborted(caught)) {
          return;
        }
        if (request.tab === 'saved') setSavedError(errorMessage(caught));
        else setBrowseError(errorMessage(caught));
      } finally {
        if (!controller.signal.aborted && generationRef.current === generation) {
          if (request.tab === 'saved') setSavedLoading(false);
          else setBrowseLoading(false);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [client, request]);

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
      if (!savedNextToken) return;
      setSavedTokens((current) => [...current.slice(0, savedIndex + 1), savedNextToken]);
      setSavedIndex((current) => current + 1);
    } else if (browseHasMore) {
      setBrowsePage((current) => current + 1);
    }
  };

  const previous = () => {
    if (tab === 'saved') setSavedIndex((current) => Math.max(0, current - 1));
    else setBrowsePage((current) => Math.max(0, current - 1));
  };

  const refresh = () => {
    if (tab === 'saved') {
      savedRefreshRef.current = true;
      invalidateCacheTab(cacheRef.current, 'saved');
      setSavedRevision((current) => current + 1);
    } else {
      browseRefreshRef.current = true;
      invalidateCacheTab(cacheRef.current, 'browse');
      setBrowseRevision((current) => current + 1);
    }
  };

  const retry = () => {
    setInteractionError(null);
    if (tab === 'saved') setSavedRevision((current) => current + 1);
    else setBrowseRevision((current) => current + 1);
  };

  const setError = (message: string | null) => {
    setInteractionError(message);
    if (message === null) {
      if (tab === 'saved') setSavedError(null);
      else setBrowseError(null);
    }
  };

  const runMutation = async (
    voiceId: string,
    action: (signal: AbortSignal) => Promise<void>,
  ): Promise<boolean> => {
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    setMutationVoiceId(voiceId);
    setInteractionError(null);
    try {
      await action(controller.signal);
      return true;
    } catch (caught) {
      if (!aborted(caught)) setInteractionError(errorMessage(caught));
      return false;
    } finally {
      if (mutationControllerRef.current === controller) {
        mutationControllerRef.current = null;
        setMutationVoiceId(null);
      }
    }
  };

  const addVoice = (item: SharedVoiceItem): Promise<boolean> =>
    runMutation(item.voice.voiceId, async (signal) => {
      const result = await client.saveSharedVoice(item, signal);
      setBrowseVoices((current) =>
        current.map((candidate) =>
          candidate.voice.voiceId === item.voice.voiceId
            ? { ...candidate, voice: { ...candidate.voice, saved: true } }
            : candidate,
        ),
      );
      invalidateCacheTab(cacheRef.current, 'saved');
      invalidateCacheTab(cacheRef.current, 'browse');
      setSavedRevision((current) => current + 1);
      const message =
        result.status === 'already-saved'
          ? `${item.voice.name} is already saved.`
          : `${item.voice.name} was added to Saved Voices.`;
      setMutationMessage(message);
    });

  const removeVoice = (item: WorkspaceVoiceItem): Promise<boolean> =>
    runMutation(item.voice.voiceId, async (signal) => {
      const result = await client.removeWorkspaceVoice(item.voice.voiceId, signal);
      setSavedVoices((current) =>
        current.filter((candidate) => candidate.voice.voiceId !== item.voice.voiceId),
      );
      setBrowseVoices((current) =>
        current.map((candidate) =>
          candidate.voice.voiceId === item.voice.voiceId
            ? { ...candidate, voice: { ...candidate.voice, saved: false } }
            : candidate,
        ),
      );
      invalidateCacheTab(cacheRef.current, 'saved');
      invalidateCacheTab(cacheRef.current, 'browse');
      setSavedRevision((current) => current + 1);
      const message =
        result.status === 'already-removed'
          ? `${item.voice.name} was already removed.`
          : `${item.voice.name} was removed from Saved Voices.`;
      setMutationMessage(message);
    });

  const activeCriteria = tab === 'saved' ? savedCriteria : browseCriteria;
  const query = tab === 'saved' ? savedQuery : browseQuery;
  const voices: readonly VoiceLibraryItem[] = tab === 'saved' ? savedVoices : browseVoices;
  const loading = tab === 'saved' ? savedLoading : browseLoading;
  const pageError = tab === 'saved' ? savedError : browseError;
  const hasMore = tab === 'saved' ? savedHasMore : browseHasMore;
  const pageNumber = tab === 'saved' ? savedIndex + 1 : browsePage + 1;

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
    announcement,
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
