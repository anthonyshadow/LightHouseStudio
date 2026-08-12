import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  projectAssetRoleSchema,
  projectSnapshotSchema,
  projectStatusSchema,
  projectRevisionSourceSchema,
} from '@studio/contracts';
import type {
  Project,
  ProjectAggregate,
  ProjectJobLink,
  ProjectOutputLink,
  ProjectRevision,
  ProjectVersionReferenceLink,
} from '@studio/domain';
import { z } from 'zod';
import { persistedTimestampSchema } from '../../application/timestamps.js';
import type {
  AppendProjectRevisionPersistenceInput,
  ProjectCreateReceipt,
  ProjectCreatePersistenceResult,
  ProjectCurrentRead,
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
} from './project-repository.js';

const ownerIdSchema = z.uuid();
const projectIdSchema = z.uuid();
const opaqueIdSchema = z.string().trim().min(1).max(200);

const storedProjectSchema = z
  .object({
    id: projectIdSchema,
    ownerUserId: ownerIdSchema,
    title: z.string().trim().min(1).max(120),
    status: projectStatusSchema,
    version: z.number().int().positive(),
    currentRevisionId: z.uuid(),
    currentRevisionNumber: z.number().int().positive(),
    archivedAt: persistedTimestampSchema.nullable(),
    deletedAt: persistedTimestampSchema.nullable(),
    createdAt: persistedTimestampSchema,
    updatedAt: persistedTimestampSchema,
  })
  .strict();

const storedRevisionSchema = z
  .object({
    id: z.uuid(),
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    revisionNumber: z.number().int().positive(),
    parentRevisionId: z.uuid().nullable(),
    parentRevisionNumber: z.number().int().positive().nullable(),
    snapshot: projectSnapshotSchema,
    author: z
      .object({ kind: z.enum(['user', 'system', 'migration']), authorId: opaqueIdSchema })
      .strict(),
    source: projectRevisionSourceSchema,
    createdAt: persistedTimestampSchema,
  })
  .strict();

const storedAssetLinkSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    assetId: z.uuid(),
    role: projectAssetRoleSchema,
    revisionId: z.uuid(),
    revisionNumber: z.number().int().positive(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

const storedVersionReferenceLinkSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    savedVideoId: z.uuid(),
    videoVersionId: z.uuid(),
    role: z.enum(['working', 'presented']),
    revisionId: z.uuid(),
    revisionNumber: z.number().int().positive(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

const storedJobLinkSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    jobId: z.uuid(),
    initiatingRevisionId: z.uuid(),
    initiatingRevisionNumber: z.number().int().positive(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

const storedOutputLinkSchema = z
  .object({
    projectId: projectIdSchema,
    ownerUserId: ownerIdSchema,
    savedVideoId: z.uuid(),
    videoVersionId: z.uuid(),
    producingRevisionId: z.uuid(),
    producingRevisionNumber: z.number().int().positive(),
    createdAt: persistedTimestampSchema,
  })
  .strict();

const storedAggregateSchema = z
  .object({
    project: storedProjectSchema,
    revisions: z.array(storedRevisionSchema).min(1),
    assetLinks: z.array(storedAssetLinkSchema),
    versionReferenceLinks: z.array(storedVersionReferenceLinkSchema),
    jobLinks: z.array(storedJobLinkSchema),
    outputLinks: z.array(storedOutputLinkSchema),
  })
  .strict()
  .superRefine((aggregate, context) => {
    const { project } = aggregate;
    const owned = (value: { projectId: string; ownerUserId: string }) =>
      value.projectId === project.id && value.ownerUserId === project.ownerUserId;
    if (
      !aggregate.revisions.some(
        (revision) =>
          revision.id === project.currentRevisionId &&
          revision.revisionNumber === project.currentRevisionNumber,
      ) ||
      !aggregate.revisions.every(owned) ||
      !aggregate.assetLinks.every(owned) ||
      !aggregate.versionReferenceLinks.every(owned) ||
      !aggregate.jobLinks.every(owned) ||
      !aggregate.outputLinks.every(owned)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Stored Project ownership or revision is invalid.',
      });
    }
  });

const createReceiptSchema = z
  .object({
    operationKey: z.uuid(),
    requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    projectId: projectIdSchema,
    createdAt: persistedTimestampSchema,
  })
  .strict();

const librarySchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerUserId: ownerIdSchema,
    revision: z.number().int().nonnegative(),
    projects: z.array(storedAggregateSchema),
    createReceipts: z.array(createReceiptSchema),
  })
  .strict()
  .superRefine((library, context) => {
    const projectIds = library.projects.map(({ project }) => project.id);
    const operationKeys = library.createReceipts.map(({ operationKey }) => operationKey);
    const projectIdSet = new Set(projectIds);
    if (
      projectIdSet.size !== projectIds.length ||
      new Set(operationKeys).size !== operationKeys.length ||
      library.projects.some(({ project }) => project.ownerUserId !== library.ownerUserId) ||
      library.createReceipts.some(({ projectId }) => !projectIdSet.has(projectId))
    ) {
      context.addIssue({ code: 'custom', message: 'Stored Project library identity is invalid.' });
    }
  });

type ProjectLibrary = z.infer<typeof librarySchema>;

const journalSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerUserId: ownerIdSchema,
    transactionId: z.uuid(),
    state: z.literal('prepared'),
    operation: z
      .object({
        kind: z.literal('project-create'),
        operationKey: z.uuid(),
        requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
        projectId: projectIdSchema,
      })
      .strict(),
    preparedAt: persistedTimestampSchema,
    writes: z.object({ projectMetadata: librarySchema }).strict(),
  })
  .strict()
  .superRefine((journal, context) => {
    const receipt = journal.writes.projectMetadata.createReceipts.find(
      ({ operationKey }) => operationKey === journal.operation.operationKey,
    );
    if (
      journal.writes.projectMetadata.ownerUserId !== journal.ownerUserId ||
      receipt?.projectId !== journal.operation.projectId ||
      receipt.requestFingerprint !== journal.operation.requestFingerprint
    ) {
      context.addIssue({ code: 'custom', message: 'Prepared Project journal is inconsistent.' });
    }
  });

const emptyLibrary = (ownerUserId: string): ProjectLibrary => ({
  schemaVersion: 1,
  ownerUserId: ownerIdSchema.parse(ownerUserId),
  revision: 0,
  projects: [],
  createReceipts: [],
});

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const asAggregate = (value: z.infer<typeof storedAggregateSchema>): ProjectAggregate => value;

const versionReferenceLinks = (revision: ProjectRevision): ProjectVersionReferenceLink[] => {
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

export interface FileProjectRepositoryOptions {
  /** Test seam for proving recovery after a durable journal is prepared. */
  readonly afterJournalPrepared?: () => Promise<void> | void;
}

export class FileProjectRepository implements ProjectRepository, ProjectRetentionPolicy {
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

  async #readParsed(filePath: string): Promise<ProjectLibrary | null> {
    try {
      return librarySchema.parse(JSON.parse(await readFile(filePath, 'utf8')) as unknown);
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
      const journal = journalSchema.parse(rawJournal);
      if (journal.ownerUserId !== ownerUserId) throw new Error('Project journal owner mismatch.');
      const recovered = librarySchema.parse(journal.writes.projectMetadata);
      await this.#atomicWrite(paths.primary, recovered);
      await this.#atomicWrite(paths.backup, recovered);
      await rm(paths.journal, { force: true });
      return recovered;
    }

    try {
      const primary = await this.#readParsed(paths.primary);
      if (primary !== null) {
        if (primary.ownerUserId !== ownerUserId)
          throw new Error('Project metadata owner mismatch.');
        return primary;
      }
    } catch (primaryError) {
      const backup = await this.#readParsed(paths.backup).catch(() => null);
      if (backup === null) throw primaryError;
      if (backup.ownerUserId !== ownerUserId) {
        throw new Error('Project backup owner mismatch.', { cause: primaryError });
      }
      await this.#atomicWrite(paths.primary, backup);
      return backup;
    }
    const backup = await this.#readParsed(paths.backup);
    if (backup !== null) {
      if (backup.ownerUserId !== ownerUserId) throw new Error('Project backup owner mismatch.');
      await this.#atomicWrite(paths.primary, backup);
      return backup;
    }
    return emptyLibrary(ownerUserId);
  }

  async #write(
    previous: ProjectLibrary,
    nextValue: ProjectLibrary,
    journal?: z.infer<typeof journalSchema>,
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
      const next = librarySchema.parse({
        ...library,
        revision: library.revision + 1,
        projects: [...library.projects, aggregate],
        createReceipts: [...library.createReceipts, receipt],
      });
      await this.#write(library, next, {
        schemaVersion: 1,
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
        writes: { projectMetadata: next },
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
    if (aggregate === undefined) return null;
    const revision = aggregate.revisions.find(
      ({ id, revisionNumber }) =>
        id === aggregate.project.currentRevisionId &&
        revisionNumber === aggregate.project.currentRevisionNumber,
    );
    if (revision === undefined) throw new Error('Project current revision is unavailable.');
    return { project: aggregate.project, revision };
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
        const followsCursor =
          input.cursor === undefined ||
          project.updatedAt < input.cursor.updatedAt ||
          (project.updatedAt === input.cursor.updatedAt && project.id < input.cursor.projectId);
        return matchesLifecycle && followsCursor;
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
          ...versionReferenceLinks(input.revision),
        ],
      });
      const projects = [...library.projects];
      projects[index] = nextAggregate;
      await this.#write(library, { ...library, revision: library.revision + 1, projects });
      return { kind: 'updated' };
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
