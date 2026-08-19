import type {
  Project,
  ProjectAggregate,
  ProjectAssetKind,
  ProjectAssetMembership,
  ProjectConflict,
  ProjectMutationContext,
  ProjectMutationResult,
  ProjectOutputLink,
  ProjectRevision,
  ProjectRevisionAuthor,
  ProjectRevisionSource,
  ProjectMediaReference,
  ProjectSnapshot,
  ProjectStatus,
  ProjectStatusFacts,
} from './types';
import { requireIsoTimestamp, requireOpaqueId, stripControlCharacters } from '../common/identity';
import { normalizeWhitespace } from '../common/text';
import type { ProjectProcessingJobStatus } from '../video-processing/types';
import { projectProcessingNeedsAttention } from '../video-processing/rules';
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
const PROJECT_APPLIED_LABEL_MAX_LENGTH = 120;

const requireTimestamp = (value: string): string =>
  requireIsoTimestamp(value, () => {
    throw new ProjectRuleError('invalid-timestamp', 'A valid project timestamp is required.');
  });

const requireId = (value: string, label: string): string =>
  requireOpaqueId(value, label, (message) => {
    throw new ProjectRuleError('invalid-id', message);
  });

const requireAppliedLabel = (value: string, label: string): void => {
  const normalized = value.replaceAll(/\s+/gu, ' ').trim();
  if (normalized.length === 0 || normalized.length > PROJECT_APPLIED_LABEL_MAX_LENGTH) {
    throw new ProjectRuleError('invalid-snapshot', `${label} is invalid.`);
  }
};

export const normalizeProjectTitle = (value: string): string => {
  const normalized = normalizeWhitespace(
    stripControlCharacters(value, { stripDelete: true }),
    PROJECT_TITLE_MAX_LENGTH,
  );
  if (normalized.length === 0) {
    throw new ProjectRuleError('invalid-title', 'A project needs a title.');
  }
  return normalized;
};

export const createProjectAssetMembership = (input: {
  readonly id: string;
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly kind: ProjectAssetKind;
  readonly resourceId: string;
  readonly createdAt: string;
}): ProjectAssetMembership => ({
  id: requireId(input.id, 'Project asset membership'),
  projectId: requireId(input.projectId, 'Project'),
  ownerUserId: requireId(input.ownerUserId, 'Project owner'),
  kind: input.kind,
  resourceId: requireId(input.resourceId, 'Project asset resource'),
  createdAt: requireTimestamp(input.createdAt),
});

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
    if (snapshot.selectedCharacter.characterLabel !== null) {
      requireAppliedLabel(snapshot.selectedCharacter.characterLabel, 'Character label');
    }
    if (snapshot.selectedCharacter.characterRevision !== null) {
      requireTimestamp(snapshot.selectedCharacter.characterRevision);
    }
    if (snapshot.selectedCharacter.variantId !== null) {
      requireId(snapshot.selectedCharacter.variantId, 'Character variant');
      if (
        (snapshot.selectedCharacter.variantLabel === null) !==
        (snapshot.selectedCharacter.variantRevision === null)
      ) {
        throw new ProjectRuleError(
          'invalid-snapshot',
          'A Character Variant label and revision must be recorded together.',
        );
      }
      if (snapshot.selectedCharacter.variantLabel !== null) {
        requireAppliedLabel(snapshot.selectedCharacter.variantLabel, 'Character Variant label');
        requireTimestamp(snapshot.selectedCharacter.variantRevision!);
      }
    } else if (
      snapshot.selectedCharacter.variantLabel !== null ||
      snapshot.selectedCharacter.variantRevision !== null
    ) {
      throw new ProjectRuleError(
        'invalid-snapshot',
        'Character Variant applied values require a Variant identifier.',
      );
    }
    if (snapshot.selectedCharacter.referenceAssetId !== null) {
      requireId(snapshot.selectedCharacter.referenceAssetId, 'Character reference');
    }
  }
  if (snapshot.selectedOutfit !== null) {
    requireId(snapshot.selectedOutfit.outfitId, 'Outfit');
    if (snapshot.selectedOutfit.outfitLabel !== null) {
      requireAppliedLabel(snapshot.selectedOutfit.outfitLabel, 'Outfit label');
    }
    if (snapshot.selectedOutfit.outfitRevision !== null) {
      requireTimestamp(snapshot.selectedOutfit.outfitRevision);
    }
    if (snapshot.selectedOutfit.referenceAssetId !== null) {
      requireId(snapshot.selectedOutfit.referenceAssetId, 'Outfit reference');
    }
  }
  if (snapshot.selectedVoice?.kind === 'saved-voice') {
    requireId(snapshot.selectedVoice.voiceId, 'Voice');
    requireAppliedLabel(snapshot.selectedVoice.voiceName, 'Voice label');
    if (snapshot.selectedVoice.resourceRevision !== null) {
      requireTimestamp(snapshot.selectedVoice.resourceRevision);
    }
  }
  if (snapshot.visualTreatment.kind === 'character-swap' && snapshot.selectedCharacter === null) {
    throw new ProjectRuleError('invalid-snapshot', 'Character Swap requires a selected character.');
  }
  if (
    snapshot.visualTreatment.kind === 'virtual-try-on' &&
    snapshot.visualTreatment.inputKind === 'saved-outfit' &&
    snapshot.selectedOutfit === null
  ) {
    throw new ProjectRuleError(
      'invalid-snapshot',
      'Saved-outfit Virtual Try-On requires a selected outfit.',
    );
  }
  if (snapshot.liveMode !== null) requireId(snapshot.liveMode.modeId, 'Live mode');
  if (snapshot.creativeIntent.promptId !== null) {
    requireId(snapshot.creativeIntent.promptId, 'Prompt');
  }
  if (snapshot.creativeIntent.recipeId !== null) {
    requireId(snapshot.creativeIntent.recipeId, 'Recipe');
  }
  if (snapshot.creativeIntent.promptLabel !== null) {
    requireAppliedLabel(snapshot.creativeIntent.promptLabel, 'Prompt label');
  }
  if (snapshot.creativeIntent.recipeLabel !== null) {
    requireAppliedLabel(snapshot.creativeIntent.recipeLabel, 'Recipe label');
  }
  if (snapshot.creativeIntent.referenceAssetId !== null) {
    requireId(snapshot.creativeIntent.referenceAssetId, 'Creative reference');
  }
  if (snapshot.creativeIntent.resourceRevision !== null) {
    requireTimestamp(snapshot.creativeIntent.resourceRevision);
  }
  if (snapshot.creativeIntent.userIntent.length > PROJECT_INTENT_MAX_LENGTH) {
    throw new ProjectRuleError('invalid-snapshot', 'Project intent is too long.');
  }
  if (
    snapshot.creativeIntent.appliedPrompt !== null &&
    snapshot.creativeIntent.appliedPrompt.length > PROJECT_INTENT_MAX_LENGTH
  ) {
    throw new ProjectRuleError('invalid-snapshot', 'The applied Project prompt is too long.');
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
    creativeIntent: {
      promptId: null,
      promptLabel: null,
      recipeId: null,
      recipeLabel: null,
      userIntent: '',
      appliedPrompt: null,
      referenceAssetId: null,
      resourceRevision: null,
    },
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

/**
 * The status a Project takes when the trace for its *current* processing attempt settles.
 *
 * Returns `null` when nothing should change. That is load-bearing rather than a convenience: the
 * Project version is a CAS token, so persisting a status the Project already has would invalidate
 * every client's `expectedVersion` for no observable reason. A forbidden transition — most
 * importantly anything out of `deleted` — also returns `null`, so a late provider trace can never
 * resurrect a Project the owner removed.
 */
export const projectStatusAfterProcessingTrace = (
  currentStatus: ProjectStatus,
  traceStatus: ProjectProcessingJobStatus,
): ProjectStatus | null => {
  const next: ProjectStatus | null =
    traceStatus === 'cancelled'
      ? 'ready'
      : projectProcessingNeedsAttention(traceStatus)
        ? 'needs-attention'
        : null;
  if (next === null || next === currentStatus) return null;
  return canTransitionProjectStatus(currentStatus, next) ? next : null;
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
  readonly campaignId?: string | null;
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
    campaignId:
      input.campaignId === null || input.campaignId === undefined
        ? null
        : requireId(input.campaignId, 'Campaign'),
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

export const moveProjectToCampaign = (
  project: Project,
  campaignId: string | null,
  expectedVersion: number,
  nowValue: string,
): ProjectMutationResult<Project> => {
  if (project.version !== expectedVersion) return projectVersionConflict(project, expectedVersion);
  if (project.deletedAt !== null) {
    throw new ProjectRuleError(
      'invalid-transition',
      'A deleted Project cannot change Campaign membership.',
    );
  }
  return {
    ok: true,
    value: {
      ...project,
      campaignId: campaignId === null ? null : requireId(campaignId, 'Campaign'),
      version: project.version + 1,
      updatedAt: requireTimestamp(nowValue),
    },
  };
};

/** The single constructor for the optimistic-concurrency conflict on a Project row. */
export const projectVersionConflictDetail = (
  projectId: string,
  expectedVersion: number,
  actualVersion: number,
): Extract<ProjectConflict, { readonly kind: 'project-version' }> => ({
  kind: 'project-version',
  projectId,
  expectedVersion,
  actualVersion,
});

/**
 * The Project conflict taxonomy, constructed in exactly one place.
 *
 * Every persistence adapter has to answer "which conflict is this?" for the same set of
 * situations. Storage mechanics legitimately differ between adapters; the conflict a caller
 * observes must not, or `local`/`shadow` and `neon` can report different outcomes for an identical
 * request and the route layer has no way to tell which one is authoritative.
 */
export const projectConflicts = {
  operationKey: (
    operation: Extract<ProjectConflict, { readonly kind: 'operation-key' }>['operation'],
  ): Extract<ProjectConflict, { readonly kind: 'operation-key' }> => ({
    kind: 'operation-key',
    operation,
  }),
  version: projectVersionConflictDetail,
  revision: (
    projectId: string,
    expectedRevisionNumber: number,
    actualRevisionNumber: number,
  ): Extract<ProjectConflict, { readonly kind: 'revision' }> => ({
    kind: 'revision',
    projectId,
    expectedRevisionNumber,
    actualRevisionNumber,
  }),
  relationMismatch: (
    projectId: string,
    relation: 'job' | 'output',
  ): Extract<ProjectConflict, { readonly kind: 'relation-mismatch' }> => ({
    kind: 'relation-mismatch',
    projectId,
    relation,
  }),
  activeJobs: (projectId: string): Extract<ProjectConflict, { readonly kind: 'active-jobs' }> => ({
    kind: 'active-jobs',
    projectId,
  }),
  campaignMembership: (
    projectId: string,
  ): Extract<ProjectConflict, { readonly kind: 'campaign-membership' }> => ({
    kind: 'campaign-membership',
    projectId,
  }),
  immutableSource: (
    projectId: string,
  ): Extract<ProjectConflict, { readonly kind: 'immutable-source' }> => ({
    kind: 'immutable-source',
    projectId,
  }),
  savedVideoVersion: (
    savedVideoId: string,
    expectedVersionId: string,
    actualVersionId: string,
  ): Extract<ProjectConflict, { readonly kind: 'saved-video-version' }> => ({
    kind: 'saved-video-version',
    savedVideoId,
    expectedVersionId,
    actualVersionId,
  }),
} as const;

const projectVersionConflict = (
  project: Project,
  expectedVersion: number,
): ProjectMutationResult<never> => ({
  ok: false,
  conflict: projectVersionConflictDetail(project.id, expectedVersion, project.version),
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

export interface SaveProjectOutputInput {
  readonly expectedProjectVersion: number;
  readonly expectedRevisionNumber: number;
  readonly savedVideoId: string;
  readonly videoVersionId: string;
  readonly author: ProjectRevisionAuthor;
}

/**
 * Records immutable producer provenance on the pre-save revision, then advances the Project to a
 * distinct post-save revision that presents the exact retained Version. This is intentionally a
 * dedicated transition: changing an ordinary revision's media clears a stale output pointer,
 * while this command proves the replacement reference names the same newly retained output.
 */
export const saveProjectOutput = (
  aggregate: ProjectAggregate,
  input: SaveProjectOutputInput,
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
      'Archived or deleted projects cannot save outputs.',
    );
  }
  if (project.status === 'processing') {
    throw new ProjectRuleError(
      'invalid-transition',
      'Active Project processing must finish before its ready output can be saved.',
    );
  }
  const producingRevision = aggregate.revisions.find(
    ({ id, revisionNumber }) =>
      id === project.currentRevisionId && revisionNumber === project.currentRevisionNumber,
  );
  if (producingRevision === undefined) {
    throw new ProjectRuleError('invalid-snapshot', 'The producing Project revision is missing.');
  }
  const { workingMedia, presentedMedia, sourceAssetId } = producingRevision.snapshot;
  if (
    sourceAssetId === null ||
    workingMedia === null ||
    presentedMedia === null ||
    JSON.stringify(workingMedia) !== JSON.stringify(presentedMedia)
  ) {
    throw new ProjectRuleError(
      'invalid-snapshot',
      'A Project output requires one exact ready working and presented media reference.',
    );
  }

  const savedVideoId = requireId(input.savedVideoId, 'Saved video');
  const videoVersionId = requireId(input.videoVersionId, 'Video version');
  if (aggregate.outputLinks.some((link) => link.videoVersionId === videoVersionId)) {
    throw new ProjectRuleError(
      'invalid-snapshot',
      'That Video Version already has producing Project provenance.',
    );
  }
  const now = requireTimestamp(context.now);
  requireId(input.author.authorId, 'Revision author');
  const revisionId = requireId(context.createId(), 'Project revision');
  const revisionNumber = producingRevision.revisionNumber + 1;
  const outputReference = { savedVideoId, videoVersionId };
  const snapshot = validateProjectSnapshot({
    ...producingRevision.snapshot,
    workingMedia: { kind: 'saved-video-version', ...outputReference },
    presentedMedia: { kind: 'saved-video-version', ...outputReference },
    lastSuccessfulOutput: outputReference,
    workflowPhase: 'complete',
    updatedAt: now,
  });
  const output: ProjectOutputLink = {
    projectId: project.id,
    ownerUserId: project.ownerUserId,
    ...outputReference,
    producingRevisionId: producingRevision.id,
    producingRevisionNumber: producingRevision.revisionNumber,
    createdAt: now,
  };
  const revision: ProjectRevision = {
    id: revisionId,
    projectId: project.id,
    ownerUserId: project.ownerUserId,
    revisionNumber,
    parentRevisionId: producingRevision.id,
    parentRevisionNumber: producingRevision.revisionNumber,
    snapshot,
    author: input.author,
    source: 'output-save',
    createdAt: now,
  };
  const status = deriveProjectStatus(snapshot, {
    sourceStatus: 'ready',
    currentAttempt: { status: 'none' },
    validatedLastSuccessfulOutput: outputReference,
  });
  assertStatusTransition(project.status, status);
  return {
    ok: true,
    value: {
      ...aggregate,
      project: {
        ...project,
        status,
        version: project.version + 1,
        currentRevisionId: revision.id,
        currentRevisionNumber: revision.revisionNumber,
        updatedAt: now,
      },
      revisions: [...aggregate.revisions, revision],
      outputLinks: [...aggregate.outputLinks, output],
    },
  };
};

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

export interface AcceptProjectSourceInput {
  readonly expectedProjectVersion: number;
  readonly expectedRevisionNumber: number;
  readonly assetId: string;
  readonly mediaReference: ProjectMediaReference;
  readonly author: ProjectRevisionAuthor;
}

/**
 * Accepts the one immutable MVP original. Storage readiness and exact Saved Video lineage are
 * verified by the repository transaction before this semantic revision is committed.
 */
export const acceptProjectSource = (
  aggregate: ProjectAggregate,
  input: AcceptProjectSourceInput,
  context: ProjectMutationContext,
): ProjectMutationResult<ProjectAggregate> => {
  const currentRevision = aggregate.revisions.find(
    ({ id }) => id === aggregate.project.currentRevisionId,
  );
  if (currentRevision === undefined) {
    throw new ProjectRuleError('invalid-snapshot', 'The current project revision is missing.');
  }
  if (currentRevision.snapshot.sourceAssetId !== null) {
    return {
      ok: false,
      conflict: { kind: 'immutable-source', projectId: aggregate.project.id },
    };
  }
  const now = requireTimestamp(context.now);
  const assetId = requireId(input.assetId, 'Source asset');
  const mediaReference =
    input.mediaReference.kind === 'asset'
      ? { kind: 'asset' as const, assetId: requireId(input.mediaReference.assetId, 'Media asset') }
      : {
          kind: 'saved-video-version' as const,
          savedVideoId: requireId(input.mediaReference.savedVideoId, 'Saved video'),
          videoVersionId: requireId(input.mediaReference.videoVersionId, 'Video version'),
        };
  if (mediaReference.kind === 'asset' && mediaReference.assetId !== assetId) {
    throw new ProjectRuleError(
      'invalid-snapshot',
      'An uploaded Project source must present the accepted source asset.',
    );
  }
  return appendProjectRevision(
    aggregate,
    {
      expectedProjectVersion: input.expectedProjectVersion,
      expectedRevisionNumber: input.expectedRevisionNumber,
      snapshot: {
        ...currentRevision.snapshot,
        sourceAssetId: assetId,
        workingMedia: mediaReference,
        presentedMedia: mediaReference,
        lastSuccessfulOutput: null,
        workflowPhase: 'creative',
        updatedAt: now,
      },
      author: input.author,
      source: 'user-edit',
      facts: {
        sourceStatus: 'ready',
        currentAttempt: { status: 'none' },
        validatedLastSuccessfulOutput: null,
      },
    },
    { ...context, now },
  );
};

export interface RemoveProjectSourceInput {
  readonly expectedProjectVersion: number;
  readonly expectedRevisionNumber: number;
  readonly author: ProjectRevisionAuthor;
}

/**
 * Detaches the current source so a different original can be chosen.
 *
 * The source is immutable *while it is attached* — `acceptProjectSource` still refuses to overwrite
 * one — but the Project is no longer a dead end when the wrong video was chosen. Removal only
 * appends a revision: earlier revisions, produced output Versions and their asset lineage are
 * untouched, so nothing that referenced the removed bytes loses them.
 *
 * Derived media goes with the source it was derived from. Creative configuration does not: the
 * usual reason to remove a source is to point the same setup at the right video.
 *
 * CAS is checked before the semantic guards, matching `saveProjectOutput`, so a stale caller is
 * told the Project moved rather than that its source vanished. Removing a source that is already
 * gone never reaches this rule — the application converges on current authority first — which is
 * what lets the command carry no operation receipt.
 */
export const removeProjectSource = (
  aggregate: ProjectAggregate,
  input: RemoveProjectSourceInput,
  context: ProjectMutationContext,
): ProjectMutationResult<ProjectAggregate> => {
  const { project } = aggregate;
  if (project.version !== input.expectedProjectVersion) {
    return projectVersionConflict(project, input.expectedProjectVersion);
  }
  if (project.currentRevisionNumber !== input.expectedRevisionNumber) {
    return {
      ok: false,
      conflict: projectConflicts.revision(
        project.id,
        input.expectedRevisionNumber,
        project.currentRevisionNumber,
      ),
    };
  }
  const currentRevision = aggregate.revisions.find(({ id }) => id === project.currentRevisionId);
  if (currentRevision === undefined) {
    throw new ProjectRuleError('invalid-snapshot', 'The current project revision is missing.');
  }
  if (currentRevision.snapshot.sourceAssetId === null) {
    throw new ProjectRuleError(
      'invalid-transition',
      'This Project does not have a source to remove.',
    );
  }
  // Cheap first refusal. Whether provider work is genuinely still open is a persistence fact, so
  // the repository transaction stays authoritative for it — and answering with the same typed
  // conflict it returns keeps one shape on the wire whichever layer refuses first.
  if (project.status === 'processing') {
    return { ok: false, conflict: projectConflicts.activeJobs(project.id) };
  }
  const now = requireTimestamp(context.now);
  return appendProjectRevision(
    aggregate,
    {
      expectedProjectVersion: input.expectedProjectVersion,
      expectedRevisionNumber: input.expectedRevisionNumber,
      snapshot: {
        ...currentRevision.snapshot,
        sourceAssetId: null,
        workingMedia: null,
        presentedMedia: null,
        lastSuccessfulOutput: null,
        workflowPhase: 'source',
        updatedAt: now,
      },
      author: input.author,
      source: 'user-edit',
      facts: {
        sourceStatus: 'none',
        currentAttempt: { status: 'none' },
        validatedLastSuccessfulOutput: null,
      },
    },
    { ...context, now },
  );
};

export interface AdoptProjectWorkingMediaInput {
  readonly expectedProjectVersion: number;
  readonly expectedRevisionNumber: number;
  readonly mediaReference: ProjectMediaReference;
  readonly localEdit: ProjectSnapshot['localEdit'];
  readonly author: ProjectRevisionAuthor;
}

/**
 * Advances only the durable working/presented pointers. The immutable source and reusable-resource
 * ownership stay unchanged; storage readiness and exact same-owner lineage are repository concerns.
 */
export const adoptProjectWorkingMedia = (
  aggregate: ProjectAggregate,
  input: AdoptProjectWorkingMediaInput,
  context: ProjectMutationContext,
): ProjectMutationResult<ProjectAggregate> => {
  const currentRevision = aggregate.revisions.find(
    ({ id }) => id === aggregate.project.currentRevisionId,
  );
  if (currentRevision === undefined) {
    throw new ProjectRuleError('invalid-snapshot', 'The current project revision is missing.');
  }
  if (currentRevision.snapshot.sourceAssetId === null) {
    throw new ProjectRuleError(
      'invalid-transition',
      'A Project needs an immutable original before working media can be adopted.',
    );
  }
  const mediaReference: ProjectMediaReference =
    input.mediaReference.kind === 'asset'
      ? { kind: 'asset', assetId: requireId(input.mediaReference.assetId, 'Working media asset') }
      : {
          kind: 'saved-video-version',
          savedVideoId: requireId(input.mediaReference.savedVideoId, 'Saved video'),
          videoVersionId: requireId(input.mediaReference.videoVersionId, 'Video version'),
        };
  const now = requireTimestamp(context.now);
  return appendProjectRevision(
    aggregate,
    {
      expectedProjectVersion: input.expectedProjectVersion,
      expectedRevisionNumber: input.expectedRevisionNumber,
      snapshot: {
        ...currentRevision.snapshot,
        workingMedia: mediaReference,
        presentedMedia: mediaReference,
        localEdit: input.localEdit,
        lastSuccessfulOutput: null,
        workflowPhase: 'review',
        updatedAt: now,
      },
      author: input.author,
      source: 'user-edit',
      facts: {
        sourceStatus: 'ready',
        currentAttempt: { status: 'none' },
        validatedLastSuccessfulOutput: null,
      },
    },
    { ...context, now },
  );
};

export interface PromoteProjectJobResultInput {
  readonly expectedProjectVersion: number;
  readonly expectedRevisionNumber: number;
  readonly initiatingRevisionId: string;
  readonly initiatingRevisionNumber: number;
  readonly operationIsCurrent: boolean;
  readonly operationId: string;
  readonly assetId: string;
  readonly author: ProjectRevisionAuthor;
}

export type PromoteProjectJobResult =
  | { readonly kind: 'promoted'; readonly value: ProjectAggregate }
  | { readonly kind: 'stale' }
  | { readonly kind: 'conflict'; readonly conflict: ProjectConflict };

/**
 * Advances current working media only for the exact initiating revision and latest accepted
 * operation. Persistence still retains a valid stale result against its initiating revision.
 */
export const promoteProjectJobResult = (
  aggregate: ProjectAggregate,
  input: PromoteProjectJobResultInput,
  context: ProjectMutationContext,
): PromoteProjectJobResult => {
  const currentRevision = aggregate.revisions.find(
    ({ id }) => id === aggregate.project.currentRevisionId,
  );
  if (currentRevision === undefined) {
    throw new ProjectRuleError('invalid-snapshot', 'The current project revision is missing.');
  }
  if (
    !input.operationIsCurrent ||
    currentRevision.id !== input.initiatingRevisionId ||
    currentRevision.revisionNumber !== input.initiatingRevisionNumber
  ) {
    return { kind: 'stale' };
  }
  const now = requireTimestamp(context.now);
  const assetId = requireId(input.assetId, 'Job result asset');
  const appended = appendProjectRevision(
    aggregate,
    {
      expectedProjectVersion: input.expectedProjectVersion,
      expectedRevisionNumber: input.expectedRevisionNumber,
      snapshot: {
        ...currentRevision.snapshot,
        workingMedia: { kind: 'asset', assetId },
        presentedMedia: { kind: 'asset', assetId },
        lastSuccessfulOutput: null,
        workflowPhase: 'review',
        updatedAt: now,
      },
      author: input.author,
      source: 'job-result',
      facts: {
        sourceStatus: currentRevision.snapshot.sourceAssetId === null ? 'none' : 'ready',
        currentAttempt: { status: 'succeeded', jobId: requireId(input.operationId, 'Operation') },
        validatedLastSuccessfulOutput: null,
      },
    },
    { ...context, now },
  );
  return appended.ok
    ? { kind: 'promoted', value: appended.value }
    : { kind: 'conflict', conflict: appended.conflict };
};
