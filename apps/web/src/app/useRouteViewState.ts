import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useLocation } from 'react-router';

/**
 * Scroll fires once per frame and browsers rate-limit `replaceState`, so a burst becomes one
 * trailing write.
 */
const SCROLL_WRITE_DELAY_MS = 150;

/** Surfaces that record only a scroll position share this scope; the entry already bounds it. */
const UNSCOPED_OWNER = '';

type StoredRouteView = Readonly<{
  /** The account the entry was recorded for; a different subject must not inherit its view. */
  owner: string;
  scrollTop: number;
  view: unknown;
}>;

const readStoredView = (storageKey: string, owner: string): StoredRouteView | null => {
  if (typeof window === 'undefined') return null;
  const historyState: unknown = window.history.state;
  if (!historyState || typeof historyState !== 'object') return null;
  const candidate = (historyState as Record<string, unknown>)[storageKey];
  if (!candidate || typeof candidate !== 'object') return null;
  const stored = candidate as Record<string, unknown>;
  if (
    stored.owner !== owner ||
    typeof stored.scrollTop !== 'number' ||
    !Number.isFinite(stored.scrollTop) ||
    stored.scrollTop < 0
  ) {
    return null;
  }
  return { owner, scrollTop: stored.scrollTop, view: stored.view };
};

/**
 * Records the view on the entry it belongs to, or not at all.
 *
 * `replaceState` always targets whichever entry is active *now*, and react-router pushes the next
 * entry synchronously inside `navigate()` — before React unmounts the surface being left. So a
 * write that arrives late (a debounced scroll, an unmount flush) would stamp the departing
 * surface's position onto the entry the operator just arrived at: Back would restore nothing, and
 * the destination would jump to a position from another route. `entryKey` is the router's key for
 * the entry the value was captured on; when the live entry has moved past it the write is dropped,
 * because a wrong memory is worse than a missing one.
 */
const writeStoredView = (storageKey: string, state: StoredRouteView, entryKey: string): void => {
  if (typeof window === 'undefined') return;
  const current =
    window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};
  const liveKey = current['key'];
  if (typeof liveKey === 'string' && liveKey !== entryKey) return;
  try {
    window.history.replaceState({ ...current, [storageKey]: state }, '');
  } catch {
    // Private or embedded browser contexts may reject history writes; the route still works.
  }
};

export type RouteViewMemory<TElement extends HTMLElement, TView> = Readonly<{
  /** Attach to the element the surface scrolls in. */
  routeRef: RefObject<TElement | null>;
  /** What this history entry recorded on arrival, or `null` for a first visit. */
  initialView: TView | null;
  /** Record a decision immediately — changing a filter is not something to wait for. */
  rememberView: (view: TView) => void;
  /** Attach to the scroll container's `onScroll`. */
  onScroll: () => void;
}>;

/**
 * Route memory for one history entry: what the surface was showing, and where it was scrolled.
 *
 * It belongs here rather than in a surface because "what does going Back mean" is one answer for
 * the whole app — the surfaces previously disagreed, some restoring and some resetting to the top.
 * The state rides the history entry rather than storage, so it is scoped to the visit that
 * recorded it and needs no cleanup.
 */
export const useRouteViewState = <TElement extends HTMLElement = HTMLElement, TView = unknown>({
  storageKey,
  owner,
  isView,
}: Readonly<{
  storageKey: string;
  /** Set when the recorded view is account-specific, so another subject cannot inherit it. */
  owner?: string;
  /** Narrows the recorded payload; without it a surface keeps only its scroll position. */
  isView?: (value: unknown) => value is TView;
}>): RouteViewMemory<TElement, TView> => {
  const scopedOwner = owner ?? UNSCOPED_OWNER;
  const location = useLocation();
  const routeRef = useRef<TElement | null>(null);
  const pendingWrite = useRef<number | null>(null);
  const pendingState = useRef<StoredRouteView | null>(null);

  const [initialView] = useState<TView | null>(() => {
    const stored = readStoredView(storageKey, scopedOwner);
    return stored && isView?.(stored.view) ? stored.view : null;
  });
  const currentView = useRef<TView | null>(initialView);

  /**
   * Keyed on `location.key`, not the path: the shell persists, so arriving is a new history entry
   * rather than a remount, and a return within one surface has to restore like a fresh visit.
   */
  useLayoutEffect(() => {
    const stored = readStoredView(storageKey, scopedOwner);
    if (routeRef.current) routeRef.current.scrollTop = stored?.scrollTop ?? 0;
  }, [storageKey, scopedOwner, location.key]);

  const entryKey = location.key;

  const cancelScrollWrite = useCallback(() => {
    if (pendingWrite.current === null) return;
    window.clearTimeout(pendingWrite.current);
    pendingWrite.current = null;
  }, []);

  const flushScrollWrite = useCallback(() => {
    if (pendingWrite.current === null) return;
    cancelScrollWrite();
    if (pendingState.current) writeStoredView(storageKey, pendingState.current, entryKey);
  }, [cancelScrollWrite, storageKey, entryKey]);

  // Flushed on unmount so leaving mid-scroll still records the position, and the position is
  // captured when observed because the route ref is already detached by the time that runs.
  useEffect(() => () => flushScrollWrite(), [flushScrollWrite]);

  return {
    routeRef,
    initialView,
    rememberView: (view: TView) => {
      currentView.current = view;
      /*
       * The pending scroll write holds the view as it was when the scroll happened. Left running,
       * it lands 150ms later and puts the old filter back — reachable by changing a filter just
       * after a momentum scroll settles, which on a phone is where the filter usually is.
       */
      cancelScrollWrite();
      writeStoredView(
        storageKey,
        { owner: scopedOwner, view, scrollTop: routeRef.current?.scrollTop ?? 0 },
        entryKey,
      );
    },
    onScroll: () => {
      const snapshot = {
        owner: scopedOwner,
        view: currentView.current,
        scrollTop: routeRef.current?.scrollTop ?? 0,
      };
      pendingState.current = snapshot;
      /*
       * The first scroll of a burst is written straight away, so leaving mid-burst still records
       * something on the entry being left: the trailing write may never get the chance, because
       * navigation retires this entry before the timer fires.
       */
      if (pendingWrite.current === null) writeStoredView(storageKey, snapshot, entryKey);
      else window.clearTimeout(pendingWrite.current);
      pendingWrite.current = window.setTimeout(flushScrollWrite, SCROLL_WRITE_DELAY_MS);
    },
  };
};
