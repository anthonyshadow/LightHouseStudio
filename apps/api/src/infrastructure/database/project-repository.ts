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
  type ProjectVersionReferenceLink,
} from '@studio/domain';
import { and, desc, eq, inArray, isNull, lt, or, sql, type SQLWrapper } from 'drizzle-orm';
import { nullableIsoTimestamp, toIsoTimestamp } from '../../application/timestamps.js';
import type {
  AppendProjectRevisionPersistenceInput,
  ProjectCurrentRead,
  ProjectLinkHistoryKind,
  ProjectLinkHistoryPage,
  ProjectLinkMutationResult,
  ProjectPersistenceMutationResult,
  ProjectRepository,
  ProjectRevisionHistoryPage,
} from '../../features/projects/project-repository.js';
import type { LightframeDatabase } from './client.js';
import {
  mediaAssets,
  processingJobs,
  projectAssets,
  projectJobs,
  projectOutputs,
  projectRevisions,
  projectVersionReferences,
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
type ProjectVersionReferenceRow = typeof projectVersionReferences.$inferSelect;

export type ProjectPersistenceErrorCode =
  'invalid-aggregate' | 'asset-not-ready' | 'version-not-ready' | 'output-not-linked';

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

const parseSnapshot = (schemaVersion: number, snapshot: unknown): ProjectSnapshot => {
  if (schemaVersion !== PROJECT_SNAPSHOT_SCHEMA_VERSION) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The stored Project snapshot version is unsupported.',
    );
  }
  return projectSnapshotSchema.parse(snapshot);
};

const toSnapshot = (row: ProjectRevisionRow): ProjectSnapshot =>
  parseSnapshot(row.snapshotSchemaVersion, row.snapshot);

const toRevision = (row: ProjectRevisionRow): ProjectRevision => ({
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
});

const toProject = (row: ProjectRow): Project => {
  if (row.currentRevisionId === null || row.currentRevisionNumber < 1) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The stored Project has no current revision.',
    );
  }
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
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

export const mapProjectAggregate = (
  projectRow: ProjectRow,
  revisionRows: readonly ProjectRevisionRow[],
  assetRows: readonly ProjectAssetRow[],
  jobRows: readonly ProjectJobRow[],
  outputRows: readonly ProjectOutputRow[],
  versionReferenceRows: readonly ProjectVersionReferenceRow[] = [],
): ProjectAggregate => {
  const project = toProject(projectRow);
  const revisions: ProjectRevision[] = revisionRows.map(toRevision);
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
  snapshot: projectSnapshotSchema.parse(revision.snapshot),
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

const snapshotVersionReferenceLinks = (
  revision: ProjectRevision,
): readonly ProjectVersionReferenceLink[] => {
  const links: ProjectVersionReferenceLink[] = [];
  for (const [role, reference] of [
    ['working', revision.snapshot.workingMedia],
    ['presented', revision.snapshot.presentedMedia],
  ] as const) {
    if (reference?.kind !== 'saved-video-version') continue;
    links.push({
      projectId: revision.projectId,
      ownerUserId: revision.ownerUserId,
      savedVideoId: reference.savedVideoId,
      videoVersionId: reference.videoVersionId,
      role,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      createdAt: revision.createdAt,
    });
  }
  return links;
};

const versionReferenceValues = (
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
    links.some((link) => link.assetId === required.assetId && link.role === required.role);
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
    .where(and(eq(mediaAssets.ownerUserId, ownerUserId), inArray(mediaAssets.id, assetIds)))
    .for('share');
  const readyAssetIds = new Set(
    rows.filter(({ status }) => status === 'ready').map(({ id }) => id),
  );
  if (assetIds.some((assetId) => !readyAssetIds.has(assetId))) {
    throw new ProjectPersistenceError(
      'asset-not-ready',
      'A missing, deleted, or unaccepted asset cannot be linked to a Project revision.',
    );
  }
};

const assertReadyVersionReferences = async (
  executor: DatabaseExecutor,
  ownerUserId: string,
  links: readonly ProjectVersionReferenceLink[],
): Promise<void> => {
  if (links.length === 0) return;
  const savedVideoIds = [...new Set(links.map(({ savedVideoId }) => savedVideoId))];
  const videoVersionIds = [...new Set(links.map(({ videoVersionId }) => videoVersionId))];
  const rows = await executor
    .select({ savedVideoId: savedVideos.id, videoVersionId: videoVersions.id })
    .from(savedVideos)
    .innerJoin(
      videoVersions,
      and(
        eq(videoVersions.videoId, savedVideos.id),
        eq(videoVersions.ownerUserId, savedVideos.ownerUserId),
      ),
    )
    .where(
      and(
        eq(savedVideos.ownerUserId, ownerUserId),
        eq(savedVideos.status, 'ready'),
        isNull(savedVideos.deletedAt),
        inArray(savedVideos.id, savedVideoIds),
        inArray(videoVersions.id, videoVersionIds),
      ),
    )
    .for('share');
  const readyReferences = new Set(
    rows.map(({ savedVideoId, videoVersionId }) => `${savedVideoId}:${videoVersionId}`),
  );
  if (
    links.some(
      ({ savedVideoId, videoVersionId }) =>
        !readyReferences.has(`${savedVideoId}:${videoVersionId}`),
    )
  ) {
    throw new ProjectPersistenceError(
      'version-not-ready',
      'A missing, deleted, cross-owner, or mismatched Saved Video Version cannot be linked.',
    );
  }
};

const assertLastSuccessfulOutput = async (
  executor: DatabaseExecutor,
  revision: ProjectRevision,
): Promise<void> => {
  const reference = revision.snapshot.lastSuccessfulOutput;
  if (reference === null) return;
  const [row] = await executor
    .select({ videoVersionId: projectOutputs.videoVersionId })
    .from(projectOutputs)
    .where(
      and(
        eq(projectOutputs.projectId, revision.projectId),
        eq(projectOutputs.ownerUserId, revision.ownerUserId),
        eq(projectOutputs.savedVideoId, reference.savedVideoId),
        eq(projectOutputs.videoVersionId, reference.videoVersionId),
      ),
    )
    .limit(1);
  if (row === undefined) {
    throw new ProjectPersistenceError(
      'output-not-linked',
      'The current output pointer must name an exact retained Project output relation.',
    );
  }
};

type LinkHistoryCursorRow = {
  readonly revisionNumber: number;
  readonly key: string;
};

const linkHistoryPage = <Row extends LinkHistoryCursorRow>(
  rows: readonly Row[],
  pageSize: number,
  toLink: (row: Row) => ProjectLinkHistoryPage['links'][number],
): ProjectLinkHistoryPage => {
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  return {
    links: page.map(toLink),
    nextCursor:
      rows.length > pageSize && last !== undefined
        ? { revisionNumber: last.revisionNumber, key: last.key }
        : null,
  };
};

const replayOrRelationConflict = <Row>(
  row: Row | undefined,
  matches: (row: Row) => boolean,
  projectId: string,
  relation: 'job' | 'output',
): ProjectLinkMutationResult =>
  row !== undefined && matches(row)
    ? { kind: 'linked', replayed: true }
    : {
        kind: 'conflict',
        conflict: { kind: 'relation-mismatch', projectId, relation },
      };

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: LightframeDatabase) {}

  async create(aggregate: ProjectAggregate): Promise<void> {
    const { project } = aggregate;
    const [rawInitialRevision] = aggregate.revisions;
    const initialRevision =
      rawInitialRevision === undefined
        ? undefined
        : {
            ...rawInitialRevision,
            snapshot: parseSnapshot(
              rawInitialRevision.snapshot.schemaVersion,
              rawInitialRevision.snapshot,
            ),
          };
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
    const versionReferenceLinks = snapshotVersionReferenceLinks(initialRevision);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(projects)
        .values(projectValues(project, { currentRevisionId: null, currentRevisionNumber: 0 }));
      await tx.insert(projectRevisions).values(revisionValues(initialRevision));
      await assertReadyAssets(tx, project.ownerUserId, aggregate.assetLinks);
      await assertReadyVersionReferences(tx, project.ownerUserId, versionReferenceLinks);
      await assertLastSuccessfulOutput(tx, initialRevision);
      if (aggregate.assetLinks.length > 0) {
        await tx.insert(projectAssets).values(aggregate.assetLinks.map(assetLinkValues));
      }
      if (versionReferenceLinks.length > 0) {
        await tx
          .insert(projectVersionReferences)
          .values(versionReferenceLinks.map(versionReferenceValues));
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

  async getCurrent(ownerUserId: string, projectId: string): Promise<ProjectCurrentRead | null> {
    const [row] = await this.db
      .select({ project: projects, revision: projectRevisions })
      .from(projects)
      .leftJoin(
        projectRevisions,
        and(
          eq(projectRevisions.projectId, projects.id),
          eq(projectRevisions.ownerUserId, projects.ownerUserId),
          eq(projectRevisions.id, projects.currentRevisionId),
          eq(projectRevisions.revisionNumber, projects.currentRevisionNumber),
        ),
      )
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .for('share', { of: projects })
      .limit(1);
    if (row === undefined) return null;
    if (row.revision === null) {
      throw new ProjectPersistenceError(
        'invalid-aggregate',
        'The stored Project current revision is unavailable.',
      );
    }
    return { project: toProject(row.project), revision: toRevision(row.revision) };
  }

  async #hasProject(ownerUserId: string, projectId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async #pageForExistingProject<Page>(
    ownerUserId: string,
    projectId: string,
    page: Page,
    hasRows: boolean,
  ): Promise<Page | null> {
    return hasRows || (await this.#hasProject(ownerUserId, projectId)) ? page : null;
  }

  async listRevisionHistory(
    ownerUserId: string,
    projectId: string,
    input: { readonly beforeRevisionNumber?: number; readonly pageSize: number },
  ): Promise<ProjectRevisionHistoryPage | null> {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw new ProjectPersistenceError('invalid-aggregate', 'Use a bounded Project history page.');
    }
    const rows = await this.db
      .select({ revision: projectRevisions })
      .from(projectRevisions)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectRevisions.projectId),
          eq(projects.ownerUserId, projectRevisions.ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .where(
        and(
          eq(projectRevisions.projectId, projectId),
          eq(projectRevisions.ownerUserId, ownerUserId),
          input.beforeRevisionNumber === undefined
            ? undefined
            : lt(projectRevisions.revisionNumber, input.beforeRevisionNumber),
        ),
      )
      .orderBy(desc(projectRevisions.revisionNumber))
      .limit(input.pageSize + 1);
    const pageRows = rows.slice(0, input.pageSize).map(({ revision }) => revision);
    const page = {
      revisions: pageRows.map(toRevision),
      nextRevisionNumber:
        rows.length > input.pageSize ? (pageRows.at(-1)?.revisionNumber ?? null) : null,
    };
    return this.#pageForExistingProject(ownerUserId, projectId, page, rows.length > 0);
  }

  async listLinkHistory(
    ownerUserId: string,
    projectId: string,
    input: {
      readonly kind: ProjectLinkHistoryKind;
      readonly cursor?: { readonly revisionNumber: number; readonly key: string };
      readonly pageSize: number;
    },
  ): Promise<ProjectLinkHistoryPage | null> {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100) {
      throw new ProjectPersistenceError('invalid-aggregate', 'Use a bounded Project link page.');
    }
    const cursorWhere = (revisionNumber: SQLWrapper, key: ReturnType<typeof sql<string>>) =>
      input.cursor === undefined
        ? undefined
        : or(
            sql`${revisionNumber} < ${input.cursor.revisionNumber}`,
            and(
              sql`${revisionNumber} = ${input.cursor.revisionNumber}`,
              sql`${key} < ${input.cursor.key}`,
            ),
          );
    const limit = input.pageSize + 1;

    if (input.kind === 'asset') {
      const key = sql<string>`${projectAssets.assetId}::text || ':' || ${projectAssets.role}::text`;
      const rows = await this.db
        .select({
          projectId: projectAssets.projectId,
          ownerUserId: projectAssets.ownerUserId,
          assetId: projectAssets.assetId,
          role: projectAssets.role,
          revisionId: projectAssets.revisionId,
          revisionNumber: projectAssets.revisionNumber,
          createdAt: projectAssets.createdAt,
          key,
        })
        .from(projectAssets)
        .innerJoin(
          projects,
          and(
            eq(projects.id, projectAssets.projectId),
            eq(projects.ownerUserId, projectAssets.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .where(
          and(
            eq(projectAssets.projectId, projectId),
            eq(projectAssets.ownerUserId, ownerUserId),
            cursorWhere(projectAssets.revisionNumber, key),
          ),
        )
        .orderBy(desc(projectAssets.revisionNumber), desc(key))
        .limit(limit);
      const page = linkHistoryPage(rows, input.pageSize, ({ key: _key, ...row }) => ({
        ...row,
        createdAt: toIsoTimestamp(row.createdAt),
      }));
      return this.#pageForExistingProject(ownerUserId, projectId, page, rows.length > 0);
    }

    if (input.kind === 'version-reference') {
      const key = sql<string>`${projectVersionReferences.videoVersionId}::text || ':' || ${projectVersionReferences.role}::text`;
      const rows = await this.db
        .select({
          projectId: projectVersionReferences.projectId,
          ownerUserId: projectVersionReferences.ownerUserId,
          savedVideoId: projectVersionReferences.savedVideoId,
          videoVersionId: projectVersionReferences.videoVersionId,
          role: projectVersionReferences.role,
          revisionId: projectVersionReferences.revisionId,
          revisionNumber: projectVersionReferences.revisionNumber,
          createdAt: projectVersionReferences.createdAt,
          key,
        })
        .from(projectVersionReferences)
        .innerJoin(
          projects,
          and(
            eq(projects.id, projectVersionReferences.projectId),
            eq(projects.ownerUserId, projectVersionReferences.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .where(
          and(
            eq(projectVersionReferences.projectId, projectId),
            eq(projectVersionReferences.ownerUserId, ownerUserId),
            cursorWhere(projectVersionReferences.revisionNumber, key),
          ),
        )
        .orderBy(desc(projectVersionReferences.revisionNumber), desc(key))
        .limit(limit);
      const page = linkHistoryPage(rows, input.pageSize, ({ key: _key, ...row }) => ({
        ...row,
        createdAt: toIsoTimestamp(row.createdAt),
      }));
      return this.#pageForExistingProject(ownerUserId, projectId, page, rows.length > 0);
    }

    if (input.kind === 'job') {
      const key = sql<string>`${projectJobs.jobId}::text`;
      const rows = await this.db
        .select({
          projectId: projectJobs.projectId,
          ownerUserId: projectJobs.ownerUserId,
          jobId: projectJobs.jobId,
          initiatingRevisionId: projectJobs.initiatingRevisionId,
          initiatingRevisionNumber: projectJobs.initiatingRevisionNumber,
          createdAt: projectJobs.createdAt,
          revisionNumber: projectJobs.initiatingRevisionNumber,
          key,
        })
        .from(projectJobs)
        .innerJoin(
          projects,
          and(
            eq(projects.id, projectJobs.projectId),
            eq(projects.ownerUserId, projectJobs.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .where(
          and(
            eq(projectJobs.projectId, projectId),
            eq(projectJobs.ownerUserId, ownerUserId),
            cursorWhere(projectJobs.initiatingRevisionNumber, key),
          ),
        )
        .orderBy(desc(projectJobs.initiatingRevisionNumber), desc(key))
        .limit(limit);
      const page = linkHistoryPage(
        rows,
        input.pageSize,
        ({ key: _key, revisionNumber: _revisionNumber, ...row }) => ({
          ...row,
          createdAt: toIsoTimestamp(row.createdAt),
        }),
      );
      return this.#pageForExistingProject(ownerUserId, projectId, page, rows.length > 0);
    }

    const key = sql<string>`${projectOutputs.videoVersionId}::text`;
    const rows = await this.db
      .select({
        projectId: projectOutputs.projectId,
        ownerUserId: projectOutputs.ownerUserId,
        savedVideoId: projectOutputs.savedVideoId,
        videoVersionId: projectOutputs.videoVersionId,
        producingRevisionId: projectOutputs.producingRevisionId,
        producingRevisionNumber: projectOutputs.producingRevisionNumber,
        createdAt: projectOutputs.createdAt,
        revisionNumber: projectOutputs.producingRevisionNumber,
        key,
      })
      .from(projectOutputs)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectOutputs.projectId),
          eq(projects.ownerUserId, projectOutputs.ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .where(
        and(
          eq(projectOutputs.projectId, projectId),
          eq(projectOutputs.ownerUserId, ownerUserId),
          cursorWhere(projectOutputs.producingRevisionNumber, key),
        ),
      )
      .orderBy(desc(projectOutputs.producingRevisionNumber), desc(key))
      .limit(limit);
    const page = linkHistoryPage(
      rows,
      input.pageSize,
      ({ key: _key, revisionNumber: _revisionNumber, ...row }) => ({
        ...row,
        createdAt: toIsoTimestamp(row.createdAt),
      }),
    );
    return this.#pageForExistingProject(ownerUserId, projectId, page, rows.length > 0);
  }

  async appendRevision(
    input: AppendProjectRevisionPersistenceInput,
  ): Promise<ProjectPersistenceMutationResult> {
    return this.db.transaction(async (tx) => {
      const revision: ProjectRevision = {
        ...input.revision,
        snapshot: projectSnapshotSchema.parse(input.revision.snapshot),
      };
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
        current.archivedAt === null &&
        revision.projectId === current.id &&
        revision.ownerUserId === current.ownerUserId &&
        revision.parentRevisionId === current.currentRevisionId &&
        revision.parentRevisionNumber === current.currentRevisionNumber &&
        revision.revisionNumber === current.currentRevisionNumber + 1 &&
        input.nextProject.currentRevisionId === revision.id &&
        input.nextProject.currentRevisionNumber === revision.revisionNumber;
      if (!validNextState) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'The appended Project revision does not continue the locked aggregate.',
        );
      }
      assertRevisionAssetLinks(revision, input.assetLinks);
      const versionReferenceLinks = snapshotVersionReferenceLinks(revision);
      await assertReadyAssets(tx, input.ownerUserId, input.assetLinks);
      await assertReadyVersionReferences(tx, input.ownerUserId, versionReferenceLinks);
      await assertLastSuccessfulOutput(tx, revision);
      await tx.insert(projectRevisions).values(revisionValues(revision));
      if (input.assetLinks.length > 0) {
        await tx.insert(projectAssets).values(input.assetLinks.map(assetLinkValues));
      }
      if (versionReferenceLinks.length > 0) {
        await tx
          .insert(projectVersionReferences)
          .values(versionReferenceLinks.map(versionReferenceValues));
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
      if (current.archivedAt === null && nextProject.archivedAt !== null) {
        const [activeJob] = await tx
          .select({ id: processingJobs.id })
          .from(projectJobs)
          .innerJoin(
            processingJobs,
            and(
              eq(processingJobs.id, projectJobs.jobId),
              eq(processingJobs.ownerUserId, projectJobs.ownerUserId),
            ),
          )
          .where(
            and(
              eq(projectJobs.projectId, current.id),
              eq(projectJobs.ownerUserId, current.ownerUserId),
              inArray(processingJobs.status, [
                'pending',
                'validating',
                'submitting',
                'accepted',
                'queued',
                'processing',
                'retrieving',
              ]),
            ),
          )
          .for('share')
          .limit(1);
        if (activeJob !== undefined) {
          return {
            kind: 'conflict',
            conflict: { kind: 'active-jobs', projectId: current.id },
          } as const;
        }
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

  async linkJob(link: ProjectJobLink): Promise<ProjectLinkMutationResult> {
    return this.db.transaction(async (tx) => {
      const [projectRow] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, link.projectId),
            eq(projects.ownerUserId, link.ownerUserId),
            isNull(projects.archivedAt),
            isNull(projects.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (projectRow === undefined) return { kind: 'not-found' };
      const [[revisionRow], [jobRow]] = await Promise.all([
        tx
          .select({ id: projectRevisions.id })
          .from(projectRevisions)
          .where(
            and(
              eq(projectRevisions.projectId, link.projectId),
              eq(projectRevisions.ownerUserId, link.ownerUserId),
              eq(projectRevisions.id, link.initiatingRevisionId),
              eq(projectRevisions.revisionNumber, link.initiatingRevisionNumber),
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
          .for('share')
          .limit(1),
      ]);
      if (revisionRow === undefined || jobRow === undefined) return { kind: 'not-found' };
      const exact = (row: ProjectJobRow): boolean =>
        row.projectId === link.projectId &&
        row.ownerUserId === link.ownerUserId &&
        row.jobId === link.jobId &&
        row.initiatingRevisionId === link.initiatingRevisionId &&
        row.initiatingRevisionNumber === link.initiatingRevisionNumber;
      const [existing] = await tx
        .select()
        .from(projectJobs)
        .where(eq(projectJobs.jobId, link.jobId))
        .limit(1);
      if (existing !== undefined) {
        return replayOrRelationConflict(existing, exact, link.projectId, 'job');
      }
      const inserted = await tx
        .insert(projectJobs)
        .values({
          projectId: link.projectId,
          ownerUserId: link.ownerUserId,
          jobId: link.jobId,
          initiatingRevisionId: link.initiatingRevisionId,
          initiatingRevisionNumber: link.initiatingRevisionNumber,
          createdAt: toIsoTimestamp(link.createdAt),
        })
        .onConflictDoNothing({ target: projectJobs.jobId })
        .returning({ jobId: projectJobs.jobId });
      if (inserted.length > 0) return { kind: 'linked', replayed: false };
      const [raced] = await tx
        .select()
        .from(projectJobs)
        .where(eq(projectJobs.jobId, link.jobId))
        .limit(1);
      return replayOrRelationConflict(raced, exact, link.projectId, 'job');
    });
  }

  async linkOutput(link: ProjectOutputLink): Promise<ProjectLinkMutationResult> {
    return this.db.transaction(async (tx) => {
      const [projectRow] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, link.projectId),
            eq(projects.ownerUserId, link.ownerUserId),
            isNull(projects.archivedAt),
            isNull(projects.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (projectRow === undefined) return { kind: 'not-found' };
      const [[revisionRow], [outputRow]] = await Promise.all([
        tx
          .select({ id: projectRevisions.id })
          .from(projectRevisions)
          .where(
            and(
              eq(projectRevisions.projectId, link.projectId),
              eq(projectRevisions.ownerUserId, link.ownerUserId),
              eq(projectRevisions.id, link.producingRevisionId),
              eq(projectRevisions.revisionNumber, link.producingRevisionNumber),
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
              eq(savedVideos.status, 'ready'),
              isNull(savedVideos.deletedAt),
            ),
          )
          .for('share')
          .limit(1),
      ]);
      if (revisionRow === undefined || outputRow === undefined) return { kind: 'not-found' };
      const exact = (row: ProjectOutputRow): boolean =>
        row.projectId === link.projectId &&
        row.ownerUserId === link.ownerUserId &&
        row.savedVideoId === link.savedVideoId &&
        row.videoVersionId === link.videoVersionId &&
        row.producingRevisionId === link.producingRevisionId &&
        row.producingRevisionNumber === link.producingRevisionNumber;
      const [existing] = await tx
        .select()
        .from(projectOutputs)
        .where(eq(projectOutputs.videoVersionId, link.videoVersionId))
        .limit(1);
      if (existing !== undefined) {
        return replayOrRelationConflict(existing, exact, link.projectId, 'output');
      }
      const inserted = await tx
        .insert(projectOutputs)
        .values({
          projectId: link.projectId,
          ownerUserId: link.ownerUserId,
          savedVideoId: link.savedVideoId,
          videoVersionId: link.videoVersionId,
          producingRevisionId: link.producingRevisionId,
          producingRevisionNumber: link.producingRevisionNumber,
          createdAt: toIsoTimestamp(link.createdAt),
        })
        .onConflictDoNothing({ target: projectOutputs.videoVersionId })
        .returning({ videoVersionId: projectOutputs.videoVersionId });
      if (inserted.length > 0) return { kind: 'linked', replayed: false };
      const [raced] = await tx
        .select()
        .from(projectOutputs)
        .where(eq(projectOutputs.videoVersionId, link.videoVersionId))
        .limit(1);
      return replayOrRelationConflict(raced, exact, link.projectId, 'output');
    });
  }
}
