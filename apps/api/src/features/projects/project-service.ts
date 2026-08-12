import { createHash, randomUUID } from 'node:crypto';
import {
  projectCurrentResponseSchema,
  projectsResponseSchema,
  type ProjectContract,
  type ProjectCurrentResponse,
  type ProjectsQuery,
} from '@studio/contracts';
import {
  archiveProject,
  createProject,
  normalizeProjectTitle,
  ProjectRuleError,
  renameProject,
  restoreProject,
  moveProjectToCampaign,
  type Project,
  type ProjectConflict,
} from '@studio/domain';
import { AppError } from '../../http/app-error.js';
import type {
  ProjectCurrentRead,
  ProjectRepository,
  ProjectSummaryCursor,
} from './project-repository.js';

const emptyFacts = {
  sourceStatus: 'none' as const,
  currentAttempt: { status: 'none' as const },
  validatedLastSuccessfulOutput: null,
};

const publicProject = (project: Project): ProjectContract => ({
  id: project.id,
  campaignId: project.campaignId,
  title: project.title,
  status: project.status,
  version: project.version,
  currentRevisionId: project.currentRevisionId,
  currentRevisionNumber: project.currentRevisionNumber,
  archivedAt: project.archivedAt,
  deletedAt: project.deletedAt,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

export const publicProjectCurrent = ({
  project,
  revision,
}: ProjectCurrentRead): ProjectCurrentResponse =>
  projectCurrentResponseSchema.parse({
    project: publicProject(project),
    revision: {
      id: revision.id,
      projectId: revision.projectId,
      revisionNumber: revision.revisionNumber,
      parentRevisionId: revision.parentRevisionId,
      parentRevisionNumber: revision.parentRevisionNumber,
      snapshot: revision.snapshot,
      authorKind: revision.author.kind,
      source: revision.source,
      createdAt: revision.createdAt,
    },
  });

const cursorCriteria = (query: ProjectsQuery): string =>
  JSON.stringify({
    lifecycle: query.lifecycle,
    campaignId: query.campaignId ?? null,
    pageSize: query.pageSize,
  });

const encodeCursor = (cursor: ProjectSummaryCursor, query: ProjectsQuery): string =>
  Buffer.from(
    JSON.stringify({ version: 1, ...cursor, criteria: cursorCriteria(query) }),
    'utf8',
  ).toString('base64url');

const decodeCursor = (
  cursor: string | undefined,
  query: ProjectsQuery,
): ProjectSummaryCursor | undefined => {
  if (cursor === undefined) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      value.version === 1 &&
      'updatedAt' in value &&
      typeof value.updatedAt === 'string' &&
      Number.isFinite(new Date(value.updatedAt).valueOf()) &&
      'projectId' in value &&
      typeof value.projectId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value.projectId,
      ) &&
      'criteria' in value &&
      value.criteria === cursorCriteria(query)
    ) {
      return { updatedAt: new Date(value.updatedAt).toISOString(), projectId: value.projectId };
    }
  } catch {
    // Opaque application cursors fail as one finite validation error.
  }
  throw new AppError(400, 'validation_error', 'Use a valid Project page cursor.');
};

export type ProjectServiceMutationResult =
  | { readonly ok: true; readonly current: ProjectCurrentResponse }
  | { readonly ok: false; readonly conflict: ProjectConflict };

export class ProjectService {
  readonly #repository: ProjectRepository;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(
    repository: ProjectRepository,
    options: { readonly now?: () => Date; readonly createId?: () => string } = {},
  ) {
    this.#repository = repository;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async create(
    ownerUserId: string,
    operationKey: string,
    titleValue: string,
    campaignId: string | null = null,
  ): Promise<ProjectServiceMutationResult> {
    let title: string;
    try {
      title = normalizeProjectTitle(titleValue);
    } catch (error) {
      if (error instanceof ProjectRuleError) {
        throw new AppError(400, 'validation_error', error.message);
      }
      throw error;
    }
    const now = this.#now().toISOString();
    const projectId = this.#createId();
    const aggregate = createProject(
      {
        id: projectId,
        ownerUserId,
        title,
        campaignId,
        author: { kind: 'user', authorId: ownerUserId },
        facts: emptyFacts,
      },
      { now, createId: this.#createId },
    );
    const requestFingerprint = createHash('sha256')
      .update(
        JSON.stringify(
          campaignId === null
            ? { version: 1, operation: 'create', title }
            : { version: 2, operation: 'create', title, campaignId },
        ),
      )
      .digest('hex');
    const result = await this.#repository.createIdempotent({
      aggregate,
      receipt: { operationKey, requestFingerprint, projectId, createdAt: now },
    });
    return result.kind === 'conflict'
      ? { ok: false, conflict: result.conflict }
      : { ok: true, current: publicProjectCurrent(result.current) };
  }

  async list(ownerUserId: string, query: ProjectsQuery) {
    const cursor = decodeCursor(query.cursor, query);
    const page = await this.#repository.list(ownerUserId, {
      lifecycle: query.lifecycle,
      ...(query.campaignId === undefined ? {} : { campaignId: query.campaignId }),
      ...(cursor === undefined ? {} : { cursor }),
      pageSize: query.pageSize,
    });
    return projectsResponseSchema.parse({
      projects: page.projects.map(publicProject),
      nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor, query),
    });
  }

  async get(ownerUserId: string, projectId: string): Promise<ProjectCurrentResponse> {
    const current = await this.#repository.getCurrent(ownerUserId, projectId);
    if (current === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    return publicProjectCurrent(current);
  }

  async rename(
    ownerUserId: string,
    projectId: string,
    expectedVersion: number,
    title: string,
  ): Promise<ProjectServiceMutationResult> {
    return this.#metadataMutation(ownerUserId, projectId, expectedVersion, (current, now) =>
      renameProject(current.project, title, expectedVersion, now),
    );
  }

  async archive(
    ownerUserId: string,
    projectId: string,
    expectedVersion: number,
  ): Promise<ProjectServiceMutationResult> {
    return this.#metadataMutation(ownerUserId, projectId, expectedVersion, (current, now) =>
      archiveProject(current.project, expectedVersion, emptyFacts, now),
    );
  }

  async restore(
    ownerUserId: string,
    projectId: string,
    expectedVersion: number,
  ): Promise<ProjectServiceMutationResult> {
    return this.#metadataMutation(ownerUserId, projectId, expectedVersion, (current, now) => {
      if (
        current.revision.snapshot.sourceAssetId !== null ||
        current.revision.snapshot.workingMedia !== null ||
        current.revision.snapshot.presentedMedia !== null ||
        current.revision.snapshot.lastSuccessfulOutput !== null
      ) {
        throw new AppError(
          409,
          'conflict',
          'This Project needs current media facts before it can be restored.',
        );
      }
      return restoreProject(
        current.project,
        expectedVersion,
        current.revision.snapshot,
        emptyFacts,
        now,
      );
    });
  }

  async moveToCampaign(
    ownerUserId: string,
    projectId: string,
    expectedVersion: number,
    campaignId: string | null,
  ): Promise<ProjectServiceMutationResult> {
    const current = await this.#repository.getCurrent(ownerUserId, projectId);
    if (current === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    let next;
    try {
      next = moveProjectToCampaign(
        current.project,
        campaignId,
        expectedVersion,
        this.#now().toISOString(),
      );
    } catch (error) {
      if (error instanceof ProjectRuleError) {
        throw new AppError(409, 'conflict', error.message);
      }
      throw error;
    }
    if (!next.ok) return { ok: false, conflict: next.conflict };
    const persisted = await this.#repository.updateCampaignMembership(
      ownerUserId,
      expectedVersion,
      next.value,
    );
    if (persisted.kind === 'not-found') {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    if (persisted.kind === 'conflict') return { ok: false, conflict: persisted.conflict };
    return {
      ok: true,
      current: publicProjectCurrent({ project: next.value, revision: current.revision }),
    };
  }

  async #metadataMutation(
    ownerUserId: string,
    projectId: string,
    expectedVersion: number,
    mutate: (
      current: ProjectCurrentRead,
      now: string,
    ) =>
      | { readonly ok: true; readonly value: Project }
      | { readonly ok: false; readonly conflict: ProjectConflict },
  ): Promise<ProjectServiceMutationResult> {
    const current = await this.#repository.getCurrent(ownerUserId, projectId);
    if (current === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    let next;
    try {
      next = mutate(current, this.#now().toISOString());
    } catch (error) {
      if (error instanceof ProjectRuleError) {
        throw new AppError(
          error.reason === 'invalid-title' ? 400 : 409,
          error.reason === 'invalid-title' ? 'validation_error' : 'conflict',
          error.message,
        );
      }
      throw error;
    }
    if (!next.ok) return { ok: false, conflict: next.conflict };
    const persisted = await this.#repository.updateMetadata(
      ownerUserId,
      expectedVersion,
      next.value,
    );
    if (persisted.kind === 'not-found') {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    if (persisted.kind === 'conflict') return { ok: false, conflict: persisted.conflict };
    return {
      ok: true,
      current: publicProjectCurrent({ project: next.value, revision: current.revision }),
    };
  }
}
