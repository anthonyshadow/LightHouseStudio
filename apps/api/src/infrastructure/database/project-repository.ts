import {
  type InspectedVideo,
  inspectedVideoSchema,
  projectOutputSaveResultSchema,
  projectProcessingCapabilitySchema,
  projectSnapshotSchema,
  videoJobErrorCodeSchema,
  videoOutputResolutionSchema,
} from '@studio/contracts';
import {
  currentProjectProcessingAttempt,
  projectProcessingAmbiguityIsSuperseded,
  projectProcessingAttemptBlocksArchive,
  projectProcessingAttemptIsRetryable,
  projectProcessingNeedsAttention,
  projectProcessingRestartTransition,
  projectVersionConflictDetail,
  type Project,
  type ProjectAggregate,
  type ProjectAssetLink,
  type ProjectAssetMembership,
  type ProjectJobLink,
  type ProjectOutputLink,
  type ProjectRevision,
  type ProjectVersionReferenceLink,
  projectStatusAfterProcessingTrace,
  projectConflicts,
} from '@studio/domain';
import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql, type SQLWrapper } from 'drizzle-orm';
import { nullableIsoTimestamp, toIsoTimestamp } from '../../application/timestamps.js';
import type {
  AdoptProjectWorkingMediaPersistenceInput,
  AppendProjectRevisionPersistenceInput,
  AcceptProjectSourcePersistenceInput,
  ProjectCreateReceipt,
  ProjectCreatePersistenceResult,
  ProjectCurrentRead,
  ProjectCurrentSourceRead,
  ProjectAssetMembershipAttachResult,
  ProjectAssetMembershipDetachResult,
  ProjectAssetMembershipPage,
  ProjectAssetMembershipPageInput,
  ProjectLinkHistoryKind,
  ProjectLinkHistoryPage,
  ProjectLinkMutationResult,
  ProjectOutputMetadataCommitResult,
  ProjectOutputMetadataUnitOfWork,
  ProjectOutputOperationReceipt,
  ProjectPersistenceMutationResult,
  ProjectRepository,
  ProjectRevisionHistoryPage,
  ProjectSummaryPage,
  ProjectSummaryPageInput,
  ProjectSummaryPreview,
  ProjectSourceAcceptanceResult,
  ProjectSourceRecord,
  ProjectSourceRemovalResult,
  RemoveProjectSourcePersistenceInput,
  ProjectWorkingMediaAdoptionResult,
  ProjectWorkingMediaRead,
  ProjectWorkingMediaRecord,
} from '../../features/projects/project-repository.js';
import type {
  StoredSavedVideoAggregate,
  StoredVideoVersion,
} from '../../features/saved-videos/saved-video-repository.js';
import {
  storedSavedVideoAggregateSchema,
  storedVideoVersionSchema,
} from '../../features/saved-videos/saved-video-repository.js';
import { savedVideoValues, savedVideoVersionValues } from './saved-video-repository.js';
import type { StoredAssetManifest } from '../../storage/asset-byte-store.js';
import {
  projectProcessingAttemptMatchesTrace,
  projectProcessingResultInputMatchesAttempt,
  retainedProjectProcessingResultMatches,
  resumableProjectProcessingAttempt,
  type PersistedProcessingJobStatus,
  type ProjectProcessingAdmissionResult,
  type ProjectProcessingAttemptRecord,
  type ProjectProcessingHistoryPage,
  type ProjectProcessingRepository,
  type ProjectProcessingResultRetentionResult,
} from '../../features/projects/project-processing-repository.js';
import type {
  ResumableVideoProcessingJob,
  VideoProcessingJobTrace,
} from '../../features/processing-jobs/file-processing-job-repository.js';
import {
  createSavedVideoProjectMembership,
  deriveProjectAssetMemberships,
  membershipsForRevisionInput,
} from '../../features/projects/project-asset-memberships.js';
import {
  projectAssetLinksForRevision,
  projectMediaReferencesEqual,
  projectVersionReferenceLinksForRevision,
} from '../../features/projects/project-snapshot-relations.js';
import type { LightframeDatabase } from './client.js';
import { ProjectPersistenceError } from './project-persistence-errors.js';
import {
  assetLinkValues,
  parseSnapshot,
  projectSourceValues,
  projectWorkingMediaValues,
  projectValues,
  revisionValues,
  toProject,
  toProjectSource,
  toProjectSummaryPoster,
  toProjectWorkingMedia,
  toRevision,
  versionReferenceValues,
} from './project-repository-mappers.js';
import {
  campaigns,
  mediaAssets,
  ownerMigrations,
  processingJobs,
  projectAssetMemberships,
  projectAssets,
  projectJobs,
  projectOperationReceipts,
  projectOutputOperationReceipts,
  projectOutputs,
  projectRevisions,
  projectSources,
  projectWorkingMediaAdoptions,
  projectVersionReferences,
  projects,
  savedVideos,
  videoVersions,
} from './schema.js';

type DatabaseExecutor = Parameters<Parameters<LightframeDatabase['transaction']>[0]>[0];
type ProjectJobRow = typeof projectJobs.$inferSelect;
type ProjectOutputRow = typeof projectOutputs.$inferSelect;
type ProjectOutputReceiptRow = typeof projectOutputOperationReceipts.$inferSelect;
type ProcessingJobRow = typeof processingJobs.$inferSelect;
type CurrentProjectRow = {
  readonly project: typeof projects.$inferSelect;
  readonly revision: typeof projectRevisions.$inferSelect | null;
};

const processingJobMatchesProjectLink = and(
  eq(processingJobs.id, projectJobs.jobId),
  eq(processingJobs.ownerUserId, projectJobs.ownerUserId),
);

const toProjectProcessingAttempt = (
  job: ProcessingJobRow,
  link: ProjectJobRow,
): ProjectProcessingAttemptRecord => {
  const capability = projectProcessingCapabilitySchema.parse(job.operation);
  const outputResolution = videoOutputResolutionSchema.parse(job.outputResolution);
  const status = job.status;
  const safeErrorCode =
    job.safeErrorCode === null
      ? null
      : job.safeErrorCode === 'processing_failed'
        ? 'processing_failed'
        : videoJobErrorCodeSchema.parse(job.safeErrorCode);
  if (
    job.requestFingerprint === null ||
    job.inputAssetId === null ||
    job.resultAssetId === null ||
    job.sourceDurationMs === null ||
    (job.sourceOrientation !== 'landscape' && job.sourceOrientation !== 'portrait') ||
    job.attempt < 1
  ) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The Project processing attempt is incomplete.',
    );
  }
  return {
    operationId: job.id,
    ownerUserId: job.ownerUserId,
    projectId: link.projectId,
    capability,
    provider: job.provider,
    providerJobId: job.providerJobId,
    requestFingerprint: job.requestFingerprint,
    inputAssetId: job.inputAssetId,
    resultAssetId: job.resultAssetId,
    outputAssetId: job.outputAssetId,
    result: job.resultMetadata === null ? null : inspectedVideoSchema.parse(job.resultMetadata),
    retryOfOperationId: job.retryOfJobId,
    attemptNumber: job.attempt,
    initiatingRevisionId: link.initiatingRevisionId,
    initiatingRevisionNumber: link.initiatingRevisionNumber,
    resultRevisionId: link.resultRevisionId,
    resultRevisionNumber: link.resultRevisionNumber,
    status,
    safeErrorCode,
    outputResolution,
    providerOutputLocation: job.providerOutputLocation,
    sourceDurationMs: job.sourceDurationMs,
    sourceOrientation: job.sourceOrientation,
    createdAt: toIsoTimestamp(job.createdAt),
    updatedAt: toIsoTimestamp(job.updatedAt),
    acceptedAt: nullableIsoTimestamp(job.acceptedAt),
    completedAt: nullableIsoTimestamp(job.completedAt),
    expiresAt: toIsoTimestamp(job.expiresAt),
  };
};

export { ProjectPersistenceError } from './project-persistence-errors.js';
export { mapProjectAggregate } from './project-repository-mappers.js';

const toProjectCurrentRead = (row: CurrentProjectRow): ProjectCurrentRead => {
  if (row.revision === null) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The stored Project current revision is unavailable.',
    );
  }
  return { project: toProject(row.project), revision: toRevision(row.revision) };
};

/**
 * A Project row joined to the revision it currently points at. Identity is asserted on all four
 * columns — owner, project, revision id and revision number — so a stale or cross-owner revision
 * can never satisfy the join.
 */
const currentRevisionMatch = and(
  eq(projectRevisions.projectId, projects.id),
  eq(projectRevisions.ownerUserId, projects.ownerUserId),
  eq(projectRevisions.id, projects.currentRevisionId),
  eq(projectRevisions.revisionNumber, projects.currentRevisionNumber),
);

// UUID columns are compared as text so malformed historical JSON is rejected by snapshot parsing,
// rather than failing early through a PostgreSQL UUID cast.
const currentWorkingMediaMatch = sql`(
  ${projectRevisions.snapshot} -> 'workingMedia' = ${projectRevisions.snapshot} -> 'presentedMedia'
  and (
    (
      ${projectRevisions.snapshot} -> 'workingMedia' ->> 'kind' = 'asset'
      and ${projectWorkingMediaAdoptions.kind} in ('local-render', 'media-asset')
      and ${projectWorkingMediaAdoptions.assetId}::text = ${projectRevisions.snapshot} -> 'workingMedia' ->> 'assetId'
    )
    or (
      ${projectRevisions.snapshot} -> 'workingMedia' ->> 'kind' = 'saved-video-version'
      and ${projectWorkingMediaAdoptions.kind} = 'saved-video-version'
      and ${projectWorkingMediaAdoptions.savedVideoId}::text = ${projectRevisions.snapshot} -> 'workingMedia' ->> 'savedVideoId'
      and ${projectWorkingMediaAdoptions.videoVersionId}::text = ${projectRevisions.snapshot} -> 'workingMedia' ->> 'videoVersionId'
    )
  )
)`;

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
  if (!projectAssetLinksForRevision(revision).every(validLink)) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'Every snapshot asset needs an explicit role link from the same revision.',
    );
  }
};

type ReadyAsset = Pick<
  typeof mediaAssets.$inferSelect,
  'id' | 'mimeType' | 'filename' | 'sizeBytes' | 'checksumSha256'
>;

type ReadyVersionReference = Pick<
  typeof videoVersions.$inferSelect,
  'assetId' | 'mimeType' | 'filename' | 'sizeBytes' | 'durationMs' | 'width' | 'height'
> & {
  readonly savedVideoId: string;
  readonly videoVersionId: string;
};

const versionReferenceKey = (savedVideoId: string, videoVersionId: string): string =>
  `${savedVideoId}:${videoVersionId}`;

const assertReadyAssets = async (
  executor: LightframeDatabase | DatabaseExecutor,
  ownerUserId: string,
  links: readonly ProjectAssetLink[],
): Promise<ReadonlyMap<string, ReadyAsset>> => {
  const assetIds = [...new Set(links.map(({ assetId }) => assetId))];
  if (assetIds.length === 0) return new Map();
  const rows = await executor
    .select({
      id: mediaAssets.id,
      status: mediaAssets.status,
      mimeType: mediaAssets.mimeType,
      filename: mediaAssets.filename,
      sizeBytes: mediaAssets.sizeBytes,
      checksumSha256: mediaAssets.checksumSha256,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.ownerUserId, ownerUserId), inArray(mediaAssets.id, assetIds)))
    .for('share');
  const readyAssets = new Map(
    rows.filter(({ status }) => status === 'ready').map((asset) => [asset.id, asset] as const),
  );
  if (assetIds.some((assetId) => !readyAssets.has(assetId))) {
    throw new ProjectPersistenceError(
      'asset-not-ready',
      'A missing, deleted, or unaccepted asset cannot be linked to a Project revision.',
    );
  }
  return readyAssets;
};

const assertReadyVersionReferences = async (
  executor: DatabaseExecutor,
  ownerUserId: string,
  links: readonly ProjectVersionReferenceLink[],
): Promise<ReadonlyMap<string, ReadyVersionReference>> => {
  if (links.length === 0) return new Map();
  const savedVideoIds = [...new Set(links.map(({ savedVideoId }) => savedVideoId))];
  const videoVersionIds = [...new Set(links.map(({ videoVersionId }) => videoVersionId))];
  const rows = await executor
    .select({
      savedVideoId: savedVideos.id,
      videoVersionId: videoVersions.id,
      assetId: videoVersions.assetId,
      mimeType: videoVersions.mimeType,
      filename: videoVersions.filename,
      sizeBytes: videoVersions.sizeBytes,
      durationMs: videoVersions.durationMs,
      width: videoVersions.width,
      height: videoVersions.height,
    })
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
  const readyReferences = new Map(
    rows.map((version) => [
      versionReferenceKey(version.savedVideoId, version.videoVersionId),
      version,
    ]),
  );
  if (
    links.some(
      ({ savedVideoId, videoVersionId }) =>
        !readyReferences.has(versionReferenceKey(savedVideoId, videoVersionId)),
    )
  ) {
    throw new ProjectPersistenceError(
      'version-not-ready',
      'A missing, deleted, cross-owner, or mismatched Saved Video Version cannot be linked.',
    );
  }
  return readyReferences;
};

const assertReadyProjectSource = (
  source: ProjectSourceRecord,
  revision: ProjectRevision,
  asset: ReadyAsset | undefined,
  version: ReadyVersionReference | undefined,
): void => {
  if (
    source.projectId !== revision.projectId ||
    source.ownerUserId !== revision.ownerUserId ||
    source.acceptedRevisionId !== revision.id ||
    source.acceptedRevisionNumber !== revision.revisionNumber ||
    source.assetId !== revision.snapshot.sourceAssetId
  ) {
    throw new ProjectPersistenceError(
      'invalid-aggregate',
      'The Project source record must name its accepting revision and source asset.',
    );
  }
  if (
    asset === undefined ||
    asset.mimeType !== source.mimeType ||
    asset.filename !== source.filename ||
    asset.sizeBytes !== source.sizeBytes ||
    asset.checksumSha256 !== source.checksumSha256
  ) {
    throw new ProjectPersistenceError(
      'asset-not-ready',
      'The Project source asset is missing, unready, or does not match inspected metadata.',
    );
  }
  if (source.kind !== 'saved-video-version') return;
  if (
    version === undefined ||
    version.assetId !== source.assetId ||
    version.mimeType !== source.mimeType ||
    version.filename !== source.filename ||
    version.sizeBytes !== source.sizeBytes ||
    version.durationMs !== source.durationMs ||
    version.width !== source.width ||
    version.height !== source.height
  ) {
    throw new ProjectPersistenceError(
      'version-not-ready',
      'The exact active Saved Video Version does not match the accepted Project source.',
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
        conflict: projectConflicts.relationMismatch(projectId, relation),
      };

const toProjectOutputReceipt = (row: ProjectOutputReceiptRow): ProjectOutputOperationReceipt => ({
  operationId: row.operationId,
  requestFingerprint: row.requestFingerprint,
  projectId: row.projectId,
  savedVideoId: row.savedVideoId,
  videoVersionId: row.videoVersionId,
  resultRevisionId: row.resultRevisionId,
  resultRevisionNumber: row.resultRevisionNumber,
  result: projectOutputSaveResultSchema.parse(row.result),
  createdAt: toIsoTimestamp(row.createdAt),
});

const projectAssetMembershipValues = (
  membership: ProjectAssetMembership,
): typeof projectAssetMemberships.$inferInsert => ({
  id: membership.id,
  projectId: membership.projectId,
  ownerUserId: membership.ownerUserId,
  kind: membership.kind,
  resourceId: membership.resourceId,
  createdAt: toIsoTimestamp(membership.createdAt),
});

const toProjectAssetMembership = (
  row: typeof projectAssetMemberships.$inferSelect,
): ProjectAssetMembership => ({
  id: row.id,
  projectId: row.projectId,
  ownerUserId: row.ownerUserId,
  kind: row.kind,
  resourceId: row.resourceId,
  createdAt: toIsoTimestamp(row.createdAt),
});

export class DrizzleProjectRepository
  implements ProjectRepository, ProjectProcessingRepository, ProjectOutputMetadataUnitOfWork
{
  /**
   * Owners whose asset-membership backfill this process has already observed as complete. The
   * `ownerMigrations` row remains the durable authority; this only stops a warm process from
   * opening a transaction to re-ask a question it has already answered, on every single
   * Project-assets request for the rest of the owner's session.
   */
  readonly #assetMembershipBackfilled = new Set<string>();

  constructor(private readonly db: LightframeDatabase) {}

  async #persistAssetMemberships(
    executor: DatabaseExecutor,
    memberships: readonly ProjectAssetMembership[],
  ): Promise<void> {
    const unique = [
      ...new Map(
        memberships.map((membership) => [
          `${membership.ownerUserId}:${membership.projectId}:${membership.kind}:${membership.resourceId}`,
          membership,
        ]),
      ).values(),
    ];
    if (unique.length === 0) return;
    await executor
      .insert(projectAssetMemberships)
      .values(unique.map(projectAssetMembershipValues))
      .onConflictDoNothing({
        target: [
          projectAssetMemberships.ownerUserId,
          projectAssetMemberships.projectId,
          projectAssetMemberships.kind,
          projectAssetMemberships.resourceId,
        ],
      });
  }

  async #processingAttempt(
    executor: LightframeDatabase | DatabaseExecutor,
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectProcessingAttemptRecord | null> {
    const [row] = await executor
      .select({ job: processingJobs, link: projectJobs })
      .from(projectJobs)
      .innerJoin(processingJobs, processingJobMatchesProjectLink)
      .where(
        and(
          eq(projectJobs.projectId, projectId),
          eq(projectJobs.ownerUserId, ownerUserId),
          eq(projectJobs.jobId, operationId),
        ),
      )
      .limit(1);
    return row === undefined ? null : toProjectProcessingAttempt(row.job, row.link);
  }

  async #currentProcessingAttempt(
    executor: LightframeDatabase | DatabaseExecutor,
    ownerUserId: string,
    projectId: string,
    currentRevision: { readonly id: string; readonly revisionNumber: number },
  ): Promise<ProjectProcessingAttemptRecord | null> {
    const [row] = await executor
      .select({ job: processingJobs, link: projectJobs })
      .from(projectJobs)
      .innerJoin(processingJobs, processingJobMatchesProjectLink)
      .where(
        and(
          eq(projectJobs.projectId, projectId),
          eq(projectJobs.ownerUserId, ownerUserId),
          or(
            and(
              eq(projectJobs.initiatingRevisionId, currentRevision.id),
              eq(projectJobs.initiatingRevisionNumber, currentRevision.revisionNumber),
            ),
            and(
              eq(projectJobs.resultRevisionId, currentRevision.id),
              eq(projectJobs.resultRevisionNumber, currentRevision.revisionNumber),
            ),
          ),
        ),
      )
      .orderBy(
        desc(processingJobs.attempt),
        desc(processingJobs.createdAt),
        desc(processingJobs.id),
      )
      .limit(1);
    return row === undefined ? null : toProjectProcessingAttempt(row.job, row.link);
  }

  async #campaignMembershipIsValid(tx: DatabaseExecutor, project: Project): Promise<boolean> {
    if (project.campaignId === null) return true;
    const [campaign] = await tx
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, project.campaignId),
          eq(campaigns.ownerUserId, project.ownerUserId),
          eq(campaigns.status, 'active'),
          isNull(campaigns.deletedAt),
        ),
      )
      .for('update')
      .limit(1);
    return campaign !== undefined;
  }

  async #persistNewAggregate(tx: DatabaseExecutor, aggregate: ProjectAggregate): Promise<void> {
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
    const versionReferenceLinks = projectVersionReferenceLinksForRevision(initialRevision);
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
    await this.#persistAssetMemberships(tx, deriveProjectAssetMemberships(aggregate));
    await tx
      .update(projects)
      .set({
        currentRevisionId: project.currentRevisionId,
        currentRevisionNumber: project.currentRevisionNumber,
      })
      .where(and(eq(projects.id, project.id), eq(projects.ownerUserId, project.ownerUserId)));
  }

  async create(aggregate: ProjectAggregate): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (!(await this.#campaignMembershipIsValid(tx, aggregate.project))) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'The target Campaign is unavailable.',
        );
      }
      await this.#persistNewAggregate(tx, aggregate);
    });
  }

  async createIdempotent(input: {
    readonly aggregate: ProjectAggregate;
    readonly receipt: ProjectCreateReceipt;
  }): Promise<ProjectCreatePersistenceResult> {
    return this.db.transaction(async (tx) => {
      if (input.receipt.projectId !== input.aggregate.project.id) {
        throw new ProjectPersistenceError('invalid-aggregate', 'Project create receipt mismatch.');
      }
      const inserted = await tx
        .insert(projectOperationReceipts)
        .values({
          ownerUserId: input.aggregate.project.ownerUserId,
          operationKey: input.receipt.operationKey,
          operation: 'create',
          requestFingerprint: input.receipt.requestFingerprint,
          projectId: input.receipt.projectId,
          createdAt: toIsoTimestamp(input.receipt.createdAt),
        })
        .onConflictDoNothing({
          target: [projectOperationReceipts.ownerUserId, projectOperationReceipts.operationKey],
        })
        .returning({ operationKey: projectOperationReceipts.operationKey });
      if (inserted.length > 0) {
        if (!(await this.#campaignMembershipIsValid(tx, input.aggregate.project))) {
          await tx
            .delete(projectOperationReceipts)
            .where(
              and(
                eq(projectOperationReceipts.ownerUserId, input.aggregate.project.ownerUserId),
                eq(projectOperationReceipts.operationKey, input.receipt.operationKey),
              ),
            );
          return {
            kind: 'conflict',
            conflict: {
              kind: 'campaign-membership',
              projectId: input.aggregate.project.id,
            },
          };
        }
        await this.#persistNewAggregate(tx, input.aggregate);
        return {
          kind: 'created',
          current: {
            project: input.aggregate.project,
            revision: input.aggregate.revisions[0]!,
          },
        };
      }

      const [row] = await tx
        .select({
          receipt: projectOperationReceipts,
          project: projects,
          revision: projectRevisions,
        })
        .from(projectOperationReceipts)
        .leftJoin(
          projects,
          and(
            eq(projects.id, projectOperationReceipts.projectId),
            eq(projects.ownerUserId, projectOperationReceipts.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .leftJoin(projectRevisions, currentRevisionMatch)
        .where(
          and(
            eq(projectOperationReceipts.ownerUserId, input.aggregate.project.ownerUserId),
            eq(projectOperationReceipts.operationKey, input.receipt.operationKey),
          ),
        )
        .for('update', { of: projectOperationReceipts })
        .limit(1);
      if (
        row === undefined ||
        row.receipt.requestFingerprint !== input.receipt.requestFingerprint ||
        row.receipt.operation !== 'create'
      ) {
        return {
          kind: 'conflict',
          conflict: projectConflicts.operationKey('create'),
        };
      }
      if (row.project === null || row.revision === null) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'Project create receipt has no retained result.',
        );
      }
      return {
        kind: 'replayed',
        current: { project: toProject(row.project), revision: toRevision(row.revision) },
      };
    });
  }

  async getCurrent(ownerUserId: string, projectId: string): Promise<ProjectCurrentRead | null> {
    const [row] = await this.db
      .select({ project: projects, revision: projectRevisions })
      .from(projects)
      .leftJoin(projectRevisions, currentRevisionMatch)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .for('share', { of: projects })
      .limit(1);
    return row === undefined ? null : toProjectCurrentRead(row);
  }

  async getRevision(
    ownerUserId: string,
    projectId: string,
    revisionNumber: number,
  ): Promise<ProjectRevision | null> {
    const [row] = await this.db
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
          eq(projectRevisions.ownerUserId, ownerUserId),
          eq(projectRevisions.projectId, projectId),
          eq(projectRevisions.revisionNumber, revisionNumber),
        ),
      )
      .limit(1);
    return row === undefined ? null : toRevision(row.revision);
  }

  async getRevisions(
    ownerUserId: string,
    projectId: string,
    revisionNumbers: readonly number[],
  ): Promise<readonly ProjectRevision[]> {
    const numbers = [...new Set(revisionNumbers)];
    if (numbers.length === 0) return [];
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
          eq(projectRevisions.ownerUserId, ownerUserId),
          eq(projectRevisions.projectId, projectId),
          inArray(projectRevisions.revisionNumber, numbers),
        ),
      );
    return rows.map(({ revision }) => toRevision(revision));
  }

  async getCurrentWithSource(
    ownerUserId: string,
    projectId: string,
  ): Promise<ProjectCurrentSourceRead | null> {
    const [row] = await this.db
      .select({ project: projects, revision: projectRevisions, source: projectSources })
      .from(projects)
      .leftJoin(projectRevisions, currentRevisionMatch)
      .leftJoin(
        projectSources,
        and(
          eq(projectSources.projectId, projects.id),
          eq(projectSources.ownerUserId, projects.ownerUserId),
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
    return {
      current: toProjectCurrentRead(row),
      source: row.source === null ? null : toProjectSource(row.source),
    };
  }

  async getSource(ownerUserId: string, projectId: string): Promise<ProjectSourceRecord | null> {
    const [row] = await this.db
      .select({ source: projectSources })
      .from(projectSources)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectSources.projectId),
          eq(projects.ownerUserId, projectSources.ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .where(
        and(eq(projectSources.projectId, projectId), eq(projectSources.ownerUserId, ownerUserId)),
      )
      .limit(1);
    return row === undefined ? null : toProjectSource(row.source);
  }

  async getWorkingMedia(
    ownerUserId: string,
    projectId: string,
    revisionId?: string,
  ): Promise<ProjectWorkingMediaRead | null> {
    const mediaMatch =
      revisionId === undefined
        ? currentWorkingMediaMatch
        : eq(projectWorkingMediaAdoptions.adoptedRevisionId, revisionId);
    const [row] = await this.db
      .select({
        project: projects,
        revision: projectRevisions,
        media: projectWorkingMediaAdoptions,
      })
      .from(projects)
      .leftJoin(projectRevisions, currentRevisionMatch)
      .leftJoin(
        projectWorkingMediaAdoptions,
        and(
          eq(projectWorkingMediaAdoptions.projectId, projects.id),
          eq(projectWorkingMediaAdoptions.ownerUserId, projects.ownerUserId),
          mediaMatch,
        ),
      )
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .orderBy(desc(projectWorkingMediaAdoptions.adoptedRevisionNumber))
      .for('share', { of: projects })
      .limit(1);
    if (row === undefined) return null;
    const current = toProjectCurrentRead(row);
    return row.media === null ? null : { ...current, media: toProjectWorkingMedia(row.media) };
  }

  async getWorkingMediaByOperationKey(
    ownerUserId: string,
    operationKey: string,
  ): Promise<ProjectWorkingMediaRead | null> {
    const [row] = await this.db
      .select({
        project: projects,
        revision: projectRevisions,
        media: projectWorkingMediaAdoptions,
      })
      .from(projectWorkingMediaAdoptions)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectWorkingMediaAdoptions.projectId),
          eq(projects.ownerUserId, projectWorkingMediaAdoptions.ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .leftJoin(projectRevisions, currentRevisionMatch)
      .where(
        and(
          eq(projectWorkingMediaAdoptions.ownerUserId, ownerUserId),
          eq(projectWorkingMediaAdoptions.operationKey, operationKey),
        ),
      )
      .for('share', { of: projects })
      .limit(1);
    return row === undefined
      ? null
      : { ...toProjectCurrentRead(row), media: toProjectWorkingMedia(row.media) };
  }

  async list(ownerUserId: string, input: ProjectSummaryPageInput): Promise<ProjectSummaryPage> {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 40) {
      throw new ProjectPersistenceError('invalid-aggregate', 'Use a bounded Project summary page.');
    }
    const cursorTimestamp =
      input.cursor === undefined ? undefined : toIsoTimestamp(input.cursor.updatedAt);
    const rows = await this.db
      .select({
        project: projects,
        // Two keys, not the whole snapshot: the poster is decoration and must not make a page read
        // carry forty full revisions. Joined rather than asked for afterwards, so listing Projects
        // stays one query no matter how many rows it returns.
        presentedMedia: sql`${projectRevisions.snapshot} -> 'presentedMedia'`,
        lastSuccessfulOutput: sql`${projectRevisions.snapshot} -> 'lastSuccessfulOutput'`,
      })
      .from(projects)
      .leftJoin(
        projectRevisions,
        and(
          eq(projectRevisions.id, projects.currentRevisionId),
          eq(projectRevisions.ownerUserId, projects.ownerUserId),
        ),
      )
      .where(
        and(
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
          input.lifecycle === 'archived'
            ? eq(projects.status, 'archived')
            : sql`${projects.status} <> 'archived'`,
          input.campaignId === undefined
            ? undefined
            : input.campaignId === 'none'
              ? isNull(projects.campaignId)
              : eq(projects.campaignId, input.campaignId),
          input.cursor === undefined
            ? undefined
            : or(
                lt(projects.updatedAt, cursorTimestamp!),
                and(
                  eq(projects.updatedAt, cursorTimestamp!),
                  lt(projects.id, input.cursor.projectId),
                ),
              ),
        ),
      )
      .orderBy(desc(projects.updatedAt), desc(projects.id))
      .limit(input.pageSize + 1);
    const pageRows = rows.slice(0, input.pageSize);
    const page = pageRows.map((row) => toProject(row.project));
    const last = page.at(-1);
    const previews: ProjectSummaryPreview[] = [];
    for (const row of pageRows) {
      const poster = toProjectSummaryPoster(row);
      if (poster !== null) previews.push({ projectId: row.project.id, ...poster });
    }
    return {
      projects: page,
      previews,
      nextCursor:
        rows.length > input.pageSize && last !== undefined
          ? { updatedAt: last.updatedAt, projectId: last.id }
          : null,
    };
  }

  async ensureAssetMembershipBackfill(ownerUserId: string): Promise<void> {
    if (this.#assetMembershipBackfilled.has(ownerUserId)) return;
    const migrationId = 'project-asset-memberships-v1';
    await this.db.transaction(async (tx) => {
      const [completed] = await tx
        .select({ migrationId: ownerMigrations.migrationId })
        .from(ownerMigrations)
        .where(
          and(
            eq(ownerMigrations.ownerUserId, ownerUserId),
            eq(ownerMigrations.migrationId, migrationId),
          ),
        )
        .limit(1);
      if (completed !== undefined) return;

      const projectRows = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.ownerUserId, ownerUserId), isNull(projects.deletedAt)));
      const projectIds = projectRows.map(({ id }) => id);
      if (projectIds.length > 0) {
        const revisionRows = await tx
          .select()
          .from(projectRevisions)
          .where(
            and(
              eq(projectRevisions.ownerUserId, ownerUserId),
              inArray(projectRevisions.projectId, projectIds),
            ),
          );
        const sourceRows = await tx
          .select()
          .from(projectSources)
          .where(
            and(
              eq(projectSources.ownerUserId, ownerUserId),
              inArray(projectSources.projectId, projectIds),
            ),
          );
        const mediaRows = await tx
          .select()
          .from(projectWorkingMediaAdoptions)
          .where(
            and(
              eq(projectWorkingMediaAdoptions.ownerUserId, ownerUserId),
              inArray(projectWorkingMediaAdoptions.projectId, projectIds),
            ),
          );
        const outputRows = await tx
          .select()
          .from(projectOutputs)
          .where(
            and(
              eq(projectOutputs.ownerUserId, ownerUserId),
              inArray(projectOutputs.projectId, projectIds),
            ),
          );

        const memberships = projectRows.flatMap((projectRow) =>
          deriveProjectAssetMemberships({
            project: toProject(projectRow),
            revisions: revisionRows
              .filter(({ projectId }) => projectId === projectRow.id)
              .map(toRevision),
            source:
              sourceRows
                .filter(({ projectId }) => projectId === projectRow.id)
                .map(toProjectSource)[0] ?? null,
            workingMediaAdoptions: mediaRows
              .filter(({ projectId }) => projectId === projectRow.id)
              .map(toProjectWorkingMedia),
            outputLinks: outputRows
              .filter(({ projectId }) => projectId === projectRow.id)
              .map((row) => ({
                projectId: row.projectId,
                ownerUserId: row.ownerUserId,
                savedVideoId: row.savedVideoId,
                videoVersionId: row.videoVersionId,
                producingRevisionId: row.producingRevisionId,
                producingRevisionNumber: row.producingRevisionNumber,
                createdAt: toIsoTimestamp(row.createdAt),
              })),
          }),
        );
        await this.#persistAssetMemberships(tx, memberships);
      }
      await tx
        .insert(ownerMigrations)
        .values({ ownerUserId, migrationId })
        .onConflictDoNothing({
          target: [ownerMigrations.ownerUserId, ownerMigrations.migrationId],
        });
    });
    this.#assetMembershipBackfilled.add(ownerUserId);
  }

  async listAssetMemberships(
    ownerUserId: string,
    projectId: string,
    input: ProjectAssetMembershipPageInput,
  ): Promise<ProjectAssetMembershipPage | null> {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 50) {
      throw new ProjectPersistenceError(
        'invalid-aggregate',
        'Use a bounded Project asset membership page.',
      );
    }
    await this.ensureAssetMembershipBackfill(ownerUserId);
    const cursorTimestamp =
      input.cursor === undefined ? undefined : toIsoTimestamp(input.cursor.createdAt);
    const rows = await this.db
      .select({ membership: projectAssetMemberships })
      .from(projectAssetMemberships)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectAssetMemberships.projectId),
          eq(projects.ownerUserId, projectAssetMemberships.ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .where(
        and(
          eq(projectAssetMemberships.ownerUserId, ownerUserId),
          eq(projectAssetMemberships.projectId, projectId),
          input.kind === undefined ? undefined : eq(projectAssetMemberships.kind, input.kind),
          input.cursor === undefined
            ? undefined
            : or(
                lt(projectAssetMemberships.createdAt, cursorTimestamp!),
                and(
                  eq(projectAssetMemberships.createdAt, cursorTimestamp!),
                  lt(projectAssetMemberships.id, input.cursor.membershipId),
                ),
              ),
        ),
      )
      .orderBy(desc(projectAssetMemberships.createdAt), desc(projectAssetMemberships.id))
      .limit(input.pageSize + 1);
    const page = rows
      .slice(0, input.pageSize)
      .map(({ membership }) => toProjectAssetMembership(membership));
    const last = page.at(-1);
    return this.#pageForExistingProject(
      ownerUserId,
      projectId,
      {
        memberships: page,
        nextCursor:
          rows.length > input.pageSize && last !== undefined
            ? { createdAt: last.createdAt, membershipId: last.id }
            : null,
      },
      rows.length > 0,
    );
  }

  async attachAssetMembership(
    membership: ProjectAssetMembership,
  ): Promise<ProjectAssetMembershipAttachResult> {
    await this.ensureAssetMembershipBackfill(membership.ownerUserId);
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ status: projects.status })
        .from(projects)
        .where(
          and(
            eq(projects.id, membership.projectId),
            eq(projects.ownerUserId, membership.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (project === undefined) return { kind: 'not-found' };
      if (project.status === 'archived') return { kind: 'archived' };
      const inserted = await tx
        .insert(projectAssetMemberships)
        .values(projectAssetMembershipValues(membership))
        .onConflictDoNothing({
          target: [
            projectAssetMemberships.ownerUserId,
            projectAssetMemberships.projectId,
            projectAssetMemberships.kind,
            projectAssetMemberships.resourceId,
          ],
        })
        .returning();
      if (inserted[0] !== undefined) {
        return { kind: 'attached', membership: toProjectAssetMembership(inserted[0]) };
      }
      const [existing] = await tx
        .select()
        .from(projectAssetMemberships)
        .where(
          and(
            eq(projectAssetMemberships.ownerUserId, membership.ownerUserId),
            eq(projectAssetMemberships.projectId, membership.projectId),
            eq(projectAssetMemberships.kind, membership.kind),
            eq(projectAssetMemberships.resourceId, membership.resourceId),
          ),
        )
        .limit(1);
      if (existing === undefined) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'The Project asset attachment did not produce a retained membership.',
        );
      }
      return { kind: 'existing', membership: toProjectAssetMembership(existing) };
    });
  }

  async getAssetMembership(
    ownerUserId: string,
    projectId: string,
    kind: ProjectAssetMembership['kind'],
    resourceId: string,
  ): Promise<ProjectAssetMembership | null> {
    await this.ensureAssetMembershipBackfill(ownerUserId);
    const [row] = await this.db
      .select({ membership: projectAssetMemberships })
      .from(projectAssetMemberships)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectAssetMemberships.projectId),
          eq(projects.ownerUserId, projectAssetMemberships.ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .where(
        and(
          eq(projectAssetMemberships.ownerUserId, ownerUserId),
          eq(projectAssetMemberships.projectId, projectId),
          eq(projectAssetMemberships.kind, kind),
          eq(projectAssetMemberships.resourceId, resourceId),
        ),
      )
      .limit(1);
    return row === undefined ? null : toProjectAssetMembership(row.membership);
  }

  async detachAssetMembership(
    ownerUserId: string,
    projectId: string,
    membershipId: string,
  ): Promise<ProjectAssetMembershipDetachResult> {
    await this.ensureAssetMembershipBackfill(ownerUserId);
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ status: projects.status })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.ownerUserId, ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (project === undefined) return { kind: 'not-found' };
      if (project.status === 'archived') return { kind: 'archived' };
      const removed = await tx
        .delete(projectAssetMemberships)
        .where(
          and(
            eq(projectAssetMemberships.id, membershipId),
            eq(projectAssetMemberships.ownerUserId, ownerUserId),
            eq(projectAssetMemberships.projectId, projectId),
          ),
        )
        .returning({ id: projectAssetMemberships.id });
      return { kind: 'detached', removed: removed.length > 0 };
    });
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
          conflict: projectVersionConflictDetail(
            input.projectId,
            input.expectedVersion,
            current.version,
          ),
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
      const versionReferenceLinks = projectVersionReferenceLinksForRevision(revision);
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
      await this.#persistAssetMemberships(tx, membershipsForRevisionInput(input));
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

  async acceptSource(
    input: AcceptProjectSourcePersistenceInput,
  ): Promise<ProjectSourceAcceptanceResult> {
    return this.db.transaction(async (tx) => {
      const [priorSourceRow] = await tx
        .select()
        .from(projectSources)
        .where(
          and(
            eq(projectSources.ownerUserId, input.ownerUserId),
            eq(projectSources.operationKey, input.source.operationKey),
          ),
        )
        .for('update')
        .limit(1);
      if (priorSourceRow !== undefined) {
        const priorSource = toProjectSource(priorSourceRow);
        if (
          priorSource.projectId !== input.projectId ||
          priorSource.requestFingerprint !== input.source.requestFingerprint
        ) {
          return {
            kind: 'conflict',
            conflict: projectConflicts.operationKey('source-accept'),
          } as const;
        }
        const [replayed] = await tx
          .select({ project: projects, revision: projectRevisions })
          .from(projects)
          .innerJoin(projectRevisions, currentRevisionMatch)
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.ownerUserId, input.ownerUserId),
              isNull(projects.deletedAt),
            ),
          )
          .limit(1);
        if (replayed === undefined) {
          throw new ProjectPersistenceError(
            'invalid-aggregate',
            'Project source receipt has no retained result.',
          );
        }
        return {
          kind: 'replayed',
          current: {
            project: toProject(replayed.project),
            revision: toRevision(replayed.revision),
          },
          source: priorSource,
        } as const;
      }

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
      const [acceptedSource] = await tx
        .select({ projectId: projectSources.projectId })
        .from(projectSources)
        .where(
          and(
            eq(projectSources.projectId, input.projectId),
            eq(projectSources.ownerUserId, input.ownerUserId),
          ),
        )
        .for('update')
        .limit(1);
      if (acceptedSource !== undefined) {
        return {
          kind: 'conflict',
          conflict: projectConflicts.immutableSource(input.projectId),
        } as const;
      }
      if (current.version !== input.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: projectVersionConflictDetail(
            input.projectId,
            input.expectedVersion,
            current.version,
          ),
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
      const revision: ProjectRevision = {
        ...input.revision,
        snapshot: projectSnapshotSchema.parse(input.revision.snapshot),
      };
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
          'The accepted Project source revision does not continue the locked aggregate.',
        );
      }
      assertRevisionAssetLinks(revision, input.assetLinks);
      const versionReferenceLinks = projectVersionReferenceLinksForRevision(revision);
      const readyAssets = await assertReadyAssets(tx, input.ownerUserId, input.assetLinks);
      const readyVersionReferences = await assertReadyVersionReferences(
        tx,
        input.ownerUserId,
        versionReferenceLinks,
      );
      assertReadyProjectSource(
        input.source,
        revision,
        readyAssets.get(input.source.assetId),
        input.source.savedVideoId === null || input.source.videoVersionId === null
          ? undefined
          : readyVersionReferences.get(
              versionReferenceKey(input.source.savedVideoId, input.source.videoVersionId),
            ),
      );
      await tx.insert(projectRevisions).values(revisionValues(revision));
      await tx.insert(projectAssets).values(input.assetLinks.map(assetLinkValues));
      if (versionReferenceLinks.length > 0) {
        await tx
          .insert(projectVersionReferences)
          .values(versionReferenceLinks.map(versionReferenceValues));
      }
      await tx.insert(projectSources).values(projectSourceValues(input.source));
      await this.#persistAssetMemberships(tx, [
        ...membershipsForRevisionInput(input),
        ...(input.source.savedVideoId === null
          ? []
          : [
              createSavedVideoProjectMembership({
                ownerUserId: input.ownerUserId,
                projectId: input.projectId,
                savedVideoId: input.source.savedVideoId,
                createdAt: input.source.acceptedAt,
              }),
            ]),
      ]);
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
      return {
        kind: 'accepted',
        current: { project: input.nextProject, revision },
        source: input.source,
      } as const;
    });
  }

  /**
   * Whether unresolved provider work is still bound to this Project.
   *
   * Shared by archive and source removal: both refuse to move a Project out from under an attempt
   * whose acceptance Lightframe cannot yet account for.
   */
  async #hasBlockingProcessingAttempt(
    tx: DatabaseExecutor,
    projectId: string,
    ownerUserId: string,
  ): Promise<boolean> {
    const processing = await tx
      .select({
        id: processingJobs.id,
        status: processingJobs.status,
        retryOfJobId: processingJobs.retryOfJobId,
        createdAt: processingJobs.createdAt,
      })
      .from(projectJobs)
      .innerJoin(
        processingJobs,
        and(
          eq(processingJobs.id, projectJobs.jobId),
          eq(processingJobs.ownerUserId, projectJobs.ownerUserId),
        ),
      )
      .where(and(eq(projectJobs.projectId, projectId), eq(projectJobs.ownerUserId, ownerUserId)))
      .for('share');
    const attempts = processing.map(({ id, status, retryOfJobId, createdAt }) => ({
      operationId: id,
      status,
      retryOfOperationId: retryOfJobId,
      createdAt: toIsoTimestamp(createdAt),
    }));
    return attempts.some((attempt) => projectProcessingAttemptBlocksArchive(attempt, attempts));
  }

  async removeSource(
    input: RemoveProjectSourcePersistenceInput,
  ): Promise<ProjectSourceRemovalResult> {
    return this.db.transaction(async (tx) => {
      // `acceptSource` takes its first lock on `project_sources`; leading with `projects` here
      // would open an ABBA deadlock window against a concurrent accept.
      const [priorSource] = await tx
        .select({
          projectId: projectSources.projectId,
          assetId: projectSources.assetId,
        })
        .from(projectSources)
        .where(
          and(
            eq(projectSources.projectId, input.projectId),
            eq(projectSources.ownerUserId, input.ownerUserId),
          ),
        )
        .for('update')
        .limit(1);
      if (priorSource === undefined) return { kind: 'not-found' } as const;
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
          conflict: projectVersionConflictDetail(
            input.projectId,
            input.expectedVersion,
            current.version,
          ),
        } as const;
      }
      if (current.currentRevisionNumber !== input.expectedRevisionNumber) {
        return {
          kind: 'conflict',
          conflict: projectConflicts.revision(
            input.projectId,
            input.expectedRevisionNumber,
            current.currentRevisionNumber,
          ),
        } as const;
      }
      if (await this.#hasBlockingProcessingAttempt(tx, current.id, current.ownerUserId)) {
        return { kind: 'conflict', conflict: projectConflicts.activeJobs(current.id) } as const;
      }
      const revision: ProjectRevision = {
        ...input.revision,
        snapshot: projectSnapshotSchema.parse(input.revision.snapshot),
      };
      const validNextState =
        priorSource.assetId === input.removedAssetId &&
        input.nextProject.id === current.id &&
        input.nextProject.ownerUserId === current.ownerUserId &&
        input.nextProject.version === current.version + 1 &&
        current.archivedAt === null &&
        revision.snapshot.sourceAssetId === null &&
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
          'The Project source removal revision does not continue the locked aggregate.',
        );
      }
      assertRevisionAssetLinks(revision, input.assetLinks);
      await assertReadyAssets(tx, input.ownerUserId, input.assetLinks);
      await tx.insert(projectRevisions).values(revisionValues(revision));
      // A sourceless revision references no media, so it contributes no asset or version links
      // beyond any creative references the snapshot still carries.
      if (input.assetLinks.length > 0) {
        await tx.insert(projectAssets).values(input.assetLinks.map(assetLinkValues));
      }
      await this.#persistAssetMemberships(tx, membershipsForRevisionInput(input));
      // Only the current-source pointer goes. The historical `project_assets` row with
      // role='source' stays, so `DrizzleProjectRetentionPolicy` keeps retaining the bytes for any
      // output Version already produced from them.
      await tx
        .delete(projectSources)
        .where(
          and(
            eq(projectSources.projectId, input.projectId),
            eq(projectSources.ownerUserId, input.ownerUserId),
          ),
        );
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
      return { kind: 'removed', current: { project: input.nextProject, revision } } as const;
    });
  }

  async adoptWorkingMedia(
    input: AdoptProjectWorkingMediaPersistenceInput,
  ): Promise<ProjectWorkingMediaAdoptionResult> {
    return this.db.transaction(async (tx) => {
      const [priorRow] = await tx
        .select()
        .from(projectWorkingMediaAdoptions)
        .where(
          and(
            eq(projectWorkingMediaAdoptions.ownerUserId, input.ownerUserId),
            eq(projectWorkingMediaAdoptions.operationKey, input.media.operationKey),
          ),
        )
        .for('update')
        .limit(1);
      if (priorRow !== undefined) {
        const prior = toProjectWorkingMedia(priorRow);
        if (
          prior.projectId !== input.projectId ||
          prior.requestFingerprint !== input.media.requestFingerprint
        ) {
          return {
            kind: 'conflict',
            conflict: projectConflicts.operationKey('working-media-adopt'),
          } as const;
        }
        const [replayed] = await tx
          .select({ project: projects, revision: projectRevisions })
          .from(projects)
          .innerJoin(projectRevisions, currentRevisionMatch)
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.ownerUserId, input.ownerUserId),
              isNull(projects.deletedAt),
            ),
          )
          .limit(1);
        if (replayed === undefined) {
          throw new ProjectPersistenceError(
            'invalid-aggregate',
            'Project working-media receipt has no retained revision.',
          );
        }
        return {
          kind: 'replayed',
          value: {
            project: toProject(replayed.project),
            revision: toRevision(replayed.revision),
            media: prior,
          },
        } as const;
      }

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
          conflict: projectVersionConflictDetail(
            input.projectId,
            input.expectedVersion,
            current.version,
          ),
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
      const revision: ProjectRevision = {
        ...input.revision,
        snapshot: projectSnapshotSchema.parse(input.revision.snapshot),
      };
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
        input.nextProject.currentRevisionNumber === revision.revisionNumber &&
        input.media.projectId === current.id &&
        input.media.ownerUserId === current.ownerUserId &&
        input.media.adoptedRevisionId === revision.id &&
        input.media.adoptedRevisionNumber === revision.revisionNumber &&
        projectMediaReferencesEqual(input.media.mediaReference, revision.snapshot.workingMedia) &&
        projectMediaReferencesEqual(input.media.mediaReference, revision.snapshot.presentedMedia);
      if (!validNextState) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'The adopted working-media revision does not continue the locked aggregate.',
        );
      }
      assertRevisionAssetLinks(revision, input.assetLinks);
      const versionReferences = projectVersionReferenceLinksForRevision(revision);
      const readyAssets = await assertReadyAssets(tx, input.ownerUserId, input.assetLinks);
      const readyVersions = await assertReadyVersionReferences(
        tx,
        input.ownerUserId,
        versionReferences,
      );
      const readyAsset = readyAssets.get(input.media.assetId);
      if (
        readyAsset === undefined ||
        readyAsset.mimeType !== input.media.mimeType ||
        readyAsset.filename !== input.media.filename ||
        readyAsset.sizeBytes !== input.media.sizeBytes ||
        readyAsset.checksumSha256 !== input.media.checksumSha256
      ) {
        throw new ProjectPersistenceError(
          'asset-not-ready',
          'Adopted working media no longer matches its ready byte manifest.',
        );
      }
      if (input.media.kind === 'saved-video-version') {
        const version = readyVersions.get(
          versionReferenceKey(input.media.savedVideoId!, input.media.videoVersionId!),
        );
        if (
          version === undefined ||
          version.assetId !== input.media.assetId ||
          version.mimeType !== input.media.mimeType ||
          version.filename !== input.media.filename ||
          version.sizeBytes !== input.media.sizeBytes ||
          version.durationMs !== input.media.durationMs ||
          version.width !== input.media.width ||
          version.height !== input.media.height
        ) {
          throw new ProjectPersistenceError(
            'asset-not-ready',
            'Adopted Saved Video Version no longer matches its retained media.',
          );
        }
      }
      await assertLastSuccessfulOutput(tx, revision);
      await tx.insert(projectRevisions).values(revisionValues(revision));
      if (input.assetLinks.length > 0) {
        await tx.insert(projectAssets).values(input.assetLinks.map(assetLinkValues));
      }
      if (versionReferences.length > 0) {
        await tx
          .insert(projectVersionReferences)
          .values(versionReferences.map(versionReferenceValues));
      }
      await tx.insert(projectWorkingMediaAdoptions).values(projectWorkingMediaValues(input.media));
      await this.#persistAssetMemberships(tx, [
        ...membershipsForRevisionInput(input),
        ...(input.media.savedVideoId === null
          ? []
          : [
              createSavedVideoProjectMembership({
                ownerUserId: input.ownerUserId,
                projectId: input.projectId,
                savedVideoId: input.media.savedVideoId,
                createdAt: input.media.adoptedAt,
              }),
            ]),
      ]);
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
      return {
        kind: 'adopted',
        value: { project: input.nextProject, revision, media: input.media },
      } as const;
    });
  }

  async admitProjectAttempt(input: {
    readonly attempt: ProjectProcessingAttemptRecord;
    readonly link: ProjectJobLink;
    readonly expectedVersion: number;
    readonly expectedRevisionNumber: number;
  }): Promise<ProjectProcessingAdmissionResult> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ job: processingJobs, link: projectJobs })
        .from(processingJobs)
        .leftJoin(projectJobs, eq(projectJobs.jobId, processingJobs.id))
        .where(eq(processingJobs.id, input.attempt.operationId))
        .for('update', { of: processingJobs })
        .limit(1);
      if (existing !== undefined) {
        if (
          existing.link !== null &&
          existing.job.ownerUserId === input.attempt.ownerUserId &&
          existing.link.projectId === input.attempt.projectId &&
          existing.job.requestFingerprint === input.attempt.requestFingerprint
        ) {
          return {
            kind: 'replayed',
            attempt: toProjectProcessingAttempt(existing.job, existing.link),
          } as const;
        }
        return { kind: 'conflict', conflict: { kind: 'operation-key' } } as const;
      }

      const [current] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.attempt.projectId),
            eq(projects.ownerUserId, input.attempt.ownerUserId),
            isNull(projects.archivedAt),
            isNull(projects.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (current === undefined) return { kind: 'not-found' } as const;
      if (current.version !== input.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: projectVersionConflictDetail(
            current.id,
            input.expectedVersion,
            current.version,
          ),
        } as const;
      }
      if (current.currentRevisionNumber !== input.expectedRevisionNumber) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'revision',
            projectId: current.id,
            expectedRevisionNumber: input.expectedRevisionNumber,
            actualRevisionNumber: current.currentRevisionNumber,
          },
        } as const;
      }
      if (
        input.link.projectId !== current.id ||
        input.link.ownerUserId !== current.ownerUserId ||
        input.link.jobId !== input.attempt.operationId ||
        input.link.initiatingRevisionId !== current.currentRevisionId ||
        input.link.initiatingRevisionNumber !== current.currentRevisionNumber ||
        input.attempt.initiatingRevisionId !== input.link.initiatingRevisionId ||
        input.attempt.initiatingRevisionNumber !== input.link.initiatingRevisionNumber ||
        input.attempt.status !== 'submitting' ||
        input.attempt.providerJobId !== null ||
        input.attempt.outputAssetId !== null ||
        input.attempt.result !== null
      ) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'Project processing admission must pre-link one submitting operation.',
        );
      }
      const [revisionRow] = await tx
        .select()
        .from(projectRevisions)
        .where(
          and(
            eq(projectRevisions.id, current.currentRevisionId),
            eq(projectRevisions.projectId, current.id),
            eq(projectRevisions.ownerUserId, current.ownerUserId),
          ),
        )
        .limit(1);
      if (revisionRow === undefined) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'The current Project revision is unavailable for processing admission.',
        );
      }
      const snapshot = parseSnapshot(revisionRow.snapshotSchemaVersion, revisionRow.snapshot);
      const adoptionRows = await tx
        .select()
        .from(projectWorkingMediaAdoptions)
        .where(
          and(
            eq(projectWorkingMediaAdoptions.projectId, current.id),
            eq(projectWorkingMediaAdoptions.ownerUserId, current.ownerUserId),
          ),
        );
      const working = adoptionRows
        .map(toProjectWorkingMedia)
        .findLast(
          ({ mediaReference }) =>
            projectMediaReferencesEqual(mediaReference, snapshot.workingMedia) &&
            projectMediaReferencesEqual(mediaReference, snapshot.presentedMedia),
        );
      const [sourceRow] = await tx
        .select()
        .from(projectSources)
        .where(
          and(
            eq(projectSources.projectId, current.id),
            eq(projectSources.ownerUserId, current.ownerUserId),
          ),
        )
        .limit(1);
      const source = sourceRow === undefined ? null : toProjectSource(sourceRow);
      const sourceReference =
        source === null
          ? null
          : source.kind === 'saved-video-version'
            ? {
                kind: 'saved-video-version' as const,
                savedVideoId: source.savedVideoId!,
                videoVersionId: source.videoVersionId!,
              }
            : { kind: 'asset' as const, assetId: source.assetId };
      const exactInputAssetId =
        working?.assetId ??
        (projectMediaReferencesEqual(sourceReference, snapshot.workingMedia)
          ? source?.assetId
          : undefined);
      if (exactInputAssetId !== input.attempt.inputAssetId) {
        throw new ProjectPersistenceError(
          'asset-not-ready',
          'The exact current Project processing input is unavailable.',
        );
      }
      const [readyInput] = await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, input.attempt.inputAssetId),
            eq(mediaAssets.ownerUserId, input.attempt.ownerUserId),
            eq(mediaAssets.status, 'ready'),
          ),
        )
        .for('share')
        .limit(1);
      if (readyInput === undefined) {
        throw new ProjectPersistenceError(
          'asset-not-ready',
          'The exact Project processing input is unavailable.',
        );
      }

      if (input.attempt.retryOfOperationId !== null) {
        const previous = await this.#processingAttempt(
          tx,
          input.attempt.ownerUserId,
          input.attempt.projectId,
          input.attempt.retryOfOperationId,
        );
        if (
          previous === null ||
          !projectProcessingAttemptIsRetryable(previous.status) ||
          input.attempt.attemptNumber !== previous.attemptNumber + 1
        ) {
          return { kind: 'conflict', conflict: { kind: 'retry-mismatch' } } as const;
        }
      } else if (input.attempt.attemptNumber !== 1) {
        return { kind: 'conflict', conflict: { kind: 'retry-mismatch' } } as const;
      }
      const [activeOwnerAttempt] = await tx
        .select({ id: processingJobs.id })
        .from(processingJobs)
        .where(
          and(
            eq(processingJobs.ownerUserId, input.attempt.ownerUserId),
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
        .for('update')
        .limit(1);
      if (activeOwnerAttempt !== undefined) {
        return {
          kind: 'conflict',
          conflict: { kind: 'active-attempt', operationId: activeOwnerAttempt.id },
        } as const;
      }

      await tx.insert(processingJobs).values({
        id: input.attempt.operationId,
        ownerUserId: input.attempt.ownerUserId,
        operation: input.attempt.capability,
        provider: input.attempt.provider,
        providerJobId: null,
        requestFingerprint: input.attempt.requestFingerprint,
        outputResolution: input.attempt.outputResolution,
        providerOutputLocation: null,
        sourceDurationMs: input.attempt.sourceDurationMs,
        sourceOrientation: input.attempt.sourceOrientation,
        status: 'submitting',
        safeErrorCode: null,
        inputAssetId: input.attempt.inputAssetId,
        outputAssetId: null,
        resultAssetId: input.attempt.resultAssetId,
        resultMetadata: null,
        retryOfJobId: input.attempt.retryOfOperationId,
        leaseOwner: null,
        leaseExpiresAt: null,
        attempt: input.attempt.attemptNumber,
        acceptedAt: null,
        completedAt: null,
        expiresAt: toIsoTimestamp(input.attempt.expiresAt),
        createdAt: toIsoTimestamp(input.attempt.createdAt),
        updatedAt: toIsoTimestamp(input.attempt.updatedAt),
      });
      await tx.insert(projectJobs).values({
        projectId: input.link.projectId,
        ownerUserId: input.link.ownerUserId,
        jobId: input.link.jobId,
        initiatingRevisionId: input.link.initiatingRevisionId,
        initiatingRevisionNumber: input.link.initiatingRevisionNumber,
        resultRevisionId: null,
        resultRevisionNumber: null,
        createdAt: toIsoTimestamp(input.link.createdAt),
      });
      await tx
        .update(projects)
        .set({
          status: 'processing',
          version: current.version + 1,
          updatedAt: toIsoTimestamp(input.attempt.createdAt),
        })
        .where(and(eq(projects.id, current.id), eq(projects.ownerUserId, current.ownerUserId)));
      return { kind: 'admitted', attempt: input.attempt } as const;
    });
  }

  async getProjectAttempt(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectProcessingAttemptRecord | null> {
    const [row] = await this.db
      .select({ job: processingJobs, link: projectJobs })
      .from(projectJobs)
      .innerJoin(processingJobs, processingJobMatchesProjectLink)
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
          eq(projectJobs.jobId, operationId),
        ),
      )
      .limit(1);
    return row === undefined ? null : toProjectProcessingAttempt(row.job, row.link);
  }

  async getCurrentProjectAttempt(
    ownerUserId: string,
    projectId: string,
  ): Promise<ProjectProcessingAttemptRecord | null> {
    const current = await this.getCurrent(ownerUserId, projectId);
    if (current === null) return null;
    return this.#currentProcessingAttempt(this.db, ownerUserId, projectId, {
      id: current.revision.id,
      revisionNumber: current.revision.revisionNumber,
    });
  }

  async isProjectAttemptSuperseded(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<boolean> {
    const [attempt] = await this.db
      .select({ status: processingJobs.status, createdAt: processingJobs.createdAt })
      .from(projectJobs)
      .innerJoin(processingJobs, processingJobMatchesProjectLink)
      .where(
        and(
          eq(projectJobs.projectId, projectId),
          eq(projectJobs.ownerUserId, ownerUserId),
          eq(processingJobs.id, operationId),
        ),
      )
      .limit(1);
    if (attempt?.status !== 'ambiguous') return false;
    const [superseding] = await this.db
      .select({ id: processingJobs.id })
      .from(projectJobs)
      .innerJoin(processingJobs, processingJobMatchesProjectLink)
      .where(
        and(
          eq(projectJobs.projectId, projectId),
          eq(projectJobs.ownerUserId, ownerUserId),
          ne(processingJobs.id, operationId),
          or(
            eq(processingJobs.retryOfJobId, operationId),
            gt(processingJobs.createdAt, attempt.createdAt),
            and(
              eq(processingJobs.createdAt, attempt.createdAt),
              gt(processingJobs.id, operationId),
            ),
          ),
        ),
      )
      .limit(1);
    return superseding !== undefined;
  }

  async listProjectAttempts(
    ownerUserId: string,
    projectId: string,
    input: {
      readonly cursor?: { readonly createdAt: string; readonly operationId: string };
      readonly pageSize: number;
    },
  ): Promise<ProjectProcessingHistoryPage | null> {
    const current = await this.getCurrent(ownerUserId, projectId);
    if (current === null) return null;
    const cursorCondition =
      input.cursor === undefined
        ? undefined
        : or(
            lt(processingJobs.createdAt, input.cursor.createdAt),
            and(
              eq(processingJobs.createdAt, input.cursor.createdAt),
              lt(processingJobs.id, input.cursor.operationId),
            ),
          );
    const rows = await this.db
      .select({ job: processingJobs, link: projectJobs })
      .from(projectJobs)
      .innerJoin(processingJobs, processingJobMatchesProjectLink)
      .where(
        and(
          eq(projectJobs.projectId, projectId),
          eq(projectJobs.ownerUserId, ownerUserId),
          cursorCondition,
        ),
      )
      .orderBy(desc(processingJobs.createdAt), desc(processingJobs.id))
      .limit(input.pageSize + 1);
    const page = rows
      .slice(0, input.pageSize)
      .map(({ job, link }) => toProjectProcessingAttempt(job, link));
    const last = page.at(-1);
    const currentAttempt = await this.#currentProcessingAttempt(this.db, ownerUserId, projectId, {
      id: current.revision.id,
      revisionNumber: current.revision.revisionNumber,
    });
    const ambiguousOperationIds = page
      .filter(({ status }) => status === 'ambiguous')
      .map(({ operationId }) => operationId);
    const retryRows =
      ambiguousOperationIds.length === 0
        ? []
        : await this.db
            .select({ operationId: processingJobs.retryOfJobId })
            .from(projectJobs)
            .innerJoin(processingJobs, processingJobMatchesProjectLink)
            .where(
              and(
                eq(projectJobs.projectId, projectId),
                eq(projectJobs.ownerUserId, ownerUserId),
                inArray(processingJobs.retryOfJobId, ambiguousOperationIds),
              ),
            );
    const [latestRow] =
      ambiguousOperationIds.length === 0
        ? []
        : await this.db
            .select({
              operationId: processingJobs.id,
              status: processingJobs.status,
              retryOfOperationId: processingJobs.retryOfJobId,
              createdAt: processingJobs.createdAt,
            })
            .from(projectJobs)
            .innerJoin(processingJobs, processingJobMatchesProjectLink)
            .where(
              and(eq(projectJobs.projectId, projectId), eq(projectJobs.ownerUserId, ownerUserId)),
            )
            .orderBy(desc(processingJobs.createdAt), desc(processingJobs.id))
            .limit(1);
    const retriedOperationIds = new Set(
      retryRows.flatMap(({ operationId }) => (operationId === null ? [] : [operationId])),
    );
    return {
      attempts: page,
      currentOperationId: currentAttempt?.operationId ?? null,
      supersededOperationIds: page.flatMap((attempt) =>
        retriedOperationIds.has(attempt.operationId) ||
        (latestRow !== undefined &&
          projectProcessingAmbiguityIsSuperseded(attempt, [attempt, latestRow]))
          ? [attempt.operationId]
          : [],
      ),
      nextCursor:
        rows.length > input.pageSize && last !== undefined
          ? { createdAt: last.createdAt, operationId: last.operationId }
          : null,
    };
  }

  async updateProjectAttemptTrace(trace: VideoProcessingJobTrace): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ job: processingJobs, link: projectJobs })
        .from(processingJobs)
        .innerJoin(projectJobs, processingJobMatchesProjectLink)
        .where(
          and(
            eq(processingJobs.id, trace.jobId),
            eq(processingJobs.ownerUserId, trace.ownerUserId),
          ),
        )
        .for('update', { of: processingJobs })
        .limit(1);
      if (row === undefined) return false;
      const attempt = toProjectProcessingAttempt(row.job, row.link);
      if (!projectProcessingAttemptMatchesTrace(attempt, trace)) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'Project processing trace changed immutable operation identity.',
        );
      }
      await tx
        .update(processingJobs)
        .set({
          providerJobId: trace.providerJobId,
          providerOutputLocation: trace.providerOutputLocation,
          sourceDurationMs: trace.sourceDurationMs,
          sourceOrientation: trace.sourceOrientation,
          status: trace.status,
          safeErrorCode: trace.safeErrorCode,
          acceptedAt:
            trace.providerJobId === null
              ? row.job.acceptedAt
              : (row.job.acceptedAt ?? toIsoTimestamp(trace.updatedAt)),
          completedAt: nullableIsoTimestamp(trace.completedAt),
          updatedAt: toIsoTimestamp(trace.updatedAt),
        })
        .where(
          and(
            eq(processingJobs.id, trace.jobId),
            eq(processingJobs.ownerUserId, trace.ownerUserId),
          ),
        );
      if (trace.status === 'cancelled' || projectProcessingNeedsAttention(trace.status)) {
        const [project] = await tx
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.id, row.link.projectId),
              eq(projects.ownerUserId, row.link.ownerUserId),
              isNull(projects.deletedAt),
            ),
          )
          .for('update')
          .limit(1);
        if (project !== undefined && project.currentRevisionId !== null) {
          const latest = await this.#currentProcessingAttempt(tx, project.ownerUserId, project.id, {
            id: project.currentRevisionId,
            revisionNumber: project.currentRevisionNumber,
          });
          const nextStatus =
            latest?.operationId === trace.jobId
              ? projectStatusAfterProcessingTrace(project.status, trace.status)
              : null;
          if (nextStatus !== null) {
            await tx
              .update(projects)
              .set({
                status: nextStatus,
                version: project.version + 1,
                updatedAt: toIsoTimestamp(trace.updatedAt),
              })
              .where(
                and(eq(projects.id, project.id), eq(projects.ownerUserId, project.ownerUserId)),
              );
          }
        }
      }
      return true;
    });
  }

  async listResumableProjectAttempts(now: string): Promise<readonly ResumableVideoProcessingJob[]> {
    return this.db.transaction(async (tx) => {
      const interrupted = await tx
        .select({ job: processingJobs, link: projectJobs })
        .from(projectJobs)
        .innerJoin(processingJobs, processingJobMatchesProjectLink)
        .where(
          inArray(processingJobs.status, [
            'pending',
            'validating',
            'submitting',
            'accepted',
            'queued',
            'processing',
            'retrieving',
            'ready',
          ]),
        )
        .for('update', { of: processingJobs });
      const recoveries = interrupted.flatMap(({ job, link }) => {
        const transition = projectProcessingRestartTransition(
          {
            status: job.status,
            providerJobId: job.providerJobId,
            outputAssetId: job.outputAssetId,
            expiresAt: toIsoTimestamp(job.expiresAt),
          },
          now,
        );
        return transition === null ? [] : [{ job, link, transition }];
      });
      const updateRecoveryGroup = async (
        status: PersistedProcessingJobStatus,
        safeErrorCode: string | null,
        completedAt: string | null,
      ): Promise<void> => {
        const jobIds = recoveries
          .filter(({ transition }) => transition.status === status)
          .map(({ job }) => job.id);
        if (jobIds.length === 0) return;
        await tx
          .update(processingJobs)
          .set({ status, safeErrorCode, completedAt, updatedAt: now })
          .where(inArray(processingJobs.id, jobIds));
      };
      await updateRecoveryGroup('expired', 'job_expired', now);
      await updateRecoveryGroup('ambiguous', 'submission_ambiguous', now);
      await updateRecoveryGroup('failed', 'processing_failed', now);
      await updateRecoveryGroup('queued', null, null);
      await updateRecoveryGroup('retrieving', null, null);

      const attentionRecoveries = recoveries.filter(({ transition }) =>
        projectProcessingNeedsAttention(transition.status),
      );
      const attentionProjectIds = [
        ...new Set(attentionRecoveries.map(({ link }) => link.projectId)),
      ];
      if (attentionProjectIds.length > 0) {
        const projectRows = await tx
          .select()
          .from(projects)
          .where(and(inArray(projects.id, attentionProjectIds), isNull(projects.deletedAt)))
          .for('update');
        const attemptRows = await tx
          .select({ job: processingJobs, link: projectJobs })
          .from(projectJobs)
          .innerJoin(processingJobs, processingJobMatchesProjectLink)
          .where(inArray(projectJobs.projectId, attentionProjectIds));
        const attemptsByProject = new Map<string, ProjectProcessingAttemptRecord[]>();
        for (const { job, link } of attemptRows) {
          const attempts = attemptsByProject.get(link.projectId) ?? [];
          attempts.push(toProjectProcessingAttempt(job, link));
          attemptsByProject.set(link.projectId, attempts);
        }
        const attentionJobIds = new Set(attentionRecoveries.map(({ job }) => job.id));
        const projectsToUpdate = projectRows.filter((project) => {
          if (project.status === 'needs-attention' || project.currentRevisionId === null) {
            return false;
          }
          const current = currentProjectProcessingAttempt(
            { id: project.currentRevisionId, revisionNumber: project.currentRevisionNumber },
            attemptsByProject.get(project.id) ?? [],
          );
          return current !== null && attentionJobIds.has(current.operationId);
        });
        if (projectsToUpdate.length > 0) {
          await tx
            .update(projects)
            .set({
              status: 'needs-attention',
              version: sql`${projects.version} + 1`,
              updatedAt: now,
            })
            .where(
              inArray(
                projects.id,
                projectsToUpdate.map(({ id }) => id),
              ),
            );
        }
      }

      const rows = await tx
        .select({ job: processingJobs, link: projectJobs })
        .from(projectJobs)
        .innerJoin(processingJobs, processingJobMatchesProjectLink)
        .where(
          and(
            inArray(processingJobs.status, ['accepted', 'queued', 'processing', 'retrieving']),
            sql`${processingJobs.providerJobId} is not null`,
            sql`${processingJobs.expiresAt} > ${now}`,
          ),
        );
      return rows.flatMap(({ job, link }) => {
        const attempt = toProjectProcessingAttempt(job, link);
        const resumable = resumableProjectProcessingAttempt(attempt, now);
        return resumable === null ? [] : [resumable];
      });
    });
  }

  async retainProjectResult(input: {
    readonly ownerUserId: string;
    readonly projectId: string;
    readonly operationId: string;
    readonly manifest: StoredAssetManifest;
    readonly inspected: InspectedVideo;
    readonly jobOutputLink: ProjectAssetLink;
    readonly currentPromotion: {
      readonly expectedVersion: number;
      readonly expectedRevisionNumber: number;
      readonly expectedCurrentOperationId: string;
      readonly revision: AppendProjectRevisionPersistenceInput;
      readonly media: ProjectWorkingMediaRecord;
    } | null;
    readonly retainedAt: string;
  }): Promise<ProjectProcessingResultRetentionResult> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ job: processingJobs, link: projectJobs, project: projects })
        .from(processingJobs)
        .innerJoin(projectJobs, processingJobMatchesProjectLink)
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
            eq(processingJobs.id, input.operationId),
            eq(processingJobs.ownerUserId, input.ownerUserId),
            eq(projectJobs.projectId, input.projectId),
          ),
        )
        .for('update', { of: [processingJobs, projects] })
        .limit(1);
      if (row === undefined) return { kind: 'not-found' } as const;
      const attempt = toProjectProcessingAttempt(row.job, row.link);
      if (!projectProcessingResultInputMatchesAttempt(input, attempt)) {
        return { kind: 'conflict' } as const;
      }
      const [readyAsset] = await tx
        .select()
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, input.manifest.assetId),
            eq(mediaAssets.ownerUserId, input.ownerUserId),
            eq(mediaAssets.status, 'ready'),
          ),
        )
        .for('share')
        .limit(1);
      if (
        readyAsset === undefined ||
        readyAsset.mimeType !== input.manifest.mimeType ||
        readyAsset.filename !== input.manifest.filename ||
        readyAsset.sizeBytes !== input.manifest.sizeBytes ||
        readyAsset.checksumSha256 !== input.manifest.checksumSha256
      ) {
        throw new ProjectPersistenceError(
          'asset-not-ready',
          'The retained processing result does not match a ready owner asset.',
        );
      }
      if (attempt.outputAssetId !== null) {
        if (!retainedProjectProcessingResultMatches(attempt, input.manifest, input.inspected)) {
          return { kind: 'conflict' } as const;
        }
        if (attempt.resultRevisionId === null) {
          return { kind: 'replayed-historical', attempt } as const;
        }
        const [mediaRow] = await tx
          .select()
          .from(projectWorkingMediaAdoptions)
          .where(
            and(
              eq(projectWorkingMediaAdoptions.projectId, input.projectId),
              eq(projectWorkingMediaAdoptions.ownerUserId, input.ownerUserId),
              eq(projectWorkingMediaAdoptions.operationKey, input.operationId),
            ),
          )
          .limit(1);
        const [revisionRow] = await tx
          .select()
          .from(projectRevisions)
          .where(
            and(
              eq(projectRevisions.projectId, input.projectId),
              eq(projectRevisions.ownerUserId, input.ownerUserId),
              eq(projectRevisions.id, attempt.resultRevisionId),
            ),
          )
          .limit(1);
        if (mediaRow === undefined || revisionRow === undefined) {
          return { kind: 'conflict' } as const;
        }
        return {
          kind: 'replayed-current',
          attempt,
          workingMedia: {
            project: toProject(row.project),
            revision: toRevision(revisionRow),
            media: toProjectWorkingMedia(mediaRow),
          },
        } as const;
      }

      const currentAttempt =
        row.project.currentRevisionId === null
          ? null
          : await this.#currentProcessingAttempt(tx, input.ownerUserId, input.projectId, {
              id: row.project.currentRevisionId,
              revisionNumber: row.project.currentRevisionNumber,
            });
      const semanticallyCurrent =
        input.currentPromotion !== null &&
        row.project.currentRevisionId === attempt.initiatingRevisionId &&
        row.project.currentRevisionNumber === attempt.initiatingRevisionNumber &&
        currentAttempt?.operationId === input.currentPromotion.expectedCurrentOperationId &&
        currentAttempt.operationId === attempt.operationId;
      if (
        semanticallyCurrent &&
        input.currentPromotion !== null &&
        (row.project.version !== input.currentPromotion.expectedVersion ||
          row.project.currentRevisionNumber !== input.currentPromotion.expectedRevisionNumber)
      ) {
        return { kind: 'conflict' } as const;
      }

      const [existingJobOutput] = await tx
        .select()
        .from(projectAssets)
        .where(
          and(
            eq(projectAssets.projectId, input.jobOutputLink.projectId),
            eq(projectAssets.ownerUserId, input.jobOutputLink.ownerUserId),
            eq(projectAssets.assetId, input.jobOutputLink.assetId),
            eq(projectAssets.role, 'job-output'),
            eq(projectAssets.revisionId, input.jobOutputLink.revisionId),
          ),
        )
        .limit(1);
      if (existingJobOutput === undefined) {
        await tx.insert(projectAssets).values(assetLinkValues(input.jobOutputLink));
      }

      let resultRevision: ProjectRevision | null = null;
      let resultMedia: ProjectWorkingMediaRecord | null = null;
      let nextProject: Project | null = null;
      if (semanticallyCurrent) {
        if (input.currentPromotion === null) return { kind: 'conflict' } as const;
        const revisionInput = input.currentPromotion.revision;
        resultRevision = {
          ...revisionInput.revision,
          snapshot: projectSnapshotSchema.parse(revisionInput.revision.snapshot),
        };
        resultMedia = input.currentPromotion.media;
        nextProject = revisionInput.nextProject;
        if (
          revisionInput.ownerUserId !== input.ownerUserId ||
          revisionInput.projectId !== input.projectId ||
          revisionInput.expectedVersion !== row.project.version ||
          revisionInput.expectedRevisionNumber !== row.project.currentRevisionNumber ||
          resultRevision.source !== 'job-result' ||
          resultRevision.parentRevisionId !== row.project.currentRevisionId ||
          resultRevision.parentRevisionNumber !== row.project.currentRevisionNumber ||
          resultMedia.operationKey !== attempt.operationId ||
          resultMedia.assetId !== attempt.resultAssetId ||
          resultMedia.adoptedRevisionId !== resultRevision.id ||
          resultMedia.adoptedRevisionNumber !== resultRevision.revisionNumber
        ) {
          return { kind: 'conflict' } as const;
        }
        assertRevisionAssetLinks(resultRevision, revisionInput.assetLinks);
        const versionReferences = projectVersionReferenceLinksForRevision(resultRevision);
        await assertReadyAssets(tx, input.ownerUserId, revisionInput.assetLinks);
        await assertReadyVersionReferences(tx, input.ownerUserId, versionReferences);
        await assertLastSuccessfulOutput(tx, resultRevision);
        await tx.insert(projectRevisions).values(revisionValues(resultRevision));
        if (revisionInput.assetLinks.length > 0) {
          await tx.insert(projectAssets).values(revisionInput.assetLinks.map(assetLinkValues));
        }
        if (versionReferences.length > 0) {
          await tx
            .insert(projectVersionReferences)
            .values(versionReferences.map(versionReferenceValues));
        }
        await tx
          .insert(projectWorkingMediaAdoptions)
          .values(projectWorkingMediaValues(resultMedia));
        await this.#persistAssetMemberships(tx, membershipsForRevisionInput(revisionInput));
        await tx
          .update(projectJobs)
          .set({
            resultRevisionId: resultRevision.id,
            resultRevisionNumber: resultRevision.revisionNumber,
          })
          .where(eq(projectJobs.jobId, attempt.operationId));
        await tx
          .update(projects)
          .set({
            status: nextProject.status,
            version: nextProject.version,
            currentRevisionId: nextProject.currentRevisionId,
            currentRevisionNumber: nextProject.currentRevisionNumber,
            updatedAt: toIsoTimestamp(nextProject.updatedAt),
          })
          .where(
            and(eq(projects.id, row.project.id), eq(projects.ownerUserId, row.project.ownerUserId)),
          );
      }

      await tx
        .update(processingJobs)
        .set({
          outputAssetId: input.manifest.assetId,
          resultMetadata: input.inspected,
          status: 'ready',
          safeErrorCode: null,
          completedAt: toIsoTimestamp(input.retainedAt),
          updatedAt: toIsoTimestamp(input.retainedAt),
        })
        .where(
          and(
            eq(processingJobs.id, attempt.operationId),
            eq(processingJobs.ownerUserId, input.ownerUserId),
          ),
        );

      const retainedAttempt: ProjectProcessingAttemptRecord = {
        ...attempt,
        outputAssetId: input.manifest.assetId,
        result: inspectedVideoSchema.parse(input.inspected),
        resultRevisionId: resultRevision?.id ?? null,
        resultRevisionNumber: resultRevision?.revisionNumber ?? null,
        status: 'ready',
        safeErrorCode: null,
        updatedAt: toIsoTimestamp(input.retainedAt),
        completedAt: toIsoTimestamp(input.retainedAt),
      };
      if (resultRevision === null || resultMedia === null || nextProject === null) {
        return { kind: 'retained-historical', attempt: retainedAttempt } as const;
      }
      return {
        kind: 'retained-current',
        attempt: retainedAttempt,
        workingMedia: { project: nextProject, revision: resultRevision, media: resultMedia },
      } as const;
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
          conflict: projectVersionConflictDetail(current.id, expectedVersion, current.version),
        } as const;
      }
      if (
        nextProject.ownerUserId !== current.ownerUserId ||
        nextProject.campaignId !== current.campaignId ||
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
        if (await this.#hasBlockingProcessingAttempt(tx, current.id, current.ownerUserId)) {
          return {
            kind: 'conflict',
            conflict: projectConflicts.activeJobs(current.id),
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

  async updateCampaignMembership(
    ownerUserId: string,
    expectedVersion: number,
    nextProject: Project,
  ): Promise<ProjectPersistenceMutationResult> {
    return this.db.transaction(async (tx) => {
      if (nextProject.campaignId !== null) {
        const [campaign] = await tx
          .select({ id: campaigns.id })
          .from(campaigns)
          .where(
            and(
              eq(campaigns.id, nextProject.campaignId),
              eq(campaigns.ownerUserId, ownerUserId),
              eq(campaigns.status, 'active'),
              isNull(campaigns.deletedAt),
            ),
          )
          .for('update')
          .limit(1);
        if (campaign === undefined) {
          return {
            kind: 'conflict',
            conflict: projectConflicts.campaignMembership(nextProject.id),
          } as const;
        }
      }
      const [current] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, nextProject.id),
            eq(projects.ownerUserId, ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (current === undefined) return { kind: 'not-found' } as const;
      if (current.version !== expectedVersion) {
        return {
          kind: 'conflict',
          conflict: projectVersionConflictDetail(current.id, expectedVersion, current.version),
        } as const;
      }
      if (
        nextProject.ownerUserId !== current.ownerUserId ||
        nextProject.version !== current.version + 1 ||
        nextProject.currentRevisionId !== current.currentRevisionId ||
        nextProject.currentRevisionNumber !== current.currentRevisionNumber ||
        nextProject.title !== current.title ||
        nextProject.status !== current.status ||
        nullableIsoTimestamp(nextProject.archivedAt) !== nullableIsoTimestamp(current.archivedAt) ||
        nullableIsoTimestamp(nextProject.deletedAt) !== nullableIsoTimestamp(current.deletedAt)
      ) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'A Campaign membership update cannot change unrelated Project metadata.',
        );
      }
      await tx
        .update(projects)
        .set({
          campaignId: nextProject.campaignId,
          version: nextProject.version,
          updatedAt: toIsoTimestamp(nextProject.updatedAt),
        })
        .where(and(eq(projects.id, current.id), eq(projects.ownerUserId, current.ownerUserId)));
      return { kind: 'updated' } as const;
    });
  }

  async findReceipt(
    ownerUserId: string,
    operationId: string,
  ): Promise<ProjectOutputOperationReceipt | null> {
    const [row] = await this.db
      .select()
      .from(projectOutputOperationReceipts)
      .where(
        and(
          eq(projectOutputOperationReceipts.ownerUserId, ownerUserId),
          eq(projectOutputOperationReceipts.operationId, operationId),
        ),
      )
      .limit(1);
    return row === undefined ? null : toProjectOutputReceipt(row);
  }

  async commit(
    input: Parameters<ProjectOutputMetadataUnitOfWork['commit']>[0],
  ): Promise<ProjectOutputMetadataCommitResult> {
    const receipt: ProjectOutputOperationReceipt = {
      ...input.receipt,
      result: projectOutputSaveResultSchema.parse(input.receipt.result),
    };
    return this.db.transaction(async (tx) => {
      const [priorRow] = await tx
        .select()
        .from(projectOutputOperationReceipts)
        .where(
          and(
            eq(projectOutputOperationReceipts.ownerUserId, input.ownerUserId),
            eq(projectOutputOperationReceipts.operationId, receipt.operationId),
          ),
        )
        .for('update')
        .limit(1);
      if (priorRow !== undefined) {
        const prior = toProjectOutputReceipt(priorRow);
        return prior.requestFingerprint === receipt.requestFingerprint &&
          prior.projectId === receipt.projectId
          ? { kind: 'replayed', receipt: prior }
          : {
              kind: 'conflict',
              conflict: projectConflicts.operationKey('output-save'),
            };
      }

      const [current] = await tx
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectRevision.projectId),
            eq(projects.ownerUserId, input.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (current === undefined) return { kind: 'not-found' } as const;
      // A competing operation may have committed while this transaction waited for the Project
      // lock. Re-read the receipt before interpreting the now-advanced Project CAS as a conflict.
      const [receiptAfterProjectLock] = await tx
        .select()
        .from(projectOutputOperationReceipts)
        .where(
          and(
            eq(projectOutputOperationReceipts.ownerUserId, input.ownerUserId),
            eq(projectOutputOperationReceipts.operationId, receipt.operationId),
          ),
        )
        .limit(1);
      if (receiptAfterProjectLock !== undefined) {
        const prior = toProjectOutputReceipt(receiptAfterProjectLock);
        return prior.requestFingerprint === receipt.requestFingerprint &&
          prior.projectId === receipt.projectId
          ? { kind: 'replayed', receipt: prior }
          : {
              kind: 'conflict',
              conflict: projectConflicts.operationKey('output-save'),
            };
      }
      if (current.version !== input.projectRevision.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: projectVersionConflictDetail(
            current.id,
            input.projectRevision.expectedVersion,
            current.version,
          ),
        } as const;
      }
      if (current.currentRevisionNumber !== input.projectRevision.expectedRevisionNumber) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'revision',
            projectId: current.id,
            expectedRevisionNumber: input.projectRevision.expectedRevisionNumber,
            actualRevisionNumber: current.currentRevisionNumber,
          },
        } as const;
      }

      let savedVideoId: string;
      let version: StoredVideoVersion;
      let createAggregate: StoredSavedVideoAggregate | null = null;
      let appendCurrent: typeof savedVideos.$inferSelect | null = null;
      if (input.savedVideo.kind === 'create') {
        createAggregate = storedSavedVideoAggregateSchema.parse(input.savedVideo.aggregate);
        version = createAggregate.versions[0]!;
        savedVideoId = createAggregate.video.id;
        if (
          createAggregate.versions.length !== 1 ||
          createAggregate.video.ownerUserId !== input.ownerUserId ||
          createAggregate.video.currentVersionId !== version.id ||
          createAggregate.video.status !== 'ready' ||
          createAggregate.video.deletedAt !== null ||
          createAggregate.revision !== 1 ||
          version.ownerUserId !== input.ownerUserId ||
          version.videoId !== savedVideoId ||
          version.ordinal !== 1
        ) {
          throw new ProjectPersistenceError(
            'invalid-aggregate',
            'The Project output Saved Video create is inconsistent.',
          );
        }
      } else {
        version = storedVideoVersionSchema.parse(input.savedVideo.version);
        savedVideoId = input.savedVideo.videoId;
        const [target] = await tx
          .select()
          .from(savedVideos)
          .where(
            and(
              eq(savedVideos.id, savedVideoId),
              eq(savedVideos.ownerUserId, input.ownerUserId),
              isNull(savedVideos.deletedAt),
            ),
          )
          .for('update')
          .limit(1);
        if (target === undefined) return { kind: 'not-found' } as const;
        if (target.currentVersionId !== input.savedVideo.expectedVersionId) {
          return {
            kind: 'conflict',
            conflict: {
              kind: 'saved-video-version',
              savedVideoId,
              expectedVersionId: input.savedVideo.expectedVersionId,
              actualVersionId: target.currentVersionId,
            },
          } as const;
        }
        const [currentVersion] = await tx
          .select({ ordinal: videoVersions.ordinal })
          .from(videoVersions)
          .where(
            and(
              eq(videoVersions.videoId, savedVideoId),
              eq(videoVersions.ownerUserId, input.ownerUserId),
              eq(videoVersions.id, target.currentVersionId),
            ),
          )
          .for('share')
          .limit(1);
        if (
          currentVersion === undefined ||
          version.videoId !== savedVideoId ||
          version.ownerUserId !== input.ownerUserId ||
          version.sourceVersionId !== input.savedVideo.expectedVersionId ||
          version.ordinal !== currentVersion.ordinal + 1
        ) {
          throw new ProjectPersistenceError(
            'invalid-aggregate',
            'The Project output Version append is inconsistent.',
          );
        }
        appendCurrent = target;
      }

      const revision: ProjectRevision = {
        ...input.projectRevision.revision,
        snapshot: projectSnapshotSchema.parse(input.projectRevision.revision.snapshot),
      };
      const output = input.output;
      const nextProject = input.projectRevision.nextProject;
      const validNextState =
        current.archivedAt === null &&
        receipt.projectId === current.id &&
        receipt.savedVideoId === savedVideoId &&
        receipt.videoVersionId === version.id &&
        receipt.resultRevisionId === revision.id &&
        receipt.resultRevisionNumber === revision.revisionNumber &&
        receipt.result.project.version === nextProject.version &&
        receipt.result.revision.id === revision.id &&
        receipt.result.output.videoVersionId === version.id &&
        receipt.result.savedVideo.currentVersion.id === version.id &&
        nextProject.id === current.id &&
        nextProject.ownerUserId === current.ownerUserId &&
        nextProject.version === current.version + 1 &&
        nextProject.status === 'completed' &&
        nextProject.currentRevisionId === revision.id &&
        nextProject.currentRevisionNumber === revision.revisionNumber &&
        revision.projectId === current.id &&
        revision.ownerUserId === current.ownerUserId &&
        revision.parentRevisionId === current.currentRevisionId &&
        revision.parentRevisionNumber === current.currentRevisionNumber &&
        revision.revisionNumber === current.currentRevisionNumber + 1 &&
        revision.source === 'output-save' &&
        output.projectId === current.id &&
        output.ownerUserId === current.ownerUserId &&
        output.savedVideoId === savedVideoId &&
        output.videoVersionId === version.id &&
        output.producingRevisionId === current.currentRevisionId &&
        output.producingRevisionNumber === current.currentRevisionNumber &&
        input.media.projectId === current.id &&
        input.media.ownerUserId === current.ownerUserId &&
        input.media.kind === 'saved-video-version' &&
        input.media.assetId === version.assetId &&
        input.media.savedVideoId === savedVideoId &&
        input.media.videoVersionId === version.id &&
        input.media.adoptedRevisionId === revision.id &&
        input.media.adoptedRevisionNumber === revision.revisionNumber &&
        input.media.operationKey === receipt.operationId &&
        input.media.requestFingerprint === receipt.requestFingerprint &&
        projectMediaReferencesEqual(input.media.mediaReference, revision.snapshot.workingMedia) &&
        projectMediaReferencesEqual(input.media.mediaReference, revision.snapshot.presentedMedia) &&
        revision.snapshot.lastSuccessfulOutput?.savedVideoId === savedVideoId &&
        revision.snapshot.lastSuccessfulOutput.videoVersionId === version.id;
      if (!validNextState) {
        throw new ProjectPersistenceError(
          'invalid-aggregate',
          'The Project output transaction does not continue the locked aggregate.',
        );
      }
      assertRevisionAssetLinks(revision, input.projectRevision.assetLinks);
      const [asset] = await tx
        .select({
          id: mediaAssets.id,
          status: mediaAssets.status,
          mimeType: mediaAssets.mimeType,
          filename: mediaAssets.filename,
          sizeBytes: mediaAssets.sizeBytes,
          checksumSha256: mediaAssets.checksumSha256,
        })
        .from(mediaAssets)
        .where(
          and(eq(mediaAssets.id, version.assetId), eq(mediaAssets.ownerUserId, input.ownerUserId)),
        )
        .for('share')
        .limit(1);
      if (
        asset === undefined ||
        asset.status !== 'ready' ||
        asset.mimeType !== version.mimeType ||
        asset.filename !== version.filename ||
        asset.sizeBytes !== version.sizeBytes ||
        input.media.assetId !== version.assetId ||
        input.media.mimeType !== version.mimeType ||
        input.media.filename !== version.filename ||
        input.media.sizeBytes !== version.sizeBytes ||
        input.media.checksumSha256 !== asset.checksumSha256 ||
        input.media.durationMs !== version.durationMs ||
        input.media.width !== version.width ||
        input.media.height !== version.height
      ) {
        throw new ProjectPersistenceError(
          'asset-not-ready',
          'The exact Project output bytes are missing, unready, or changed.',
        );
      }

      const insertedReceipt = await tx
        .insert(projectOutputOperationReceipts)
        .values({
          ownerUserId: input.ownerUserId,
          operationId: receipt.operationId,
          requestFingerprint: receipt.requestFingerprint,
          projectId: receipt.projectId,
          savedVideoId: receipt.savedVideoId,
          videoVersionId: receipt.videoVersionId,
          resultRevisionId: receipt.resultRevisionId,
          resultRevisionNumber: receipt.resultRevisionNumber,
          result: receipt.result,
          createdAt: toIsoTimestamp(receipt.createdAt),
        })
        .onConflictDoNothing({
          target: [
            projectOutputOperationReceipts.ownerUserId,
            projectOutputOperationReceipts.operationId,
          ],
        })
        .returning({ operationId: projectOutputOperationReceipts.operationId });
      if (insertedReceipt.length === 0) {
        const [racedRow] = await tx
          .select()
          .from(projectOutputOperationReceipts)
          .where(
            and(
              eq(projectOutputOperationReceipts.ownerUserId, input.ownerUserId),
              eq(projectOutputOperationReceipts.operationId, receipt.operationId),
            ),
          )
          .limit(1);
        if (racedRow === undefined) {
          throw new ProjectPersistenceError(
            'invalid-aggregate',
            'The Project output receipt race could not be reconciled.',
          );
        }
        const raced = toProjectOutputReceipt(racedRow);
        return raced.requestFingerprint === receipt.requestFingerprint &&
          raced.projectId === receipt.projectId
          ? { kind: 'replayed', receipt: raced }
          : {
              kind: 'conflict',
              conflict: projectConflicts.operationKey('output-save'),
            };
      }

      if (createAggregate !== null) {
        await tx.insert(savedVideos).values(savedVideoValues(createAggregate));
      }
      await tx.insert(videoVersions).values(savedVideoVersionValues(version));
      if (appendCurrent !== null) {
        await tx
          .update(savedVideos)
          .set({
            currentVersionId: version.id,
            status: 'ready',
            revision: appendCurrent.revision + 1,
            updatedAt: toIsoTimestamp(version.createdAt),
          })
          .where(
            and(
              eq(savedVideos.id, appendCurrent.id),
              eq(savedVideos.ownerUserId, appendCurrent.ownerUserId),
            ),
          );
      }
      await tx.insert(projectOutputs).values({
        projectId: output.projectId,
        ownerUserId: output.ownerUserId,
        savedVideoId: output.savedVideoId,
        videoVersionId: output.videoVersionId,
        producingRevisionId: output.producingRevisionId,
        producingRevisionNumber: output.producingRevisionNumber,
        createdAt: toIsoTimestamp(output.createdAt),
      });
      const versionReferenceLinks = projectVersionReferenceLinksForRevision(revision);
      await assertReadyAssets(tx, input.ownerUserId, input.projectRevision.assetLinks);
      await assertReadyVersionReferences(tx, input.ownerUserId, versionReferenceLinks);
      await assertLastSuccessfulOutput(tx, revision);
      await tx.insert(projectRevisions).values(revisionValues(revision));
      if (input.projectRevision.assetLinks.length > 0) {
        await tx
          .insert(projectAssets)
          .values(input.projectRevision.assetLinks.map(assetLinkValues));
      }
      if (versionReferenceLinks.length > 0) {
        await tx
          .insert(projectVersionReferences)
          .values(versionReferenceLinks.map(versionReferenceValues));
      }
      await tx.insert(projectWorkingMediaAdoptions).values(projectWorkingMediaValues(input.media));
      await this.#persistAssetMemberships(tx, [
        ...membershipsForRevisionInput(input.projectRevision),
        createSavedVideoProjectMembership({
          ownerUserId: input.ownerUserId,
          projectId: input.projectRevision.projectId,
          savedVideoId,
          createdAt: receipt.createdAt,
        }),
      ]);
      await tx
        .update(projects)
        .set({
          status: nextProject.status,
          version: nextProject.version,
          currentRevisionId: nextProject.currentRevisionId,
          currentRevisionNumber: nextProject.currentRevisionNumber,
          updatedAt: toIsoTimestamp(nextProject.updatedAt),
        })
        .where(and(eq(projects.id, current.id), eq(projects.ownerUserId, current.ownerUserId)));
      return { kind: 'committed', receipt };
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

  async getOutput(
    ownerUserId: string,
    projectId: string,
    videoVersionId: string,
  ): Promise<ProjectOutputLink | null> {
    const [row] = await this.db
      .select()
      .from(projectOutputs)
      .where(
        and(
          eq(projectOutputs.ownerUserId, ownerUserId),
          eq(projectOutputs.projectId, projectId),
          eq(projectOutputs.videoVersionId, videoVersionId),
        ),
      )
      .limit(1);
    return row === undefined
      ? null
      : {
          projectId: row.projectId,
          ownerUserId: row.ownerUserId,
          savedVideoId: row.savedVideoId,
          videoVersionId: row.videoVersionId,
          producingRevisionId: row.producingRevisionId,
          producingRevisionNumber: row.producingRevisionNumber,
          createdAt: toIsoTimestamp(row.createdAt),
        };
  }

  async assignedSavedVideoIds(
    ownerUserId: string,
    savedVideoIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const candidates = [...new Set(savedVideoIds)];
    if (candidates.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ savedVideoId: projectOutputs.savedVideoId })
      .from(projectOutputs)
      .where(
        and(
          eq(projectOutputs.ownerUserId, ownerUserId),
          inArray(projectOutputs.savedVideoId, candidates),
        ),
      );
    return new Set(rows.map(({ savedVideoId }) => savedVideoId));
  }
}
