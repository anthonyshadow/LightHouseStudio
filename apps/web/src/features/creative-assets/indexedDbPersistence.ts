import type {
  CreativeAssetStore,
  RecentPrompt,
  SavedCharacterPrompt,
  SavedCharacterVariant,
  SavedPrompt,
} from '@studio/domain';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  CreativeAssetPersistenceConflictError,
  type CreativeAssetPersistence,
  type PersistedCreativeAssetSnapshot,
} from './creativeAssetPersistence';

export const CREATIVE_ASSET_DATABASE_NAME = 'lightframe.creative-assets';
export const CREATIVE_ASSET_DATABASE_VERSION = 1;

const SAVED_PROMPTS_STORE = 'savedPrompts';
const RECENT_PROMPTS_STORE = 'recentPrompts';
const CHARACTERS_STORE = 'characters';
const CHARACTER_VARIANTS_STORE = 'characterVariants';
const PROJECTS_STORE = 'projects';
const UPLOAD_SESSIONS_STORE = 'uploadSessions';
const SYNC_OUTBOX_STORE = 'syncOutbox';
const METADATA_STORE = 'metadata';
const REPOSITORY_METADATA_KEY = 'creativeAssetRepository';

type OwnerRecordKey = [ownerUserId: string, id: string];
type OwnerTimestampKey = [ownerUserId: string, timestamp: string];

type OwnedRecord<T extends { readonly id: string }> = T & { readonly ownerUserId: string };

interface ReservedOwnedRecord {
  readonly ownerUserId: string;
  readonly id: string;
  readonly updatedAt: string;
  readonly value: unknown;
}

interface CreativeAssetMetadata {
  readonly ownerUserId: string;
  readonly key: typeof REPOSITORY_METADATA_KEY;
  readonly schemaVersion: number;
  readonly revision: number;
}

interface CreativeAssetDatabase extends DBSchema {
  savedPrompts: {
    key: OwnerRecordKey;
    value: OwnedRecord<SavedPrompt>;
    indexes: { byOwner: string; byOwnerUpdatedAt: OwnerTimestampKey };
  };
  recentPrompts: {
    key: OwnerRecordKey;
    value: OwnedRecord<RecentPrompt>;
    indexes: { byOwner: string; byOwnerUsedAt: OwnerTimestampKey };
  };
  characters: {
    key: OwnerRecordKey;
    value: OwnedRecord<SavedCharacterPrompt>;
    indexes: { byOwner: string; byOwnerUpdatedAt: OwnerTimestampKey };
  };
  characterVariants: {
    key: OwnerRecordKey;
    value: OwnedRecord<SavedCharacterVariant>;
    indexes: {
      byOwner: string;
      byOwnerUpdatedAt: OwnerTimestampKey;
      byOwnerParent: OwnerRecordKey;
    };
  };
  projects: {
    key: OwnerRecordKey;
    value: ReservedOwnedRecord;
    indexes: { byOwner: string; byOwnerUpdatedAt: OwnerTimestampKey };
  };
  uploadSessions: {
    key: OwnerRecordKey;
    value: ReservedOwnedRecord;
    indexes: { byOwner: string; byOwnerUpdatedAt: OwnerTimestampKey };
  };
  syncOutbox: {
    key: OwnerRecordKey;
    value: ReservedOwnedRecord;
    indexes: { byOwner: string; byOwnerUpdatedAt: OwnerTimestampKey };
  };
  metadata: {
    key: OwnerRecordKey;
    value: CreativeAssetMetadata;
    indexes: { byOwner: string };
  };
}

const createOwnedStore = (
  database: IDBPDatabase<CreativeAssetDatabase>,
  name:
    | typeof SAVED_PROMPTS_STORE
    | typeof CHARACTERS_STORE
    | typeof PROJECTS_STORE
    | typeof UPLOAD_SESSIONS_STORE
    | typeof SYNC_OUTBOX_STORE,
) => {
  const store = database.createObjectStore(name, { keyPath: ['ownerUserId', 'id'] });
  store.createIndex('byOwner', 'ownerUserId');
  store.createIndex('byOwnerUpdatedAt', ['ownerUserId', 'updatedAt']);
};

const openCreativeAssetDatabase = (databaseName: string) =>
  openDB<CreativeAssetDatabase>(databaseName, CREATIVE_ASSET_DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(SAVED_PROMPTS_STORE)) {
        createOwnedStore(database, SAVED_PROMPTS_STORE);
      }
      if (!database.objectStoreNames.contains(RECENT_PROMPTS_STORE)) {
        const store = database.createObjectStore(RECENT_PROMPTS_STORE, {
          keyPath: ['ownerUserId', 'id'],
        });
        store.createIndex('byOwner', 'ownerUserId');
        store.createIndex('byOwnerUsedAt', ['ownerUserId', 'usedAt']);
      }
      if (!database.objectStoreNames.contains(CHARACTERS_STORE)) {
        createOwnedStore(database, CHARACTERS_STORE);
      }
      if (!database.objectStoreNames.contains(CHARACTER_VARIANTS_STORE)) {
        const store = database.createObjectStore(CHARACTER_VARIANTS_STORE, {
          keyPath: ['ownerUserId', 'id'],
        });
        store.createIndex('byOwner', 'ownerUserId');
        store.createIndex('byOwnerUpdatedAt', ['ownerUserId', 'updatedAt']);
        store.createIndex('byOwnerParent', ['ownerUserId', 'parentCharacterId']);
      }
      if (!database.objectStoreNames.contains(PROJECTS_STORE)) {
        createOwnedStore(database, PROJECTS_STORE);
      }
      if (!database.objectStoreNames.contains(UPLOAD_SESSIONS_STORE)) {
        createOwnedStore(database, UPLOAD_SESSIONS_STORE);
      }
      if (!database.objectStoreNames.contains(SYNC_OUTBOX_STORE)) {
        createOwnedStore(database, SYNC_OUTBOX_STORE);
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        const store = database.createObjectStore(METADATA_STORE, {
          keyPath: ['ownerUserId', 'key'],
        });
        store.createIndex('byOwner', 'ownerUserId');
      }
    },
  });

const stripOwner = <T extends { readonly ownerUserId: string }>({
  ownerUserId: _,
  ...record
}: T): Omit<T, 'ownerUserId'> => record;

const recordChanged = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) !== JSON.stringify(right);

const applyDiff = <T extends { readonly id: string }>(
  ownerUserId: string,
  previous: readonly T[],
  next: readonly T[],
  target: {
    delete(key: OwnerRecordKey): Promise<unknown>;
    put(value: OwnedRecord<T>): Promise<unknown>;
  },
) => {
  const previousById = new Map(previous.map((record) => [record.id, record]));
  const nextById = new Map(next.map((record) => [record.id, record]));
  const requests: Promise<unknown>[] = [];
  for (const id of previousById.keys()) {
    if (!nextById.has(id)) requests.push(target.delete([ownerUserId, id]));
  }
  for (const record of next) {
    const previousRecord = previousById.get(record.id);
    if (!previousRecord || recordChanged(previousRecord, record)) {
      requests.push(target.put({ ...record, ownerUserId }));
    }
  }
  return requests;
};

class IndexedDbCreativeAssetPersistence implements CreativeAssetPersistence {
  private database: Promise<IDBPDatabase<CreativeAssetDatabase>> | null = null;

  constructor(private readonly databaseName: string) {}

  private getDatabase() {
    this.database ??= openCreativeAssetDatabase(this.databaseName);
    return this.database;
  }

  async load(ownerUserId: string): Promise<PersistedCreativeAssetSnapshot | null> {
    const database = await this.getDatabase();
    const ownerTimestampRange = IDBKeyRange.bound([ownerUserId, ''], [ownerUserId, '\uffff']);
    const transaction = database.transaction(
      [
        SAVED_PROMPTS_STORE,
        RECENT_PROMPTS_STORE,
        CHARACTERS_STORE,
        CHARACTER_VARIANTS_STORE,
        METADATA_STORE,
      ],
      'readonly',
    );
    const metadataRequest = transaction
      .objectStore(METADATA_STORE)
      .get([ownerUserId, REPOSITORY_METADATA_KEY]);
    const savedPromptsRequest = transaction
      .objectStore(SAVED_PROMPTS_STORE)
      .index('byOwnerUpdatedAt')
      .getAll(ownerTimestampRange);
    const recentPromptsRequest = transaction
      .objectStore(RECENT_PROMPTS_STORE)
      .index('byOwnerUsedAt')
      .getAll(ownerTimestampRange);
    const charactersRequest = transaction
      .objectStore(CHARACTERS_STORE)
      .index('byOwnerUpdatedAt')
      .getAll(ownerTimestampRange);
    const variantsRequest = transaction
      .objectStore(CHARACTER_VARIANTS_STORE)
      .index('byOwnerUpdatedAt')
      .getAll(ownerTimestampRange);
    const [metadata, savedPrompts, recentPrompts, savedCharacterPrompts, savedCharacterVariants] =
      await Promise.all([
        metadataRequest,
        savedPromptsRequest,
        recentPromptsRequest,
        charactersRequest,
        variantsRequest,
        transaction.done,
      ]);
    if (!metadata) return null;
    return {
      revision: metadata.revision,
      store: {
        schemaVersion: metadata.schemaVersion,
        savedPrompts: savedPrompts.reverse().map(stripOwner),
        recentPrompts: recentPrompts.reverse().map(stripOwner),
        savedCharacterPrompts: savedCharacterPrompts.reverse().map(stripOwner),
        savedCharacterVariants: savedCharacterVariants.reverse().map(stripOwner),
      },
    };
  }

  async initialize(ownerUserId: string, store: CreativeAssetStore): Promise<number> {
    const database = await this.getDatabase();
    const transaction = database.transaction(
      [
        SAVED_PROMPTS_STORE,
        RECENT_PROMPTS_STORE,
        CHARACTERS_STORE,
        CHARACTER_VARIANTS_STORE,
        METADATA_STORE,
      ],
      'readwrite',
      { durability: 'strict' },
    );
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const existing = await metadataStore.get([ownerUserId, REPOSITORY_METADATA_KEY]);
    if (existing) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      throw new CreativeAssetPersistenceConflictError();
    }
    const requests = [
      ...applyDiff(
        ownerUserId,
        [],
        store.savedPrompts,
        transaction.objectStore(SAVED_PROMPTS_STORE),
      ),
      ...applyDiff(
        ownerUserId,
        [],
        store.recentPrompts,
        transaction.objectStore(RECENT_PROMPTS_STORE),
      ),
      ...applyDiff(
        ownerUserId,
        [],
        store.savedCharacterPrompts,
        transaction.objectStore(CHARACTERS_STORE),
      ),
      ...applyDiff(
        ownerUserId,
        [],
        store.savedCharacterVariants,
        transaction.objectStore(CHARACTER_VARIANTS_STORE),
      ),
      metadataStore.put({
        ownerUserId,
        key: REPOSITORY_METADATA_KEY,
        schemaVersion: store.schemaVersion,
        revision: 1,
      }),
    ];
    await Promise.all(requests);
    await transaction.done;
    return 1;
  }

  async commit(
    ownerUserId: string,
    expectedRevision: number,
    previous: CreativeAssetStore,
    next: CreativeAssetStore,
  ): Promise<number> {
    const database = await this.getDatabase();
    const transaction = database.transaction(
      [
        SAVED_PROMPTS_STORE,
        RECENT_PROMPTS_STORE,
        CHARACTERS_STORE,
        CHARACTER_VARIANTS_STORE,
        METADATA_STORE,
      ],
      'readwrite',
      { durability: 'strict' },
    );
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const metadata = await metadataStore.get([ownerUserId, REPOSITORY_METADATA_KEY]);
    if (!metadata || metadata.revision !== expectedRevision) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      throw new CreativeAssetPersistenceConflictError();
    }
    const revision = metadata.revision + 1;
    const requests = [
      ...applyDiff(
        ownerUserId,
        previous.savedPrompts,
        next.savedPrompts,
        transaction.objectStore(SAVED_PROMPTS_STORE),
      ),
      ...applyDiff(
        ownerUserId,
        previous.recentPrompts,
        next.recentPrompts,
        transaction.objectStore(RECENT_PROMPTS_STORE),
      ),
      ...applyDiff(
        ownerUserId,
        previous.savedCharacterPrompts,
        next.savedCharacterPrompts,
        transaction.objectStore(CHARACTERS_STORE),
      ),
      ...applyDiff(
        ownerUserId,
        previous.savedCharacterVariants,
        next.savedCharacterVariants,
        transaction.objectStore(CHARACTER_VARIANTS_STORE),
      ),
      metadataStore.put({
        ownerUserId,
        key: REPOSITORY_METADATA_KEY,
        schemaVersion: next.schemaVersion,
        revision,
      }),
    ];
    await Promise.all(requests);
    await transaction.done;
    return revision;
  }

  async repair(
    ownerUserId: string,
    expectedRevision: number,
    store: CreativeAssetStore,
  ): Promise<number> {
    const database = await this.getDatabase();
    const transaction = database.transaction(
      [
        SAVED_PROMPTS_STORE,
        RECENT_PROMPTS_STORE,
        CHARACTERS_STORE,
        CHARACTER_VARIANTS_STORE,
        METADATA_STORE,
      ],
      'readwrite',
      { durability: 'strict' },
    );
    const metadataStore = transaction.objectStore(METADATA_STORE);
    const metadataRequest = metadataStore.get([ownerUserId, REPOSITORY_METADATA_KEY]);
    const savedPromptKeysRequest = transaction
      .objectStore(SAVED_PROMPTS_STORE)
      .index('byOwner')
      .getAllKeys(ownerUserId);
    const recentPromptKeysRequest = transaction
      .objectStore(RECENT_PROMPTS_STORE)
      .index('byOwner')
      .getAllKeys(ownerUserId);
    const characterKeysRequest = transaction
      .objectStore(CHARACTERS_STORE)
      .index('byOwner')
      .getAllKeys(ownerUserId);
    const variantKeysRequest = transaction
      .objectStore(CHARACTER_VARIANTS_STORE)
      .index('byOwner')
      .getAllKeys(ownerUserId);
    const [metadata, savedPromptKeys, recentPromptKeys, characterKeys, variantKeys] =
      await Promise.all([
        metadataRequest,
        savedPromptKeysRequest,
        recentPromptKeysRequest,
        characterKeysRequest,
        variantKeysRequest,
      ]);
    if (!metadata || metadata.revision !== expectedRevision) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      throw new CreativeAssetPersistenceConflictError();
    }
    const savedPromptStore = transaction.objectStore(SAVED_PROMPTS_STORE);
    const recentPromptStore = transaction.objectStore(RECENT_PROMPTS_STORE);
    const characterStore = transaction.objectStore(CHARACTERS_STORE);
    const variantStore = transaction.objectStore(CHARACTER_VARIANTS_STORE);
    const revision = metadata.revision + 1;
    const requests = [
      ...savedPromptKeys.map((key) => savedPromptStore.delete(key)),
      ...recentPromptKeys.map((key) => recentPromptStore.delete(key)),
      ...characterKeys.map((key) => characterStore.delete(key)),
      ...variantKeys.map((key) => variantStore.delete(key)),
      ...applyDiff(ownerUserId, [], store.savedPrompts, savedPromptStore),
      ...applyDiff(ownerUserId, [], store.recentPrompts, recentPromptStore),
      ...applyDiff(ownerUserId, [], store.savedCharacterPrompts, characterStore),
      ...applyDiff(ownerUserId, [], store.savedCharacterVariants, variantStore),
      metadataStore.put({
        ownerUserId,
        key: REPOSITORY_METADATA_KEY,
        schemaVersion: store.schemaVersion,
        revision,
      }),
    ];
    await Promise.all(requests);
    await transaction.done;
    return revision;
  }

  close(): void {
    void this.database?.then((database) => database.close());
    this.database = null;
  }
}

export const createIndexedDbCreativeAssetPersistence = (
  databaseName = CREATIVE_ASSET_DATABASE_NAME,
): CreativeAssetPersistence => new IndexedDbCreativeAssetPersistence(databaseName);
