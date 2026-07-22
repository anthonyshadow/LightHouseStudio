import { describe, expect, it } from 'vitest';
import { createPromptBuilderDraft } from '@studio/domain';
import {
  createLocalProjectRepository,
  requestPersistentProjectStorage,
  sanitizeGuidedProjectData,
} from './projectRepository';
import type { ProjectStorageError } from './projectRepository';
import { createEmptyGuidedProjectData, type CheckpointCommit } from './types';

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

  get(key: IDBValidKey) {
    const request = new FakeRequest<unknown>();
    const value = this.values.get(fakeKey(key));
    request.succeed(value === undefined ? undefined : cloneStored(value));
    return request as unknown as IDBRequest<unknown>;
  }

  getAll() {
    const request = new FakeRequest<unknown[]>();
    request.succeed([...this.values.values()].map(cloneStored));
    return request as unknown as IDBRequest<unknown[]>;
  }

  put(value: FakeStoredRecord) {
    this.values.set(String(value.id), cloneStored(value));
    const request = new FakeRequest<IDBValidKey>();
    request.succeed(String(value.id));
    return request as unknown as IDBRequest<IDBValidKey>;
  }

  add(value: FakeStoredRecord) {
    const key = String(value.id);
    const request = new FakeRequest<IDBValidKey>();
    if (this.values.has(key)) request.fail(`Duplicate key ${key}.`);
    else {
      this.values.set(key, cloneStored(value));
      request.succeed(key);
    }
    return request as unknown as IDBRequest<IDBValidKey>;
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
            continue: () => advance(),
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
  private active = true;

  constructor(private readonly state: FakeDatabaseState) {
    super();
    setTimeout(() => {
      if (!this.active) return;
      this.active = false;
      this.emit('complete');
    }, 0);
  }

  objectStore(name: string) {
    const values = name === 'projects' ? this.state.projects : this.state.artifacts;
    return new FakeObjectStore(values, this.state) as unknown as IDBObjectStore;
  }

  abort() {
    if (!this.active) throw new DOMException('Transaction is inactive.', 'InvalidStateError');
    this.active = false;
    this.error = new DOMException('Transaction aborted.', 'AbortError');
    queueMicrotask(() => this.emit('abort'));
  }
}

class FakeDatabase extends FakeEventSource {
  closeCount = 0;
  readonly objectStoreNames = {
    contains: (name: string) => name === 'projects' || name === 'artifacts',
  } as unknown as DOMStringList;

  constructor(private readonly state: FakeDatabaseState) {
    super();
  }

  transaction() {
    return new FakeTransaction(this.state) as unknown as IDBTransaction;
  }

  close() {
    this.closeCount += 1;
  }
}

const fakeIndexedDb = (plannedOpenFailures: number) => {
  const state: FakeDatabaseState = { projects: new Map(), artifacts: new Map() };
  let failuresRemaining = plannedOpenFailures;
  return {
    factory: {
      open: () => {
        const request = new FakeRequest<IDBDatabase>();
        if (failuresRemaining > 0) {
          failuresRemaining -= 1;
          request.fail('Planned IndexedDB open failure.');
        } else {
          request.succeed(new FakeDatabase(state) as unknown as IDBDatabase);
        }
        return request as unknown as IDBOpenDBRequest;
      },
    } as unknown as IDBFactory,
    state,
    failNextOpen: (count = 1) => {
      failuresRemaining += count;
    },
  };
};

const delayedIndexedDb = () => {
  const state: FakeDatabaseState = { projects: new Map(), artifacts: new Map() };
  const database = new FakeDatabase(state);
  const request = new FakeRequest<IDBDatabase>();
  return {
    database,
    request,
    factory: {
      open: () => request as unknown as IDBOpenDBRequest,
    } as unknown as IDBFactory,
  };
};

const fixture = () => {
  let minute = 0;
  return createLocalProjectRepository({
    indexedDB: null,
    now: () => new Date(Date.UTC(2026, 6, 20, 12, minute++)),
  });
};

const commit = (overrides: Partial<CheckpointCommit> = {}): CheckpointCommit => ({
  projectId: 'project-1',
  expectedRevision: null,
  title: 'Character project',
  checkpoint: 'character-ready',
  data: {
    ...createEmptyGuidedProjectData(),
    characterName: 'Morgan',
    characterPrompt: 'An adult documentary presenter.',
    referenceImageStale: true,
  },
  ...overrides,
});

describe('createLocalProjectRepository', () => {
  it('reports a truthful session-only fallback when IndexedDB is unavailable', async () => {
    const repository = fixture();
    const storage = await repository.initialize();
    expect(storage).toMatchObject({ health: 'session-only', durable: false });
    expect(storage.notice).toContain('this tab');
  });

  it('closes a database that opens after the repository has closed', async () => {
    const indexedDb = delayedIndexedDb();
    const repository = createLocalProjectRepository({
      indexedDB: indexedDb.factory,
      databaseName: 'late-open-project-test',
    });

    const initialize = repository.initialize();
    repository.close();
    indexedDb.request.succeed(indexedDb.database as unknown as IDBDatabase);

    await expect(initialize).rejects.toMatchObject({ code: 'closed' });
    expect(indexedDb.database.closeCount).toBe(1);
  });

  it('atomically checkpoints metadata and byte-identical original media', async () => {
    const repository = fixture();
    const video = new Blob(['original-video'], { type: 'video/webm' });
    const audio = new Blob(['original-audio'], { type: 'audio/webm' });
    const created = await repository.commit(
      commit({
        checkpoint: 'review-take',
        artifacts: [
          { id: 'video-1', kind: 'original-video', blob: video },
          { id: 'audio-1', kind: 'original-audio', blob: audio },
        ],
        data: {
          ...commit().data,
          originalVideoArtifactId: 'video-1',
          originalVideoMetadata: {
            filename: 'morgan-original.webm',
            mimeType: 'video/webm',
            sourceModeId: 'lucy-2.5',
            startedAt: '2026-07-20T12:00:00.000Z',
            durationMs: 12_500,
            sizeBytes: video.size,
          },
          originalAudioArtifactId: 'audio-1',
          originalAudioMimeType: 'audio/webm',
          finalVariant: 'original',
        },
      }),
    );

    expect(created).toMatchObject({ revision: 1, checkpoint: 'review-take' });
    expect(created.data.referenceImageStale).toBe(true);
    expect(created.data).toMatchObject({
      originalVideoMetadata: {
        filename: 'morgan-original.webm',
        durationMs: 12_500,
      },
      originalAudioMimeType: 'audio/webm',
      finalVariant: 'original',
    });
    await expect((await repository.readArtifact('project-1', 'video-1'))?.text()).resolves.toBe(
      'original-video',
    );
    await expect((await repository.readArtifact('project-1', 'audio-1'))?.text()).resolves.toBe(
      'original-audio',
    );
  });

  it('allowlists resumable data and rejects invalid artifact metadata', () => {
    const raw = {
      ...createEmptyGuidedProjectData(),
      runtimeStream: { deviceId: 'must-not-persist' },
      providerToken: 'must-not-persist',
    };
    const sanitized = sanitizeGuidedProjectData(raw);
    expect(sanitized).toEqual(createEmptyGuidedProjectData());
    expect(sanitized).not.toHaveProperty('runtimeStream');
    expect(sanitized).not.toHaveProperty('providerToken');

    expect(
      sanitizeGuidedProjectData({
        ...raw,
        originalVideoMetadata: {
          filename: 'take.webm',
          mimeType: 'video/webm',
          sourceModeId: 'lucy-2.5',
          startedAt: 'not-a-timestamp',
          durationMs: -1,
          sizeBytes: 12,
        },
      }),
    ).toBeNull();
  });

  it('persists a complete canonical character draft and defaults older project data to null', () => {
    const characterDraft = {
      ...createPromptBuilderDraft('character-transform'),
      adultAge: 'adult' as const,
      gender: 'non-binary' as const,
      characterBase: 'Documentary presenter',
      appearance: 'Freckled, natural grooming',
      bodyShape: 'Soft-curved',
      hair: 'Legacy layered shoulder-length hair',
      hairColor: 'Copper with a silver streak',
      outfit: 'Custom asymmetric formalwear',
      matchReference: true,
      preserve: 'Keep the existing glasses',
      customDetails: 'Keep the exact lapel pin placement',
    };
    const current = sanitizeGuidedProjectData({
      ...createEmptyGuidedProjectData(),
      characterDraft,
    });
    expect(current?.characterDraft).toEqual(characterDraft);

    const olderData = { ...createEmptyGuidedProjectData() } as Record<string, unknown>;
    delete olderData.characterDraft;
    expect(sanitizeGuidedProjectData(olderData)?.characterDraft).toBeNull();

    const legacyDraft = { ...characterDraft } as Record<string, unknown>;
    delete legacyDraft.bodyShape;
    delete legacyDraft.hairColor;
    const migrated = sanitizeGuidedProjectData({
      ...createEmptyGuidedProjectData(),
      characterDraft: legacyDraft,
    });
    expect(migrated?.characterDraft).toMatchObject({
      bodyShape: '',
      hair: 'Legacy layered shoulder-length hair',
      hairColor: '',
    });
    expect(
      sanitizeGuidedProjectData({
        ...createEmptyGuidedProjectData(),
        characterDraft: createPromptBuilderDraft('add-object'),
      }),
    ).toBeNull();
  });

  it('reopens IndexedDB and durably flushes the complete in-memory snapshot', async () => {
    const indexedDb = fakeIndexedDb(1);
    const repository = createLocalProjectRepository({
      indexedDB: indexedDb.factory,
      databaseName: 'retry-success',
    });
    await expect(repository.initialize()).resolves.toMatchObject({ durable: false });

    const original = new Blob(['memory-original'], { type: 'video/webm' });
    const characterDraft = {
      ...createPromptBuilderDraft('character-transform'),
      adultAge: 'adult' as const,
      characterBase: 'Local character',
      bodyShape: 'Balanced',
      hair: 'Textured curls',
      hairColor: 'Dark brown',
    };
    await repository.commit(
      commit({
        artifacts: [{ id: 'memory-video', kind: 'original-video', blob: original }],
        data: {
          ...commit().data,
          characterDraft,
          originalVideoArtifactId: 'memory-video',
        },
      }),
    );

    await expect(repository.retryDurableStorage()).resolves.toEqual({
      health: 'ready',
      durable: true,
      notice: null,
    });
    expect((await repository.load('project-1'))?.data.characterDraft).toEqual(characterDraft);
    await expect(
      (await repository.readArtifact('project-1', 'memory-video'))?.text(),
    ).resolves.toBe('memory-original');

    repository.close();
    const reopened = createLocalProjectRepository({
      indexedDB: indexedDb.factory,
      databaseName: 'retry-success',
    });
    await expect(reopened.initialize()).resolves.toMatchObject({ durable: true });
    expect((await reopened.load('project-1'))?.data.characterDraft).toEqual(characterDraft);
    await expect((await reopened.readArtifact('project-1', 'memory-video'))?.text()).resolves.toBe(
      'memory-original',
    );
    reopened.close();
  });

  it('keeps every in-memory byte available when durable retry fails', async () => {
    const indexedDb = fakeIndexedDb(2);
    const repository = createLocalProjectRepository({
      indexedDB: indexedDb.factory,
      databaseName: 'retry-failure',
    });
    await repository.initialize();
    const original = new Blob(['still-in-memory'], { type: 'video/webm' });
    await repository.commit(
      commit({
        artifacts: [{ id: 'memory-video', kind: 'original-video', blob: original }],
        data: { ...commit().data, originalVideoArtifactId: 'memory-video' },
      }),
    );

    const storage = await repository.retryDurableStorage();
    expect(storage).toMatchObject({ health: 'degraded', durable: false });
    expect(storage.notice).toContain('remain available in this tab');
    expect((await repository.load('project-1'))?.revision).toBe(1);
    await expect(
      (await repository.readArtifact('project-1', 'memory-video'))?.text(),
    ).resolves.toBe('still-in-memory');
  });

  it('flushes offline project deletions without leaving durable media behind', async () => {
    const indexedDb = fakeIndexedDb(0);
    const seeder = createLocalProjectRepository({
      indexedDB: indexedDb.factory,
      databaseName: 'retry-delete',
    });
    await seeder.initialize();
    await seeder.commit(
      commit({
        artifacts: [
          {
            id: 'durable-original',
            kind: 'original-video',
            blob: new Blob(['durable-original'], { type: 'video/webm' }),
          },
        ],
        data: { ...commit().data, originalVideoArtifactId: 'durable-original' },
      }),
    );
    seeder.close();

    indexedDb.failNextOpen();
    const offline = createLocalProjectRepository({
      indexedDB: indexedDb.factory,
      databaseName: 'retry-delete',
    });
    await expect(offline.initialize()).resolves.toMatchObject({ durable: false });
    await offline.deleteProject('project-1');
    await expect(offline.retryDurableStorage()).resolves.toMatchObject({ durable: true });
    await expect(offline.load('project-1')).resolves.toBeNull();
    await expect(offline.readArtifact('project-1', 'durable-original')).resolves.toBeNull();
  });

  it('rejects stale revisions without partially writing artifacts', async () => {
    const repository = fixture();
    await repository.commit(commit());

    await expect(
      repository.commit(
        commit({
          expectedRevision: null,
          artifacts: [
            {
              id: 'late-video',
              kind: 'original-video',
              blob: new Blob(['late'], { type: 'video/webm' }),
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'revision-conflict' } satisfies Partial<ProjectStorageError>);

    expect((await repository.load('project-1'))?.revision).toBe(1);
    await expect(repository.readArtifact('project-1', 'late-video')).resolves.toBeNull();
  });

  it('keeps originals immutable while allowing processed variants to be replaced atomically', async () => {
    const repository = fixture();
    const first = await repository.commit(
      commit({
        artifacts: [
          {
            id: 'original-1',
            kind: 'original-video',
            blob: new Blob(['original'], { type: 'video/webm' }),
          },
        ],
        data: { ...commit().data, originalVideoArtifactId: 'original-1' },
      }),
    );
    const second = await repository.commit(
      commit({
        expectedRevision: first.revision,
        checkpoint: 'processed-voice',
        artifacts: [
          {
            id: 'processed-1',
            kind: 'processed-video',
            sourceArtifactId: 'original-1',
            blob: new Blob(['processed-one'], { type: 'video/webm' }),
          },
        ],
        data: {
          ...first.data,
          processedVideoArtifactId: 'processed-1',
        },
      }),
    );

    await expect(
      repository.commit(
        commit({
          expectedRevision: second.revision,
          removeArtifactIds: ['original-1'],
          data: second.data,
        }),
      ),
    ).rejects.toMatchObject({ code: 'immutable-artifact' } satisfies Partial<ProjectStorageError>);
    expect((await repository.load('project-1'))?.revision).toBe(2);

    const third = await repository.commit(
      commit({
        expectedRevision: second.revision,
        removeArtifactIds: ['processed-1'],
        artifacts: [
          {
            id: 'processed-2',
            kind: 'processed-video',
            sourceArtifactId: 'original-1',
            blob: new Blob(['processed-two'], { type: 'video/webm' }),
          },
        ],
        data: { ...second.data, processedVideoArtifactId: 'processed-2' },
      }),
    );
    expect(third.revision).toBe(3);
    await expect(repository.readArtifact('project-1', 'processed-1')).resolves.toBeNull();
    await expect((await repository.readArtifact('project-1', 'processed-2'))?.text()).resolves.toBe(
      'processed-two',
    );
  });

  it('deletes project metadata and all owned media together', async () => {
    const repository = fixture();
    await repository.commit(
      commit({
        artifacts: [
          {
            id: 'original-1',
            kind: 'original-video',
            blob: new Blob(['original'], { type: 'video/webm' }),
          },
        ],
      }),
    );
    await repository.deleteProject('project-1');
    await expect(repository.load('project-1')).resolves.toBeNull();
    await expect(repository.readArtifact('project-1', 'original-1')).resolves.toBeNull();
  });
});

describe('requestPersistentProjectStorage', () => {
  it('distinguishes persistent, best-effort, and unsupported retention', async () => {
    await expect(requestPersistentProjectStorage(null)).resolves.toBe('unsupported');
    await expect(
      requestPersistentProjectStorage({ persist: () => Promise.resolve(false) }),
    ).resolves.toBe('best-effort');
    await expect(
      requestPersistentProjectStorage({
        persisted: () => Promise.resolve(true),
        persist: () => Promise.resolve(false),
      }),
    ).resolves.toBe('persistent');
  });
});
