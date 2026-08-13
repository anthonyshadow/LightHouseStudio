import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type {
  Campaign,
  Project,
  ProjectAggregate,
  ProjectJobLink,
  ProjectOutputLink,
} from '@studio/domain';
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
  storedProjectSourceSchema,
  storedProjectWorkingMediaSchema,
  type ProjectJournal,
  type ProjectLibrary,
  type StoredProjectAggregate,
} from './file-project-persistence-schema.js';
import {
  projectMediaReferencesEqual,
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

export interface FileProjectRepositoryOptions {
  /** Test seam for proving recovery after a durable journal is prepared. */
  readonly afterJournalPrepared?: () => Promise<void> | void;
}

export class FileProjectRepository
  implements ProjectRepository, ProjectRetentionPolicy, CampaignRepository
{
  readonly #root: string;
  readonly #locks = new Map<string, Promise<unknown>>();
  readonly #afterJournalPrepared: (() => Promise<void> | void) | undefined;

  constructor(dataDirectory: string, options: FileProjectRepositoryOptions = {}) {
    this.#root = path.resolve(dataDirectory, 'metadata', 'v1', 'projects');
    this.#afterJournalPrepared = options.afterJournalPrepared;
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
    }
    await this.#atomicWrite(paths.backup, librarySchema.parse(previous));
    await this.#atomicWrite(paths.primary, next);
    if (journal !== undefined) await rm(paths.journal, { force: true });
  }

  async #withOwnerLock<Result>(
    ownerUserId: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    ownerIdSchema.parse(ownerUserId);
    const prior = this.#locks.get(ownerUserId) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prior.then(() => next);
    this.#locks.set(ownerUserId, chain);
    await prior;
    try {
      return await operation();
    } finally {
      release();
      if (this.#locks.get(ownerUserId) === chain) this.#locks.delete(ownerUserId);
    }
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
        schemaVersion: 4,
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
      .sort(
        (left, right) =>
          right.revisionNumber - left.revisionNumber || right.key.localeCompare(left.key),
      )
      .filter((item) =>
        input.cursor === undefined
          ? true
          : item.revisionNumber < input.cursor.revisionNumber ||
            (item.revisionNumber === input.cursor.revisionNumber && item.key < input.cursor.key),
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
        schemaVersion: 4,
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
        schemaVersion: 4,
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
        aggregate.project.status === 'processing'
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
        schemaVersion: 4,
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
    return (await this.#read(ownerUserId)).projects.some((aggregate) =>
      aggregate.assetLinks.some((link) => link.assetId === assetId),
    );
  }

  async retainedAssetIds(
    ownerUserId: string,
    assetIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const candidates = new Set(assetIds);
    const retained = new Set<string>();
    for (const aggregate of (await this.#read(ownerUserId)).projects) {
      for (const link of aggregate.assetLinks) {
        if (candidates.has(link.assetId)) retained.add(link.assetId);
      }
    }
    return retained;
  }
}
