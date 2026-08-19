import type { CreativeAssetStore } from '@studio/domain';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  readCreativeLibrary,
  replaceCreativeLibrary,
} from '../../adapters/api-client/creativeLibraryApi';
import type { CreativeAssetRepository } from './types';

/**
 * Why the cloud mirror stopped, in a form the UI can act on.
 *
 * A sentence cannot be branched on without matching its own copy, and the recovery surface offers
 * different actions for "the two copies diverged" (pick a side) and "the server could not be
 * reached" (try again). It lives with the hook rather than in the repository because the repository
 * owns *local* storage: cloud status is neither its data nor anything it reads.
 */
export type CreativeLibrarySyncStatus =
  | { readonly state: 'idle' }
  | {
      readonly state: 'paused';
      readonly reason: 'diverged' | 'conflict' | 'unavailable';
      readonly message: string;
    };

const IDLE: CreativeLibrarySyncStatus = { state: 'idle' };

const itemCount = (store: CreativeAssetStore): number =>
  store.savedPrompts.length +
  store.recentPrompts.length +
  store.savedCharacterPrompts.length +
  store.savedCharacterVariants.length;

const DIVERGED_MESSAGE =
  'Cloud library sync paused because this browser and the cloud both contain changes. The local copy was preserved.';
const CONFLICT_MESSAGE =
  'Cloud library sync paused because another session changed the library. Your local copy was preserved.';
const INITIALIZED_ELSEWHERE_MESSAGE =
  'Cloud library sync paused because another session initialized it first.';
const UNAVAILABLE_MESSAGE =
  'Cloud library sync is unavailable. Your local copy remains available on this browser.';

/**
 * How the operator answered a divergence, carried into the next attempt.
 *
 * There is no third answer. The comparison that detects divergence is a whole-store deep equality
 * with no per-record identity, and the contract exposes only a full-store PUT — so a merge would
 * be invented semantics rather than a reconciliation. Picking a side is the honest choice.
 */
export type CreativeLibrarySyncResolution = 'keep-local' | 'keep-cloud';

/**
 * Where the library actually lives, for surfaces that have to say so without overclaiming.
 *
 * `status` cannot answer this: a server with no cloud route and a healthy mirror are both `idle`.
 * `registerCreativeLibraryRoutes` registers nothing unless a relational database mode supplied a
 * repository, and `GET /api/creative-library` then answers 404 — which is exactly the observation
 * this records. It stays `checking` while unknown, including after a transport failure, because
 * "the server could not be reached" is not evidence either way.
 */
export type CreativeLibraryMirror = 'checking' | 'browser-only' | 'cloud';

export interface CreativeLibraryCloudSyncOptions {
  readonly initializeEmptyRemoteFromLocal?: boolean;
}

export interface CreativeLibraryCloudSync {
  readonly status: CreativeLibrarySyncStatus;
  /** Whether a cloud copy exists in this configuration at all. */
  readonly mirror: CreativeLibraryMirror;
  /** Re-runs the whole startup sequence, including the divergence check. */
  readonly retry: () => void;
  /** Overwrites the cloud copy with this browser's. */
  readonly keepLocal: () => void;
  /** Overwrites this browser's copy with the cloud's. */
  readonly keepCloud: () => void;
}

export const useCreativeLibraryCloudSync = (
  repository: CreativeAssetRepository,
  { initializeEmptyRemoteFromLocal = false }: CreativeLibraryCloudSyncOptions = {},
): CreativeLibraryCloudSync => {
  const [status, setStatus] = useState<CreativeLibrarySyncStatus>(IDLE);
  const [mirror, setMirror] = useState<CreativeLibraryMirror>('checking');
  /**
   * The re-arm signal. Sync used to fail closed for the lifetime of the repository: the effect ran
   * once, dropped its subscription, and only a new owner or a page reload could start it again —
   * and a reload met the same divergence and paused again. A fresh object per click re-runs the
   * effect exactly once, which is what turns a terminal notice into a recovery path.
   */
  const [attempt, setAttempt] = useState<{
    readonly resolution: CreativeLibrarySyncResolution | null;
  }>({ resolution: null });

  useEffect(() => {
    if (repository.replaceFromRemote === undefined) return;
    const controller = new AbortController();
    let active = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let writing = false;
    let pending = false;
    let unsubscribe: (() => void) | null = null;

    const failClosed = (reason: 'diverged' | 'conflict' | 'unavailable', message: string) => {
      if (!active) return;
      setStatus({ state: 'paused', reason, message });
      unsubscribe?.();
      unsubscribe = null;
    };

    const settle = () => {
      if (active) setStatus(IDLE);
    };

    /** Full-store PUT plus its one failure mode; the three callers differ only in expectations. */
    const pushLocal = async (expectedRevision: number, conflictMessage = CONFLICT_MESSAGE) => {
      const result = await replaceCreativeLibrary(
        expectedRevision,
        repository.getSnapshot().store,
        controller.signal,
      );
      if (result === 'conflict') {
        failClosed('conflict', conflictMessage);
        return false;
      }
      revision = result;
      return true;
    };

    const flush = async (): Promise<void> => {
      if (!active || writing) {
        pending = true;
        return;
      }
      writing = true;
      pending = false;
      try {
        if (await pushLocal(revision)) settle();
      } catch {
        if (!controller.signal.aborted) failClosed('unavailable', UNAVAILABLE_MESSAGE);
      } finally {
        writing = false;
        if (pending && active) void flush();
      }
    };

    void (async () => {
      try {
        await repository.ready();
        if (!active) return;
        const remote = await readCreativeLibrary(controller.signal);
        if (!active) return;
        // A 404 is the only signal that this deployment has no cloud copy at all.
        setMirror(remote === null ? 'browser-only' : 'cloud');
        if (remote === null) return;
        revision = remote.revision;
        const localStore = repository.getSnapshot().store;
        const localCount = itemCount(localStore);
        const remoteCount = itemCount(remote.store);
        if (attempt.resolution === 'keep-cloud') {
          await repository.replaceFromRemote?.(remote.store);
        } else if (attempt.resolution === 'keep-local') {
          // Deliberately `remote.revision`, freshly read: the revision this hook was holding when
          // it paused is exactly the one the server already rejected.
          if (!(await pushLocal(remote.revision))) return;
        } else if (remote.revision === 0 && localCount > 0) {
          if (initializeEmptyRemoteFromLocal) {
            if (!(await pushLocal(0, INITIALIZED_ELSEWHERE_MESSAGE))) return;
          } else {
            await repository.replaceFromRemote?.(remote.store);
          }
        } else if (remoteCount > 0 && localCount === 0) {
          await repository.replaceFromRemote?.(remote.store);
        } else if (
          remote.revision > 0 &&
          JSON.stringify(localStore) !== JSON.stringify(remote.store)
        ) {
          failClosed('diverged', DIVERGED_MESSAGE);
          return;
        }
        if (!active) return;
        settle();
        unsubscribe = repository.subscribe(() => {
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(() => void flush(), 250);
        });
      } catch {
        if (!controller.signal.aborted) {
          // A local-only server intentionally has no sync route; 404 was handled above.
          failClosed('unavailable', UNAVAILABLE_MESSAGE);
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
      if (timer !== null) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [attempt, initializeEmptyRemoteFromLocal, repository]);

  const rearm = useCallback(
    (resolution: CreativeLibrarySyncResolution | null) => setAttempt({ resolution }),
    [],
  );

  return useMemo(
    () => ({
      status,
      mirror,
      retry: () => rearm(null),
      keepLocal: () => rearm('keep-local'),
      keepCloud: () => rearm('keep-cloud'),
    }),
    [mirror, rearm, status],
  );
};
