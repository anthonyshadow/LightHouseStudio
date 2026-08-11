import { projectSnapshotSchema } from '@studio/contracts';
import {
  PROJECT_SNAPSHOT_SCHEMA_VERSION,
  type Project,
  type ProjectAggregate,
  type ProjectAssetLink,
  type ProjectJobLink,
  type ProjectOutputLink,
  type ProjectRevision,
  type ProjectRevisionAuthor,
  type ProjectSnapshot,
} from '@studio/domain';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { nullableIsoTimestamp, toIsoTimestamp } from '../../application/timestamps.js';
import type {
  AppendProjectRevisionPersistenceInput,
  ProjectPersistenceMutationResult,
  ProjectRepository,
} from '../../features/projects/project-repository.js';
import type { LightframeDatabase } from './client.js';
import {
  mediaAssets,
  processingJobs,
  projectAssets,
  projectJobs,
  projectOutputs,
  projectRevisions,
  projects,
  savedVideos,
  videoVersions,
} from './schema.js';

type DatabaseExecutor = Parameters<Parameters<LightframeDatabase['transaction']>[0]>[0];
type ProjectRow = typeof projects.$inferSelect;
type ProjectRevisionRow = typeof projectRevisions.$inferSelect;
type ProjectAssetRow = typeof projectAssets.$inferSelect;
type ProjectJobRow = typeof projectJobs.$inferSelect;
type ProjectOutputRow = typeof projectOutputs.$inferSelect;

export type ProjectPersistenceErrorCode = 'invalid-aggregate' | 'asset-not-ready';

export class ProjectPersistenceError extends Error {
  constructor(
    readonly code: ProjectPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectPersistenceError';
  }
}

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

const toSnapshot = (row: ProjectRevisionRow): ProjectSnapshot => {
  if (row.snapshotSchemaVersion !== PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The stored Project snapshot version is unsupported.',
    );
  }
  return projectSnapshotSchema.parse(row.snapshot);
};

export const mapProjectAggregate = (
  projectRow: ProjectRow,
  revisionRows: readonly ProjectRevisionRow[],
  assetRows: readonly ProjectAssetRow[],
  jobRows: readonly ProjectJobRow[],
  outputRows: readonly ProjectOutputRow[],
): ProjectAggregate => {
  if (projectRow.currentRevisionId === null || projectRow.currentRevisionNumber < 1) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The stored Project has no current revision.',
    );
  }
  const project: Project = {
    id: projectRow.id,
    ownerUserId: projectRow.ownerUserId,
    title: projectRow.title,
    status: projectRow.status,
    version: projectRow.version,
    currentRevisionId: projectRow.currentRevisionId,
    currentRevisionNumber: projectRow.currentRevisionNumber,
    archivedAt: nullableIsoTimestamp(projectRow.archivedAt),
    deletedAt: nullableIsoTimestamp(projectRow.deletedAt),
    createdAt: toIsoTimestamp(projectRow.createdAt),
    updatedAt: toIsoTimestamp(projectRow.updatedAt),
  };
  const revisions: ProjectRevision[] = revisionRows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    ownerUserId: row.ownerUserId,
    revisionNumber: row.revisionNumber,
    parentRevisionId: row.parentRevisionId,
    parentRevisionNumber: row.parentRevisionNumber,
    snapshot: toSnapshot(row),
    author: toRevisionAuthor(row),
    source: row.source,
    createdAt: toIsoTimestamp(row.createdAt),
  }));
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
    jobLinks: jobRows.map((row) => ({
      projectId: row.projectId,
      ownerUserId: row.ownerUserId,
      jobId: row.jobId,
      revisionId: row.revisionId,
      revisionNumber: row.revisionNumber,
      createdAt: toIsoTimestamp(row.createdAt),
    })),
    outputLinks: outputRows.map((row) => ({
      projectId: row.projectId,
      ownerUserId: row.ownerUserId,
      savedVideoId: row.savedVideoId,
      videoVersionId: row.videoVersionId,
      revisionId: row.revisionId,
      revisionNumber: row.revisionNumber,
      createdAt: toIsoTimestamp(row.createdAt),
    })),
  };
};

const projectValues = (
  project: Project,
  current: {
    readonly currentRevisionId: string | null;
    readonly currentRevisionNumber: number;
  },
): typeof projects.$inferInsert => ({
  id: project.id,
  ownerUserId: project.ownerUserId,
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

const revisionValues = (revision: ProjectRevision): typeof projectRevisions.$inferInsert => ({
  id: revision.id,
  projectId: revision.projectId,
  ownerUserId: revision.ownerUserId,
  revisionNumber: revision.revisionNumber,
  parentRevisionId: revision.parentRevisionId,
  parentRevisionNumber: revision.parentRevisionNumber,
  snapshotSchemaVersion: revision.snapshot.schemaVersion,
  snapshot: revision.snapshot,
  authorKind: revision.author.kind,
  authorId: revision.author.authorId,
  source: revision.source,
  createdAt: toIsoTimestamp(revision.createdAt),
});

const assetLinkValues = (link: ProjectAssetLink): typeof projectAssets.$inferInsert => ({
  projectId: link.projectId,
  ownerUserId: link.ownerUserId,
  assetId: link.assetId,
  role: link.role,
  revisionId: link.revisionId,
  revisionNumber: link.revisionNumber,
  createdAt: toIsoTimestamp(link.createdAt),
});

const snapshotAssetLinks = (
  revision: ProjectRevision,
): readonly Readonly<{ assetId: string; role: ProjectAssetLink['role'] }>[] => {
  const links: { assetId: string; role: ProjectAssetLink['role'] }[] = [];
  if (revision.snapshot.sourceAssetId !== null) {
    links.push({ assetId: revision.snapshot.sourceAssetId, role: 'source' });
  }
  if (revision.snapshot.workingMedia?.kind === 'asset') {
    links.push({ assetId: revision.snapshot.workingMedia.assetId, role: 'working' });
  }
  if (revision.snapshot.presentedMedia?.kind === 'asset') {
    links.push({ assetId: revision.snapshot.presentedMedia.assetId, role: 'presented' });
  }
  return links;
};

const assertRevisionAssetLinks = (
  revision: ProjectRevision,
  links: readonly ProjectAssetLink[],
): void => {
  if (
    links.some(
      (link) =>
        link.projectId !== revision.projectId ||
        link.ownerUserId !== revision.ownerUserId ||
        link.revisionId !== revision.id ||
        link.revisionNumber !== revision.revisionNumber,
    )
  ) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'Project asset links must belong to the same owner, Project, and revision.',
    );
  }
  const validLink = (required: { assetId: string; role: ProjectAssetLink['role'] }) =>
    links.some(
      (link) =>
        link.assetId === required.assetId &&
        link.role === required.role &&
        link.projectId === revision.projectId &&
        link.ownerUserId === revision.ownerUserId &&
        link.revisionId === revision.id &&
        link.revisionNumber === revision.revisionNumber,
    );
  if (!snapshotAssetLinks(revision).every(validLink)) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'Every snapshot asset needs an explicit role link from the same revision.',
    );
  }
};

const assertReadyAssets = async (
  executor: LightframeDatabase | DatabaseExecutor,
  ownerUserId: string,
  links: readonly ProjectAssetLink[],
): Promise<void> => {
  const assetIds = [...new Set(links.map(({ assetId }) => assetId))];
  if (assetIds.length === 0) return;
  const rows = await executor
    .select({ id: mediaAssets.id, status: mediaAssets.status })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.ownerUserId, ownerUserId), inArray(mediaAssets.id, assetIds)));
  if (
    assetIds.some((assetId) => !rows.some((row) => row.id === assetId && row.status === 'ready'))
  ) {
    throw new ProjectPersistenceError(
      'asset-not-ready',
      'A missing, deleted, or unaccepted asset cannot be linked to a Project revision.',
    );
  }
};

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: LightframeDatabase) {}

  async create(aggregate: ProjectAggregate): Promise<void> {
    const { project } = aggregate;
    const [initialRevision] = aggregate.revisions;
    if (
      initialRevision === undefined ||
      aggregate.revisions.length !== 1 ||
      initialRevision.revisionNumber !== 1 ||
      initialRevision.id !== project.currentRevisionId ||
      project.currentRevisionNumber !== 1 ||
      project.version !== 1 ||
      initialRevision.projectId !== project.id ||
      initialRevision.ownerUserId !== project.ownerUserId ||
      aggregate.jobLinks.length !== 0 ||
      aggregate.outputLinks.length !== 0
    ) {
      throw new ProjectPersistenceError(
        'invalid-aggregate',
        'A new Project must contain one matching initial revision and no existing jobs or outputs.',
      );
    }
    assertRevisionAssetLinks(initialRevision, aggregate.assetLinks);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(projects)
        .values(projectValues(project, { currentRevisionId: null, currentRevisionNumber: 0 }));
      await tx.insert(projectRevisions).values(revisionValues(initialRevision));
      await assertReadyAssets(tx, project.ownerUserId, aggregate.assetLinks);
      if (aggregate.assetLinks.length > 0) {
        await tx.insert(projectAssets).values(aggregate.assetLinks.map(assetLinkValues));
      }
      await tx
        .update(projects)
        .set({
          currentRevisionId: project.currentRevisionId,
          currentRevisionNumber: project.currentRevisionNumber,
        })
        .where(and(eq(projects.id, project.id), eq(projects.ownerUserId, project.ownerUserId)));
    });
  }

  async get(ownerUserId: string, projectId: string): Promise<ProjectAggregate | null> {
    return this.db.transaction(async (tx) => {
      const [projectRow] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.ownerUserId, ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .for('share')
        .limit(1);
      if (projectRow === undefined) return null;
      const [revisionRows, assetRows, jobRows, outputRows] = await Promise.all([
        tx
          .select()
          .from(projectRevisions)
          .where(eq(projectRevisions.projectId, projectId))
          .orderBy(asc(projectRevisions.revisionNumber)),
        tx.select().from(projectAssets).where(eq(projectAssets.projectId, projectId)),
        tx.select().from(projectJobs).where(eq(projectJobs.projectId, projectId)),
        tx.select().from(projectOutputs).where(eq(projectOutputs.projectId, projectId)),
      ]);
      return mapProjectAggregate(projectRow, revisionRows, assetRows, jobRows, outputRows);
    });
  }

  async appendRevision(
    input: AppendProjectRevisionPersistenceInput,
  ): Promise<ProjectPersistenceMutationResult> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.ownerUserId, input.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (current === undefined) return { kind: 'not-found' } as const;
      if (current.version !== input.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'project-version',
            projectId: input.projectId,
            expectedVersion: input.expectedVersion,
            actualVersion: current.version,
          },
        } as const;
      }
      if (current.currentRevisionNumber !== input.expectedRevisionNumber) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'revision',
            projectId: input.projectId,
            expectedRevisionNumber: input.expectedRevisionNumber,
            actualRevisionNumber: current.currentRevisionNumber,
          },
        } as const;
      }
      const validNextState =
        input.nextProject.id === current.id &&
        input.nextProject.ownerUserId === current.ownerUserId &&
        input.nextProject.version === current.version + 1 &&
        input.revision.projectId === current.id &&
        input.revision.ownerUserId === current.ownerUserId &&
        input.revision.parentRevisionId === current.currentRevisionId &&
        input.revision.parentRevisionNumber === current.currentRevisionNumber &&
        input.revision.revisionNumber === current.currentRevisionNumber + 1 &&
        input.nextProject.currentRevisionId === input.revision.id &&
        input.nextProject.currentRevisionNumber === input.revision.revisionNumber;
      if (!validNextState) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'The appended Project revision does not continue the locked aggregate.',
        );
      }
      assertRevisionAssetLinks(input.revision, input.assetLinks);
      await assertReadyAssets(tx, input.ownerUserId, input.assetLinks);
      await tx.insert(projectRevisions).values(revisionValues(input.revision));
      if (input.assetLinks.length > 0) {
        await tx
          .insert(projectAssets)
          .values(input.assetLinks.map(assetLinkValues))
          .onConflictDoNothing();
      }
      await tx
        .update(projects)
        .set({
          status: input.nextProject.status,
          version: input.nextProject.version,
          currentRevisionId: input.nextProject.currentRevisionId,
          currentRevisionNumber: input.nextProject.currentRevisionNumber,
          updatedAt: toIsoTimestamp(input.nextProject.updatedAt),
        })
        .where(and(eq(projects.id, current.id), eq(projects.ownerUserId, current.ownerUserId)));
      return { kind: 'updated' } as const;
    });
  }

  async updateMetadata(
    ownerUserId: string,
    expectedVersion: number,
    nextProject: Project,
  ): Promise<ProjectPersistenceMutationResult> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, nextProject.id), eq(projects.ownerUserId, ownerUserId)))
        .for('update')
        .limit(1);
      if (current === undefined) return { kind: 'not-found' } as const;
      if (current.version !== expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'project-version',
            projectId: current.id,
            expectedVersion,
            actualVersion: current.version,
          },
        } as const;
      }
      if (
        nextProject.ownerUserId !== current.ownerUserId ||
        nextProject.version !== current.version + 1 ||
        nextProject.currentRevisionId !== current.currentRevisionId ||
        nextProject.currentRevisionNumber !== current.currentRevisionNumber
      ) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'A metadata update cannot change Project ownership or revision identity.',
        );
      }
      await tx
        .update(projects)
        .set({
          title: nextProject.title,
          status: nextProject.status,
          version: nextProject.version,
          archivedAt: nullableIsoTimestamp(nextProject.archivedAt),
          deletedAt: nullableIsoTimestamp(nextProject.deletedAt),
          updatedAt: toIsoTimestamp(nextProject.updatedAt),
        })
        .where(and(eq(projects.id, current.id), eq(projects.ownerUserId, current.ownerUserId)));
      return { kind: 'updated' } as const;
    });
  }

  async linkJob(link: ProjectJobLink): Promise<'linked' | 'not-found'> {
    return this.db.transaction(async (tx) => {
      const [projectRow, jobRow] = await Promise.all([
        tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, link.projectId),
              eq(projects.ownerUserId, link.ownerUserId),
              isNull(projects.deletedAt),
            ),
          )
          .limit(1),
        tx
          .select({ id: processingJobs.id })
          .from(processingJobs)
          .where(
            and(
              eq(processingJobs.id, link.jobId),
              eq(processingJobs.ownerUserId, link.ownerUserId),
            ),
          )
          .limit(1),
      ]);
      if (projectRow === undefined || jobRow === undefined) return 'not-found';
      await tx
        .insert(projectJobs)
        .values({
          projectId: link.projectId,
          ownerUserId: link.ownerUserId,
          jobId: link.jobId,
          revisionId: link.revisionId,
          revisionNumber: link.revisionNumber,
          createdAt: toIsoTimestamp(link.createdAt),
        })
        .onConflictDoNothing();
      return 'linked';
    });
  }

  async linkOutput(link: ProjectOutputLink): Promise<'linked' | 'not-found'> {
    return this.db.transaction(async (tx) => {
      const [projectRow, outputRow] = await Promise.all([
        tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.id, link.projectId),
              eq(projects.ownerUserId, link.ownerUserId),
              isNull(projects.deletedAt),
            ),
          )
          .limit(1),
        tx
          .select({ id: videoVersions.id })
          .from(videoVersions)
          .innerJoin(
            savedVideos,
            and(
              eq(savedVideos.id, videoVersions.videoId),
              eq(savedVideos.ownerUserId, videoVersions.ownerUserId),
            ),
          )
          .where(
            and(
              eq(savedVideos.id, link.savedVideoId),
              eq(videoVersions.id, link.videoVersionId),
              eq(savedVideos.ownerUserId, link.ownerUserId),
              isNull(savedVideos.deletedAt),
            ),
          )
          .limit(1),
      ]);
      if (projectRow === undefined || outputRow === undefined) return 'not-found';
      await tx
        .insert(projectOutputs)
        .values({
          projectId: link.projectId,
          ownerUserId: link.ownerUserId,
          savedVideoId: link.savedVideoId,
          videoVersionId: link.videoVersionId,
          revisionId: link.revisionId,
          revisionNumber: link.revisionNumber,
          createdAt: toIsoTimestamp(link.createdAt),
        })
        .onConflictDoNothing();
      return 'linked';
    });
  }
}
