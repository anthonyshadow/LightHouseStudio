import { sanitizeCreativeAssetStore, type CreativeAssetStore } from '@studio/domain';
import { useEffect } from 'react';
import type { CreativeAssetRepository } from './types';

const itemCount = (store: CreativeAssetStore): number =>
  store.savedPrompts.length +
  store.recentPrompts.length +
  store.savedCharacterPrompts.length +
  store.savedCharacterVariants.length;

const readRemote = async (signal: AbortSignal) => {
  const response = await fetch('/api/creative-library', {
    credentials: 'same-origin',
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Creative library cloud read failed.');
  const body = (await response.json()) as unknown;
  if (
    typeof body !== 'object' ||
    body === null ||
    !('revision' in body) ||
    typeof body.revision !== 'number' ||
    !Number.isInteger(body.revision) ||
    body.revision < 0 ||
    !('store' in body)
  ) {
    throw new Error('Creative library cloud response is invalid.');
  }
  const parsed = sanitizeCreativeAssetStore(body.store);
  if (parsed.recovered || parsed.droppedRecords > 0) {
    throw new Error('Creative library cloud response contains invalid records.');
  }
  return { revision: body.revision, store: parsed.store };
};

const replaceRemote = async (
  expectedRevision: number,
  repository: CreativeAssetRepository,
  signal: AbortSignal,
) => {
  const response = await fetch('/api/creative-library', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision, store: repository.getSnapshot().store }),
    signal,
  });
  if (response.status === 409) return 'conflict' as const;
  if (!response.ok) throw new Error('Creative library cloud write failed.');
  const body = (await response.json()) as { readonly revision?: unknown };
  if (typeof body.revision !== 'number' || !Number.isInteger(body.revision)) {
    throw new Error('Creative library cloud write response is invalid.');
  }
  return body.revision;
};

export const useCreativeLibraryCloudSync = (repository: CreativeAssetRepository): void => {
  useEffect(() => {
    if (repository.replaceFromRemote === undefined || repository.setSyncNotice === undefined)
      return;
    const controller = new AbortController();
    let active = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let writing = false;
    let pending = false;
    let unsubscribe: (() => void) | null = null;

    const failClosed = (message: string) => {
      if (!active) return;
      repository.setSyncNotice?.(message);
      unsubscribe?.();
      unsubscribe = null;
    };

    const flush = async (): Promise<void> => {
      if (!active || writing) {
        pending = true;
        return;
      }
      writing = true;
      pending = false;
      try {
        const result = await replaceRemote(revision, repository, controller.signal);
        if (result === 'conflict') {
          failClosed(
            'Cloud library sync paused because another session changed the library. Your local copy was preserved.',
          );
          return;
        }
        revision = result;
        repository.setSyncNotice?.(null);
      } catch {
        if (!controller.signal.aborted) {
          failClosed(
            'Cloud library sync is unavailable. Your local copy remains available on this browser.',
          );
        }
      } finally {
        writing = false;
        if (pending && active) void flush();
      }
    };

    void (async () => {
      try {
        await repository.ready();
        if (!active) return;
        const remote = await readRemote(controller.signal);
        if (!active || remote === null) return;
        revision = remote.revision;
        const localStore = repository.getSnapshot().store;
        const localCount = itemCount(localStore);
        const remoteCount = itemCount(remote.store);
        if (remote.revision === 0 && localCount > 0) {
          const result = await replaceRemote(0, repository, controller.signal);
          if (result === 'conflict') {
            failClosed('Cloud library sync paused because another session initialized it first.');
            return;
          }
          revision = result;
        } else if (remoteCount > 0 && localCount === 0) {
          await repository.replaceFromRemote?.(remote.store);
        } else if (
          remote.revision > 0 &&
          JSON.stringify(localStore) !== JSON.stringify(remote.store)
        ) {
          failClosed(
            'Cloud library sync paused because this browser and the cloud both contain changes. The local copy was preserved.',
          );
          return;
        }
        if (!active) return;
        repository.setSyncNotice?.(null);
        unsubscribe = repository.subscribe(() => {
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(() => void flush(), 250);
        });
      } catch {
        if (!controller.signal.aborted) {
          // A local-only server intentionally has no sync route; 404 was handled above.
          failClosed(
            'Cloud library sync is unavailable. Your local copy remains available on this browser.',
          );
        }
      }
    })();

    return () => {
      active = false;
      controller.abort();
      if (timer !== null) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [repository]);
};
