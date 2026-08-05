import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import {
  createLocalProjectRepository,
  GUIDED_PROJECT_ARTIFACTS_STORE,
  GUIDED_PROJECT_DATABASE_NAME,
  GUIDED_PROJECT_DATABASE_VERSION,
  GUIDED_PROJECTS_STORE,
  sanitizeGuidedProjectData,
} from './projectRepository';
import type { GuidedProjectDataV1 } from './types';

type FakeStoredRecord = Record<string, unknown>;

type FakeListener = {
  readonly callback: EventListenerOrEventListenerObject;
  readonly once: boolean;
};

class FakeEventSource {
  readonly listeners = new Map<string, FakeListener[]>();

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

  succeed(result: T) {
    this.result = result;
    queueMicrotask(() => this.emit('success'));
  }

  fail(message: string) {
    this.error = new DOMException(message, 'UnknownError');
    queueMicrotask(() => this.emit('error'));
  }
}

type FakeDatabaseState = {
  readonly projects: Map<string, FakeStoredRecord>;
  readonly artifacts: Map<string, FakeStoredRecord>;
  queryCounts?: { count: number; get: number; getAll: number };
};

const cloneStored = <T>(value: T): T => structuredClone(value);

const fakeKey = (value: IDBValidKey): string => {
  if (typeof value !== 'string') throw new Error('The fake IndexedDB accepts string keys only.');
  return value;
};

class FakeObjectStore {
  constructor(
    private readonly values: Map<string, FakeStoredRecord>,
    private readonly state: FakeDatabaseState,
  ) {}

  private recordQuery(kind: 'count' | 'get' | 'getAll') {
    this.state.queryCounts ??= { count: 0, get: 0, getAll: 0 };
    this.state.queryCounts[kind] += 1;
  }

  get(key: IDBValidKey) {
    this.recordQuery('get');
    const request = new FakeRequest<unknown>();
    const value = this.values.get(fakeKey(key));
    request.succeed(value === undefined ? undefined : cloneStored(value));
    return request as unknown as IDBRequest<unknown>;
  }

  getAll() {
    this.recordQuery('getAll');
    const request = new FakeRequest<unknown[]>();
    request.succeed([...this.values.values()].map(cloneStored));
    return request as unknown as IDBRequest<unknown[]>;
  }

  count() {
    this.recordQuery('count');
    const request = new FakeRequest<number>();
    request.succeed(this.values.size);
    return request as unknown as IDBRequest<number>;
  }

  delete(key: IDBValidKey) {
    this.values.delete(fakeKey(key));
    const request = new FakeRequest<undefined>();
    request.succeed(undefined);
    return request as unknown as IDBRequest<undefined>;
  }

  index(name: string) {
    if (name !== 'by-project-id') throw new Error(`Unknown fake index ${name}.`);
    return {
      openCursor: (projectId: IDBValidKey) => {
        const request = new FakeRequest<IDBCursorWithValue | null>();
        const ids = [...this.state.artifacts]
          .filter(([, artifact]) => artifact.projectId === projectId)
          .map(([id]) => id);
        let index = 0;
        const advance = () => {
          const id = ids[index++];
          if (!id) {
            request.succeed(null);
            return;
          }
          request.succeed({
            delete: () => this.state.artifacts.delete(id),
            continue: advance,
          } as unknown as IDBCursorWithValue);
        };
        advance();
        return request as unknown as IDBRequest<IDBCursorWithValue | null>;
      },
    } as IDBIndex;
  }
}

class FakeTransaction extends FakeEventSource {
  error: DOMException | null = null;

  constructor(
    private readonly state: FakeDatabaseState,
    readonly storeNames: string | readonly string[],
    readonly mode: IDBTransactionMode,
  ) {
    super();
    setTimeout(() => this.emit('complete'), 0);
  }

  objectStore(name: string) {
    const values = name === GUIDED_PROJECTS_STORE ? this.state.projects : this.state.artifacts;
    return new FakeObjectStore(values, this.state) as unknown as IDBObjectStore;
  }
}

class FakeDatabase extends FakeEventSource {
  closeCount = 0;
  failNextTransaction = false;
  readonly transactions: FakeTransaction[] = [];
  readonly objectStoreNames = {
    contains: (name: string) =>
      name === GUIDED_PROJECTS_STORE || name === GUIDED_PROJECT_ARTIFACTS_STORE,
  } as unknown as DOMStringList;

  constructor(private readonly state: FakeDatabaseState) {
    super();
  }

  transaction(storeNames: string | string[], mode: IDBTransactionMode = 'readonly') {
    if (this.failNextTransaction) {
      this.failNextTransaction = false;
      throw new DOMException('Planned IndexedDB transaction failure.', 'UnknownError');
    }
    const transaction = new FakeTransaction(this.state, storeNames, mode);
    this.transactions.push(transaction);
    return transaction as unknown as IDBTransaction;
  }

  close() {
    this.closeCount += 1;
  }
}

const emptyGuidedData = (): GuidedProjectDataV1 => ({
  characterId: null,
  characterName: '',
  characterPrompt: '',
  characterDraft: null,
  guidedDesign: null,
  referenceMode: null,
  referenceImageAssetId: null,
  referenceImageStale: false,
  originalVideoArtifactId: null,
  originalVideoMetadata: null,
  originalAudioArtifactId: null,
  originalAudioMimeType: null,
  processedVideoArtifactId: null,
  processedVideoMetadata: null,
  finalVariant: null,
  selectedVoiceId: null,
  selectedVoiceName: null,
  downloadStartedAt: null,
  completedAt: null,
});

const legacyProjectFixture = (
  id: string,
  updatedAt: string,
  overrides: Partial<GuidedProjectDataV1> = {},
): FakeStoredRecord => ({
  schemaVersion: 1,
  id,
  title: `Legacy ${id}`,
  revision: 4,
  checkpoint: 'character-design',
  data: {
    ...emptyGuidedData(),
    characterName: `Character ${id}`,
    ...overrides,
    runtimeStream: { deviceId: 'must-not-escape' },
    providerToken: 'must-not-escape',
  },
  createdAt: '2026-01-10T12:00:00.000Z',
  updatedAt,
  unknownTopLevel: true,
});

const artifactFixture = (
  id: string,
  projectId: string,
  body: string,
  overrides: FakeStoredRecord = {},
): FakeStoredRecord => {
  const blob = new Blob([body], { type: 'video/webm' });
  return {
    id,
    projectId,
    kind: 'original-video',
    blob,
    mimeType: blob.type,
    sizeBytes: blob.size,
    sourceArtifactId: null,
    createdAt: '2026-01-10T12:01:00.000Z',
    ...overrides,
  };
};

const compatibilityIndexedDb = (state: FakeDatabaseState) => {
  const database = new FakeDatabase(state);
  const opens: { readonly name: string; readonly version?: number }[] = [];
  const factory = {
    open: (name: string, version?: number) => {
      opens.push({ name, ...(version === undefined ? {} : { version }) });
      const request = new FakeRequest<IDBDatabase>();
      request.succeed(database as unknown as IDBDatabase);
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
  return { database, factory, opens };
};

describe('Guided project compatibility repository', () => {
  it('opens the unchanged database and lists only sanitized legacy records newest first', async () => {
    const older = legacyProjectFixture('older', '2026-01-10T12:02:00.000Z');
    const newer = legacyProjectFixture('newer', '2026-01-10T12:03:00.000Z', {
      characterPrompt: 'A documentary presenter.',
      referenceImageStale: true,
    });
    const damaged = { ...legacyProjectFixture('damaged', '2026-01-10T12:04:00.000Z') };
    damaged.schemaVersion = 99;
    const state = {
      projects: new Map([
        ['older', older],
        ['newer', newer],
        ['damaged', damaged],
      ]),
      artifacts: new Map<string, FakeStoredRecord>(),
    };
    const indexedDb = compatibilityIndexedDb(state);
    const repository = createLocalProjectRepository({ indexedDB: indexedDb.factory });

    await expect(repository.initialize()).resolves.toEqual({
      health: 'ready',
      durable: true,
      notice: null,
    });
    await expect(repository.list()).resolves.toEqual([
      expect.objectContaining({ id: 'newer', characterName: 'Character newer' }),
      expect.objectContaining({ id: 'older', characterName: 'Character older' }),
    ]);
    const loaded = await repository.load('newer');
    expect(loaded?.data.characterPrompt).toBe('A documentary presenter.');
    expect(loaded?.data).not.toHaveProperty('runtimeStream');
    expect(loaded?.data).not.toHaveProperty('providerToken');
    expect(loaded).not.toHaveProperty('unknownTopLevel');
    expect(indexedDb.opens).toEqual([
      { name: GUIDED_PROJECT_DATABASE_NAME, version: GUIDED_PROJECT_DATABASE_VERSION },
    ]);
    expect(GUIDED_PROJECT_DATABASE_NAME).toBe('lightframe.local-projects');
    expect(GUIDED_PROJECT_DATABASE_VERSION).toBe(1);
    expect(GUIDED_PROJECTS_STORE).toBe('projects');
    expect(GUIDED_PROJECT_ARTIFACTS_STORE).toBe('artifacts');
  });

  it('counts legacy projects with one native IndexedDB count request', async () => {
    const state: FakeDatabaseState = {
      projects: new Map([
        ['one', legacyProjectFixture('one', '2026-01-10T12:02:00.000Z')],
        ['two', legacyProjectFixture('two', '2026-01-10T12:03:00.000Z')],
      ]),
      artifacts: new Map(),
    };
    const indexedDb = compatibilityIndexedDb(state);
    const repository = createLocalProjectRepository({ indexedDB: indexedDb.factory });

    await expect(repository.count()).resolves.toBe(2);
    expect(state.queryCounts).toEqual({ count: 1, get: 0, getAll: 0 });
  });

  it('loads the newest migratable character design in one backend query', async () => {
    const older = legacyProjectFixture('older', '2026-01-10T12:02:00.000Z', {
      characterDraft: createPromptBuilderDraft('character-transform'),
    });
    const newest = legacyProjectFixture('newest', '2026-01-10T12:04:00.000Z', {
      characterDraft: createPromptBuilderDraft('character-transform'),
    });
    const unrelated = legacyProjectFixture('unrelated', '2026-01-10T12:05:00.000Z', {
      characterDraft: createPromptBuilderDraft('character-transform'),
    });
    unrelated.checkpoint = 'complete';
    const state: FakeDatabaseState = {
      projects: new Map([
        ['older', older],
        ['newest', newest],
        ['unrelated', unrelated],
      ]),
      artifacts: new Map(),
    };
    const indexedDb = compatibilityIndexedDb(state);
    const repository = createLocalProjectRepository({ indexedDB: indexedDb.factory });

    await expect(repository.loadNewestCharacterDesign()).resolves.toMatchObject({ id: 'newest' });
    expect(state.queryCounts).toEqual({ count: 0, get: 0, getAll: 1 });
  });

  it('reads byte-identical owned artifacts and rejects damaged or cross-project records', async () => {
    const state = {
      projects: new Map([
        ['project-1', legacyProjectFixture('project-1', '2026-01-10T12:02:00.000Z')],
      ]),
      artifacts: new Map([
        ['owned-video', artifactFixture('owned-video', 'project-1', 'legacy-video')],
        ['other-video', artifactFixture('other-video', 'project-2', 'other-video')],
        [
          'damaged-video',
          artifactFixture('damaged-video', 'project-1', 'damaged', { sizeBytes: 999 }),
        ],
      ]),
    };
    const indexedDb = compatibilityIndexedDb(state);
    const repository = createLocalProjectRepository({ indexedDB: indexedDb.factory });

    await expect((await repository.readArtifact('project-1', 'owned-video'))?.text()).resolves.toBe(
      'legacy-video',
    );
    await expect(repository.readArtifact('project-1', 'other-video')).resolves.toBeNull();
    await expect(repository.readArtifact('project-1', 'damaged-video')).resolves.toBeNull();
  });

  it('keeps already-read records and media available if IndexedDB fails mid-session', async () => {
    const project = legacyProjectFixture('project-1', '2026-01-10T12:02:00.000Z', {
      originalVideoArtifactId: 'owned-video',
    });
    const state = {
      projects: new Map([['project-1', project]]),
      artifacts: new Map([
        ['owned-video', artifactFixture('owned-video', 'project-1', 'legacy-video')],
      ]),
    };
    const indexedDb = compatibilityIndexedDb(state);
    const repository = createLocalProjectRepository({ indexedDB: indexedDb.factory });

    await repository.list();
    await repository.readArtifact('project-1', 'owned-video');

    indexedDb.database.failNextTransaction = true;
    await expect(repository.load('project-1')).resolves.toMatchObject({ id: 'project-1' });
    await expect((await repository.readArtifact('project-1', 'owned-video'))?.text()).resolves.toBe(
      'legacy-video',
    );
    expect(repository.getStorageState()).toMatchObject({ health: 'degraded', durable: false });
  });

  it('transactionally deletes one legacy record and all of its artifacts without touching others', async () => {
    const state = {
      projects: new Map([
        ['project-1', legacyProjectFixture('project-1', '2026-01-10T12:02:00.000Z')],
        ['project-2', legacyProjectFixture('project-2', '2026-01-10T12:03:00.000Z')],
      ]),
      artifacts: new Map([
        ['project-1-video', artifactFixture('project-1-video', 'project-1', 'one')],
        ['project-1-audio', artifactFixture('project-1-audio', 'project-1', 'audio')],
        ['project-2-video', artifactFixture('project-2-video', 'project-2', 'two')],
      ]),
    };
    const indexedDb = compatibilityIndexedDb(state);
    const repository = createLocalProjectRepository({ indexedDB: indexedDb.factory });

    await repository.deleteProject('project-1');

    expect(state.projects.has('project-1')).toBe(false);
    expect(state.artifacts.has('project-1-video')).toBe(false);
    expect(state.artifacts.has('project-1-audio')).toBe(false);
    expect(state.projects.has('project-2')).toBe(true);
    expect(state.artifacts.has('project-2-video')).toBe(true);
    expect(indexedDb.database.transactions.at(-1)).toMatchObject({
      storeNames: [GUIDED_PROJECTS_STORE, GUIDED_PROJECT_ARTIFACTS_STORE],
      mode: 'readwrite',
    });
  });

  it('preserves legacy character drafts for migration while defaulting older optional fields', () => {
    const characterDraft = {
      ...createPromptBuilderDraft('character-transform'),
      adultAge: 'adult' as const,
      characterBase: 'Documentary presenter',
      bodyShape: 'Balanced',
      hair: 'Layered shoulder-length hair',
      hairColor: 'Copper',
    };
    const current = sanitizeGuidedProjectData({
      ...emptyGuidedData(),
      characterDraft,
      providerToken: 'must-not-escape',
    });
    expect(current?.characterDraft).toEqual(characterDraft);
    expect(current).not.toHaveProperty('providerToken');

    const olderData = { ...emptyGuidedData() } as Record<string, unknown>;
    delete olderData.characterDraft;
    expect(sanitizeGuidedProjectData(olderData)?.characterDraft).toBeNull();

    const olderDraft = { ...characterDraft } as Record<string, unknown>;
    delete olderDraft.bodyShape;
    delete olderDraft.hairColor;
    expect(
      sanitizeGuidedProjectData({
        ...emptyGuidedData(),
        characterDraft: olderDraft,
      })?.characterDraft,
    ).toMatchObject({
      bodyShape: '',
      hair: 'Layered shoulder-length hair',
      hairColor: '',
    });
  });

  it('reports unavailable storage without creating or rewriting browser records', async () => {
    const repository = createLocalProjectRepository({ indexedDB: null });

    await expect(repository.initialize()).resolves.toMatchObject({
      health: 'session-only',
      durable: false,
    });
    await expect(repository.list()).resolves.toEqual([]);
    await expect(repository.count()).resolves.toBe(0);
    await expect(repository.load('legacy')).resolves.toBeNull();
    await expect(repository.loadNewestCharacterDesign()).resolves.toBeNull();
    await expect(repository.readArtifact('legacy', 'video')).resolves.toBeNull();
  });

  it('closes a database that opens after the repository has closed', async () => {
    const state = {
      projects: new Map<string, FakeStoredRecord>(),
      artifacts: new Map<string, FakeStoredRecord>(),
    };
    const database = new FakeDatabase(state);
    const request = new FakeRequest<IDBDatabase>();
    const repository = createLocalProjectRepository({
      indexedDB: {
        open: () => request as unknown as IDBOpenDBRequest,
      } as unknown as IDBFactory,
    });

    const initialize = repository.initialize();
    repository.close();
    request.succeed(database as unknown as IDBDatabase);

    await expect(initialize).rejects.toMatchObject({ code: 'closed' });
    expect(database.closeCount).toBe(1);
  });
});
