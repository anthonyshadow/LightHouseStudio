import type {
  Project,
  ProjectAggregate,
  ProjectMutationContext,
  ProjectMutationResult,
  ProjectRevision,
  ProjectRevisionAuthor,
  ProjectRevisionSource,
  ProjectSnapshot,
  ProjectStatus,
  ProjectStatusFacts,
} from './types';
import { PROJECT_SNAPSHOT_SCHEMA_VERSION } from './types';

export type ProjectRuleErrorReason =
  | 'invalid-id'
  | 'invalid-title'
  | 'invalid-timestamp'
  | 'invalid-snapshot'
  | 'invalid-transition'
  | 'not-archived'
  | 'confirmation-required';

export class ProjectRuleError extends Error {
  constructor(
    readonly reason: ProjectRuleErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectRuleError';
  }
}

const PROJECT_TITLE_MAX_LENGTH = 120;
const PROJECT_INTENT_MAX_LENGTH = 4_000;

const requireTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.valueOf())) {
    throw new ProjectRuleError('invalid-timestamp', 'A valid project timestamp is required.');
  }
  return parsed.toISOString();
};

const requireId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 200 ||
    /^(?:blob|data|https?):/iu.test(normalized)
  ) {
    throw new ProjectRuleError('invalid-id', `${label} must be an opaque durable identifier.`);
  }
  return normalized;
};

export const normalizeProjectTitle = (value: string): string => {
  const normalized = [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('')
    .replaceAll(/\s+/gu, ' ')
    .trim()
    .slice(0, PROJECT_TITLE_MAX_LENGTH);
  if (normalized.length === 0) {
    throw new ProjectRuleError('invalid-title', 'A project needs a title.');
  }
  return normalized;
};

const validateMediaReference = (reference: ProjectSnapshot['workingMedia']): void => {
  if (reference === null) return;
  if (reference.kind === 'asset') {
    requireId(reference.assetId, 'Media asset');
    return;
  }
  requireId(reference.savedVideoId, 'Saved video');
  requireId(reference.videoVersionId, 'Video version');
};

export const validateProjectSnapshot = (snapshot: ProjectSnapshot): ProjectSnapshot => {
  if (snapshot.schemaVersion !== PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    throw new ProjectRuleError('invalid-snapshot', 'The project snapshot version is unsupported.');
  }
  const createdAt = requireTimestamp(snapshot.createdAt);
  const updatedAt = requireTimestamp(snapshot.updatedAt);
  if (updatedAt < createdAt) {
    throw new ProjectRuleError(
      'invalid-snapshot',
      'A project snapshot cannot be updated before it was created.',
    );
  }
  if (snapshot.sourceAssetId !== null) requireId(snapshot.sourceAssetId, 'Source asset');
  validateMediaReference(snapshot.workingMedia);
  validateMediaReference(snapshot.presentedMedia);
  if (snapshot.selectedCharacter !== null) {
    requireId(snapshot.selectedCharacter.characterId, 'Character');
    if (snapshot.selectedCharacter.variantId !== null) {
      requireId(snapshot.selectedCharacter.variantId, 'Character variant');
    }
  }
  if (snapshot.selectedOutfit !== null) requireId(snapshot.selectedOutfit.outfitId, 'Outfit');
  if (snapshot.selectedVoice?.kind === 'saved-voice') {
    requireId(snapshot.selectedVoice.voiceId, 'Voice');
  }
  if (snapshot.visualTreatment.kind === 'character-swap' && snapshot.selectedCharacter === null) {
    throw new ProjectRuleError('invalid-snapshot', 'Character Swap requires a selected character.');
  }
  if (snapshot.visualTreatment.kind === 'virtual-try-on' && snapshot.selectedOutfit === null) {
    throw new ProjectRuleError('invalid-snapshot', 'Virtual Try-On requires a selected outfit.');
  }
  if (snapshot.liveMode !== null) requireId(snapshot.liveMode.modeId, 'Live mode');
  if (snapshot.creativeIntent.promptId !== null) {
    requireId(snapshot.creativeIntent.promptId, 'Prompt');
  }
  if (snapshot.creativeIntent.recipeId !== null) {
    requireId(snapshot.creativeIntent.recipeId, 'Recipe');
  }
  if (snapshot.creativeIntent.userIntent.length > PROJECT_INTENT_MAX_LENGTH) {
    throw new ProjectRuleError('invalid-snapshot', 'Project intent is too long.');
  }
  if (snapshot.lastSuccessfulOutput !== null) {
    requireId(snapshot.lastSuccessfulOutput.savedVideoId, 'Saved video');
    requireId(snapshot.lastSuccessfulOutput.videoVersionId, 'Video version');
  }
  return { ...snapshot, createdAt, updatedAt };
};

export const createEmptyProjectSnapshot = (nowValue: string): ProjectSnapshot => {
  const now = requireTimestamp(nowValue);
  return {
    schemaVersion: PROJECT_SNAPSHOT_SCHEMA_VERSION,
    sourceAssetId: null,
    workingMedia: null,
    presentedMedia: null,
    selectedCharacter: null,
    selectedOutfit: null,
    selectedVoice: null,
    visualTreatment: { kind: 'none' },
    liveMode: null,
    creativeIntent: { promptId: null, recipeId: null, userIntent: '' },
    localEdit: null,
    exportSpecification: null,
    lastSuccessfulOutput: null,
    workflowPhase: 'source',
    createdAt: now,
    updatedAt: now,
  };
};

const materialSnapshot = (snapshot: ProjectSnapshot) => ({
  sourceAssetId: snapshot.sourceAssetId,
  workingMedia: snapshot.workingMedia,
  presentedMedia: snapshot.presentedMedia,
  selectedCharacter: snapshot.selectedCharacter,
  selectedOutfit: snapshot.selectedOutfit,
  selectedVoice: snapshot.selectedVoice,
  visualTreatment: snapshot.visualTreatment,
  liveMode: snapshot.liveMode,
  creativeIntent: snapshot.creativeIntent,
  localEdit: snapshot.localEdit,
  exportSpecification: snapshot.exportSpecification,
});

export const deriveProjectStatus = (
  snapshot: Pick<ProjectSnapshot, 'lastSuccessfulOutput'>,
  facts: ProjectStatusFacts,
  lifecycle: Pick<Project, 'archivedAt' | 'deletedAt'> = {
    archivedAt: null,
    deletedAt: null,
  },
): ProjectStatus => {
  if (lifecycle.deletedAt !== null) return 'deleted';
  if (lifecycle.archivedAt !== null) return 'archived';
  if (facts.currentAttempt.status === 'active') return 'processing';
  if (facts.sourceStatus === 'unavailable' || facts.currentAttempt.status === 'failed') {
    return 'needs-attention';
  }
  if (
    snapshot.lastSuccessfulOutput !== null &&
    facts.validatedLastSuccessfulOutput?.savedVideoId ===
      snapshot.lastSuccessfulOutput.savedVideoId &&
    facts.validatedLastSuccessfulOutput.videoVersionId ===
      snapshot.lastSuccessfulOutput.videoVersionId
  ) {
    return 'completed';
  }
  return facts.sourceStatus === 'ready' ? 'ready' : 'draft';
};

export const PROJECT_STATUS_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> =
  {
    draft: ['ready', 'processing', 'needs-attention', 'completed', 'archived'],
    ready: ['draft', 'processing', 'needs-attention', 'completed', 'archived'],
    processing: ['draft', 'ready', 'needs-attention', 'completed', 'archived'],
    'needs-attention': ['draft', 'ready', 'processing', 'completed', 'archived'],
    completed: ['draft', 'ready', 'processing', 'needs-attention', 'archived'],
    archived: ['draft', 'ready', 'processing', 'needs-attention', 'completed', 'deleted'],
    deleted: [],
  };

export const canTransitionProjectStatus = (from: ProjectStatus, to: ProjectStatus): boolean =>
  from === to || PROJECT_STATUS_TRANSITIONS[from].includes(to);

const assertStatusTransition = (from: ProjectStatus, to: ProjectStatus): void => {
  if (!canTransitionProjectStatus(from, to)) {
    throw new ProjectRuleError(
      'invalid-transition',
      `A project cannot transition from ${from} to ${to}.`,
    );
  }
};

export const isProjectResumable = (
  project: Project,
  snapshot: ProjectSnapshot,
  facts: ProjectStatusFacts,
): boolean =>
  project.archivedAt === null &&
  project.deletedAt === null &&
  snapshot.sourceAssetId !== null &&
  facts.sourceStatus === 'ready';

export interface CreateProjectInput {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly snapshot?: ProjectSnapshot;
  readonly author: ProjectRevisionAuthor;
  readonly facts: ProjectStatusFacts;
}

export const createProject = (
  input: CreateProjectInput,
  context: ProjectMutationContext,
): ProjectAggregate => {
  const now = requireTimestamp(context.now);
  const projectId = requireId(input.id, 'Project');
  const ownerUserId = requireId(input.ownerUserId, 'Project owner');
  const revisionId = requireId(context.createId(), 'Project revision');
  requireId(input.author.authorId, 'Revision author');
  const snapshot = validateProjectSnapshot(input.snapshot ?? createEmptyProjectSnapshot(now));
  if (
    (snapshot.sourceAssetId === null && input.facts.sourceStatus !== 'none') ||
    (snapshot.sourceAssetId !== null && input.facts.sourceStatus !== 'ready')
  ) {
    throw new ProjectRuleError(
      'invalid-snapshot',
      'A durable source can be recorded only after its asset is ready.',
    );
  }
  const project: Project = {
    id: projectId,
    ownerUserId,
    title: normalizeProjectTitle(input.title),
    status: deriveProjectStatus(snapshot, input.facts),
    version: 1,
    currentRevisionId: revisionId,
    currentRevisionNumber: 1,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const revision: ProjectRevision = {
    id: revisionId,
    projectId,
    ownerUserId,
    revisionNumber: 1,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot,
    author: input.author,
    source: 'create',
    createdAt: now,
  };
  return {
    project,
    revisions: [revision],
    assetLinks: [],
    versionReferenceLinks: [],
    jobLinks: [],
    outputLinks: [],
  };
};

const projectVersionConflict = (
  project: Project,
  expectedVersion: number,
): ProjectMutationResult<never> => ({
  ok: false,
  conflict: {
    kind: 'project-version',
    projectId: project.id,
    expectedVersion,
    actualVersion: project.version,
  },
});

export const renameProject = (
  project: Project,
  title: string,
  expectedVersion: number,
  nowValue: string,
): ProjectMutationResult<Project> => {
  if (project.version !== expectedVersion) return projectVersionConflict(project, expectedVersion);
  if (project.deletedAt !== null) {
    throw new ProjectRuleError('invalid-transition', 'A deleted project cannot be renamed.');
  }
  return {
    ok: true,
    value: {
      ...project,
      title: normalizeProjectTitle(title),
      version: project.version + 1,
      updatedAt: requireTimestamp(nowValue),
    },
  };
};

export const archiveProject = (
  project: Project,
  expectedVersion: number,
  facts: Pick<ProjectStatusFacts, 'currentAttempt'>,
  nowValue: string,
): ProjectMutationResult<Project> => {
  if (project.version !== expectedVersion) return projectVersionConflict(project, expectedVersion);
  if (facts.currentAttempt.status === 'active') {
    throw new ProjectRuleError(
      'invalid-transition',
      'Active Project work must finish or be handled before archive.',
    );
  }
  const now = requireTimestamp(nowValue);
  assertStatusTransition(project.status, 'archived');
  return {
    ok: true,
    value: {
      ...project,
      status: 'archived',
      version: project.version + 1,
      archivedAt: now,
      updatedAt: now,
    },
  };
};

export const restoreProject = (
  project: Project,
  expectedVersion: number,
  currentSnapshot: Pick<ProjectSnapshot, 'lastSuccessfulOutput'>,
  facts: ProjectStatusFacts,
  nowValue: string,
): ProjectMutationResult<Project> => {
  if (project.version !== expectedVersion) return projectVersionConflict(project, expectedVersion);
  if (project.status !== 'archived' || project.archivedAt === null) {
    throw new ProjectRuleError('not-archived', 'Only an archived project can be restored.');
  }
  const status = deriveProjectStatus(currentSnapshot, facts);
  assertStatusTransition(project.status, status);
  return {
    ok: true,
    value: {
      ...project,
      status,
      version: project.version + 1,
      archivedAt: null,
      updatedAt: requireTimestamp(nowValue),
    },
  };
};

export const deleteProject = (
  project: Project,
  expectedVersion: number,
  confirmation: 'permanent-delete' | null,
  nowValue: string,
): ProjectMutationResult<Project> => {
  if (project.version !== expectedVersion) return projectVersionConflict(project, expectedVersion);
  if (project.status !== 'archived' || project.archivedAt === null) {
    throw new ProjectRuleError('not-archived', 'Archive the project before permanent deletion.');
  }
  if (confirmation !== 'permanent-delete') {
    throw new ProjectRuleError(
      'confirmation-required',
      'Permanent project deletion requires explicit confirmation.',
    );
  }
  const now = requireTimestamp(nowValue);
  assertStatusTransition(project.status, 'deleted');
  return {
    ok: true,
    value: {
      ...project,
      status: 'deleted',
      version: project.version + 1,
      deletedAt: now,
      updatedAt: now,
    },
  };
};

export interface AppendProjectRevisionInput {
  readonly expectedProjectVersion: number;
  readonly expectedRevisionNumber: number;
  readonly snapshot: ProjectSnapshot;
  readonly author: ProjectRevisionAuthor;
  readonly source: Exclude<ProjectRevisionSource, 'create'>;
  readonly facts: ProjectStatusFacts;
}

export const appendProjectRevision = (
  aggregate: ProjectAggregate,
  input: AppendProjectRevisionInput,
  context: ProjectMutationContext,
): ProjectMutationResult<ProjectAggregate> => {
  const { project } = aggregate;
  if (project.version !== input.expectedProjectVersion) {
    return projectVersionConflict(project, input.expectedProjectVersion);
  }
  if (project.currentRevisionNumber !== input.expectedRevisionNumber) {
    return {
      ok: false,
      conflict: {
        kind: 'revision',
        projectId: project.id,
        expectedRevisionNumber: input.expectedRevisionNumber,
        actualRevisionNumber: project.currentRevisionNumber,
      },
    };
  }
  if (project.archivedAt !== null || project.deletedAt !== null) {
    throw new ProjectRuleError(
      'invalid-transition',
      'Archived or deleted projects cannot accept revisions.',
    );
  }
  const currentRevision = aggregate.revisions.find(({ id }) => id === project.currentRevisionId);
  if (currentRevision === undefined) {
    throw new ProjectRuleError('invalid-snapshot', 'The current project revision is missing.');
  }
  const now = requireTimestamp(context.now);
  requireId(input.author.authorId, 'Revision author');
  let snapshot = validateProjectSnapshot(input.snapshot);
  if (snapshot.createdAt !== currentRevision.snapshot.createdAt || snapshot.updatedAt !== now) {
    throw new ProjectRuleError(
      'invalid-snapshot',
      'A new snapshot must preserve its creation time and use the mutation timestamp.',
    );
  }
  if (
    (snapshot.sourceAssetId === null && input.facts.sourceStatus !== 'none') ||
    (snapshot.sourceAssetId !== currentRevision.snapshot.sourceAssetId &&
      snapshot.sourceAssetId !== null &&
      input.facts.sourceStatus !== 'ready')
  ) {
    throw new ProjectRuleError(
      'invalid-snapshot',
      'A durable source can be recorded only after its asset is ready.',
    );
  }
  if (
    snapshot.lastSuccessfulOutput !== null &&
    JSON.stringify(materialSnapshot(snapshot)) !==
      JSON.stringify(materialSnapshot(currentRevision.snapshot))
  ) {
    snapshot = { ...snapshot, lastSuccessfulOutput: null };
  }
  const status = deriveProjectStatus(snapshot, input.facts);
  assertStatusTransition(project.status, status);
  const revisionId = requireId(context.createId(), 'Project revision');
  const revisionNumber = project.currentRevisionNumber + 1;
  const revision: ProjectRevision = {
    id: revisionId,
    projectId: project.id,
    ownerUserId: project.ownerUserId,
    revisionNumber,
    parentRevisionId: currentRevision.id,
    parentRevisionNumber: currentRevision.revisionNumber,
    snapshot,
    author: input.author,
    source: input.source,
    createdAt: now,
  };
  return {
    ok: true,
    value: {
      ...aggregate,
      project: {
        ...project,
        status,
        version: project.version + 1,
        currentRevisionId: revisionId,
        currentRevisionNumber: revisionNumber,
        updatedAt: now,
      },
      revisions: [...aggregate.revisions, revision],
    },
  };
};
