import {
  sanitizeGuidedDesignV1,
  sanitizePromptBuilderDraft,
  type CharacterTransformDraft,
  type GuidedDesignV1,
} from '@studio/domain';
import {
  browserIndexedDb,
  openIndexedDatabase,
  requestResult,
  transactionComplete,
} from '../../adapters/indexed-db/indexedDb';
import {
  GUIDED_PROJECT_SCHEMA_VERSION,
  type GuidedProjectDataV1,
  type LocalProjectRepository,
  type PersistedVideoMetadata,
  type ProjectRecordV1,
  type ProjectStorageState,
  type ProjectSummary,
} from './types';

export const GUIDED_PROJECT_DATABASE_NAME = 'lightframe.local-projects';
export const GUIDED_PROJECT_DATABASE_VERSION = 1;
export const GUIDED_PROJECTS_STORE = 'projects';
export const GUIDED_PROJECT_ARTIFACTS_STORE = 'artifacts';

export type ProjectStorageErrorCode = 'closed' | 'storage-failed';

export class ProjectStorageError extends Error {
  readonly code: ProjectStorageErrorCode;

  constructor(code: ProjectStorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProjectStorageError';
    this.code = code;
  }
}

export interface LocalProjectRepositoryOptions {
  readonly indexedDB?: IDBFactory | null;
  readonly databaseName?: string;
}

type ProjectArtifactKind = 'original-video' | 'original-audio' | 'processed-video';

interface ProjectArtifactRecord {
  readonly id: string;
  readonly projectId: string;
  readonly kind: ProjectArtifactKind;
  readonly blob: Blob;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sourceArtifactId: string | null;
  readonly createdAt: string;
}

interface ProjectBackend {
  list(): Promise<readonly ProjectRecordV1[]>;
  load(projectId: string): Promise<ProjectRecordV1 | null>;
  readArtifact(projectId: string, artifactId: string): Promise<Blob | null>;
  deleteProject(projectId: string): Promise<void>;
  close(): void;
}

const READY_STATE: ProjectStorageState = { health: 'ready', durable: true, notice: null };
const INITIAL_STATE: ProjectStorageState = {
  health: 'session-only',
  durable: false,
  notice: 'Project storage has not been initialized.',
};
const SESSION_ONLY_STATE: ProjectStorageState = {
  health: 'session-only',
  durable: false,
  notice: 'Browser project storage is unavailable. Changes will last only until this tab closes.',
};
const DEGRADED_STATE: ProjectStorageState = {
  health: 'degraded',
  durable: false,
  notice:
    'Durable browser storage failed. Your project and active media remain available in this tab for retry or download.',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const limitedText = (value: unknown, maxLength: number): string | null =>
  typeof value === 'string' && value.length <= maxLength ? value : null;

const nullableText = (value: unknown, maxLength: number): string | null | undefined =>
  value === null ? null : (limitedText(value, maxLength) ?? undefined);

const timestamp = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 64) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) ? value : null;
};

const sanitizeGuidedDesign = (value: unknown): GuidedDesignV1 | null | undefined => {
  if (value === null) return null;
  return sanitizeGuidedDesignV1(value) ?? undefined;
};

const sanitizeCharacterDraft = (value: unknown): CharacterTransformDraft | null | undefined => {
  if (value === undefined || value === null) return null;
  const draft = sanitizePromptBuilderDraft(value);
  return draft?.intent === 'character-transform' ? draft : undefined;
};

const sanitizeVideoMetadata = (value: unknown): PersistedVideoMetadata | null | undefined => {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const filename = limitedText(value.filename, 256);
  const mimeType = limitedText(value.mimeType, 128);
  const sourceModeId = limitedText(value.sourceModeId, 128);
  const startedAt = timestamp(value.startedAt);
  if (
    !filename?.trim() ||
    !mimeType?.trim() ||
    !sourceModeId?.trim() ||
    !startedAt ||
    typeof value.durationMs !== 'number' ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    typeof value.sizeBytes !== 'number' ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 0
  ) {
    return undefined;
  }
  return {
    filename,
    mimeType,
    sourceModeId,
    startedAt,
    durationMs: value.durationMs,
    sizeBytes: value.sizeBytes,
  };
};

/** Allowlist compatibility checkpoint data; runtime and unknown fields are discarded. */
export const sanitizeGuidedProjectData = (value: unknown): GuidedProjectDataV1 | null => {
  if (!isRecord(value)) return null;
  const characterId = nullableText(value.characterId, 256);
  const characterName = limitedText(value.characterName, 160);
  const characterPrompt = limitedText(value.characterPrompt, 12_000);
  const characterDraft = sanitizeCharacterDraft(value.characterDraft);
  const guidedDesign = sanitizeGuidedDesign(value.guidedDesign);
  const referenceMode =
    value.referenceMode === null ||
    value.referenceMode === 'prompt-only' ||
    value.referenceMode === 'generate' ||
    value.referenceMode === 'existing'
      ? value.referenceMode
      : undefined;
  const referenceImageAssetId = nullableText(value.referenceImageAssetId, 256);
  const originalVideoArtifactId = nullableText(value.originalVideoArtifactId, 256);
  const originalVideoMetadata = sanitizeVideoMetadata(value.originalVideoMetadata);
  const originalAudioArtifactId = nullableText(value.originalAudioArtifactId, 256);
  const originalAudioMimeType = nullableText(value.originalAudioMimeType, 128);
  const processedVideoArtifactId = nullableText(value.processedVideoArtifactId, 256);
  const processedVideoMetadata = sanitizeVideoMetadata(value.processedVideoMetadata);
  const selectedVoiceId = nullableText(value.selectedVoiceId, 256);
  const selectedVoiceName = nullableText(value.selectedVoiceName, 256);
  const downloadStartedAt =
    value.downloadStartedAt === null ? null : timestamp(value.downloadStartedAt);
  const completedAt = value.completedAt === null ? null : timestamp(value.completedAt);
  const finalVariant =
    value.finalVariant === null ||
    value.finalVariant === 'original' ||
    value.finalVariant === 'processed'
      ? value.finalVariant
      : undefined;
  if (
    characterId === undefined ||
    characterName === null ||
    characterPrompt === null ||
    characterDraft === undefined ||
    guidedDesign === undefined ||
    referenceMode === undefined ||
    referenceImageAssetId === undefined ||
    typeof value.referenceImageStale !== 'boolean' ||
    originalVideoArtifactId === undefined ||
    originalVideoMetadata === undefined ||
    originalAudioArtifactId === undefined ||
    originalAudioMimeType === undefined ||
    processedVideoArtifactId === undefined ||
    processedVideoMetadata === undefined ||
    finalVariant === undefined ||
    selectedVoiceId === undefined ||
    selectedVoiceName === undefined ||
    (downloadStartedAt === null && value.downloadStartedAt !== null) ||
    (completedAt === null && value.completedAt !== null)
  ) {
    return null;
  }
  return {
    characterId,
    characterName,
    characterPrompt,
    characterDraft,
    guidedDesign,
    referenceMode,
    referenceImageAssetId,
    referenceImageStale: value.referenceImageStale,
    originalVideoArtifactId,
    originalVideoMetadata,
    originalAudioArtifactId,
    originalAudioMimeType,
    processedVideoArtifactId,
    processedVideoMetadata,
    finalVariant,
    selectedVoiceId,
    selectedVoiceName,
    downloadStartedAt,
    completedAt,
  };
};

const projectCheckpoints = new Set([
  'character-design',
  'character-ready',
  'review-take',
  'accepted-take',
  'selected-voice',
  'processed-voice',
  'delivery-ready',
  'complete',
]);

export const sanitizeProjectRecord = (value: unknown): ProjectRecordV1 | null => {
  if (!isRecord(value) || value.schemaVersion !== GUIDED_PROJECT_SCHEMA_VERSION) return null;
  const id = limitedText(value.id, 256);
  const title = limitedText(value.title, 160);
  const data = sanitizeGuidedProjectData(value.data);
  const createdAt = timestamp(value.createdAt);
  const updatedAt = timestamp(value.updatedAt);
  if (
    !id?.trim() ||
    !title?.trim() ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    typeof value.checkpoint !== 'string' ||
    !projectCheckpoints.has(value.checkpoint) ||
    !data ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  return {
    schemaVersion: GUIDED_PROJECT_SCHEMA_VERSION,
    id,
    title,
    revision: value.revision as number,
    checkpoint: value.checkpoint as ProjectRecordV1['checkpoint'],
    data,
    createdAt,
    updatedAt,
  };
};

const sanitizeArtifactRecord = (value: unknown): ProjectArtifactRecord | null => {
  if (!isRecord(value)) return null;
  const id = limitedText(value.id, 256);
  const projectId = limitedText(value.projectId, 256);
  const mimeType = limitedText(value.mimeType, 128);
  const sourceArtifactId = nullableText(value.sourceArtifactId, 256);
  const createdAt = timestamp(value.createdAt);
  if (
    !id?.trim() ||
    !projectId?.trim() ||
    (value.kind !== 'original-video' &&
      value.kind !== 'original-audio' &&
      value.kind !== 'processed-video') ||
    !(value.blob instanceof Blob) ||
    !mimeType?.trim() ||
    value.blob.size !== value.sizeBytes ||
    sourceArtifactId === undefined ||
    !createdAt
  ) {
    return null;
  }
  return {
    id,
    projectId,
    kind: value.kind,
    blob: value.blob,
    mimeType,
    sizeBytes: value.blob.size,
    sourceArtifactId,
    createdAt,
  };
};

const toSummary = (project: ProjectRecordV1): ProjectSummary => ({
  id: project.id,
  title: project.title,
  revision: project.revision,
  checkpoint: project.checkpoint,
  characterName: project.data.characterName,
  hasOriginalVideo: project.data.originalVideoArtifactId !== null,
  hasProcessedVideo: project.data.processedVideoArtifactId !== null,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

const cloneProject = (record: ProjectRecordV1): ProjectRecordV1 => structuredClone(record);

const cloneArtifact = (record: ProjectArtifactRecord): ProjectArtifactRecord => ({
  ...record,
  blob: record.blob.slice(0, record.blob.size, record.mimeType),
});

class MemoryProjectBackend implements ProjectBackend {
  readonly #projects = new Map<string, ProjectRecordV1>();
  readonly #artifacts = new Map<string, ProjectArtifactRecord>();
  #closed = false;

  #assertOpen() {
    if (this.#closed) throw new ProjectStorageError('closed', 'Project storage is closed.');
  }

  seedProject(record: ProjectRecordV1) {
    this.#assertOpen();
    this.#projects.set(record.id, cloneProject(record));
  }

  seedArtifact(record: ProjectArtifactRecord) {
    this.#assertOpen();
    this.#artifacts.set(record.id, cloneArtifact(record));
  }

  list() {
    this.#assertOpen();
    return Promise.resolve([...this.#projects.values()].map(cloneProject));
  }

  load(projectId: string) {
    this.#assertOpen();
    const project = this.#projects.get(projectId);
    return Promise.resolve(project ? cloneProject(project) : null);
  }

  readArtifact(projectId: string, artifactId: string) {
    this.#assertOpen();
    const artifact = this.#artifacts.get(artifactId);
    return Promise.resolve(artifact?.projectId === projectId ? cloneArtifact(artifact).blob : null);
  }

  deleteProject(projectId: string) {
    this.#assertOpen();
    this.#projects.delete(projectId);
    for (const [artifactId, artifact] of this.#artifacts) {
      if (artifact.projectId === projectId) this.#artifacts.delete(artifactId);
    }
    return Promise.resolve();
  }

  close() {
    this.#closed = true;
  }
}

const deleteProjectArtifacts = (artifacts: IDBObjectStore, projectId: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = artifacts.index('by-project-id').openCursor(projectId);
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB cursor failed.')),
      { once: true },
    );
    request.addEventListener('success', () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    });
  });

class IndexedDbProjectBackend implements ProjectBackend {
  constructor(private readonly database: IDBDatabase) {
    database.addEventListener('versionchange', () => database.close());
  }

  async list() {
    const transaction = this.database.transaction(GUIDED_PROJECTS_STORE, 'readonly');
    const completion = transactionComplete(transaction);
    const records = await requestResult<unknown[]>(
      transaction.objectStore(GUIDED_PROJECTS_STORE).getAll(),
    );
    await completion;
    return records
      .map((record) => sanitizeProjectRecord(record))
      .filter((record): record is ProjectRecordV1 => record !== null);
  }

  async load(projectId: string) {
    const transaction = this.database.transaction(GUIDED_PROJECTS_STORE, 'readonly');
    const completion = transactionComplete(transaction);
    const record = await requestResult<unknown>(
      transaction.objectStore(GUIDED_PROJECTS_STORE).get(projectId),
    );
    await completion;
    return sanitizeProjectRecord(record);
  }

  async readArtifact(projectId: string, artifactId: string) {
    const transaction = this.database.transaction(GUIDED_PROJECT_ARTIFACTS_STORE, 'readonly');
    const completion = transactionComplete(transaction);
    const rawArtifact = await requestResult<unknown>(
      transaction.objectStore(GUIDED_PROJECT_ARTIFACTS_STORE).get(artifactId),
    );
    await completion;
    const artifact = sanitizeArtifactRecord(rawArtifact);
    return artifact?.projectId === projectId ? artifact.blob : null;
  }

  async deleteProject(projectId: string) {
    const transaction = this.database.transaction(
      [GUIDED_PROJECTS_STORE, GUIDED_PROJECT_ARTIFACTS_STORE],
      'readwrite',
    );
    const completion = transactionComplete(transaction);
    transaction.objectStore(GUIDED_PROJECTS_STORE).delete(projectId);
    await deleteProjectArtifacts(
      transaction.objectStore(GUIDED_PROJECT_ARTIFACTS_STORE),
      projectId,
    );
    await completion;
  }

  close() {
    this.database.close();
  }
}

const openProjectDatabase = (factory: IDBFactory, databaseName: string): Promise<IDBDatabase> =>
  openIndexedDatabase(factory, databaseName, GUIDED_PROJECT_DATABASE_VERSION, (database) => {
    if (!database.objectStoreNames.contains(GUIDED_PROJECTS_STORE)) {
      database.createObjectStore(GUIDED_PROJECTS_STORE, { keyPath: 'id' });
    }
    if (!database.objectStoreNames.contains(GUIDED_PROJECT_ARTIFACTS_STORE)) {
      const artifacts = database.createObjectStore(GUIDED_PROJECT_ARTIFACTS_STORE, {
        keyPath: 'id',
      });
      artifacts.createIndex('by-project-id', 'projectId', { unique: false });
    }
  });

export const createLocalProjectRepository = (
  options: LocalProjectRepositoryOptions = {},
): LocalProjectRepository => {
  const factory = options.indexedDB === undefined ? browserIndexedDb() : options.indexedDB;
  const databaseName = options.databaseName ?? GUIDED_PROJECT_DATABASE_NAME;
  let state = INITIAL_STATE;
  let backend: ProjectBackend | null = null;
  const memoryFallback = new MemoryProjectBackend();
  let initialization: Promise<ProjectStorageState> | null = null;
  let closed = false;

  const initialize = async (): Promise<ProjectStorageState> => {
    if (closed) throw new ProjectStorageError('closed', 'Project storage is closed.');
    if (backend) return state;
    if (initialization) return initialization;
    initialization = (async () => {
      if (!factory) {
        backend = memoryFallback;
        state = SESSION_ONLY_STATE;
        return state;
      }
      try {
        const database = await openProjectDatabase(factory, databaseName);
        if (closed) {
          database.close();
          throw new ProjectStorageError('closed', 'Project storage is closed.');
        }
        backend = new IndexedDbProjectBackend(database);
        state = READY_STATE;
      } catch (error) {
        if (closed) throw error;
        backend = memoryFallback;
        state = SESSION_ONLY_STATE;
      }
      return state;
    })();
    return initialization;
  };

  const getBackend = async () => {
    if (closed) throw new ProjectStorageError('closed', 'Project storage is closed.');
    await initialize();
    if (!backend) {
      throw new ProjectStorageError('storage-failed', 'Project storage is unavailable.');
    }
    return backend;
  };

  const operation = async <T>(run: (target: ProjectBackend) => Promise<T>): Promise<T> => {
    const target = await getBackend();
    try {
      return await run(target);
    } catch (error) {
      if (target !== memoryFallback) {
        target.close();
        backend = memoryFallback;
        state = DEGRADED_STATE;
        return run(memoryFallback);
      }
      if (error instanceof ProjectStorageError) throw error;
      throw new ProjectStorageError(
        'storage-failed',
        'Browser project storage could not complete the operation.',
        { cause: error },
      );
    }
  };

  return {
    initialize,
    getStorageState: () => state,
    list: async () => {
      const projects = await operation((target) => target.list());
      for (const project of projects) memoryFallback.seedProject(project);
      return [...projects]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map(toSummary);
    },
    load: async (projectId) => {
      const project = await operation((target) => target.load(projectId));
      if (project) memoryFallback.seedProject(project);
      return project;
    },
    readArtifact: async (projectId, artifactId) => {
      const blob = await operation((target) => target.readArtifact(projectId, artifactId));
      if (blob && backend !== memoryFallback) {
        const project = await backend?.load(projectId);
        if (project) {
          memoryFallback.seedProject(project);
          const kind =
            project.data.originalVideoArtifactId === artifactId
              ? 'original-video'
              : project.data.originalAudioArtifactId === artifactId
                ? 'original-audio'
                : project.data.processedVideoArtifactId === artifactId
                  ? 'processed-video'
                  : null;
          if (kind) {
            memoryFallback.seedArtifact({
              id: artifactId,
              projectId,
              kind,
              blob,
              mimeType: blob.type,
              sizeBytes: blob.size,
              sourceArtifactId:
                kind === 'processed-video' ? project.data.originalVideoArtifactId : null,
              createdAt: project.createdAt,
            });
          }
        }
      }
      return blob;
    },
    deleteProject: async (projectId) => {
      await operation((target) => target.deleteProject(projectId));
      if (backend !== memoryFallback) await memoryFallback.deleteProject(projectId);
    },
    close: () => {
      if (closed) return;
      closed = true;
      backend?.close();
      if (backend !== memoryFallback) memoryFallback.close();
      backend = null;
    },
  };
};
