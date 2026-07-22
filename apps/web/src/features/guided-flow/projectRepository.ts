import {
  sanitizeGuidedDesignV1,
  sanitizePromptBuilderDraft,
  type CharacterTransformDraft,
  type GuidedDesignV1,
} from '@studio/domain';
import {
  abortTransaction,
  browserIndexedDb,
  openIndexedDatabase,
  requestResult,
  transactionComplete,
} from '../../adapters/indexed-db/indexedDb';
import {
  GUIDED_PROJECT_SCHEMA_VERSION,
  type CheckpointCommit,
  type LocalProjectRepository,
  type ProjectArtifactCommit,
  type ProjectArtifactRecord,
  type GuidedProjectDataV1,
  type PersistedVideoMetadata,
  type ProjectRecordV1,
  type ProjectStorageState,
  type ProjectSummary,
} from './types';

export const GUIDED_PROJECT_DATABASE_NAME = 'lightframe.local-projects';
export const GUIDED_PROJECT_DATABASE_VERSION = 1;
export const GUIDED_PROJECTS_STORE = 'projects';
export const GUIDED_PROJECT_ARTIFACTS_STORE = 'artifacts';

export type ProjectStorageErrorCode =
  | 'closed'
  | 'invalid-project'
  | 'invalid-artifact'
  | 'not-found'
  | 'revision-conflict'
  | 'immutable-artifact'
  | 'storage-failed';

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
  readonly now?: () => Date;
}

export type ProjectRetention = 'persistent' | 'best-effort' | 'unsupported';

export interface ProjectPersistenceManager {
  persisted?(): Promise<boolean>;
  persist?(): Promise<boolean>;
}

/** Call only after an explicit user-initiated media save. */
export const requestPersistentProjectStorage = async (
  suppliedManager?: ProjectPersistenceManager | null,
): Promise<ProjectRetention> => {
  const manager =
    suppliedManager === undefined
      ? typeof navigator === 'undefined'
        ? null
        : navigator.storage
      : suppliedManager;
  if (!manager?.persist) return 'unsupported';
  try {
    if (manager.persisted && (await manager.persisted())) return 'persistent';
    return (await manager.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
};

interface ProjectBackend {
  list(): Promise<readonly ProjectRecordV1[]>;
  load(projectId: string): Promise<ProjectRecordV1 | null>;
  readArtifact(projectId: string, artifactId: string): Promise<Blob | null>;
  commit(input: CheckpointCommit, now: string): Promise<ProjectRecordV1>;
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

const validId = (value: string) => value.trim().length > 0 && value.length <= 256;

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
  )
    return undefined;
  return {
    filename,
    mimeType,
    sourceModeId,
    startedAt,
    durationMs: value.durationMs,
    sizeBytes: value.sizeBytes,
  };
};

/** Allowlist durable checkpoint data; runtime and unknown fields are discarded. */
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
  )
    return null;
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
  )
    return null;
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
  )
    return null;
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

const validateCommit = (input: CheckpointCommit) => {
  if (!validId(input.projectId)) {
    throw new ProjectStorageError('invalid-project', 'A valid project ID is required.');
  }
  if (!input.title.trim() || input.title.length > 160) {
    throw new ProjectStorageError(
      'invalid-project',
      'A project title between 1 and 160 characters is required.',
    );
  }
  if (
    input.expectedRevision !== null &&
    (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)
  ) {
    throw new ProjectStorageError('invalid-project', 'The expected project revision is invalid.');
  }
  const ids = new Set<string>();
  for (const artifact of input.artifacts ?? []) {
    validateArtifact(artifact);
    if (ids.has(artifact.id)) {
      throw new ProjectStorageError(
        'invalid-artifact',
        `Artifact ${artifact.id} appears more than once in the checkpoint.`,
      );
    }
    ids.add(artifact.id);
  }
};

const validateArtifact = (artifact: ProjectArtifactCommit) => {
  if (!validId(artifact.id) || !(artifact.blob instanceof Blob) || artifact.blob.size === 0) {
    throw new ProjectStorageError(
      'invalid-artifact',
      'Project artifacts must have an ID and data.',
    );
  }
  const mimeType = (artifact.mimeType ?? artifact.blob.type).trim();
  if (!mimeType || mimeType.length > 128) {
    throw new ProjectStorageError(
      'invalid-artifact',
      'Project artifacts require a valid MIME type.',
    );
  }
  if (artifact.kind === 'processed-video' && !artifact.sourceArtifactId) {
    throw new ProjectStorageError(
      'invalid-artifact',
      'A processed video must reference its immutable original video.',
    );
  }
};

const artifactRecord = (
  projectId: string,
  input: ProjectArtifactCommit,
  now: string,
): ProjectArtifactRecord => ({
  id: input.id,
  projectId,
  kind: input.kind,
  blob: input.blob,
  mimeType: (input.mimeType ?? input.blob.type).trim(),
  sizeBytes: input.blob.size,
  sourceArtifactId: input.sourceArtifactId ?? null,
  createdAt: now,
});

const recordForCommit = (
  input: CheckpointCommit,
  current: ProjectRecordV1 | null,
  now: string,
): ProjectRecordV1 => {
  const data = sanitizeGuidedProjectData(input.data);
  if (!data)
    throw new ProjectStorageError('invalid-project', 'Project checkpoint data is invalid.');
  return {
    schemaVersion: GUIDED_PROJECT_SCHEMA_VERSION,
    id: input.projectId,
    title: input.title.trim(),
    revision: (current?.revision ?? 0) + 1,
    checkpoint: input.checkpoint,
    data,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };
};

const assertExpectedRevision = (input: CheckpointCommit, current: ProjectRecordV1 | null) => {
  if (input.expectedRevision === null) {
    if (current) {
      throw new ProjectStorageError(
        'revision-conflict',
        `Project ${input.projectId} already exists at revision ${current.revision}.`,
      );
    }
    return;
  }
  if (!current) {
    throw new ProjectStorageError('not-found', `Project ${input.projectId} was not found.`);
  }
  if (current.revision !== input.expectedRevision) {
    throw new ProjectStorageError(
      'revision-conflict',
      `Project ${input.projectId} changed from revision ${input.expectedRevision} to ${current.revision}.`,
    );
  }
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
  id: record.id,
  projectId: record.projectId,
  kind: record.kind,
  blob: record.blob.slice(0, record.blob.size, record.mimeType),
  mimeType: record.mimeType,
  sizeBytes: record.sizeBytes,
  sourceArtifactId: record.sourceArtifactId,
  createdAt: record.createdAt,
});

interface ProjectBackendSnapshot {
  readonly projects: readonly ProjectRecordV1[];
  readonly artifacts: readonly ProjectArtifactRecord[];
}

interface DeletedProjectSnapshot {
  readonly projectId: string;
  readonly revision: number | null;
}

interface RemovedArtifactSnapshot {
  readonly artifactId: string;
  readonly projectId: string;
}

const sameArtifactIdentity = (left: ProjectArtifactRecord, right: ProjectArtifactRecord): boolean =>
  left.id === right.id &&
  left.projectId === right.projectId &&
  left.kind === right.kind &&
  left.mimeType === right.mimeType &&
  left.sizeBytes === right.sizeBytes &&
  left.sourceArtifactId === right.sourceArtifactId;

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

  removeSeededArtifact(artifactId: string) {
    this.#assertOpen();
    this.#artifacts.delete(artifactId);
  }

  snapshot(): ProjectBackendSnapshot {
    this.#assertOpen();
    return {
      projects: [...this.#projects.values()].map(cloneProject),
      artifacts: [...this.#artifacts.values()].map(cloneArtifact),
    };
  }

  list() {
    this.#assertOpen();
    return Promise.resolve([...this.#projects.values()].map(cloneProject));
  }

  load(projectId: string) {
    this.#assertOpen();
    const value = this.#projects.get(projectId);
    return Promise.resolve(value ? cloneProject(value) : null);
  }

  readArtifact(projectId: string, artifactId: string) {
    this.#assertOpen();
    const artifact = this.#artifacts.get(artifactId);
    if (!artifact || artifact.projectId !== projectId) return Promise.resolve(null);
    return Promise.resolve(cloneArtifact(artifact).blob);
  }

  commit(input: CheckpointCommit, now: string) {
    this.#assertOpen();
    validateCommit(input);
    const current = this.#projects.get(input.projectId) ?? null;
    assertExpectedRevision(input, current);

    const nextArtifacts = new Map(this.#artifacts);
    for (const artifactId of input.removeArtifactIds ?? []) {
      const artifact = nextArtifacts.get(artifactId);
      if (!artifact || artifact.projectId !== input.projectId) continue;
      if (artifact.kind !== 'processed-video') {
        throw new ProjectStorageError(
          'immutable-artifact',
          'Original project media can only be removed by deleting the project.',
        );
      }
      nextArtifacts.delete(artifactId);
    }
    for (const pending of input.artifacts ?? []) {
      if (nextArtifacts.has(pending.id)) {
        throw new ProjectStorageError(
          'immutable-artifact',
          `Artifact ${pending.id} already exists and cannot be overwritten.`,
        );
      }
      if (pending.kind === 'processed-video') {
        const source = nextArtifacts.get(pending.sourceArtifactId ?? '');
        if (!source || source.projectId !== input.projectId || source.kind !== 'original-video') {
          throw new ProjectStorageError(
            'invalid-artifact',
            'The processed video source must be an original video in this project.',
          );
        }
      }
      nextArtifacts.set(pending.id, artifactRecord(input.projectId, pending, now));
    }

    const nextProject = recordForCommit(input, current, now);
    this.#artifacts.clear();
    for (const [id, artifact] of nextArtifacts) this.#artifacts.set(id, artifact);
    this.#projects.set(input.projectId, cloneProject(nextProject));
    return Promise.resolve(cloneProject(nextProject));
  }

  deleteProject(projectId: string) {
    this.#assertOpen();
    this.#projects.delete(projectId);
    for (const [id, artifact] of this.#artifacts) {
      if (artifact.projectId === projectId) this.#artifacts.delete(id);
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

  async commit(input: CheckpointCommit, now: string) {
    validateCommit(input);
    const transaction = this.database.transaction(
      [GUIDED_PROJECTS_STORE, GUIDED_PROJECT_ARTIFACTS_STORE],
      'readwrite',
    );
    const completion = transactionComplete(transaction);
    const projects = transaction.objectStore(GUIDED_PROJECTS_STORE);
    const artifacts = transaction.objectStore(GUIDED_PROJECT_ARTIFACTS_STORE);
    try {
      const rawCurrent = await requestResult<unknown>(projects.get(input.projectId));
      const current = sanitizeProjectRecord(rawCurrent);
      if (rawCurrent !== undefined && rawCurrent !== null && !current) {
        throw new ProjectStorageError(
          'storage-failed',
          `Project ${input.projectId} contains an unsupported or damaged record.`,
        );
      }
      assertExpectedRevision(input, current);

      for (const artifactId of input.removeArtifactIds ?? []) {
        const existing = sanitizeArtifactRecord(
          await requestResult<unknown>(artifacts.get(artifactId)),
        );
        if (!existing || existing.projectId !== input.projectId) continue;
        if (existing.kind !== 'processed-video') {
          throw new ProjectStorageError(
            'immutable-artifact',
            'Original project media can only be removed by deleting the project.',
          );
        }
        artifacts.delete(artifactId);
      }

      for (const pending of input.artifacts ?? []) {
        const existing = sanitizeArtifactRecord(
          await requestResult<unknown>(artifacts.get(pending.id)),
        );
        if (existing) {
          throw new ProjectStorageError(
            'immutable-artifact',
            `Artifact ${pending.id} already exists and cannot be overwritten.`,
          );
        }
        if (pending.kind === 'processed-video') {
          const source = sanitizeArtifactRecord(
            await requestResult<unknown>(artifacts.get(pending.sourceArtifactId ?? '')),
          );
          if (!source || source.projectId !== input.projectId || source.kind !== 'original-video') {
            throw new ProjectStorageError(
              'invalid-artifact',
              'The processed video source must be an original video in this project.',
            );
          }
        }
        artifacts.add(artifactRecord(input.projectId, pending, now));
      }

      const next = recordForCommit(input, current, now);
      projects.put(next);
      await completion;
      return next;
    } catch (error) {
      abortTransaction(transaction);
      await completion.catch(() => undefined);
      throw error;
    }
  }

  async flushSnapshot(
    snapshot: ProjectBackendSnapshot,
    deletedProjects: readonly DeletedProjectSnapshot[],
    removedArtifacts: readonly RemovedArtifactSnapshot[],
  ): Promise<void> {
    const projectsToWrite = snapshot.projects.map((project) => sanitizeProjectRecord(project));
    const artifactsToWrite = snapshot.artifacts.map((artifact) => sanitizeArtifactRecord(artifact));
    if (
      projectsToWrite.some((project) => project === null) ||
      artifactsToWrite.some((artifact) => artifact === null)
    ) {
      throw new ProjectStorageError(
        'storage-failed',
        'The in-memory project snapshot could not be validated for durable storage.',
      );
    }
    const validProjects = projectsToWrite as ProjectRecordV1[];
    const validArtifacts = artifactsToWrite as ProjectArtifactRecord[];
    const projectIds = new Set(validProjects.map((project) => project.id));
    if (validArtifacts.some((artifact) => !projectIds.has(artifact.projectId))) {
      throw new ProjectStorageError(
        'storage-failed',
        'The in-memory project snapshot contains media without its owning project.',
      );
    }

    const transaction = this.database.transaction(
      [GUIDED_PROJECTS_STORE, GUIDED_PROJECT_ARTIFACTS_STORE],
      'readwrite',
    );
    const completion = transactionComplete(transaction);
    const projects = transaction.objectStore(GUIDED_PROJECTS_STORE);
    const artifacts = transaction.objectStore(GUIDED_PROJECT_ARTIFACTS_STORE);
    try {
      for (const deleted of deletedProjects) {
        const rawCurrent = await requestResult<unknown>(projects.get(deleted.projectId));
        const current = sanitizeProjectRecord(rawCurrent);
        if (rawCurrent !== undefined && rawCurrent !== null && !current) {
          throw new ProjectStorageError(
            'storage-failed',
            `Project ${deleted.projectId} contains an unsupported or damaged record.`,
          );
        }
        if (current && deleted.revision !== null && current.revision > deleted.revision) {
          throw new ProjectStorageError(
            'revision-conflict',
            `Project ${deleted.projectId} changed after it was deleted from this tab.`,
          );
        }
        projects.delete(deleted.projectId);
        await deleteProjectArtifacts(artifacts, deleted.projectId);
      }

      for (const removed of removedArtifacts) {
        const rawExisting = await requestResult<unknown>(artifacts.get(removed.artifactId));
        const existing = sanitizeArtifactRecord(rawExisting);
        if (rawExisting !== undefined && rawExisting !== null && !existing) {
          throw new ProjectStorageError(
            'storage-failed',
            `Artifact ${removed.artifactId} contains an unsupported or damaged record.`,
          );
        }
        if (!existing || existing.projectId !== removed.projectId) continue;
        if (existing.kind !== 'processed-video') {
          throw new ProjectStorageError(
            'immutable-artifact',
            'Original project media can only be removed by deleting the project.',
          );
        }
        artifacts.delete(removed.artifactId);
      }

      for (const artifact of validArtifacts) {
        const rawExisting = await requestResult<unknown>(artifacts.get(artifact.id));
        const existing = sanitizeArtifactRecord(rawExisting);
        if (rawExisting !== undefined && rawExisting !== null && !existing) {
          throw new ProjectStorageError(
            'storage-failed',
            `Artifact ${artifact.id} contains an unsupported or damaged record.`,
          );
        }
        if (existing) {
          if (!sameArtifactIdentity(existing, artifact)) {
            throw new ProjectStorageError(
              'immutable-artifact',
              `Artifact ${artifact.id} conflicts with durable immutable media.`,
            );
          }
          continue;
        }
        artifacts.add(cloneArtifact(artifact));
      }

      for (const project of validProjects) {
        const rawCurrent = await requestResult<unknown>(projects.get(project.id));
        const current = sanitizeProjectRecord(rawCurrent);
        if (rawCurrent !== undefined && rawCurrent !== null && !current) {
          throw new ProjectStorageError(
            'storage-failed',
            `Project ${project.id} contains an unsupported or damaged record.`,
          );
        }
        if (
          current &&
          (current.revision > project.revision ||
            (current.revision === project.revision &&
              JSON.stringify(current) !== JSON.stringify(project)))
        ) {
          throw new ProjectStorageError(
            'revision-conflict',
            `Project ${project.id} has a conflicting durable revision.`,
          );
        }
        projects.put(cloneProject(project));
      }

      for (const project of validProjects) {
        const references = [
          [project.data.originalVideoArtifactId, 'original-video'],
          [project.data.originalAudioArtifactId, 'original-audio'],
          [project.data.processedVideoArtifactId, 'processed-video'],
        ] as const;
        for (const [artifactId, expectedKind] of references) {
          if (!artifactId) continue;
          const referenced = sanitizeArtifactRecord(
            await requestResult<unknown>(artifacts.get(artifactId)),
          );
          if (
            !referenced ||
            referenced.projectId !== project.id ||
            referenced.kind !== expectedKind ||
            (expectedKind === 'processed-video' &&
              referenced.sourceArtifactId !== project.data.originalVideoArtifactId)
          ) {
            throw new ProjectStorageError(
              'storage-failed',
              `Project ${project.id} references unavailable or inconsistent media.`,
            );
          }
        }
      }

      await completion;
    } catch (error) {
      abortTransaction(transaction);
      await completion.catch(() => undefined);
      throw error;
    }
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

const safeTimestamp = (now: () => Date) => {
  const value = now();
  return Number.isFinite(value.valueOf()) ? value.toISOString() : new Date(0).toISOString();
};

export const createLocalProjectRepository = (
  options: LocalProjectRepositoryOptions = {},
): LocalProjectRepository => {
  const factory = options.indexedDB === undefined ? browserIndexedDb() : options.indexedDB;
  const databaseName = options.databaseName ?? GUIDED_PROJECT_DATABASE_NAME;
  const now = options.now ?? (() => new Date());
  let state = INITIAL_STATE;
  let backend: ProjectBackend | null = null;
  const memoryFallback = new MemoryProjectBackend();
  const deletedProjects = new Map<string, number | null>();
  const removedArtifacts = new Map<string, string>();
  let initialization: Promise<ProjectStorageState> | null = null;
  let durableRetry: Promise<ProjectStorageState> | null = null;
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

  const retryDurableStorage = (): Promise<ProjectStorageState> => {
    if (durableRetry) return durableRetry;
    const attempt = (async () => {
      if (closed) throw new ProjectStorageError('closed', 'Project storage is closed.');
      await initialize();
      if (state.durable && backend !== memoryFallback) return state;
      if (!factory) {
        state = SESSION_ONLY_STATE;
        return state;
      }

      const snapshot = memoryFallback.snapshot();
      let candidate: IndexedDbProjectBackend | null = null;
      try {
        candidate = new IndexedDbProjectBackend(await openProjectDatabase(factory, databaseName));
        await candidate.flushSnapshot(
          snapshot,
          [...deletedProjects].map(([projectId, revision]) => ({ projectId, revision })),
          [...removedArtifacts].map(([artifactId, projectId]) => ({ artifactId, projectId })),
        );
        if (closed) throw new ProjectStorageError('closed', 'Project storage is closed.');
        backend = candidate;
        state = READY_STATE;
        deletedProjects.clear();
        removedArtifacts.clear();
      } catch (error) {
        candidate?.close();
        if (closed) throw error;
        backend = memoryFallback;
        state = DEGRADED_STATE;
      }
      return state;
    })();
    durableRetry = attempt;
    void attempt.then(
      () => {
        if (durableRetry === attempt) durableRetry = null;
      },
      () => {
        if (durableRetry === attempt) durableRetry = null;
      },
    );
    return attempt;
  };

  const getBackend = async () => {
    if (durableRetry) await durableRetry;
    await initialize();
    if (!backend)
      throw new ProjectStorageError('storage-failed', 'Project storage is unavailable.');
    return backend;
  };

  const operation = async <T>(run: (target: ProjectBackend) => Promise<T>): Promise<T> => {
    const target = await getBackend();
    try {
      return await run(target);
    } catch (error) {
      const recoverable =
        target !== memoryFallback &&
        (!(error instanceof ProjectStorageError) || error.code === 'storage-failed');
      if (recoverable) {
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
    retryDurableStorage,
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
    commit: async (input) => {
      const committedAt = safeTimestamp(now);
      const record = await operation((target) => target.commit(input, committedAt));
      if (backend === memoryFallback) {
        deletedProjects.delete(input.projectId);
        for (const artifactId of input.removeArtifactIds ?? []) {
          removedArtifacts.set(artifactId, input.projectId);
        }
        for (const artifact of input.artifacts ?? []) removedArtifacts.delete(artifact.id);
      } else {
        try {
          await memoryFallback.commit(input, committedAt);
        } catch {
          memoryFallback.seedProject(record);
          for (const artifactId of input.removeArtifactIds ?? []) {
            memoryFallback.removeSeededArtifact(artifactId);
          }
          for (const artifact of input.artifacts ?? []) {
            memoryFallback.seedArtifact(artifactRecord(input.projectId, artifact, committedAt));
          }
        }
      }
      return record;
    },
    deleteProject: async (projectId) => {
      const remembered = await memoryFallback.load(projectId);
      await operation((target) => target.deleteProject(projectId));
      if (backend === memoryFallback) {
        deletedProjects.set(projectId, remembered?.revision ?? null);
        for (const [artifactId, ownerProjectId] of removedArtifacts) {
          if (ownerProjectId === projectId) removedArtifacts.delete(artifactId);
        }
      } else {
        await memoryFallback.deleteProject(projectId);
      }
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
