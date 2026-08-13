import { projectSnapshotSchema } from '@studio/contracts';
import {
  PROJECT_SNAPSHOT_SCHEMA_VERSION,
  type Project,
  type ProjectAggregate,
  type ProjectAssetLink,
  type ProjectRevision,
  type ProjectRevisionAuthor,
  type ProjectSnapshot,
  type ProjectVersionReferenceLink,
} from '@studio/domain';
import { nullableIsoTimestamp, toIsoTimestamp } from '../../application/timestamps.js';
import type {
  ProjectSourceRecord,
  ProjectWorkingMediaRecord,
} from '../../features/projects/project-repository.js';
import { ProjectPersistenceError } from './project-persistence-errors.js';
import type {
  projectAssets,
  projectJobs,
  projectOutputs,
  projectRevisions,
  projectSources,
  projectWorkingMediaAdoptions,
  projectVersionReferences,
  projects,
} from './schema.js';

type ProjectRow = typeof projects.$inferSelect;
type ProjectRevisionRow = typeof projectRevisions.$inferSelect;
type ProjectAssetRow = typeof projectAssets.$inferSelect;
type ProjectJobRow = typeof projectJobs.$inferSelect;
type ProjectOutputRow = typeof projectOutputs.$inferSelect;
type ProjectVersionReferenceRow = typeof projectVersionReferences.$inferSelect;
type ProjectSourceRow = typeof projectSources.$inferSelect;
type ProjectWorkingMediaRow = typeof projectWorkingMediaAdoptions.$inferSelect;

const toRevisionAuthor = (row: ProjectRevisionRow): ProjectRevisionAuthor => {
  switch (row.authorKind) {
    case 'user':
      return { kind: 'user', authorId: row.authorId };
    case 'system':
      return { kind: 'system', authorId: row.authorId };
    case 'migration':
      return { kind: 'migration', authorId: row.authorId };
  }
};

export const parseSnapshot = (schemaVersion: number, snapshot: unknown): ProjectSnapshot => {
  if (schemaVersion !== 1 && schemaVersion !== PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The stored Project snapshot version is unsupported.',
    );
  }
  return projectSnapshotSchema.parse(snapshot);
};

export const toRevision = (row: ProjectRevisionRow): ProjectRevision => ({
  id: row.id,
  projectId: row.projectId,
  ownerUserId: row.ownerUserId,
  revisionNumber: row.revisionNumber,
  parentRevisionId: row.parentRevisionId,
  parentRevisionNumber: row.parentRevisionNumber,
  snapshot: parseSnapshot(row.snapshotSchemaVersion, row.snapshot),
  author: toRevisionAuthor(row),
  source: row.source,
  createdAt: toIsoTimestamp(row.createdAt),
});

export const toProject = (row: ProjectRow): Project => {
  if (row.currentRevisionId === null || row.currentRevisionNumber < 1) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The stored Project has no current revision.',
    );
  }
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    campaignId: row.campaignId,
    title: row.title,
    status: row.status,
    version: row.version,
    currentRevisionId: row.currentRevisionId,
    currentRevisionNumber: row.currentRevisionNumber,
    archivedAt: nullableIsoTimestamp(row.archivedAt),
    deletedAt: nullableIsoTimestamp(row.deletedAt),
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
  };
};

export const toProjectSource = (row: ProjectSourceRow): ProjectSourceRecord => ({
  projectId: row.projectId,
  ownerUserId: row.ownerUserId,
  assetId: row.assetId,
  kind: row.kind,
  savedVideoId: row.savedVideoId,
  videoVersionId: row.videoVersionId,
  acceptedRevisionId: row.acceptedRevisionId,
  acceptedRevisionNumber: row.acceptedRevisionNumber,
  operationKey: row.operationKey,
  requestFingerprint: row.requestFingerprint,
  mimeType: row.mimeType as ProjectSourceRecord['mimeType'],
  filename: row.filename,
  sizeBytes: row.sizeBytes,
  checksumSha256: row.checksumSha256,
  container: row.container as ProjectSourceRecord['container'],
  videoCodec: row.videoCodec as ProjectSourceRecord['videoCodec'],
  audioCodec: row.audioCodec,
  durationMs: row.durationMs,
  width: row.width,
  height: row.height,
  hasAudio: row.hasAudio,
  acceptedAt: toIsoTimestamp(row.acceptedAt),
});

export const toProjectWorkingMedia = (row: ProjectWorkingMediaRow): ProjectWorkingMediaRecord => ({
  projectId: row.projectId,
  ownerUserId: row.ownerUserId,
  kind: row.kind as ProjectWorkingMediaRecord['kind'],
  mediaReference:
    row.kind === 'saved-video-version'
      ? {
          kind: 'saved-video-version',
          savedVideoId: row.savedVideoId!,
          videoVersionId: row.videoVersionId!,
        }
      : { kind: 'asset', assetId: row.assetId },
  assetId: row.assetId,
  savedVideoId: row.savedVideoId,
  videoVersionId: row.videoVersionId,
  adoptedRevisionId: row.adoptedRevisionId,
  adoptedRevisionNumber: row.adoptedRevisionNumber,
  operationKey: row.operationKey,
  requestFingerprint: row.requestFingerprint,
  mimeType: row.mimeType as ProjectWorkingMediaRecord['mimeType'],
  filename: row.filename,
  sizeBytes: row.sizeBytes,
  checksumSha256: row.checksumSha256,
  container: row.container as ProjectWorkingMediaRecord['container'],
  videoCodec: row.videoCodec as ProjectWorkingMediaRecord['videoCodec'],
  audioCodec: row.audioCodec,
  durationMs: row.durationMs,
  width: row.width,
  height: row.height,
  hasAudio: row.hasAudio,
  adoptedAt: toIsoTimestamp(row.adoptedAt),
});

export const projectWorkingMediaValues = (
  media: ProjectWorkingMediaRecord,
): typeof projectWorkingMediaAdoptions.$inferInsert => ({
  projectId: media.projectId,
  ownerUserId: media.ownerUserId,
  kind: media.kind,
  assetId: media.assetId,
  savedVideoId: media.savedVideoId,
  videoVersionId: media.videoVersionId,
  adoptedRevisionId: media.adoptedRevisionId,
  adoptedRevisionNumber: media.adoptedRevisionNumber,
  operationKey: media.operationKey,
  requestFingerprint: media.requestFingerprint,
  mimeType: media.mimeType,
  filename: media.filename,
  sizeBytes: media.sizeBytes,
  checksumSha256: media.checksumSha256,
  container: media.container,
  videoCodec: media.videoCodec,
  audioCodec: media.audioCodec,
  durationMs: media.durationMs,
  width: media.width,
  height: media.height,
  hasAudio: media.hasAudio,
  adoptedAt: toIsoTimestamp(media.adoptedAt),
});

export const mapProjectAggregate = (
  projectRow: ProjectRow,
  revisionRows: readonly ProjectRevisionRow[],
  assetRows: readonly ProjectAssetRow[],
  jobRows: readonly ProjectJobRow[],
  outputRows: readonly ProjectOutputRow[],
  versionReferenceRows: readonly ProjectVersionReferenceRow[] = [],
): ProjectAggregate => {
  const project = toProject(projectRow);
  const revisions = revisionRows.map(toRevision);
  if (
    !revisions.some(
      ({ id, revisionNumber }) =>
        id === project.currentRevisionId && revisionNumber === project.currentRevisionNumber,
    )
  ) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The stored Project current revision is outside its revision history.',
    );
  }
  return {
    project,
    revisions,
    assetLinks: assetRows.map((row) => ({
      projectId: row.projectId,
      ownerUserId: row.ownerUserId,
      assetId: row.assetId,
      role: row.role,
      revisionId: row.revisionId,
      revisionNumber: row.revisionNumber,
      createdAt: toIsoTimestamp(row.createdAt),
    })),
    versionReferenceLinks: versionReferenceRows.map((row) => ({
      projectId: row.projectId,
      ownerUserId: row.ownerUserId,
      savedVideoId: row.savedVideoId,
      videoVersionId: row.videoVersionId,
      role: row.role,
      revisionId: row.revisionId,
      revisionNumber: row.revisionNumber,
      createdAt: toIsoTimestamp(row.createdAt),
    })),
    jobLinks: jobRows.map((row) => ({
      projectId: row.projectId,
      ownerUserId: row.ownerUserId,
      jobId: row.jobId,
      initiatingRevisionId: row.initiatingRevisionId,
      initiatingRevisionNumber: row.initiatingRevisionNumber,
      createdAt: toIsoTimestamp(row.createdAt),
    })),
    outputLinks: outputRows.map((row) => ({
      projectId: row.projectId,
      ownerUserId: row.ownerUserId,
      savedVideoId: row.savedVideoId,
      videoVersionId: row.videoVersionId,
      producingRevisionId: row.producingRevisionId,
      producingRevisionNumber: row.producingRevisionNumber,
      createdAt: toIsoTimestamp(row.createdAt),
    })),
  };
};

export const projectValues = (
  project: Project,
  current: {
    readonly currentRevisionId: string | null;
    readonly currentRevisionNumber: number;
  },
): typeof projects.$inferInsert => ({
  id: project.id,
  ownerUserId: project.ownerUserId,
  campaignId: project.campaignId,
  title: project.title,
  status: project.status,
  version: project.version,
  currentRevisionId: current.currentRevisionId,
  currentRevisionNumber: current.currentRevisionNumber,
  archivedAt: nullableIsoTimestamp(project.archivedAt),
  deletedAt: nullableIsoTimestamp(project.deletedAt),
  createdAt: toIsoTimestamp(project.createdAt),
  updatedAt: toIsoTimestamp(project.updatedAt),
});

export const revisionValues = (
  revision: ProjectRevision,
): typeof projectRevisions.$inferInsert => ({
  id: revision.id,
  projectId: revision.projectId,
  ownerUserId: revision.ownerUserId,
  revisionNumber: revision.revisionNumber,
  parentRevisionId: revision.parentRevisionId,
  parentRevisionNumber: revision.parentRevisionNumber,
  snapshotSchemaVersion: revision.snapshot.schemaVersion,
  snapshot: projectSnapshotSchema.parse(revision.snapshot),
  authorKind: revision.author.kind,
  authorId: revision.author.authorId,
  source: revision.source,
  createdAt: toIsoTimestamp(revision.createdAt),
});

export const assetLinkValues = (link: ProjectAssetLink): typeof projectAssets.$inferInsert => ({
  projectId: link.projectId,
  ownerUserId: link.ownerUserId,
  assetId: link.assetId,
  role: link.role,
  revisionId: link.revisionId,
  revisionNumber: link.revisionNumber,
  createdAt: toIsoTimestamp(link.createdAt),
});

export const versionReferenceValues = (
  link: ProjectVersionReferenceLink,
): typeof projectVersionReferences.$inferInsert => ({
  projectId: link.projectId,
  ownerUserId: link.ownerUserId,
  savedVideoId: link.savedVideoId,
  videoVersionId: link.videoVersionId,
  role: link.role,
  revisionId: link.revisionId,
  revisionNumber: link.revisionNumber,
  createdAt: toIsoTimestamp(link.createdAt),
});

export const projectSourceValues = (
  source: ProjectSourceRecord,
): typeof projectSources.$inferInsert => ({
  projectId: source.projectId,
  ownerUserId: source.ownerUserId,
  assetId: source.assetId,
  kind: source.kind,
  savedVideoId: source.savedVideoId,
  videoVersionId: source.videoVersionId,
  acceptedRevisionId: source.acceptedRevisionId,
  acceptedRevisionNumber: source.acceptedRevisionNumber,
  operationKey: source.operationKey,
  requestFingerprint: source.requestFingerprint,
  mimeType: source.mimeType,
  filename: source.filename,
  sizeBytes: source.sizeBytes,
  checksumSha256: source.checksumSha256,
  container: source.container,
  videoCodec: source.videoCodec,
  audioCodec: source.audioCodec,
  durationMs: source.durationMs,
  width: source.width,
  height: source.height,
  hasAudio: source.hasAudio,
  acceptedAt: toIsoTimestamp(source.acceptedAt),
});
