import 'fake-indexeddb/auto';

import { createEmptyCreativeAssetStore, createSavedPrompt } from '@studio/domain';
import { deleteDB } from 'idb';
import { afterEach, describe, expect, it } from 'vitest';
import { createIndexedDbCreativeAssetPersistence } from './indexedDbPersistence';
import { CreativeAssetPersistenceConflictError } from './creativeAssetPersistence';
import { createCreativeAssetRepository } from './repository';
import { ORIGINAL_CREATIVE_ASSET_STORAGE_KEY, type StorageLike } from './types';

const databaseNames = new Set<string>();

const databaseName = () => {
  const name = `lightframe.creative-assets.test.${crypto.randomUUID()}`;
  databaseNames.add(name);
  return name;
};

afterEach(async () => {
  await Promise.all([...databaseNames].map((name) => deleteDB(name)));
  databaseNames.clear();
});

const storeWithPrompt = (id: string, title: string) =>
  createSavedPrompt(
    createEmptyCreativeAssetStore(),
    {
      title,
      prompt: `${title} prompt`,
      modelModeId: 'lucy-latest',
      source: 'manual',
    },
    { now: '2026-08-09T12:00:00.000Z', createId: () => id },
  );

class LegacyStorage implements StorageLike {
  readonly records = new Map<string, string>();

  getItem(key: string) {
    return this.records.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.records.set(key, value);
  }

  removeItem(key: string) {
    this.records.delete(key);
  }
}

describe('IndexedDB creative-asset persistence', () => {
  it('commits per-record changes atomically and rejects a stale revision', async () => {
    const name = databaseName();
    const persistence = createIndexedDbCreativeAssetPersistence(name);
    const original = createSavedPrompt(
      storeWithPrompt('prompt-a', 'Original'),
      {
        title: 'Newer',
        prompt: 'Newer prompt',
        modelModeId: 'lucy-latest',
        source: 'manual',
      },
      { now: '2026-08-09T12:01:00.000Z', createId: () => 'prompt-z' },
    );
    const revision = await persistence.initialize('owner-1', original);

    await expect(persistence.load('owner-1')).resolves.toMatchObject({
      revision,
      store: {
        savedPrompts: [
          { id: 'prompt-z', title: 'Newer' },
          { id: 'prompt-a', title: 'Original' },
        ],
      },
    });

    const next = storeWithPrompt('prompt-2', 'Replacement');
    await expect(persistence.commit('owner-1', revision, original, next)).resolves.toBe(2);
    await expect(persistence.load('owner-1')).resolves.toMatchObject({
      revision: 2,
      store: { savedPrompts: [{ id: 'prompt-2', title: 'Replacement' }] },
    });
    await expect(persistence.commit('owner-1', revision, original, next)).rejects.toBeInstanceOf(
      CreativeAssetPersistenceConflictError,
    );

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name);
      request.addEventListener('success', () => resolve(request.result), { once: true });
      request.addEventListener(
        'error',
        () => reject(request.error ?? new Error('IndexedDB open failed.')),
        { once: true },
      );
    });
    expect([...database.objectStoreNames]).toEqual([
      'characterVariants',
      'characters',
      'metadata',
      'projects',
      'recentPrompts',
      'savedPrompts',
      'syncOutbox',
      'uploadSessions',
    ]);
    database.close();
    persistence.close();
  });

  it('removes legacy localStorage only after verified IndexedDB migration', async () => {
    const name = databaseName();
    const storage = new LegacyStorage();
    storage.records.set(
      ORIGINAL_CREATIVE_ASSET_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        savedPrompts: [
          {
            id: 'legacy-prompt',
            title: 'Legacy prompt',
            prompt: 'Keep the scene cinematic.',
            modelModeId: 'lucy-latest',
            source: 'manual',
            tags: [],
            createdAt: '2026-08-09T12:00:00.000Z',
            updatedAt: '2026-08-09T12:00:00.000Z',
            lastUsedAt: null,
            useCount: 0,
          },
        ],
        recentPrompts: [],
        savedCharacterPrompts: [],
      }),
    );
    const repository = createCreativeAssetRepository({
      storage,
      ownerUserId: 'owner-1',
      persistence: createIndexedDbCreativeAssetPersistence(name),
    });

    await repository.ready();

    expect(repository.getSnapshot()).toMatchObject({
      health: 'ready',
      store: { savedPrompts: [{ id: 'legacy-prompt', referenceImageAssetId: null }] },
    });
    expect(storage.records.has(ORIGINAL_CREATIVE_ASSET_STORAGE_KEY)).toBe(false);
    repository.close();

    const reopened = createCreativeAssetRepository({
      storage,
      ownerUserId: 'owner-1',
      persistence: createIndexedDbCreativeAssetPersistence(name),
    });
    await reopened.ready();
    expect(reopened.getSnapshot().store.savedPrompts[0]?.id).toBe('legacy-prompt');
    reopened.close();
  });
});
