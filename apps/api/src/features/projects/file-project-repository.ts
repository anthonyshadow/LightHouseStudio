import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { InspectedVideo } from '@studio/contracts';
import {
  currentProjectProcessingAttempt,
  projectProcessingBlocksArchive,
  projectProcessingNeedsAttention,
  projectProcessingRestartTransition,
  type Campaign,
  type Project,
  type ProjectAggregate,
  type ProjectAssetLink,
  type ProjectJobLink,
  type ProjectOutputLink,
} from '@studio/domain';
import type {
  ResumableVideoProcessingJob,
  VideoProcessingJobTrace,
} from '../processing-jobs/file-processing-job-repository.js';
import type { StoredAssetManifest } from '../../storage/asset-byte-store.js';
import { KeyedLock } from '../../application/keyed-lock.js';
import type {
  CampaignCreatePersistenceResult,
  CampaignCreateReceipt,
  CampaignPersistenceMutationResult,
  CampaignRepository,
  CampaignSummaryPage as CampaignPage,
  CampaignSummaryPageInput as CampaignPageInput,
  CampaignWithAttachedProjectCount,
} from '../campaigns/campaign-repository.js';
import type {
  AdoptProjectWorkingMediaPersistenceInput,
  AppendProjectRevisionPersistenceInput,
  AcceptProjectSourcePersistenceInput,
  ProjectCreateReceipt,
  ProjectCreatePersistenceResult,
  ProjectCurrentRead,
  ProjectCurrentSourceRead,
  ProjectLinkHistoryItem,
  ProjectLinkHistoryKind,
  ProjectLinkHistoryPage,
  ProjectLinkMutationResult,
  ProjectOutputMetadataCommitResult,
  ProjectOutputMetadataUnitOfWork,
  ProjectOutputOperationReceipt,
  ProjectPersistenceMutationResult,
  ProjectRepository,
  ProjectRetentionPolicy,
  ProjectRevisionHistoryPage,
  ProjectSummaryPage,
  ProjectSummaryPageInput,
  ProjectSourceAcceptanceResult,
  ProjectSourceRecord,
  ProjectWorkingMediaAdoptionResult,
  ProjectWorkingMediaRead,
  ProjectWorkingMediaRecord,
} from './project-repository.js';
import {
  appendStoredVideoVersion,
  FileSavedVideoRepository,
  savedVideoLibrarySchema,
  storedSavedVideoAggregateSchema,
  storedVideoVersionSchema,
  type SavedVideoLibrary,
} from '../saved-videos/saved-video-repository.js';
import {
  projectProcessingAttemptMatchesTrace,
  projectProcessingResultInputMatchesAttempt,
  retainedProjectProcessingResultMatches,
  resumableProjectProcessingAttempt,
  type ProjectProcessingAdmissionResult,
  type ProjectProcessingAttemptRecord,
  type ProjectProcessingHistoryPage,
  type ProjectProcessingRepository,
  type ProjectProcessingResultRetentionResult,
} from './project-processing-repository.js';
import {
  campaignCreateReceiptSchema,
  createReceiptSchema,
  emptyLibrary,
  journalSchema,
  librarySchema,
  ownerIdSchema,
  parseJournal,
  parseLibrary,
  storedAggregateSchema,
  storedCampaignSchema,
  storedJobLinkSchema,
  storedOutputLinkSchema,
  storedProjectProcessingAttemptSchema,
  storedProjectSourceSchema,
  storedProjectWorkingMediaSchema,
  type ProjectJournal,
  type ProjectLibrary,
  type StoredProjectAggregate,
} from './file-project-persistence-schema.js';
import {
  projectMediaReferencesEqual,
  projectAssetLinksForRevision,
  projectVersionReferenceLinksForRevision,
} from './project-snapshot-relations.js';

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const asAggregate = (value: StoredProjectAggregate): ProjectAggregate => value;

const currentRead = (aggregate: StoredProjectAggregate): ProjectCurrentRead => {
  const revision = aggregate.revisions.find(
    ({ id, revisionNumber }) =>
      id === aggregate.project.currentRevisionId &&
      revisionNumber === aggregate.project.currentRevisionNumber,
  );
  if (revision === undefined) throw new Error('Project current revision is unavailable.');
  return { project: aggregate.project, revision };
};

const workingMediaForOperation = (
  library: ProjectLibrary,
  operationKey: string,
): {
  readonly aggregate: StoredProjectAggregate;
  readonly media: ProjectWorkingMediaRecord;
} | null => {
  for (const aggregate of library.projects) {
    const media = aggregate.workingMediaAdoptions.find(
      (candidate) => candidate.operationKey === operationKey,
    );
    if (media !== undefined) return { aggregate, media };
  }
  return null;
};

const attemptForOperation = (
  library: ProjectLibrary,
  operationId: string,
): ProjectProcessingAttemptRecord | null =>
  library.processingJobs.find((attempt) => attempt.operationId === operationId) ?? null;

const currentAttemptForAggregate = (
  aggregate: StoredProjectAggregate,
  attempts: readonly ProjectProcessingAttemptRecord[],
): ProjectProcessingAttemptRecord | null => {
  const current = currentRead(aggregate);
  return currentProjectProcessingAttempt(
    { id: current.revision.id, revisionNumber: current.revision.revisionNumber },
    attempts,
  );
};

const attemptsForProject = (
  attempts: readonly ProjectProcessingAttemptRecord[],
  projectId: string,
): ProjectProcessingAttemptRecord[] =>
  attempts.filter((attempt) => attempt.projectId === projectId);

type ProjectOutputCommitInput = Parameters<ProjectOutputMetadataUnitOfWork['commit']>[0];

const appendSavedVideoForOutput = (
  library: SavedVideoLibrary,
  input: ProjectOutputCommitInput['savedVideo'],
):
  | { readonly kind: 'ready'; readonly library: SavedVideoLibrary }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'conflict';
      readonly savedVideoId: string;
      readonly expectedVersionId: string;
      readonly actualVersionId: string;
    } => {
  if (input.kind === 'create') {
    const aggregate = storedSavedVideoAggregateSchema.parse(input.aggregate);
    const version = aggregate.versions[0];
    if (
      aggregate.versions.length !== 1 ||
      version === undefined ||
      aggregate.video.ownerUserId !== library.ownerUserId ||
      aggregate.video.currentVersionId !== version.id ||
      aggregate.video.status !== 'ready' ||
      aggregate.video.deletedAt !== null ||
      aggregate.revision !== 1 ||
      version.ownerUserId !== library.ownerUserId ||
      version.videoId !== aggregate.video.id ||
      version.ordinal !== 1 ||
      library.videos.some(({ video }) => video.id === aggregate.video.id) ||
      library.videos.some(({ versions }) => versions.some(({ id }) => id === version.id))
    ) {
      throw new Error('The local Project output Saved Video create is inconsistent.');
    }
    return {
      kind: 'ready',
      library: savedVideoLibrarySchema.parse({
        ...library,
        revision: library.revision + 1,
        videos: [...library.videos, aggregate],
      }),
    };
  }

  const version = storedVideoVersionSchema.parse(input.version);
  const index = library.videos.findIndex(
    ({ video }) => video.id === input.videoId && video.deletedAt === null,
  );
  const current = library.videos[index];
  if (current === undefined) return { kind: 'not-found' };
  if (current.video.currentVersionId !== input.expectedVersionId) {
    return {
      kind: 'conflict',
      savedVideoId: input.videoId,
      expectedVersionId: input.expectedVersionId,
      actualVersionId: current.video.currentVersionId,
    };
  }
  if (
    current.video.ownerUserId !== library.ownerUserId ||
    version.videoId !== input.videoId ||
    version.ownerUserId !== library.ownerUserId ||
    version.ordinal !== current.versions.length + 1 ||
    version.sourceVersionId !== input.expectedVersionId ||
    library.videos.some(({ versions }) => versions.some(({ id }) => id === version.id))
  ) {
    throw new Error('The local Project output Version append is inconsistent.');
  }
  const nextAggregate = storedSavedVideoAggregateSchema.parse(
    appendStoredVideoVersion(current, version),
  );
  const videos = [...library.videos];
  videos[index] = nextAggregate;
  return {
    kind: 'ready',
    library: savedVideoLibrarySchema.parse({
      ...library,
      revision: library.revision + 1,
      videos,
    }),
  };
};

export interface FileProjectRepositoryOptions {
  /** Test seam for proving recovery after a durable journal is prepared. */
  readonly afterJournalPrepared?: () => Promise<void> | void;
  /** Test seams for proving convergence after either metadata file is published. */
  readonly afterSavedVideoCommitted?: () => Promise<void> | void;
  readonly afterProjectCommitted?: () => Promise<void> | void;
  readonly ownerLock?: KeyedLock;
  readonly savedVideos?: FileSavedVideoRepository;
}

export class FileProjectRepository
  implements
    ProjectRepository,
    ProjectRetentionPolicy,
    CampaignRepository,
    ProjectProcessingRepository,
    ProjectOutputMetadataUnitOfWork
{
  readonly #root: string;
  readonly #ownerLock: KeyedLock;
  readonly #savedVideos: FileSavedVideoRepository;
  readonly #afterJournalPrepared: (() => Promise<void> | void) | undefined;
  readonly #afterSavedVideoCommitted: (() => Promise<void> | void) | undefined;
  readonly #afterProjectCommitted: (() => Promise<void> | void) | undefined;

  constructor(dataDirectory: string, options: FileProjectRepositoryOptions = {}) {
    this.#root = path.resolve(dataDirectory, 'metadata', 'v1', 'projects');
    this.#ownerLock = options.ownerLock ?? new KeyedLock();
    this.#savedVideos =
      options.savedVideos ??
      new FileSavedVideoRepository(dataDirectory, { ownerLock: this.#ownerLock });
    this.#afterJournalPrepared = options.afterJournalPrepared;
    this.#afterSavedVideoCommitted = options.afterSavedVideoCommitted;
    this.#afterProjectCommitted = options.afterProjectCommitted;
  }

  #paths(ownerUserId: string): { primary: string; backup: string; journal: string } {
    const segment = createHash('sha256').update(ownerIdSchema.parse(ownerUserId)).digest('hex');
    const primary = path.join(this.#root, `${segment}.json`);
    return { primary, backup: `${primary}.bak`, journal: `${primary}.journal.json` };
  }

  async #atomicWrite(filePath: string, value: unknown): Promise<void> {
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    await chmod(this.#root, 0o700);
    const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
    try {
      const handle = await open(temporaryPath, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async #readParsed(
    filePath: string,
  ): Promise<{ readonly library: ProjectLibrary; readonly migrated: boolean } | null> {
    try {
      return parseLibrary(JSON.parse(await readFile(filePath, 'utf8')) as unknown);
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async #read(ownerUserId: string): Promise<ProjectLibrary> {
    const paths = this.#paths(ownerUserId);
    let rawJournal: unknown;
    try {
      rawJournal = JSON.parse(await readFile(paths.journal, 'utf8')) as unknown;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    if (rawJournal !== undefined) {
      const journal = parseJournal(rawJournal);
      if (journal.ownerUserId !== ownerUserId) throw new Error('Project journal owner mismatch.');
      const recovered = librarySchema.parse(journal.writes.metadata);
      if (journal.writes.savedVideos !== undefined) {
        await this.#savedVideos.writeLibraryForProjectOutput(journal.writes.savedVideos);
      }
      await this.#atomicWrite(paths.primary, recovered);
      await this.#atomicWrite(paths.backup, recovered);
      await rm(paths.journal, { force: true });
      return recovered;
    }

    try {
      const primary = await this.#readParsed(paths.primary);
      if (primary !== null) {
        if (primary.library.ownerUserId !== ownerUserId)
          throw new Error('Project metadata owner mismatch.');
        if (primary.migrated) {
          await this.#atomicWrite(paths.primary, primary.library);
          await this.#atomicWrite(paths.backup, primary.library);
        }
        return primary.library;
      }
    } catch (primaryError) {
      const backup = await this.#readParsed(paths.backup).catch(() => null);
      if (backup === null) throw primaryError;
      if (backup.library.ownerUserId !== ownerUserId) {
        throw new Error('Project backup owner mismatch.', { cause: primaryError });
      }
      await this.#atomicWrite(paths.primary, backup.library);
      if (backup.migrated) await this.#atomicWrite(paths.backup, backup.library);
      return backup.library;
    }
    const backup = await this.#readParsed(paths.backup);
    if (backup !== null) {
      if (backup.library.ownerUserId !== ownerUserId)
        throw new Error('Project backup owner mismatch.');
      await this.#atomicWrite(paths.primary, backup.library);
      if (backup.migrated) await this.#atomicWrite(paths.backup, backup.library);
      return backup.library;
    }
    return emptyLibrary(ownerUserId);
  }

  async #ownerIdsOnDisk(): Promise<readonly string[]> {
    let entries: readonly string[];
    try {
      entries = await readdir(this.#root);
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
    const owners = new Set<string>();
    for (const entry of entries) {
      if (!entry.endsWith('.json') || entry.includes('.tmp-')) continue;
      try {
        const raw = JSON.parse(await readFile(path.join(this.#root, entry), 'utf8')) as unknown;
        if (entry.endsWith('.journal.json')) {
          owners.add(parseJournal(raw).ownerUserId);
        } else if (!entry.endsWith('.bak')) {
          owners.add(parseLibrary(raw).library.ownerUserId);
        }
      } catch {
        // #read owns primary/backup recovery; an unreadable candidate cannot identify an owner.
      }
    }
    return [...owners];
  }

  async #write(
    previous: ProjectLibrary,
    nextValue: ProjectLibrary,
    journal?: ProjectJournal,
  ): Promise<void> {
    const next = librarySchema.parse(nextValue);
    const paths = this.#paths(next.ownerUserId);
    if (journal !== undefined) {
      await this.#atomicWrite(paths.journal, journalSchema.parse(journal));
      await this.#afterJournalPrepared?.();
      if (journal.writes.savedVideos !== undefined) {
        await this.#savedVideos.writeLibraryForProjectOutput(journal.writes.savedVideos);
        await this.#afterSavedVideoCommitted?.();
      }
    }
    await this.#atomicWrite(paths.backup, librarySchema.parse(previous));
    await this.#atomicWrite(paths.primary, next);
    if (journal !== undefined) await this.#afterProjectCommitted?.();
    if (journal !== undefined) await rm(paths.journal, { force: true });
  }

  async #withOwnerLock<Result>(
    ownerUserId: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    ownerIdSchema.parse(ownerUserId);
    return this.#ownerLock.run(ownerUserId, operation);
  }

  async create(aggregateValue: ProjectAggregate): Promise<void> {
    const aggregate = storedAggregateSchema.parse(aggregateValue);
    await this.#withOwnerLock(aggregate.project.ownerUserId, async () => {
      const library = await this.#read(aggregate.project.ownerUserId);
      if (library.projects.some(({ project }) => project.id === aggregate.project.id)) {
        throw new Error('A Project with that identifier already exists.');
      }
      if (
        aggregate.project.campaignId !== null &&
        !library.campaigns.some(
          (campaign) =>
            campaign.id === aggregate.project.campaignId &&
            campaign.status === 'active' &&
            campaign.deletedAt === null,
        )
      ) {
        throw new Error('The target Campaign is unavailable.');
      }
      await this.#write(library, {
        ...library,
        revision: library.revision + 1,
        projects: [...library.projects, aggregate],
      });
    });
  }

  async createIdempotent(input: {
    readonly aggregate: ProjectAggregate;
    readonly receipt: ProjectCreateReceipt;
  }): Promise<ProjectCreatePersistenceResult> {
    const aggregate = storedAggregateSchema.parse(input.aggregate);
    const receipt = createReceiptSchema.parse(input.receipt);
    if (receipt.projectId !== aggregate.project.id) throw new Error('Project receipt mismatch.');
    return this.#withOwnerLock(aggregate.project.ownerUserId, async () => {
      const library = await this.#read(aggregate.project.ownerUserId);
      const prior = library.createReceipts.find(
        ({ operationKey }) => operationKey === receipt.operationKey,
      );
      if (prior !== undefined) {
        if (prior.requestFingerprint !== receipt.requestFingerprint) {
          return {
            kind: 'conflict',
            conflict: { kind: 'operation-key', operation: 'create' },
          };
        }
        const existing = library.projects.find(({ project }) => project.id === prior.projectId);
        if (existing === undefined) throw new Error('Project create receipt has no result.');
        const revision = existing.revisions.find(
          ({ id, revisionNumber }) =>
            id === existing.project.currentRevisionId &&
            revisionNumber === existing.project.currentRevisionNumber,
        );
        if (revision === undefined) throw new Error('Project current revision is unavailable.');
        return { kind: 'replayed', current: { project: existing.project, revision } };
      }
      if (library.projects.some(({ project }) => project.id === aggregate.project.id)) {
        throw new Error('A Project with that identifier already exists.');
      }
      if (
        aggregate.project.campaignId !== null &&
        !library.campaigns.some(
          (campaign) =>
            campaign.id === aggregate.project.campaignId &&
            campaign.status === 'active' &&
            campaign.deletedAt === null,
        )
      ) {
        return {
          kind: 'conflict',
          conflict: { kind: 'campaign-membership', projectId: aggregate.project.id },
        };
      }
      const next = librarySchema.parse({
        ...library,
        revision: library.revision + 1,
        projects: [...library.projects, aggregate],
        createReceipts: [...library.createReceipts, receipt],
      });
      await this.#write(library, next, {
        schemaVersion: 6,
        ownerUserId: aggregate.project.ownerUserId,
        transactionId: randomUUID(),
        state: 'prepared',
        operation: {
          kind: 'project-create',
          operationKey: receipt.operationKey,
          requestFingerprint: receipt.requestFingerprint,
          projectId: receipt.projectId,
        },
        preparedAt: receipt.createdAt,
        writes: { metadata: next },
      });
      return {
        kind: 'created',
        current: { project: aggregate.project, revision: aggregate.revisions[0]! },
      };
    });
  }

  async getCurrent(ownerUserId: string, projectId: string): Promise<ProjectCurrentRead | null> {
    const aggregate = (await this.#read(ownerUserId)).projects.find(
      ({ project }) => project.id === projectId && project.deletedAt === null,
    );
    return aggregate === undefined ? null : currentRead(aggregate);
  }

  async getCurrentWithSource(
    ownerUserId: string,
    projectId: string,
  ): Promise<ProjectCurrentSourceRead | null> {
    const aggregate = (await this.#read(ownerUserId)).projects.find(
      ({ project }) => project.id === projectId && project.deletedAt === null,
    );
    if (aggregate === undefined) return null;
    return {
      current: currentRead(aggregate),
      source: aggregate.source ?? null,
    };
  }

  async getSource(ownerUserId: string, projectId: string): Promise<ProjectSourceRecord | null> {
    const aggregate = (await this.#read(ownerUserId)).projects.find(
      ({ project }) => project.id === projectId && project.deletedAt === null,
    );
    return aggregate?.source ?? null;
  }

  async getWorkingMedia(
    ownerUserId: string,
    projectId: string,
    revisionId?: string,
  ): Promise<ProjectWorkingMediaRead | null> {
    const aggregate = (await this.#read(ownerUserId)).projects.find(
      ({ project }) => project.id === projectId && project.deletedAt === null,
    );
    if (aggregate === undefined) return null;
    const revision = currentRead(aggregate).revision;
    const media =
      revisionId === undefined
        ? aggregate.workingMediaAdoptions.findLast(
            ({ mediaReference }) =>
              projectMediaReferencesEqual(mediaReference, revision.snapshot.workingMedia) &&
              projectMediaReferencesEqual(mediaReference, revision.snapshot.presentedMedia),
          )
        : aggregate.workingMediaAdoptions.find(
            ({ adoptedRevisionId }) => adoptedRevisionId === revisionId,
          );
    return media === undefined ? null : { project: aggregate.project, revision, media };
  }

  async getWorkingMediaByOperationKey(
    ownerUserId: string,
    operationKey: string,
  ): Promise<ProjectWorkingMediaRead | null> {
    const match = workingMediaForOperation(await this.#read(ownerUserId), operationKey);
    if (match === null || match.aggregate.project.deletedAt !== null) return null;
    return {
      project: match.aggregate.project,
      revision: currentRead(match.aggregate).revision,
      media: match.media,
    };
  }

  async admitProjectAttempt(input: {
    readonly attempt: ProjectProcessingAttemptRecord;
    readonly link: ProjectJobLink;
    readonly expectedVersion: number;
    readonly expectedRevisionNumber: number;
  }): Promise<ProjectProcessingAdmissionResult> {
    const attempt = storedProjectProcessingAttemptSchema.parse(
      input.attempt,
    ) as ProjectProcessingAttemptRecord;
    const link = storedJobLinkSchema.parse(input.link) as ProjectJobLink;
    return this.#withOwnerLock(attempt.ownerUserId, async () => {
      const library = await this.#read(attempt.ownerUserId);
      const prior = attemptForOperation(library, attempt.operationId);
      if (prior !== null) {
        return prior.projectId === attempt.projectId &&
          prior.requestFingerprint === attempt.requestFingerprint
          ? { kind: 'replayed', attempt: prior }
          : { kind: 'conflict', conflict: { kind: 'operation-key' } };
      }
      const index = library.projects.findIndex(
        ({ project }) => project.id === attempt.projectId && project.deletedAt === null,
      );
      const aggregate = library.projects[index];
      if (aggregate === undefined) return { kind: 'not-found' };
      if (aggregate.project.version !== input.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'project-version',
            projectId: attempt.projectId,
            expectedVersion: input.expectedVersion,
            actualVersion: aggregate.project.version,
          },
        };
      }
      if (aggregate.project.currentRevisionNumber !== input.expectedRevisionNumber) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'revision',
            projectId: attempt.projectId,
            expectedRevisionNumber: input.expectedRevisionNumber,
            actualRevisionNumber: aggregate.project.currentRevisionNumber,
          },
        };
      }
      if (
        aggregate.project.archivedAt !== null ||
        link.projectId !== attempt.projectId ||
        link.ownerUserId !== attempt.ownerUserId ||
        link.jobId !== attempt.operationId ||
        link.initiatingRevisionId !== aggregate.project.currentRevisionId ||
        link.initiatingRevisionNumber !== aggregate.project.currentRevisionNumber ||
        attempt.initiatingRevisionId !== link.initiatingRevisionId ||
        attempt.initiatingRevisionNumber !== link.initiatingRevisionNumber
      ) {
        return { kind: 'not-found' };
      }
      const currentRevision = currentRead(aggregate).revision;
      const working = aggregate.workingMediaAdoptions.findLast(
        ({ mediaReference }) =>
          projectMediaReferencesEqual(mediaReference, currentRevision.snapshot.workingMedia) &&
          projectMediaReferencesEqual(mediaReference, currentRevision.snapshot.presentedMedia),
      );
      const sourceReference =
        aggregate.source === null
          ? null
          : aggregate.source.kind === 'saved-video-version'
            ? {
                kind: 'saved-video-version' as const,
                savedVideoId: aggregate.source.savedVideoId!,
                videoVersionId: aggregate.source.videoVersionId!,
              }
            : { kind: 'asset' as const, assetId: aggregate.source.assetId };
      const exactInputAssetId =
        working?.assetId ??
        (projectMediaReferencesEqual(sourceReference, currentRevision.snapshot.workingMedia)
          ? aggregate.source?.assetId
          : undefined);
      if (exactInputAssetId !== attempt.inputAssetId) return { kind: 'not-found' };

      if (attempt.retryOfOperationId !== null) {
        const previous = attemptForOperation(library, attempt.retryOfOperationId);
        if (
          previous === null ||
          previous.projectId !== attempt.projectId ||
          !['ambiguous', 'failed', 'expired', 'cancelled'].includes(previous.status) ||
          attempt.attemptNumber !== previous.attemptNumber + 1
        ) {
          return { kind: 'conflict', conflict: { kind: 'retry-mismatch' } };
        }
      } else if (attempt.attemptNumber !== 1) {
        return { kind: 'conflict', conflict: { kind: 'retry-mismatch' } };
      }
      const activeOwnerAttempt = library.processingJobs.find(
        (candidate) =>
          candidate.ownerUserId === attempt.ownerUserId &&
          candidate.status !== 'ambiguous' &&
          projectProcessingBlocksArchive(candidate.status),
      );
      if (
        activeOwnerAttempt !== undefined &&
        !(
          attempt.retryOfOperationId === activeOwnerAttempt.operationId &&
          ['ambiguous', 'failed', 'expired', 'cancelled'].includes(activeOwnerAttempt.status)
        )
      ) {
        return {
          kind: 'conflict',
          conflict: { kind: 'active-attempt', operationId: activeOwnerAttempt.operationId },
        };
      }

      const nextAggregate = storedAggregateSchema.parse({
        ...aggregate,
        project: {
          ...aggregate.project,
          status: 'processing',
          version: aggregate.project.version + 1,
          updatedAt: attempt.createdAt,
        },
        jobLinks: [...aggregate.jobLinks, link],
      });
      const projects = [...library.projects];
      projects[index] = nextAggregate;
      const next = librarySchema.parse({
        ...library,
        revision: library.revision + 1,
        projects,
        processingJobs: [...library.processingJobs, attempt],
      });
      await this.#write(library, next, {
        schemaVersion: 6,
        ownerUserId: attempt.ownerUserId,
        transactionId: randomUUID(),
        state: 'prepared',
        operation: {
          kind: 'project-processing-admit',
          operationId: attempt.operationId,
          requestFingerprint: attempt.requestFingerprint,
          projectId: attempt.projectId,
        },
        preparedAt: attempt.createdAt,
        writes: { metadata: next },
      });
      return { kind: 'admitted', attempt };
    });
  }

  async getProjectAttempt(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectProcessingAttemptRecord | null> {
    const library = await this.#read(ownerUserId);
    const attempt = attemptForOperation(library, operationId);
    if (attempt?.projectId !== projectId) return null;
    const project = library.projects.find(
      ({ project: candidate }) => candidate.id === projectId && candidate.deletedAt === null,
    );
    return project === undefined ? null : attempt;
  }

  async getCurrentProjectAttempt(
    ownerUserId: string,
    projectId: string,
  ): Promise<ProjectProcessingAttemptRecord | null> {
    const library = await this.#read(ownerUserId);
    const aggregate = library.projects.find(
      ({ project }) => project.id === projectId && project.deletedAt === null,
    );
    return aggregate === undefined
      ? null
      : currentAttemptForAggregate(
          aggregate,
          attemptsForProject(library.processingJobs, projectId),
        );
  }

  async hasProjectAttemptRetry(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<boolean> {
    const library = await this.#read(ownerUserId);
    return library.processingJobs.some(
      (attempt) => attempt.projectId === projectId && attempt.retryOfOperationId === operationId,
    );
  }

  async listProjectAttempts(
    ownerUserId: string,
    projectId: string,
    input: {
      readonly cursor?: { readonly createdAt: string; readonly operationId: string };
      readonly pageSize: number;
    },
  ): Promise<ProjectProcessingHistoryPage | null> {
    const library = await this.#read(ownerUserId);
    const aggregate = library.projects.find(
      ({ project }) => project.id === projectId && project.deletedAt === null,
    );
    if (aggregate === undefined) return null;
    const projectAttempts = library.processingJobs.filter(
      (attempt) => attempt.projectId === projectId,
    );
    const attempts = projectAttempts
      .filter(
        (attempt) =>
          input.cursor === undefined ||
          attempt.createdAt < input.cursor.createdAt ||
          (attempt.createdAt === input.cursor.createdAt &&
            attempt.operationId < input.cursor.operationId),
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.operationId.localeCompare(left.operationId),
      );
    const page = attempts.slice(0, input.pageSize) as ProjectProcessingAttemptRecord[];
    const last = page.at(-1);
    const ambiguousOperationIds = new Set(
      page.filter(({ status }) => status === 'ambiguous').map(({ operationId }) => operationId),
    );
    return {
      attempts: page,
      currentOperationId:
        currentAttemptForAggregate(aggregate, projectAttempts)?.operationId ?? null,
      retriedOperationIds: [
        ...new Set(
          projectAttempts.flatMap(({ retryOfOperationId }) =>
            retryOfOperationId !== null && ambiguousOperationIds.has(retryOfOperationId)
              ? [retryOfOperationId]
              : [],
          ),
        ),
      ],
      nextCursor:
        attempts.length > input.pageSize && last !== undefined
          ? { createdAt: last.createdAt, operationId: last.operationId }
          : null,
    };
  }

  async updateProjectAttemptTrace(trace: VideoProcessingJobTrace): Promise<boolean> {
    return this.#withOwnerLock(trace.ownerUserId, async () => {
      const library = await this.#read(trace.ownerUserId);
      const attemptIndex = library.processingJobs.findIndex(
        ({ operationId }) => operationId === trace.jobId,
      );
      const current = library.processingJobs[attemptIndex] as
        ProjectProcessingAttemptRecord | undefined;
      if (current === undefined) return false;
      if (!projectProcessingAttemptMatchesTrace(current, trace)) {
        throw new Error('Project processing trace changed immutable operation identity.');
      }
      const acceptedAt =
        current.acceptedAt ?? (trace.providerJobId === null ? null : trace.updatedAt);
      const nextAttempt = storedProjectProcessingAttemptSchema.parse({
        ...current,
        providerJobId: trace.providerJobId,
        providerOutputLocation: trace.providerOutputLocation,
        sourceDurationMs: trace.sourceDurationMs ?? current.sourceDurationMs,
        sourceOrientation: trace.sourceOrientation ?? current.sourceOrientation,
        status: trace.status,
        safeErrorCode: trace.safeErrorCode,
        updatedAt: trace.updatedAt,
        acceptedAt,
        completedAt: trace.completedAt,
      });
      const processingJobs = [...library.processingJobs];
      processingJobs[attemptIndex] = nextAttempt;
      const projects = [...library.projects];
      const projectIndex = projects.findIndex(
        ({ project }) => project.id === current.projectId && project.deletedAt === null,
      );
      const aggregate = projects[projectIndex];
      if (aggregate !== undefined) {
        const latest = currentAttemptForAggregate(
          aggregate,
          attemptsForProject(processingJobs, aggregate.project.id),
        );
        if (latest?.operationId === current.operationId) {
          const nextStatus =
            trace.status === 'cancelled'
              ? 'ready'
              : ['ambiguous', 'failed', 'expired'].includes(trace.status)
                ? 'needs-attention'
                : aggregate.project.status;
          if (nextStatus !== aggregate.project.status) {
            projects[projectIndex] = storedAggregateSchema.parse({
              ...aggregate,
              project: {
                ...aggregate.project,
                status: nextStatus,
                version: aggregate.project.version + 1,
                updatedAt: trace.updatedAt,
              },
            });
          }
        }
      }
      await this.#write(library, {
        ...library,
        revision: library.revision + 1,
        projects,
        processingJobs,
      });
      return true;
    });
  }

  async listResumableProjectAttempts(now: string): Promise<readonly ResumableVideoProcessingJob[]> {
    const result: ResumableVideoProcessingJob[] = [];
    for (const ownerUserId of await this.#ownerIdsOnDisk()) {
      await this.#withOwnerLock(ownerUserId, async () => {
        const library = await this.#read(ownerUserId);
        let changed = false;
        const processingJobs = library.processingJobs.map((attempt) => {
          const transition = projectProcessingRestartTransition(attempt, now);
          if (transition === null) return attempt;
          changed = true;
          return storedProjectProcessingAttemptSchema.parse({
            ...attempt,
            ...transition,
            updatedAt: now,
          });
        });
        const attemptsByProject = new Map<string, ProjectProcessingAttemptRecord[]>();
        for (const attempt of processingJobs) {
          const attempts = attemptsByProject.get(attempt.projectId);
          if (attempts === undefined) attemptsByProject.set(attempt.projectId, [attempt]);
          else attempts.push(attempt);
        }
        const projects = library.projects.map((aggregate) => {
          const currentAttempt = currentAttemptForAggregate(
            aggregate,
            attemptsByProject.get(aggregate.project.id) ?? [],
          );
          if (
            currentAttempt === null ||
            !projectProcessingNeedsAttention(currentAttempt.status) ||
            aggregate.project.status === 'needs-attention'
          ) {
            return aggregate;
          }
          return storedAggregateSchema.parse({
            ...aggregate,
            project: {
              ...aggregate.project,
              status: 'needs-attention',
              version: aggregate.project.version + 1,
              updatedAt: now,
            },
          });
        });
        if (changed) {
          await this.#write(library, {
            ...library,
            revision: library.revision + 1,
            projects,
            processingJobs,
          });
        }
        for (const attempt of processingJobs) {
          const resumable = resumableProjectProcessingAttempt(attempt, now);
          if (resumable !== null) result.push(resumable);
        }
      });
    }
    return result;
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
    return this.#withOwnerLock(input.ownerUserId, async () => {
      const library = await this.#read(input.ownerUserId);
      const attemptIndex = library.processingJobs.findIndex(
        ({ operationId }) => operationId === input.operationId,
      );
      const attempt = library.processingJobs[attemptIndex] as
        ProjectProcessingAttemptRecord | undefined;
      if (attempt === undefined || attempt.projectId !== input.projectId) {
        return { kind: 'not-found' };
      }
      if (!projectProcessingResultInputMatchesAttempt(input, attempt)) {
        return { kind: 'conflict' };
      }

      const projectIndex = library.projects.findIndex(
        ({ project }) => project.id === input.projectId && project.deletedAt === null,
      );
      const aggregate = library.projects[projectIndex];
      if (aggregate === undefined) return { kind: 'not-found' };
      if (attempt.outputAssetId !== null) {
        if (!retainedProjectProcessingResultMatches(attempt, input.manifest, input.inspected)) {
          return { kind: 'conflict' };
        }
        if (attempt.resultRevisionId === null) {
          return { kind: 'replayed-historical', attempt };
        }
        const media = aggregate.workingMediaAdoptions.find(
          ({ operationKey }) => operationKey === attempt.operationId,
        );
        const revision = aggregate.revisions.find(({ id }) => id === attempt.resultRevisionId);
        if (media === undefined || revision === undefined) return { kind: 'conflict' };
        return {
          kind: 'replayed-current',
          attempt,
          workingMedia: { project: aggregate.project, revision, media },
        };
      }

      const currentAttempt = currentAttemptForAggregate(
        aggregate,
        attemptsForProject(library.processingJobs, input.projectId),
      );
      const promotion = input.currentPromotion;
      const promoteCurrent =
        promotion !== null &&
        aggregate.project.version === promotion.expectedVersion &&
        aggregate.project.currentRevisionNumber === promotion.expectedRevisionNumber &&
        aggregate.project.currentRevisionId === attempt.initiatingRevisionId &&
        aggregate.project.currentRevisionNumber === attempt.initiatingRevisionNumber &&
        currentAttempt?.operationId === promotion.expectedCurrentOperationId &&
        promotion.expectedCurrentOperationId === attempt.operationId;

      const existingJobOutput = aggregate.assetLinks.find(
        (link) =>
          link.assetId === input.jobOutputLink.assetId &&
          link.role === 'job-output' &&
          link.revisionId === input.jobOutputLink.revisionId,
      );
      if (
        existingJobOutput !== undefined &&
        JSON.stringify(existingJobOutput) !== JSON.stringify(input.jobOutputLink)
      ) {
        return { kind: 'conflict' };
      }
      let nextAggregate: StoredProjectAggregate;
      let workingMedia: ProjectWorkingMediaRead | null = null;
      let nextAttempt: ProjectProcessingAttemptRecord;
      if (promoteCurrent) {
        const revisionInput = promotion.revision;
        const media = storedProjectWorkingMediaSchema.parse(
          promotion.media,
        ) as ProjectWorkingMediaRecord;
        if (
          revisionInput.ownerUserId !== input.ownerUserId ||
          revisionInput.projectId !== input.projectId ||
          revisionInput.expectedVersion !== promotion.expectedVersion ||
          revisionInput.expectedRevisionNumber !== promotion.expectedRevisionNumber ||
          revisionInput.nextProject.version !== aggregate.project.version + 1 ||
          revisionInput.revision.source !== 'job-result' ||
          media.operationKey !== attempt.operationId ||
          media.assetId !== attempt.resultAssetId ||
          media.adoptedRevisionId !== revisionInput.revision.id ||
          media.adoptedRevisionNumber !== revisionInput.revision.revisionNumber
        ) {
          return { kind: 'conflict' };
        }
        nextAggregate = storedAggregateSchema.parse({
          ...aggregate,
          project: revisionInput.nextProject,
          revisions: [...aggregate.revisions, revisionInput.revision],
          assetLinks: [
            ...aggregate.assetLinks,
            ...(existingJobOutput === undefined ? [input.jobOutputLink] : []),
            ...revisionInput.assetLinks,
          ],
          versionReferenceLinks: [
            ...aggregate.versionReferenceLinks,
            ...projectVersionReferenceLinksForRevision(revisionInput.revision),
          ],
          workingMediaAdoptions: [...aggregate.workingMediaAdoptions, media],
        });
        nextAttempt = storedProjectProcessingAttemptSchema.parse({
          ...attempt,
          outputAssetId: attempt.resultAssetId,
          result: input.inspected,
          resultRevisionId: revisionInput.revision.id,
          resultRevisionNumber: revisionInput.revision.revisionNumber,
          status: 'ready',
          safeErrorCode: null,
          updatedAt: input.retainedAt,
          completedAt: input.retainedAt,
        });
        workingMedia = {
          project: revisionInput.nextProject,
          revision: revisionInput.revision,
          media,
        };
      } else {
        nextAggregate = storedAggregateSchema.parse({
          ...aggregate,
          assetLinks: [
            ...aggregate.assetLinks,
            ...(existingJobOutput === undefined ? [input.jobOutputLink] : []),
          ],
        });
        nextAttempt = storedProjectProcessingAttemptSchema.parse({
          ...attempt,
          outputAssetId: attempt.resultAssetId,
          result: input.inspected,
          status: 'ready',
          safeErrorCode: null,
          updatedAt: input.retainedAt,
          completedAt: input.retainedAt,
        });
      }

      const projects = [...library.projects];
      projects[projectIndex] = nextAggregate;
      const processingJobs = [...library.processingJobs];
      processingJobs[attemptIndex] = nextAttempt;
      const next = librarySchema.parse({
        ...library,
        revision: library.revision + 1,
        projects,
        processingJobs,
      });
      await this.#write(library, next, {
        schemaVersion: 6,
        ownerUserId: input.ownerUserId,
        transactionId: randomUUID(),
        state: 'prepared',
        operation: {
          kind: 'project-processing-result',
          operationId: input.operationId,
          projectId: input.projectId,
          assetId: input.manifest.assetId,
        },
        preparedAt: input.retainedAt,
        writes: { metadata: next },
      });
      return workingMedia === null
        ? { kind: 'retained-historical', attempt: nextAttempt }
        : { kind: 'retained-current', attempt: nextAttempt, workingMedia };
    });
  }

  async list(ownerUserId: string, input: ProjectSummaryPageInput): Promise<ProjectSummaryPage> {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 40) {
      throw new Error('Use a bounded Project summary page.');
    }
    const projects = (await this.#read(ownerUserId)).projects
      .map(({ project }) => project)
      .filter((project) => {
        const matchesLifecycle =
          project.deletedAt === null &&
          (input.lifecycle === 'archived'
            ? project.status === 'archived'
            : project.status !== 'archived');
        const matchesCampaign =
          input.campaignId === undefined
            ? true
            : input.campaignId === 'none'
              ? project.campaignId === null
              : project.campaignId === input.campaignId;
        const followsCursor =
          input.cursor === undefined ||
          project.updatedAt < input.cursor.updatedAt ||
          (project.updatedAt === input.cursor.updatedAt && project.id < input.cursor.projectId);
        return matchesLifecycle && matchesCampaign && followsCursor;
      })
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
      );
    const page = projects.slice(0, input.pageSize);
    const last = page.at(-1);
    return {
      projects: page,
      nextCursor:
        projects.length > input.pageSize && last !== undefined
          ? { updatedAt: last.updatedAt, projectId: last.id }
          : null,
    };
  }

  async listRevisionHistory(
    ownerUserId: string,
    projectId: string,
    input: { readonly beforeRevisionNumber?: number; readonly pageSize: number },
  ): Promise<ProjectRevisionHistoryPage | null> {
    const aggregate = (await this.#read(ownerUserId)).projects.find(
      ({ project }) => project.id === projectId && project.deletedAt === null,
    );
    if (aggregate === undefined) return null;
    const revisions = aggregate.revisions
      .filter((revision) =>
        input.beforeRevisionNumber === undefined
          ? true
          : revision.revisionNumber < input.beforeRevisionNumber,
      )
      .sort((left, right) => right.revisionNumber - left.revisionNumber);
    const page = revisions.slice(0, input.pageSize);
    return {
      revisions: page,
      nextRevisionNumber:
        revisions.length > input.pageSize ? (page.at(-1)?.revisionNumber ?? null) : null,
    };
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
    const aggregate = (await this.#read(ownerUserId)).projects.find(
      ({ project }) => project.id === projectId && project.deletedAt === null,
    );
    if (aggregate === undefined) return null;
    let keyed: Array<{
      readonly link: ProjectLinkHistoryItem;
      readonly revisionNumber: number;
      readonly key: string;
    }>;
    switch (input.kind) {
      case 'asset':
        keyed = aggregate.assetLinks.map((link) => ({
          link,
          revisionNumber: link.revisionNumber,
          key: `${link.assetId}:${link.role}`,
        }));
        break;
      case 'version-reference':
        keyed = aggregate.versionReferenceLinks.map((link) => ({
          link,
          revisionNumber: link.revisionNumber,
          key: `${link.videoVersionId}:${link.role}`,
        }));
        break;
      case 'job':
        keyed = aggregate.jobLinks.map((link) => ({
          link,
          revisionNumber: link.initiatingRevisionNumber,
          key: link.jobId,
        }));
        break;
      case 'output':
        keyed = aggregate.outputLinks.map((link) => ({
          link,
          revisionNumber: link.producingRevisionNumber,
          key: link.videoVersionId,
        }));
        break;
    }
    keyed = keyed
      .filter((item) =>
        input.cursor === undefined
          ? true
          : item.revisionNumber < input.cursor.revisionNumber ||
            (item.revisionNumber === input.cursor.revisionNumber && item.key < input.cursor.key),
      )
      .sort(
        (left, right) =>
          right.revisionNumber - left.revisionNumber || right.key.localeCompare(left.key),
      );
    const page = keyed.slice(0, input.pageSize);
    const last = page.at(-1);
    return {
      links: page.map(({ link }) => link),
      nextCursor:
        keyed.length > input.pageSize && last !== undefined
          ? { revisionNumber: last.revisionNumber, key: last.key }
          : null,
    };
  }

  async appendRevision(
    input: AppendProjectRevisionPersistenceInput,
  ): Promise<ProjectPersistenceMutationResult> {
    return this.#withOwnerLock(input.ownerUserId, async () => {
      const library = await this.#read(input.ownerUserId);
      const index = library.projects.findIndex(({ project }) => project.id === input.projectId);
      const aggregate = library.projects[index];
      if (aggregate === undefined || aggregate.project.deletedAt !== null)
        return { kind: 'not-found' };
      if (aggregate.project.version !== input.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'project-version',
            projectId: input.projectId,
            expectedVersion: input.expectedVersion,
            actualVersion: aggregate.project.version,
          },
        };
      }
      if (aggregate.project.currentRevisionNumber !== input.expectedRevisionNumber) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'revision',
            projectId: input.projectId,
            expectedRevisionNumber: input.expectedRevisionNumber,
            actualRevisionNumber: aggregate.project.currentRevisionNumber,
          },
        };
      }
      const nextAggregate = storedAggregateSchema.parse({
        ...aggregate,
        project: input.nextProject,
        revisions: [...aggregate.revisions, input.revision],
        assetLinks: [...aggregate.assetLinks, ...input.assetLinks],
        versionReferenceLinks: [
          ...aggregate.versionReferenceLinks,
          ...projectVersionReferenceLinksForRevision(input.revision),
        ],
      });
      const projects = [...library.projects];
      projects[index] = nextAggregate;
      await this.#write(library, { ...library, revision: library.revision + 1, projects });
      return { kind: 'updated' };
    });
  }

  async acceptSource(
    input: AcceptProjectSourcePersistenceInput,
  ): Promise<ProjectSourceAcceptanceResult> {
    const source = storedProjectSourceSchema.parse(input.source) as ProjectSourceRecord;
    return this.#withOwnerLock(input.ownerUserId, async () => {
      const library = await this.#read(input.ownerUserId);
      const prior = library.projects.find(
        (aggregate) => aggregate.source?.operationKey === source.operationKey,
      );
      if (prior?.source !== undefined && prior.source !== null) {
        if (
          prior.source.projectId !== input.projectId ||
          prior.source.requestFingerprint !== source.requestFingerprint
        ) {
          return {
            kind: 'conflict',
            conflict: { kind: 'operation-key', operation: 'source-accept' },
          };
        }
        const revision = prior.revisions.find(
          ({ id, revisionNumber }) =>
            id === prior.project.currentRevisionId &&
            revisionNumber === prior.project.currentRevisionNumber,
        );
        if (revision === undefined)
          throw new Error('Project source receipt has no current result.');
        return {
          kind: 'replayed',
          current: { project: prior.project, revision },
          source: prior.source,
        };
      }

      const index = library.projects.findIndex(({ project }) => project.id === input.projectId);
      const aggregate = library.projects[index];
      if (aggregate === undefined || aggregate.project.deletedAt !== null) {
        return { kind: 'not-found' };
      }
      if (
        aggregate.source !== null ||
        aggregate.revisions.some(({ snapshot }) => snapshot.sourceAssetId !== null)
      ) {
        return {
          kind: 'conflict',
          conflict: { kind: 'immutable-source', projectId: input.projectId },
        };
      }
      if (aggregate.project.version !== input.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'project-version',
            projectId: input.projectId,
            expectedVersion: input.expectedVersion,
            actualVersion: aggregate.project.version,
          },
        };
      }
      if (aggregate.project.currentRevisionNumber !== input.expectedRevisionNumber) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'revision',
            projectId: input.projectId,
            expectedRevisionNumber: input.expectedRevisionNumber,
            actualRevisionNumber: aggregate.project.currentRevisionNumber,
          },
        };
      }
      const validSource =
        source.projectId === input.projectId &&
        source.ownerUserId === input.ownerUserId &&
        source.assetId === input.revision.snapshot.sourceAssetId &&
        source.acceptedRevisionId === input.revision.id &&
        source.acceptedRevisionNumber === input.revision.revisionNumber;
      if (!validSource) throw new Error('Project source acceptance record is inconsistent.');

      const nextAggregate = storedAggregateSchema.parse({
        ...aggregate,
        project: input.nextProject,
        revisions: [...aggregate.revisions, input.revision],
        assetLinks: [...aggregate.assetLinks, ...input.assetLinks],
        versionReferenceLinks: [
          ...aggregate.versionReferenceLinks,
          ...projectVersionReferenceLinksForRevision(input.revision),
        ],
        source,
      });
      const projects = [...library.projects];
      projects[index] = nextAggregate;
      const next = librarySchema.parse({
        ...library,
        revision: library.revision + 1,
        projects,
      });
      await this.#write(library, next, {
        schemaVersion: 6,
        ownerUserId: input.ownerUserId,
        transactionId: randomUUID(),
        state: 'prepared',
        operation: {
          kind: 'project-source-accept',
          operationKey: source.operationKey,
          requestFingerprint: source.requestFingerprint,
          projectId: input.projectId,
        },
        preparedAt: source.acceptedAt,
        writes: { metadata: next },
      });
      return {
        kind: 'accepted',
        current: { project: input.nextProject, revision: input.revision },
        source,
      };
    });
  }

  async adoptWorkingMedia(
    input: AdoptProjectWorkingMediaPersistenceInput,
  ): Promise<ProjectWorkingMediaAdoptionResult> {
    const media = storedProjectWorkingMediaSchema.parse(input.media) as ProjectWorkingMediaRecord;
    return this.#withOwnerLock(input.ownerUserId, async () => {
      const library = await this.#read(input.ownerUserId);
      const prior = workingMediaForOperation(library, media.operationKey);
      if (prior !== null) {
        if (
          prior.media.projectId !== input.projectId ||
          prior.media.requestFingerprint !== media.requestFingerprint
        ) {
          return {
            kind: 'conflict',
            conflict: { kind: 'operation-key', operation: 'working-media-adopt' },
          };
        }
        const revision = currentRead(prior.aggregate).revision;
        return {
          kind: 'replayed',
          value: { project: prior.aggregate.project, revision, media: prior.media },
        };
      }

      const index = library.projects.findIndex(({ project }) => project.id === input.projectId);
      const aggregate = library.projects[index];
      if (aggregate === undefined || aggregate.project.deletedAt !== null) {
        return { kind: 'not-found' };
      }
      if (aggregate.project.version !== input.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'project-version',
            projectId: input.projectId,
            expectedVersion: input.expectedVersion,
            actualVersion: aggregate.project.version,
          },
        };
      }
      if (aggregate.project.currentRevisionNumber !== input.expectedRevisionNumber) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'revision',
            projectId: input.projectId,
            expectedRevisionNumber: input.expectedRevisionNumber,
            actualRevisionNumber: aggregate.project.currentRevisionNumber,
          },
        };
      }
      const validMedia =
        media.projectId === input.projectId &&
        media.ownerUserId === input.ownerUserId &&
        media.adoptedRevisionId === input.revision.id &&
        media.adoptedRevisionNumber === input.revision.revisionNumber &&
        projectMediaReferencesEqual(media.mediaReference, input.revision.snapshot.workingMedia) &&
        projectMediaReferencesEqual(media.mediaReference, input.revision.snapshot.presentedMedia);
      if (!validMedia) throw new Error('Project working-media adoption is inconsistent.');

      const nextAggregate = storedAggregateSchema.parse({
        ...aggregate,
        project: input.nextProject,
        revisions: [...aggregate.revisions, input.revision],
        assetLinks: [...aggregate.assetLinks, ...input.assetLinks],
        versionReferenceLinks: [
          ...aggregate.versionReferenceLinks,
          ...projectVersionReferenceLinksForRevision(input.revision),
        ],
        workingMediaAdoptions: [...aggregate.workingMediaAdoptions, media],
      });
      const projects = [...library.projects];
      projects[index] = nextAggregate;
      const next = librarySchema.parse({
        ...library,
        revision: library.revision + 1,
        projects,
      });
      await this.#write(library, next, {
        schemaVersion: 6,
        ownerUserId: input.ownerUserId,
        transactionId: randomUUID(),
        state: 'prepared',
        operation: {
          kind: 'project-working-media-adopt',
          operationKey: media.operationKey,
          requestFingerprint: media.requestFingerprint,
          projectId: input.projectId,
          revisionId: input.revision.id,
        },
        preparedAt: media.adoptedAt,
        writes: { metadata: next },
      });
      return {
        kind: 'adopted',
        value: { project: input.nextProject, revision: input.revision, media },
      };
    });
  }

  async updateMetadata(
    ownerUserId: string,
    expectedVersion: number,
    nextProject: Project,
  ): Promise<ProjectPersistenceMutationResult> {
    return this.#withOwnerLock(ownerUserId, async () => {
      const library = await this.#read(ownerUserId);
      const index = library.projects.findIndex(({ project }) => project.id === nextProject.id);
      const aggregate = library.projects[index];
      if (aggregate === undefined) return { kind: 'not-found' };
      if (aggregate.project.version !== expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'project-version',
            projectId: nextProject.id,
            expectedVersion,
            actualVersion: aggregate.project.version,
          },
        };
      }
      if (
        aggregate.project.ownerUserId !== nextProject.ownerUserId ||
        aggregate.project.campaignId !== nextProject.campaignId ||
        aggregate.project.currentRevisionId !== nextProject.currentRevisionId ||
        aggregate.project.currentRevisionNumber !== nextProject.currentRevisionNumber ||
        nextProject.version !== expectedVersion + 1
      ) {
        throw new Error('A Project metadata update changed immutable identity.');
      }
      if (
        aggregate.project.archivedAt === null &&
        nextProject.archivedAt !== null &&
        (aggregate.project.status === 'processing' ||
          library.processingJobs.some(
            (attempt) =>
              attempt.projectId === aggregate.project.id &&
              projectProcessingBlocksArchive(attempt.status) &&
              !(
                attempt.status === 'ambiguous' &&
                library.processingJobs.some(
                  (candidate) => candidate.retryOfOperationId === attempt.operationId,
                )
              ),
          ))
      ) {
        return {
          kind: 'conflict',
          conflict: { kind: 'active-jobs', projectId: nextProject.id },
        };
      }
      const projects = [...library.projects];
      projects[index] = storedAggregateSchema.parse({ ...aggregate, project: nextProject });
      await this.#write(library, { ...library, revision: library.revision + 1, projects });
      return { kind: 'updated' };
    });
  }

  async updateCampaignMembership(
    ownerUserId: string,
    expectedVersion: number,
    nextProject: Project,
  ): Promise<ProjectPersistenceMutationResult> {
    return this.#withOwnerLock(ownerUserId, async () => {
      const library = await this.#read(ownerUserId);
      const index = library.projects.findIndex(({ project }) => project.id === nextProject.id);
      const aggregate = library.projects[index];
      if (aggregate === undefined || aggregate.project.deletedAt !== null) {
        return { kind: 'not-found' };
      }
      if (aggregate.project.version !== expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'project-version',
            projectId: nextProject.id,
            expectedVersion,
            actualVersion: aggregate.project.version,
          },
        };
      }
      if (
        aggregate.project.ownerUserId !== nextProject.ownerUserId ||
        aggregate.project.currentRevisionId !== nextProject.currentRevisionId ||
        aggregate.project.currentRevisionNumber !== nextProject.currentRevisionNumber ||
        aggregate.project.title !== nextProject.title ||
        aggregate.project.status !== nextProject.status ||
        aggregate.project.archivedAt !== nextProject.archivedAt ||
        aggregate.project.deletedAt !== nextProject.deletedAt ||
        nextProject.version !== expectedVersion + 1
      ) {
        throw new Error('A Project Campaign update changed unrelated metadata.');
      }
      if (
        nextProject.campaignId !== null &&
        !library.campaigns.some(
          (campaign) =>
            campaign.id === nextProject.campaignId &&
            campaign.status === 'active' &&
            campaign.deletedAt === null,
        )
      ) {
        return {
          kind: 'conflict',
          conflict: { kind: 'campaign-membership', projectId: nextProject.id },
        };
      }
      const projects = [...library.projects];
      projects[index] = storedAggregateSchema.parse({ ...aggregate, project: nextProject });
      await this.#write(library, { ...library, revision: library.revision + 1, projects });
      return { kind: 'updated' };
    });
  }

  async createCampaignIdempotent(input: {
    readonly campaign: Campaign;
    readonly receipt: CampaignCreateReceipt;
  }): Promise<CampaignCreatePersistenceResult> {
    const campaign = storedCampaignSchema.parse(input.campaign) as Campaign;
    const receipt = campaignCreateReceiptSchema.parse(input.receipt);
    if (campaign.id !== receipt.campaignId) throw new Error('Campaign receipt mismatch.');
    return this.#withOwnerLock(campaign.ownerUserId, async () => {
      const library = await this.#read(campaign.ownerUserId);
      const prior = library.campaignCreateReceipts.find(
        ({ operationKey }) => operationKey === receipt.operationKey,
      );
      if (prior !== undefined) {
        if (prior.requestFingerprint !== receipt.requestFingerprint) {
          return {
            kind: 'conflict',
            conflict: { kind: 'operation-key', operation: 'campaign-create' },
          };
        }
        const existing = library.campaigns.find(({ id }) => id === prior.campaignId);
        if (existing === undefined) throw new Error('Campaign create receipt has no result.');
        return { kind: 'replayed', campaign: existing };
      }
      if (library.campaigns.some(({ id }) => id === campaign.id)) {
        throw new Error('A Campaign with that identifier already exists.');
      }
      const next = librarySchema.parse({
        ...library,
        revision: library.revision + 1,
        campaigns: [...library.campaigns, campaign],
        campaignCreateReceipts: [...library.campaignCreateReceipts, receipt],
      });
      await this.#write(library, next, {
        schemaVersion: 6,
        ownerUserId: campaign.ownerUserId,
        transactionId: randomUUID(),
        state: 'prepared',
        operation: {
          kind: 'campaign-create',
          operationKey: receipt.operationKey,
          requestFingerprint: receipt.requestFingerprint,
          campaignId: receipt.campaignId,
        },
        preparedAt: receipt.createdAt,
        writes: { metadata: next },
      });
      return { kind: 'created', campaign };
    });
  }

  async getCampaign(ownerUserId: string, campaignId: string): Promise<Campaign | null> {
    const campaign = (await this.#read(ownerUserId)).campaigns.find(
      ({ id, deletedAt }) => id === campaignId && deletedAt === null,
    );
    return campaign ?? null;
  }

  async getCampaignWithAttachedProjectCount(
    ownerUserId: string,
    campaignId: string,
  ): Promise<CampaignWithAttachedProjectCount | null> {
    const library = await this.#read(ownerUserId);
    const campaign = library.campaigns.find(
      ({ id, deletedAt }) => id === campaignId && deletedAt === null,
    );
    if (campaign === undefined) return null;
    return {
      campaign,
      attachedProjectCount: library.projects.filter(
        ({ project }) => project.campaignId === campaignId,
      ).length,
    };
  }

  async listCampaigns(ownerUserId: string, input: CampaignPageInput): Promise<CampaignPage> {
    if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 40) {
      throw new Error('Use a bounded Campaign summary page.');
    }
    const campaigns = (await this.#read(ownerUserId)).campaigns
      .filter((campaign) => {
        const matchesLifecycle =
          campaign.deletedAt === null &&
          (input.lifecycle === 'archived'
            ? campaign.status === 'archived'
            : campaign.status === 'active');
        const followsCursor =
          input.cursor === undefined ||
          campaign.updatedAt < input.cursor.updatedAt ||
          (campaign.updatedAt === input.cursor.updatedAt && campaign.id < input.cursor.campaignId);
        return matchesLifecycle && followsCursor;
      })
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
      );
    const page = campaigns.slice(0, input.pageSize);
    const last = page.at(-1);
    return {
      campaigns: page,
      nextCursor:
        campaigns.length > input.pageSize && last !== undefined
          ? { updatedAt: last.updatedAt, campaignId: last.id }
          : null,
    };
  }

  async updateCampaignMetadata(input: {
    readonly ownerUserId: string;
    readonly expectedVersion: number;
    readonly campaign: Campaign;
    readonly requireNoAttachedProjects?: boolean;
  }): Promise<CampaignPersistenceMutationResult> {
    const nextCampaign = storedCampaignSchema.parse(input.campaign) as Campaign;
    return this.#withOwnerLock(input.ownerUserId, async () => {
      const library = await this.#read(input.ownerUserId);
      const index = library.campaigns.findIndex(({ id }) => id === nextCampaign.id);
      const current = library.campaigns[index];
      if (current === undefined || current.deletedAt !== null) return { kind: 'not-found' };
      if (current.version !== input.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'campaign-version',
            campaignId: current.id,
            expectedVersion: input.expectedVersion,
            actualVersion: current.version,
          },
        };
      }
      if (
        current.ownerUserId !== nextCampaign.ownerUserId ||
        nextCampaign.ownerUserId !== input.ownerUserId ||
        nextCampaign.version !== input.expectedVersion + 1 ||
        nextCampaign.createdAt !== current.createdAt
      ) {
        throw new Error('A Campaign update changed immutable identity.');
      }
      if (input.requireNoAttachedProjects) {
        const attachedProjectCount = library.projects.filter(
          ({ project }) => project.campaignId === current.id,
        ).length;
        if (attachedProjectCount > 0) {
          return {
            kind: 'conflict',
            conflict: {
              kind: 'campaign-not-empty',
              campaignId: current.id,
              attachedProjectCount,
            },
          };
        }
      }
      const campaigns = [...library.campaigns];
      campaigns[index] = storedCampaignSchema.parse(nextCampaign);
      await this.#write(library, { ...library, revision: library.revision + 1, campaigns });
      return { kind: 'updated' };
    });
  }

  async findReceipt(
    ownerUserId: string,
    operationId: string,
  ): Promise<ProjectOutputOperationReceipt | null> {
    ownerIdSchema.parse(ownerUserId);
    return (
      (await this.#read(ownerUserId)).outputReceipts.find(
        (receipt) => receipt.operationId === operationId,
      ) ?? null
    );
  }

  async commit(input: ProjectOutputCommitInput): Promise<ProjectOutputMetadataCommitResult> {
    return this.#withOwnerLock(input.ownerUserId, async () => {
      const library = await this.#read(input.ownerUserId);
      const prior = library.outputReceipts.find(
        ({ operationId }) => operationId === input.receipt.operationId,
      );
      if (prior !== undefined) {
        return prior.requestFingerprint === input.receipt.requestFingerprint &&
          prior.projectId === input.receipt.projectId
          ? { kind: 'replayed', receipt: prior }
          : {
              kind: 'conflict',
              conflict: { kind: 'operation-key', operation: 'output-save' },
            };
      }

      const projectIndex = library.projects.findIndex(
        ({ project }) => project.id === input.projectRevision.projectId,
      );
      const aggregate = library.projects[projectIndex];
      if (aggregate === undefined || aggregate.project.deletedAt !== null) {
        return { kind: 'not-found' };
      }
      if (aggregate.project.version !== input.projectRevision.expectedVersion) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'project-version',
            projectId: aggregate.project.id,
            expectedVersion: input.projectRevision.expectedVersion,
            actualVersion: aggregate.project.version,
          },
        };
      }
      if (
        aggregate.project.currentRevisionNumber !== input.projectRevision.expectedRevisionNumber
      ) {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'revision',
            projectId: aggregate.project.id,
            expectedRevisionNumber: input.projectRevision.expectedRevisionNumber,
            actualRevisionNumber: aggregate.project.currentRevisionNumber,
          },
        };
      }

      const savedLibrary = await this.#savedVideos.readLibraryForProjectOutput(input.ownerUserId);
      const savedMutation = appendSavedVideoForOutput(savedLibrary, input.savedVideo);
      if (savedMutation.kind === 'not-found') return { kind: 'not-found' };
      if (savedMutation.kind === 'conflict') {
        return {
          kind: 'conflict',
          conflict: {
            kind: 'saved-video-version',
            savedVideoId: savedMutation.savedVideoId,
            expectedVersionId: savedMutation.expectedVersionId,
            actualVersionId: savedMutation.actualVersionId,
          },
        };
      }

      const revision = input.projectRevision.revision;
      const output = storedOutputLinkSchema.parse(input.output) as ProjectOutputLink;
      const committedVersion =
        input.savedVideo.kind === 'create'
          ? input.savedVideo.aggregate.versions[0]!
          : input.savedVideo.version;
      const savedVideoId =
        input.savedVideo.kind === 'create'
          ? input.savedVideo.aggregate.video.id
          : input.savedVideo.videoId;
      const videoVersionId = committedVersion.id;
      const valid =
        input.receipt.projectId === aggregate.project.id &&
        input.receipt.savedVideoId === savedVideoId &&
        input.receipt.videoVersionId === videoVersionId &&
        input.receipt.resultRevisionId === revision.id &&
        input.receipt.resultRevisionNumber === revision.revisionNumber &&
        input.projectRevision.ownerUserId === input.ownerUserId &&
        input.projectRevision.nextProject.ownerUserId === input.ownerUserId &&
        input.projectRevision.nextProject.id === aggregate.project.id &&
        input.projectRevision.nextProject.version === aggregate.project.version + 1 &&
        revision.projectId === aggregate.project.id &&
        revision.ownerUserId === input.ownerUserId &&
        revision.parentRevisionId === aggregate.project.currentRevisionId &&
        revision.parentRevisionNumber === aggregate.project.currentRevisionNumber &&
        revision.revisionNumber === aggregate.project.currentRevisionNumber + 1 &&
        output.projectId === aggregate.project.id &&
        output.ownerUserId === input.ownerUserId &&
        output.savedVideoId === savedVideoId &&
        output.videoVersionId === videoVersionId &&
        output.producingRevisionId === aggregate.project.currentRevisionId &&
        output.producingRevisionNumber === aggregate.project.currentRevisionNumber &&
        input.media.projectId === aggregate.project.id &&
        input.media.ownerUserId === input.ownerUserId &&
        input.media.kind === 'saved-video-version' &&
        input.media.assetId === committedVersion.assetId &&
        input.media.savedVideoId === savedVideoId &&
        input.media.videoVersionId === videoVersionId &&
        input.media.adoptedRevisionId === revision.id &&
        input.media.adoptedRevisionNumber === revision.revisionNumber &&
        input.media.operationKey === input.receipt.operationId &&
        input.media.requestFingerprint === input.receipt.requestFingerprint &&
        projectMediaReferencesEqual(input.media.mediaReference, revision.snapshot.workingMedia) &&
        projectMediaReferencesEqual(input.media.mediaReference, revision.snapshot.presentedMedia) &&
        input.media.mimeType === committedVersion.mimeType &&
        input.media.filename === committedVersion.filename &&
        input.media.sizeBytes === committedVersion.sizeBytes &&
        input.media.durationMs === committedVersion.durationMs &&
        input.media.width === committedVersion.width &&
        input.media.height === committedVersion.height &&
        revision.snapshot.lastSuccessfulOutput?.savedVideoId === savedVideoId &&
        revision.snapshot.lastSuccessfulOutput.videoVersionId === videoVersionId;
      if (!valid) throw new Error('The local Project output transaction is inconsistent.');
      if (
        library.projects.some(({ outputLinks }) =>
          outputLinks.some(({ videoVersionId: existingId }) => existingId === videoVersionId),
        )
      ) {
        throw new Error('That Video Version already has Project output provenance.');
      }

      const nextAggregate = storedAggregateSchema.parse({
        ...aggregate,
        project: input.projectRevision.nextProject,
        revisions: [...aggregate.revisions, revision],
        assetLinks: [...aggregate.assetLinks, ...projectAssetLinksForRevision(revision)],
        versionReferenceLinks: [
          ...aggregate.versionReferenceLinks,
          ...projectVersionReferenceLinksForRevision(revision),
        ],
        outputLinks: [...aggregate.outputLinks, output],
        workingMediaAdoptions: [...aggregate.workingMediaAdoptions, input.media],
      });
      const projects = [...library.projects];
      projects[projectIndex] = nextAggregate;
      const receipt = input.receipt;
      const next = librarySchema.parse({
        ...library,
        revision: library.revision + 1,
        projects,
        outputReceipts: [...library.outputReceipts, receipt],
      });
      await this.#write(library, next, {
        schemaVersion: 6,
        ownerUserId: input.ownerUserId,
        transactionId: randomUUID(),
        state: 'prepared',
        operation: {
          kind: 'project-output-save',
          operationId: receipt.operationId,
          requestFingerprint: receipt.requestFingerprint,
          projectId: receipt.projectId,
          savedVideoId: receipt.savedVideoId,
          videoVersionId: receipt.videoVersionId,
          resultRevisionId: receipt.resultRevisionId,
        },
        preparedAt: receipt.createdAt,
        writes: { metadata: next, savedVideos: savedMutation.library },
      });
      return { kind: 'committed', receipt };
    });
  }

  async linkJob(linkValue: ProjectJobLink): Promise<ProjectLinkMutationResult> {
    const link = storedJobLinkSchema.parse(linkValue) as ProjectJobLink;
    return this.#link(
      link.ownerUserId,
      link.projectId,
      'job',
      (aggregate) => aggregate.jobLinks.find(({ jobId }) => jobId === link.jobId),
      (existing) =>
        existing.projectId === link.projectId &&
        existing.initiatingRevisionId === link.initiatingRevisionId &&
        existing.initiatingRevisionNumber === link.initiatingRevisionNumber,
      (aggregate) => ({ ...aggregate, jobLinks: [...aggregate.jobLinks, link] }),
    );
  }

  async linkOutput(linkValue: ProjectOutputLink): Promise<ProjectLinkMutationResult> {
    const link = storedOutputLinkSchema.parse(linkValue) as ProjectOutputLink;
    return this.#link(
      link.ownerUserId,
      link.projectId,
      'output',
      (aggregate) =>
        aggregate.outputLinks.find(({ videoVersionId }) => videoVersionId === link.videoVersionId),
      (existing) =>
        existing.projectId === link.projectId &&
        existing.savedVideoId === link.savedVideoId &&
        existing.producingRevisionId === link.producingRevisionId &&
        existing.producingRevisionNumber === link.producingRevisionNumber,
      (aggregate) => ({ ...aggregate, outputLinks: [...aggregate.outputLinks, link] }),
    );
  }

  async getOutput(
    ownerUserId: string,
    projectId: string,
    videoVersionId: string,
  ): Promise<ProjectOutputLink | null> {
    const aggregate = (await this.#read(ownerUserId)).projects.find(
      ({ project }) => project.id === projectId,
    );
    return (
      aggregate?.outputLinks.find((output) => output.videoVersionId === videoVersionId) ?? null
    );
  }

  async #link<Link extends ProjectJobLink | ProjectOutputLink>(
    ownerUserId: string,
    projectId: string,
    relation: 'job' | 'output',
    findExisting: (aggregate: ProjectAggregate) => Link | undefined,
    matches: (link: Link) => boolean,
    append: (aggregate: ProjectAggregate) => ProjectAggregate,
  ): Promise<ProjectLinkMutationResult> {
    return this.#withOwnerLock(ownerUserId, async () => {
      const library = await this.#read(ownerUserId);
      for (const aggregate of library.projects) {
        const existing = findExisting(asAggregate(aggregate));
        if (existing !== undefined) {
          return matches(existing)
            ? { kind: 'linked', replayed: true }
            : {
                kind: 'conflict',
                conflict: { kind: 'relation-mismatch', projectId, relation },
              };
        }
      }
      const index = library.projects.findIndex(
        ({ project }) =>
          project.id === projectId && project.archivedAt === null && project.deletedAt === null,
      );
      const aggregate = library.projects[index];
      if (aggregate === undefined) return { kind: 'not-found' };
      const projects = [...library.projects];
      projects[index] = storedAggregateSchema.parse(append(asAggregate(aggregate)));
      await this.#write(library, { ...library, revision: library.revision + 1, projects });
      return { kind: 'linked', replayed: false };
    });
  }

  async retainsAsset(ownerUserId: string, assetId: string): Promise<boolean> {
    return (await this.retainedAssetIds(ownerUserId, [assetId])).has(assetId);
  }

  async retainedAssetIds(
    ownerUserId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const candidates = new Set(assetIds);
    const retained = new Set<string>();
    const library = await this.#read(ownerUserId);
    const versionReferences = new Map<string, { savedVideoId: string; videoVersionId: string }>();
    for (const aggregate of library.projects) {
      for (const link of aggregate.assetLinks) {
        if (candidates.has(link.assetId)) retained.add(link.assetId);
      }
      for (const link of [...aggregate.versionReferenceLinks, ...aggregate.outputLinks]) {
        versionReferences.set(`${link.savedVideoId}:${link.videoVersionId}`, link);
      }
    }
    for (const { savedVideoId, videoVersionId } of versionReferences.values()) {
      const retainedVersion = await this.#savedVideos.getRetainedVersion(
        ownerUserId,
        savedVideoId,
        videoVersionId,
      );
      if (retainedVersion === null) continue;
      if (candidates.has(retainedVersion.version.assetId)) {
        retained.add(retainedVersion.version.assetId);
      }
      if (
        retainedVersion.version.thumbnailAssetId !== null &&
        candidates.has(retainedVersion.version.thumbnailAssetId)
      ) {
        retained.add(retainedVersion.version.thumbnailAssetId);
      }
    }
    return retained;
  }
}
