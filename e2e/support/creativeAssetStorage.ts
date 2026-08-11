import type { CreativeAssetStore } from '@studio/domain';
import type { Page } from '@playwright/test';
import { TEST_AUTH_SESSION } from './authFixture.js';

const developmentStorageKey = (baseName: string): string =>
  `${baseName}.development.${TEST_AUTH_SESSION.user.id}`;

export const CREATIVE_ASSET_STORAGE_KEY = developmentStorageKey(
  'realtime-creator-studio.creative-assets.v7',
);
const PREVIOUS_CREATIVE_ASSET_STORAGE_KEY = developmentStorageKey(
  'realtime-creator-studio.creative-assets.v6',
);
const CREATIVE_ASSET_DATABASE_NAME = 'lightframe.creative-assets';
const REPOSITORY_METADATA_KEY = 'creativeAssetRepository';

export const readCreativeAssetStore = async (page: Page): Promise<CreativeAssetStore | null> =>
  page.evaluate(
    async ({ databaseName, metadataKey, ownerUserId, storageKey, previousStorageKey }) => {
      const readLegacyStore = (): CreativeAssetStore | null => {
        const serialized =
          localStorage.getItem(`${storageKey}.${ownerUserId}`) ??
          localStorage.getItem(storageKey) ??
          localStorage.getItem(`${previousStorageKey}.${ownerUserId}`) ??
          localStorage.getItem(previousStorageKey);
        if (!serialized) return null;
        const persisted = JSON.parse(serialized) as {
          readonly store?: CreativeAssetStore;
        } & CreativeAssetStore;
        return persisted.store ?? persisted;
      };

      const databases = await indexedDB.databases();
      if (!databases.some(({ name }) => name === databaseName)) return readLegacyStore();

      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error('The creative asset database could not be opened.'));
      });
      const requiredStores = [
        'savedPrompts',
        'recentPrompts',
        'characters',
        'characterVariants',
        'metadata',
      ] as const;
      if (requiredStores.some((name) => !database.objectStoreNames.contains(name))) {
        database.close();
        return readLegacyStore();
      }

      const transaction = database.transaction(requiredStores, 'readonly');
      const readRequest = <T>(request: IDBRequest<T>): Promise<T> =>
        new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () =>
            reject(request.error ?? new Error('The creative asset records could not be read.'));
        });
      const metadataRequest = readRequest<
        { schemaVersion: CreativeAssetStore['schemaVersion'] } | undefined
      >(
        transaction.objectStore('metadata').get([ownerUserId, metadataKey]) as IDBRequest<
          { schemaVersion: CreativeAssetStore['schemaVersion'] } | undefined
        >,
      );
      const readOwnedRecords = <T>(storeName: (typeof requiredStores)[number]) =>
        readRequest<(T & { ownerUserId: string })[]>(
          transaction.objectStore(storeName).index('byOwner').getAll(ownerUserId) as IDBRequest<
            (T & { ownerUserId: string })[]
          >,
        );
      const [metadata, savedPrompts, recentPrompts, savedCharacterPrompts, savedCharacterVariants] =
        await Promise.all([
          metadataRequest,
          readOwnedRecords<CreativeAssetStore['savedPrompts'][number]>('savedPrompts'),
          readOwnedRecords<CreativeAssetStore['recentPrompts'][number]>('recentPrompts'),
          readOwnedRecords<CreativeAssetStore['savedCharacterPrompts'][number]>('characters'),
          readOwnedRecords<CreativeAssetStore['savedCharacterVariants'][number]>(
            'characterVariants',
          ),
        ]);
      database.close();
      if (!metadata) return readLegacyStore();

      const stripOwner = <T extends { ownerUserId: string }>({
        ownerUserId: _,
        ...record
      }: T): Omit<T, 'ownerUserId'> => record;
      return {
        schemaVersion: metadata.schemaVersion,
        savedPrompts: savedPrompts.map(stripOwner),
        recentPrompts: recentPrompts.map(stripOwner),
        savedCharacterPrompts: savedCharacterPrompts.map(stripOwner),
        savedCharacterVariants: savedCharacterVariants.map(stripOwner),
      };
    },
    {
      databaseName: CREATIVE_ASSET_DATABASE_NAME,
      metadataKey: REPOSITORY_METADATA_KEY,
      ownerUserId: TEST_AUTH_SESSION.user.id,
      storageKey: CREATIVE_ASSET_STORAGE_KEY,
      previousStorageKey: PREVIOUS_CREATIVE_ASSET_STORAGE_KEY,
    },
  );
