import { describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_BUILDER_DRAFT_STORE,
  CharacterBuilderDraftError,
  createCharacterBuilderDraftRepository,
} from './draftRepository';

type TestDraft = { readonly name: string };

const sanitizeDraft = (value: unknown): TestDraft | null => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name.length > 80
  ) {
    return null;
  }
  return { name: value.name.trim() };
};

type FakeListener = {
  readonly callback: EventListenerOrEventListenerObject;
  readonly once: boolean;
};

const fakeKey = (value: IDBValidKey): string => {
  if (typeof value !== 'string') throw new Error('The fake IndexedDB accepts string keys only.');
  return value;
};

class FakeEventSource {
  private readonly listeners = new Map<string, FakeListener[]>();

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (!callback) return;
    const once = typeof options === 'object' && options.once === true;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), { callback, once }]);
  }

  protected emit(type: string) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((listener) => !listener.once),
    );
    const event = new Event(type);
    for (const { callback } of listeners) {
      if (typeof callback === 'function') callback.call(this, event);
      else callback.handleEvent(event);
    }
  }
}

class FakeRequest<T> extends FakeEventSource {
  result!: T;
  error: DOMException | null = null;

  succeed(result: T, event = 'success') {
    this.result = result;
    queueMicrotask(() => this.emit(event));
  }

  upgrade(result: T) {
    this.result = result;
    queueMicrotask(() => this.emit('upgradeneeded'));
  }

  fail(message: string) {
    this.error = new DOMException(message, 'UnknownError');
    queueMicrotask(() => this.emit('error'));
  }
}

class FakeObjectStore {
  constructor(private readonly values: Map<string, unknown>) {}

  get(key: IDBValidKey) {
    const request = new FakeRequest<unknown>();
    const value = this.values.get(fakeKey(key));
    request.succeed(value === undefined ? undefined : structuredClone(value));
    return request as unknown as IDBRequest<unknown>;
  }

  put(value: unknown) {
    if (typeof value !== 'object' || value === null || !('id' in value)) {
      throw new Error('Fake object store values require an id.');
    }
    this.values.set(String(value.id), structuredClone(value));
    const request = new FakeRequest<IDBValidKey>();
    request.succeed(String(value.id));
    return request as unknown as IDBRequest<IDBValidKey>;
  }
}

class FakeTransaction extends FakeEventSource {
  error: DOMException | null = null;
  private active = true;

  constructor(private readonly values: Map<string, unknown>) {
    super();
    setTimeout(() => {
      if (!this.active) return;
      this.active = false;
      this.emit('complete');
    }, 0);
  }

  objectStore(name: string) {
    if (name !== CHARACTER_BUILDER_DRAFT_STORE) throw new Error(`Unknown store ${name}.`);
    return new FakeObjectStore(this.values) as unknown as IDBObjectStore;
  }

  abort() {
    if (!this.active) return;
    this.active = false;
    this.error = new DOMException('Transaction aborted.', 'AbortError');
    queueMicrotask(() => this.emit('abort'));
  }
}

class FakeDatabase extends FakeEventSource {
  private hasStore = false;
  closeCount = 0;
  readonly objectStoreNames = {
    contains: (name: string) => this.hasStore && name === CHARACTER_BUILDER_DRAFT_STORE,
  } as unknown as DOMStringList;

  constructor(private readonly values: Map<string, unknown>) {
    super();
  }

  createObjectStore(name: string) {
    if (name !== CHARACTER_BUILDER_DRAFT_STORE) throw new Error(`Unknown store ${name}.`);
    this.hasStore = true;
    return new FakeObjectStore(this.values) as unknown as IDBObjectStore;
  }

  transaction() {
    return new FakeTransaction(this.values) as unknown as IDBTransaction;
  }

  close() {
    this.closeCount += 1;
  }

  simulateVersionChange() {
    this.emit('versionchange');
  }
}

const fakeIndexedDb = (plannedOpenFailures = 0) => {
  const values = new Map<string, unknown>();
  const database = new FakeDatabase(values);
  let failuresRemaining = plannedOpenFailures;
  return {
    values,
    database,
    factory: {
      open: () => {
        const request = new FakeRequest<IDBDatabase>();
        if (failuresRemaining > 0) {
          failuresRemaining -= 1;
          request.fail('Planned IndexedDB open failure.');
          return request as unknown as IDBOpenDBRequest;
        }
        request.result = database as unknown as IDBDatabase;
        if (!database.objectStoreNames.contains(CHARACTER_BUILDER_DRAFT_STORE)) {
          request.upgrade(database as unknown as IDBDatabase);
          queueMicrotask(() => {
            request.succeed(database as unknown as IDBDatabase);
          });
        } else {
          request.succeed(database as unknown as IDBDatabase);
        }
        return request as unknown as IDBOpenDBRequest;
      },
    } as unknown as IDBFactory,
  };
};

const delayedIndexedDb = () => {
  const values = new Map<string, unknown>();
  const database = new FakeDatabase(values);
  const request = new FakeRequest<IDBDatabase>();
  return {
    database,
    request,
    factory: {
      open: () => request as unknown as IDBOpenDBRequest,
    } as unknown as IDBFactory,
  };
};

describe('createCharacterBuilderDraftRepository', () => {
  it('uses optimistic revisions across save, reset, and complete in session fallback', async () => {
    const repository = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: null,
      sanitizeDraft,
    });

    await expect(repository.load()).resolves.toBeNull();
    expect(repository.getStorageState()).toMatchObject({ durable: false, health: 'session-only' });

    const created = await repository.save({ expectedRevision: null, value: { name: 'Morgan' } });
    expect(created).toMatchObject({ revision: 1, value: { name: 'Morgan' } });
    await expect(
      repository.save({ expectedRevision: 1, value: { name: 'Taylor' } }),
    ).resolves.toMatchObject({ revision: 2, value: { name: 'Taylor' } });
    await expect(
      repository.save({ expectedRevision: 1, value: { name: 'Stale' } }),
    ).rejects.toMatchObject({ code: 'revision-conflict' });

    const completed = await repository.complete({ expectedRevision: 2 });
    expect(completed.value).toEqual({ name: 'Taylor' });
    await expect(repository.load()).resolves.toBeNull();
    await expect(repository.reset({ expectedRevision: null })).resolves.toBeUndefined();
  });

  it('rejects values outside the caller-provided persistence allowlist', async () => {
    const repository = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: null,
      sanitizeDraft,
    });
    await expect(
      repository.save({ expectedRevision: null, value: { name: '' } }),
    ).rejects.toBeInstanceOf(CharacterBuilderDraftError);
    await expect(repository.load()).resolves.toBeNull();
  });

  it('imports the newest legacy character-design once and preserves provenance', async () => {
    const loadNewestCharacterDesign = vi.fn(() =>
      Promise.resolve({
        sourceId: 'legacy-project-2',
        sourceRevision: 7,
        sourceUpdatedAt: '2026-07-20T12:00:00.000Z',
        value: { name: 'Legacy Morgan' },
      }),
    );
    const repository = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: null,
      sanitizeDraft,
      legacyMigration: { id: 'guided-character-design-v1', loadNewestCharacterDesign },
    });

    const imported = await repository.load();
    expect(imported).toMatchObject({
      revision: 1,
      value: { name: 'Legacy Morgan' },
      origin: {
        kind: 'legacy-character-design',
        migrationId: 'guided-character-design-v1',
        sourceId: 'legacy-project-2',
        sourceRevision: 7,
      },
    });
    await repository.complete({ expectedRevision: imported?.revision ?? 0 });
    await expect(repository.load()).resolves.toBeNull();
    expect(loadNewestCharacterDesign).toHaveBeenCalledTimes(1);
  });

  it('persists one active versioned draft across IndexedDB repository instances', async () => {
    const indexedDb = fakeIndexedDb();
    const first = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: indexedDb.factory,
      databaseName: 'durable-draft-test',
      sanitizeDraft,
    });
    const created = await first.save({ expectedRevision: null, value: { name: 'Durable' } });
    expect(first.getStorageState()).toMatchObject({ durable: true, health: 'ready' });
    first.close();

    const reopened = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: indexedDb.factory,
      databaseName: 'durable-draft-test',
      sanitizeDraft,
    });
    await expect(reopened.load()).resolves.toEqual(created);
    const reset = reopened.reset({ expectedRevision: created.revision });
    await expect(reset).resolves.toBeUndefined();
    await expect(reopened.load()).resolves.toBeNull();
    reopened.close();
  });

  it('closes a database that opens after the repository has closed', async () => {
    const indexedDb = delayedIndexedDb();
    const repository = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: indexedDb.factory,
      databaseName: 'late-open-draft-test',
      sanitizeDraft,
    });

    const load = repository.load();
    repository.close();
    indexedDb.request.succeed(indexedDb.database as unknown as IDBDatabase);

    await expect(load).rejects.toMatchObject({ code: 'closed' });
    expect(indexedDb.database.closeCount).toBe(1);
  });

  it('closes its durable database when another version is requested', async () => {
    const indexedDb = fakeIndexedDb();
    const repository = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: indexedDb.factory,
      databaseName: 'versionchange-draft-test',
      sanitizeDraft,
    });

    await repository.load();
    indexedDb.database.simulateVersionChange();

    expect(indexedDb.database.closeCount).toBe(1);
  });

  it('flushes the complete session draft when durable storage becomes available', async () => {
    const indexedDb = fakeIndexedDb(1);
    const repository = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: indexedDb.factory,
      databaseName: 'retry-draft-test',
      sanitizeDraft,
    });

    await expect(repository.load()).resolves.toBeNull();
    const sessionRecord = await repository.save({
      expectedRevision: null,
      value: { name: 'Session-safe' },
    });
    expect(repository.getStorageState()).toMatchObject({ durable: false });
    await expect(repository.retryDurableStorage()).resolves.toMatchObject({ durable: true });
    repository.close();

    const reopened = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: indexedDb.factory,
      databaseName: 'retry-draft-test',
      sanitizeDraft,
    });
    await expect(reopened.load()).resolves.toEqual(sessionRecord);
    reopened.close();
  });

  it('never reports a strict journal mutation as successful in session-only storage', async () => {
    const repository = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: null,
      sanitizeDraft,
    });

    await expect(
      repository.saveDurably({ expectedRevision: null, value: { name: 'Journal intent' } }),
    ).rejects.toMatchObject({ code: 'storage-failed' });
    await expect(repository.load()).resolves.toBeNull();
  });

  it('recovers IndexedDB before committing a strict journal mutation', async () => {
    const indexedDb = fakeIndexedDb(1);
    const repository = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: indexedDb.factory,
      databaseName: 'strict-retry-draft-test',
      sanitizeDraft,
    });

    await expect(repository.load()).resolves.toBeNull();
    const created = await repository.saveDurably({
      expectedRevision: null,
      value: { name: 'Recovered journal' },
    });
    expect(repository.getStorageState()).toMatchObject({ durable: true, health: 'ready' });
    await expect(
      repository.completeDurably({ expectedRevision: created.revision }),
    ).resolves.toEqual(created);
    await expect(repository.load()).resolves.toBeNull();
  });

  it('explicitly repairs an unreadable durable envelope without reimporting legacy data', async () => {
    const indexedDb = fakeIndexedDb();
    indexedDb.values.set('active', {
      schemaVersion: 1,
      id: 'active',
      revision: 4,
      active: { damaged: true },
      appliedMigrations: [],
    });
    const loadNewestCharacterDesign = vi.fn(() =>
      Promise.resolve({
        sourceId: 'legacy-project',
        sourceRevision: 1,
        sourceUpdatedAt: '2026-07-20T12:00:00.000Z',
        value: { name: 'Should not return' },
      }),
    );
    const repository = createCharacterBuilderDraftRepository<TestDraft>({
      indexedDB: indexedDb.factory,
      databaseName: 'repair-draft-test',
      sanitizeDraft,
      legacyMigration: { id: 'guided-character-design-v1', loadNewestCharacterDesign },
    });

    await expect(repository.load()).rejects.toMatchObject({ code: 'unsupported-schema' });
    await expect(repository.repairDurably()).resolves.toBeUndefined();
    await expect(repository.load()).resolves.toBeNull();
    expect(loadNewestCharacterDesign).not.toHaveBeenCalled();
  });
});
