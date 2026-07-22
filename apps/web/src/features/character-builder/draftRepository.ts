export const CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION = 1 as const;
export const CHARACTER_BUILDER_DRAFT_DATABASE_NAME = 'lightframe.character-builder';
export const CHARACTER_BUILDER_DRAFT_DATABASE_VERSION = 1;
export const CHARACTER_BUILDER_DRAFT_STORE = 'draft-state';

const DRAFT_STATE_ID = 'active';

export type CharacterBuilderDraftStorageHealth = 'ready' | 'session-only' | 'degraded';

export interface CharacterBuilderDraftStorageState {
  readonly health: CharacterBuilderDraftStorageHealth;
  readonly durable: boolean;
  readonly notice: string | null;
}

export interface NativeCharacterBuilderDraftOrigin {
  readonly kind: 'native';
}

export interface LegacyCharacterDesignDraftOrigin {
  readonly kind: 'legacy-character-design';
  readonly migrationId: string;
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly sourceUpdatedAt: string;
}

export type CharacterBuilderDraftOrigin =
  NativeCharacterBuilderDraftOrigin | LegacyCharacterDesignDraftOrigin;

export interface CharacterBuilderDraftRecord<TDraft> {
  readonly schemaVersion: typeof CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION;
  readonly id: typeof DRAFT_STATE_ID;
  readonly revision: number;
  readonly value: TDraft;
  readonly origin: CharacterBuilderDraftOrigin;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SaveCharacterBuilderDraftInput<TDraft> {
  /** `null` creates a draft and fails if another active draft already exists. */
  readonly expectedRevision: number | null;
  readonly value: TDraft;
}

export interface ResetCharacterBuilderDraftInput {
  /** `null` is an idempotent assertion that no active draft exists. */
  readonly expectedRevision: number | null;
}

export interface CompleteCharacterBuilderDraftInput {
  readonly expectedRevision: number;
}

export interface LegacyCharacterDesignDraftCandidate<TDraft> {
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly sourceUpdatedAt: string;
  readonly value: TDraft;
}

/**
 * An adapter owned by the composition layer. It can query the retired Guided
 * project repository for its newest `character-design` checkpoint without
 * coupling this repository to legacy project types.
 */
export interface LegacyCharacterDesignDraftMigration<TDraft> {
  /** Bump this stable ID when a materially different import should run once. */
  readonly id: string;
  loadNewestCharacterDesign(): Promise<LegacyCharacterDesignDraftCandidate<TDraft> | null>;
}

export interface CharacterBuilderDraftRepository<TDraft> {
  load(): Promise<CharacterBuilderDraftRecord<TDraft> | null>;
  save(input: SaveCharacterBuilderDraftInput<TDraft>): Promise<CharacterBuilderDraftRecord<TDraft>>;
  /** Writes without accepting the session-only fallback. Used by the save journal. */
  saveDurably(
    input: SaveCharacterBuilderDraftInput<TDraft>,
  ): Promise<CharacterBuilderDraftRecord<TDraft>>;
  reset(input: ResetCharacterBuilderDraftInput): Promise<void>;
  /** Deletes without reporting success until IndexedDB has committed the deletion. */
  resetDurably(input: ResetCharacterBuilderDraftInput): Promise<void>;
  /** Clears the active draft and returns the exact record that was completed. */
  complete(input: CompleteCharacterBuilderDraftInput): Promise<CharacterBuilderDraftRecord<TDraft>>;
  /** Finalizes without reporting success until IndexedDB has committed the tombstone. */
  completeDurably(
    input: CompleteCharacterBuilderDraftInput,
  ): Promise<CharacterBuilderDraftRecord<TDraft>>;
  /** Explicitly replaces an unreadable envelope with an empty migration-marked tombstone. */
  repairDurably(): Promise<void>;
  getStorageState(): CharacterBuilderDraftStorageState;
  /** Reopens IndexedDB and flushes the complete session snapshot when possible. */
  retryDurableStorage(): Promise<CharacterBuilderDraftStorageState>;
  close(): void;
}

export type CharacterBuilderDraftErrorCode =
  | 'closed'
  | 'invalid-draft'
  | 'not-found'
  | 'revision-conflict'
  | 'migration-failed'
  | 'unsupported-schema'
  | 'storage-failed';

export class CharacterBuilderDraftError extends Error {
  readonly code: CharacterBuilderDraftErrorCode;

  constructor(code: CharacterBuilderDraftErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CharacterBuilderDraftError';
    this.code = code;
  }
}

export interface CharacterBuilderDraftRepositoryOptions<TDraft> {
  readonly indexedDB?: IDBFactory | null;
  readonly databaseName?: string;
  readonly now?: () => Date;
  /** Allowlist parser applied to every value crossing the persistence boundary. */
  readonly sanitizeDraft: (value: unknown) => TDraft | null;
  readonly legacyMigration?: LegacyCharacterDesignDraftMigration<TDraft> | null;
}

interface StoredDraftEnvelope<TDraft> {
  readonly schemaVersion: typeof CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION;
  readonly id: typeof DRAFT_STATE_ID;
  readonly revision: number;
  readonly active: CharacterBuilderDraftRecord<TDraft> | null;
  readonly appliedMigrations: readonly string[];
}

interface DraftMutation<TDraft, TResult> {
  readonly envelope: StoredDraftEnvelope<TDraft>;
  readonly result: TResult;
}

interface DraftBackend<TDraft> {
  read(): Promise<StoredDraftEnvelope<TDraft>>;
  mutate<TResult>(
    mutation: (current: StoredDraftEnvelope<TDraft>) => DraftMutation<TDraft, TResult>,
  ): Promise<TResult>;
  replace(envelope: StoredDraftEnvelope<TDraft>): Promise<void>;
  repair(envelope: StoredDraftEnvelope<TDraft>): Promise<void>;
  close(): void;
}

const READY_STATE: CharacterBuilderDraftStorageState = {
  health: 'ready',
  durable: true,
  notice: null,
};

const SESSION_ONLY_STATE: CharacterBuilderDraftStorageState = {
  health: 'session-only',
  durable: false,
  notice: 'Browser draft storage is unavailable. Changes will last only until this tab closes.',
};

const DEGRADED_STATE: CharacterBuilderDraftStorageState = {
  health: 'degraded',
  durable: false,
  notice:
    'Durable draft storage failed. The active character draft remains available in this tab for retry.',
};

const emptyEnvelope = <TDraft>(): StoredDraftEnvelope<TDraft> => ({
  schemaVersion: CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION,
  id: DRAFT_STATE_ID,
  revision: 0,
  active: null,
  appliedMigrations: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && Number.isFinite(new Date(value).valueOf());

const validRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const validNonEmptyText = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;

const sanitizeOrigin = (value: unknown): CharacterBuilderDraftOrigin | null => {
  if (!isRecord(value)) return null;
  if (value.kind === 'native') return { kind: 'native' };
  if (
    value.kind !== 'legacy-character-design' ||
    !validNonEmptyText(value.migrationId, 128) ||
    !validNonEmptyText(value.sourceId, 256) ||
    !validRevision(value.sourceRevision) ||
    value.sourceRevision < 1 ||
    !validTimestamp(value.sourceUpdatedAt)
  ) {
    return null;
  }
  return {
    kind: 'legacy-character-design',
    migrationId: value.migrationId,
    sourceId: value.sourceId,
    sourceRevision: value.sourceRevision,
    sourceUpdatedAt: value.sourceUpdatedAt,
  };
};

const sanitizeActiveRecord = <TDraft>(
  value: unknown,
  sanitizeDraft: (value: unknown) => TDraft | null,
): CharacterBuilderDraftRecord<TDraft> | null => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION ||
    value.id !== DRAFT_STATE_ID ||
    !validRevision(value.revision) ||
    value.revision < 1 ||
    !validTimestamp(value.createdAt) ||
    !validTimestamp(value.updatedAt)
  ) {
    return null;
  }
  const draft = sanitizeDraft(value.value);
  const origin = sanitizeOrigin(value.origin);
  if (!draft || !origin) return null;
  return {
    schemaVersion: CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION,
    id: DRAFT_STATE_ID,
    revision: value.revision,
    value: draft,
    origin,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

const sanitizeEnvelope = <TDraft>(
  value: unknown,
  sanitizeDraft: (value: unknown) => TDraft | null,
): StoredDraftEnvelope<TDraft> | null => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION ||
    value.id !== DRAFT_STATE_ID ||
    !validRevision(value.revision) ||
    !Array.isArray(value.appliedMigrations) ||
    value.appliedMigrations.some((id) => !validNonEmptyText(id, 128))
  ) {
    return null;
  }
  const active = value.active === null ? null : sanitizeActiveRecord(value.active, sanitizeDraft);
  if (value.active !== null && !active) return null;
  if (active && active.revision !== value.revision) return null;
  return {
    schemaVersion: CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION,
    id: DRAFT_STATE_ID,
    revision: value.revision,
    active,
    appliedMigrations: [...new Set(value.appliedMigrations as string[])],
  };
};

const cloneEnvelope = <TDraft>(
  envelope: StoredDraftEnvelope<TDraft>,
): StoredDraftEnvelope<TDraft> => structuredClone(envelope);

const safeTimestamp = (now: () => Date): string => {
  const value = now();
  return Number.isFinite(value.valueOf()) ? value.toISOString() : new Date(0).toISOString();
};

const assertExpectedRevision = <TDraft>(
  expectedRevision: number | null,
  active: CharacterBuilderDraftRecord<TDraft> | null,
) => {
  if (expectedRevision === null) {
    if (active) {
      throw new CharacterBuilderDraftError(
        'revision-conflict',
        `A character draft already exists at revision ${active.revision}.`,
      );
    }
    return;
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new CharacterBuilderDraftError(
      'invalid-draft',
      'The expected character draft revision is invalid.',
    );
  }
  if (!active) {
    throw new CharacterBuilderDraftError('not-found', 'The active character draft was not found.');
  }
  if (active.revision !== expectedRevision) {
    throw new CharacterBuilderDraftError(
      'revision-conflict',
      `The character draft changed from revision ${expectedRevision} to ${active.revision}.`,
    );
  }
};

class MemoryDraftBackend<TDraft> implements DraftBackend<TDraft> {
  private envelope = emptyEnvelope<TDraft>();

  read() {
    return Promise.resolve(cloneEnvelope(this.envelope));
  }

  mutate<TResult>(
    mutation: (current: StoredDraftEnvelope<TDraft>) => DraftMutation<TDraft, TResult>,
  ) {
    const next = mutation(cloneEnvelope(this.envelope));
    this.envelope = cloneEnvelope(next.envelope);
    return Promise.resolve(structuredClone(next.result));
  }

  replace(envelope: StoredDraftEnvelope<TDraft>) {
    this.envelope = cloneEnvelope(envelope);
    return Promise.resolve();
  }

  repair(envelope: StoredDraftEnvelope<TDraft>) {
    return this.replace(envelope);
  }

  close() {}
}

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      { once: true },
    );
  });

const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    );
  });

const abortTransaction = (transaction: IDBTransaction) => {
  try {
    transaction.abort();
  } catch {
    // A completed or already-aborted transaction needs no further cleanup.
  }
};

class IndexedDbDraftBackend<TDraft> implements DraftBackend<TDraft> {
  constructor(
    private readonly database: IDBDatabase,
    private readonly sanitizeDraft: (value: unknown) => TDraft | null,
  ) {}

  private parse(raw: unknown): StoredDraftEnvelope<TDraft> {
    if (raw === undefined || raw === null) return emptyEnvelope<TDraft>();
    const envelope = sanitizeEnvelope(raw, this.sanitizeDraft);
    if (!envelope) {
      throw new CharacterBuilderDraftError(
        'unsupported-schema',
        'The stored character draft has an unsupported or damaged schema.',
      );
    }
    return envelope;
  }

  async read() {
    const transaction = this.database.transaction(CHARACTER_BUILDER_DRAFT_STORE, 'readonly');
    const completion = transactionComplete(transaction);
    const raw = await requestResult<unknown>(
      transaction.objectStore(CHARACTER_BUILDER_DRAFT_STORE).get(DRAFT_STATE_ID),
    );
    await completion;
    return this.parse(raw);
  }

  async mutate<TResult>(
    mutation: (current: StoredDraftEnvelope<TDraft>) => DraftMutation<TDraft, TResult>,
  ) {
    const transaction = this.database.transaction(CHARACTER_BUILDER_DRAFT_STORE, 'readwrite');
    const completion = transactionComplete(transaction);
    try {
      const store = transaction.objectStore(CHARACTER_BUILDER_DRAFT_STORE);
      const current = this.parse(await requestResult<unknown>(store.get(DRAFT_STATE_ID)));
      const next = mutation(current);
      store.put(cloneEnvelope(next.envelope));
      await completion;
      return structuredClone(next.result);
    } catch (error) {
      abortTransaction(transaction);
      await completion.catch(() => undefined);
      throw error;
    }
  }

  async replace(envelope: StoredDraftEnvelope<TDraft>) {
    const transaction = this.database.transaction(CHARACTER_BUILDER_DRAFT_STORE, 'readwrite');
    const completion = transactionComplete(transaction);
    try {
      const store = transaction.objectStore(CHARACTER_BUILDER_DRAFT_STORE);
      const durable = this.parse(await requestResult<unknown>(store.get(DRAFT_STATE_ID)));
      if (
        durable.revision > envelope.revision ||
        (durable.revision === envelope.revision &&
          durable.revision > 0 &&
          JSON.stringify(durable) !== JSON.stringify(envelope))
      ) {
        throw new CharacterBuilderDraftError(
          'revision-conflict',
          'The durable character draft changed while session storage was active.',
        );
      }
      store.put(cloneEnvelope(envelope));
      await completion;
    } catch (error) {
      abortTransaction(transaction);
      await completion.catch(() => undefined);
      throw error;
    }
  }

  async repair(envelope: StoredDraftEnvelope<TDraft>) {
    const transaction = this.database.transaction(CHARACTER_BUILDER_DRAFT_STORE, 'readwrite');
    const completion = transactionComplete(transaction);
    try {
      transaction.objectStore(CHARACTER_BUILDER_DRAFT_STORE).put(cloneEnvelope(envelope));
      await completion;
    } catch (error) {
      abortTransaction(transaction);
      await completion.catch(() => undefined);
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}

const openDraftDatabase = (factory: IDBFactory, databaseName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(databaseName, CHARACTER_BUILDER_DRAFT_DATABASE_VERSION);
    let settled = false;
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(CHARACTER_BUILDER_DRAFT_STORE)) {
        request.result.createObjectStore(CHARACTER_BUILDER_DRAFT_STORE, { keyPath: 'id' });
      }
    });
    request.addEventListener('success', () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      settled = true;
      reject(request.error ?? new Error('IndexedDB could not be opened.'));
    });
    request.addEventListener('blocked', () => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB is blocked by another open version.'));
    });
  });

const browserIndexedDb = (): IDBFactory | null => {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
};

const cloneAndSanitizeDraft = <TDraft>(
  value: unknown,
  sanitizeDraft: (value: unknown) => TDraft | null,
): TDraft => {
  let cloned: unknown;
  try {
    cloned = structuredClone(value);
  } catch (error) {
    throw new CharacterBuilderDraftError(
      'invalid-draft',
      'The character draft contains values that browser storage cannot clone.',
      { cause: error },
    );
  }
  const sanitized = sanitizeDraft(cloned);
  if (!sanitized) {
    throw new CharacterBuilderDraftError(
      'invalid-draft',
      'The character draft did not pass the persistence allowlist.',
    );
  }
  try {
    return structuredClone(sanitized);
  } catch (error) {
    throw new CharacterBuilderDraftError(
      'invalid-draft',
      'The sanitized character draft contains values that browser storage cannot clone.',
      { cause: error },
    );
  }
};

export const createCharacterBuilderDraftRepository = <TDraft>(
  options: CharacterBuilderDraftRepositoryOptions<TDraft>,
): CharacterBuilderDraftRepository<TDraft> => {
  const factory = options.indexedDB === undefined ? browserIndexedDb() : options.indexedDB;
  const databaseName = options.databaseName ?? CHARACTER_BUILDER_DRAFT_DATABASE_NAME;
  const now = options.now ?? (() => new Date());
  const memory = new MemoryDraftBackend<TDraft>();
  let backend: DraftBackend<TDraft> | null = null;
  let storageState = SESSION_ONLY_STATE;
  let initialization: Promise<void> | null = null;
  let durableRetry: Promise<CharacterBuilderDraftStorageState> | null = null;
  let closed = false;

  const initialize = async () => {
    if (closed)
      throw new CharacterBuilderDraftError('closed', 'Character draft storage is closed.');
    if (backend) return;
    if (initialization) return initialization;
    initialization = (async () => {
      if (!factory) {
        backend = memory;
        storageState = SESSION_ONLY_STATE;
        return;
      }
      try {
        backend = new IndexedDbDraftBackend(
          await openDraftDatabase(factory, databaseName),
          options.sanitizeDraft,
        );
        storageState = READY_STATE;
      } catch {
        backend = memory;
        storageState = SESSION_ONLY_STATE;
      }
    })();
    return initialization;
  };

  const getBackend = async () => {
    if (durableRetry) await durableRetry;
    await initialize();
    if (!backend) {
      throw new CharacterBuilderDraftError(
        'storage-failed',
        'Character draft storage is unavailable.',
      );
    }
    return backend;
  };

  const operation = async <TResult>(
    run: (target: DraftBackend<TDraft>) => Promise<TResult>,
  ): Promise<TResult> => {
    const target = await getBackend();
    try {
      return await run(target);
    } catch (error) {
      const semanticFailure =
        error instanceof CharacterBuilderDraftError && error.code !== 'storage-failed';
      if (target === memory || semanticFailure) throw error;
      target.close();
      backend = memory;
      storageState = DEGRADED_STATE;
      try {
        return await run(memory);
      } catch (fallbackError) {
        if (fallbackError instanceof CharacterBuilderDraftError) throw fallbackError;
        throw new CharacterBuilderDraftError(
          'storage-failed',
          'Browser draft storage could not complete the operation.',
          { cause: fallbackError },
        );
      }
    }
  };

  const durableOperation = async <TResult>(
    run: (target: DraftBackend<TDraft>) => Promise<TResult>,
  ): Promise<TResult> => {
    await initialize();
    if (backend === memory || !storageState.durable) {
      const recovered = await retryDurableStorage();
      if (!recovered.durable || backend === memory) {
        throw new CharacterBuilderDraftError(
          'storage-failed',
          recovered.notice ?? 'Durable character draft storage is unavailable.',
        );
      }
    }
    const target = backend;
    if (!target || target === memory) {
      throw new CharacterBuilderDraftError(
        'storage-failed',
        'Durable character draft storage is unavailable.',
      );
    }
    try {
      return await run(target);
    } catch (error) {
      const semanticFailure =
        error instanceof CharacterBuilderDraftError && error.code !== 'storage-failed';
      if (semanticFailure) throw error;
      target.close();
      backend = memory;
      storageState = DEGRADED_STATE;
      throw new CharacterBuilderDraftError(
        'storage-failed',
        'Durable character draft storage could not complete the operation.',
        { cause: error },
      );
    }
  };

  const mutate = async <TResult>(
    mutation: (current: StoredDraftEnvelope<TDraft>) => DraftMutation<TDraft, TResult>,
    requireDurable = false,
  ): Promise<TResult> => {
    const execute = requireDurable ? durableOperation : operation;
    const outcome = await execute((target) =>
      target.mutate((current) => {
        const next = mutation(current);
        return {
          envelope: next.envelope,
          result: { envelope: next.envelope, value: next.result },
        };
      }),
    );
    await memory.replace(outcome.envelope);
    return outcome.value;
  };

  const saveWithDurability = async (
    input: SaveCharacterBuilderDraftInput<TDraft>,
    requireDurable: boolean,
  ): Promise<CharacterBuilderDraftRecord<TDraft>> => {
    const value = cloneAndSanitizeDraft(input.value, options.sanitizeDraft);
    const updatedAt = safeTimestamp(now);
    return mutate((current) => {
      assertExpectedRevision(input.expectedRevision, current.active);
      const revision = current.revision + 1;
      const record: CharacterBuilderDraftRecord<TDraft> = {
        schemaVersion: CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION,
        id: DRAFT_STATE_ID,
        revision,
        value,
        origin: current.active?.origin ?? { kind: 'native' },
        createdAt: current.active?.createdAt ?? updatedAt,
        updatedAt,
      };
      return {
        envelope: { ...current, revision, active: record },
        result: record,
      };
    }, requireDurable);
  };

  const save = (input: SaveCharacterBuilderDraftInput<TDraft>) => saveWithDurability(input, false);

  const saveDurably = (input: SaveCharacterBuilderDraftInput<TDraft>) =>
    saveWithDurability(input, true);

  const resetWithDurability = async (
    input: ResetCharacterBuilderDraftInput,
    requireDurable: boolean,
  ): Promise<void> => {
    await mutate((current) => {
      assertExpectedRevision(input.expectedRevision, current.active);
      if (!current.active) return { envelope: current, result: undefined };
      return {
        envelope: { ...current, revision: current.revision + 1, active: null },
        result: undefined,
      };
    }, requireDurable);
  };

  const reset = (input: ResetCharacterBuilderDraftInput) => resetWithDurability(input, false);

  const resetDurably = (input: ResetCharacterBuilderDraftInput) => resetWithDurability(input, true);

  const completeWithDurability = async (
    input: CompleteCharacterBuilderDraftInput,
    requireDurable: boolean,
  ): Promise<CharacterBuilderDraftRecord<TDraft>> =>
    mutate((current) => {
      assertExpectedRevision(input.expectedRevision, current.active);
      const completed = current.active;
      if (!completed) {
        throw new CharacterBuilderDraftError(
          'not-found',
          'The active character draft was not found.',
        );
      }
      return {
        envelope: { ...current, revision: current.revision + 1, active: null },
        result: completed,
      };
    }, requireDurable);

  const complete = (input: CompleteCharacterBuilderDraftInput) =>
    completeWithDurability(input, false);

  const completeDurably = (input: CompleteCharacterBuilderDraftInput) =>
    completeWithDurability(input, true);

  const repairDurably = async (): Promise<void> => {
    const migrationId = options.legacyMigration?.id;
    const envelope: StoredDraftEnvelope<TDraft> = {
      ...emptyEnvelope<TDraft>(),
      revision: 1,
      appliedMigrations: migrationId && validNonEmptyText(migrationId, 128) ? [migrationId] : [],
    };
    await durableOperation((target) => target.repair(envelope));
    await memory.replace(envelope);
  };

  const applyLegacyMigration = async (
    current: CharacterBuilderDraftRecord<TDraft> | null,
  ): Promise<CharacterBuilderDraftRecord<TDraft> | null> => {
    const migration = options.legacyMigration;
    if (!migration) return current;
    if (!validNonEmptyText(migration.id, 128)) {
      throw new CharacterBuilderDraftError(
        'migration-failed',
        'The legacy character draft migration ID is invalid.',
      );
    }
    const envelope = await operation((target) => target.read());
    if (envelope.appliedMigrations.includes(migration.id)) return envelope.active;

    let candidate: LegacyCharacterDesignDraftCandidate<TDraft> | null;
    try {
      candidate = await migration.loadNewestCharacterDesign();
    } catch (error) {
      throw new CharacterBuilderDraftError(
        'migration-failed',
        'The newest legacy character design could not be read.',
        { cause: error },
      );
    }
    const importedValue = candidate
      ? cloneAndSanitizeDraft(candidate.value, options.sanitizeDraft)
      : null;
    if (
      candidate &&
      (!validNonEmptyText(candidate.sourceId, 256) ||
        !validRevision(candidate.sourceRevision) ||
        candidate.sourceRevision < 1 ||
        !validTimestamp(candidate.sourceUpdatedAt))
    ) {
      throw new CharacterBuilderDraftError(
        'migration-failed',
        'The legacy character design migration returned invalid provenance.',
      );
    }
    const importedAt = safeTimestamp(now);
    return mutate((latest) => {
      if (latest.appliedMigrations.includes(migration.id)) {
        return { envelope: latest, result: latest.active };
      }
      const revision = latest.revision + 1;
      const imported: CharacterBuilderDraftRecord<TDraft> | null =
        latest.active || !candidate || !importedValue
          ? latest.active
          : {
              schemaVersion: CHARACTER_BUILDER_DRAFT_SCHEMA_VERSION,
              id: DRAFT_STATE_ID,
              revision,
              value: importedValue,
              origin: {
                kind: 'legacy-character-design',
                migrationId: migration.id,
                sourceId: candidate.sourceId,
                sourceRevision: candidate.sourceRevision,
                sourceUpdatedAt: candidate.sourceUpdatedAt,
              },
              createdAt: importedAt,
              updatedAt: importedAt,
            };
      return {
        envelope: {
          ...latest,
          revision,
          active: imported
            ? {
                ...imported,
                revision,
              }
            : null,
          appliedMigrations: [...latest.appliedMigrations, migration.id],
        },
        result: imported
          ? {
              ...imported,
              revision,
            }
          : null,
      };
    });
  };

  const load = async (): Promise<CharacterBuilderDraftRecord<TDraft> | null> => {
    const envelope = await operation((target) => target.read());
    await memory.replace(envelope);
    return applyLegacyMigration(envelope.active);
  };

  const retryDurableStorage = (): Promise<CharacterBuilderDraftStorageState> => {
    if (durableRetry) return durableRetry;
    const attempt = (async () => {
      if (closed) {
        throw new CharacterBuilderDraftError('closed', 'Character draft storage is closed.');
      }
      await initialize();
      if (storageState.durable && backend !== memory) return storageState;
      if (!factory) {
        storageState = SESSION_ONLY_STATE;
        return storageState;
      }
      let candidate: IndexedDbDraftBackend<TDraft> | null = null;
      try {
        const snapshot = await memory.read();
        candidate = new IndexedDbDraftBackend(
          await openDraftDatabase(factory, databaseName),
          options.sanitizeDraft,
        );
        await candidate.replace(snapshot);
        if (closed)
          throw new CharacterBuilderDraftError('closed', 'Character draft storage is closed.');
        backend = candidate;
        storageState = READY_STATE;
      } catch (error) {
        candidate?.close();
        if (closed) throw error;
        backend = memory;
        storageState = DEGRADED_STATE;
      }
      return storageState;
    })();
    durableRetry = attempt;
    void attempt.finally(() => {
      if (durableRetry === attempt) durableRetry = null;
    });
    return attempt;
  };

  return {
    load,
    save,
    saveDurably,
    reset,
    resetDurably,
    complete,
    completeDurably,
    repairDurably,
    getStorageState: () => storageState,
    retryDurableStorage,
    close: () => {
      if (closed) return;
      closed = true;
      backend?.close();
      if (backend !== memory) memory.close();
      backend = null;
    },
  };
};
