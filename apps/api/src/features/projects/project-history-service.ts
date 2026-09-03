import {
  type ProjectHistoryQuery,
  type ProjectHistoryResponse,
  type ProjectOutputHistoryItem,
  type ProjectOutputHistoryResponse,
} from '@studio/contracts';
import type { ProjectOutputLink, ProjectRevision } from '@studio/domain';
import { AppError } from '../../http/app-error.js';
import type {
  SavedVideoRepository,
  StoredVideoVersionRead,
} from '../saved-videos/saved-video-repository.js';
import {
  publicSavedVideoVersion,
  savedVideoVersionHasThumbnail,
} from '../saved-videos/saved-video-service.js';
import type { ProjectRepository } from './project-repository.js';

const encodeCursor = (value: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify({ version: 1, ...value }), 'utf8').toString('base64url');

const cursorRecord = (value: string | undefined): Record<string, unknown> | undefined => {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      parsed.version === 1
    ) {
      return parsed;
    }
  } catch {
    // Opaque cursors fail through one finite app-owned validation error.
  }
  throw new AppError(400, 'validation_error', 'Use a valid Project history cursor.');
};

const revisionCursor = (value: string | undefined): number | undefined => {
  const parsed = cursorRecord(value);
  if (parsed === undefined) return undefined;
  if (
    parsed.kind === 'revision' &&
    typeof parsed.beforeRevisionNumber === 'number' &&
    Number.isInteger(parsed.beforeRevisionNumber) &&
    parsed.beforeRevisionNumber > 0
  ) {
    return parsed.beforeRevisionNumber;
  }
  throw new AppError(400, 'validation_error', 'Use a valid Project history cursor.');
};

const outputCursor = (
  value: string | undefined,
): { readonly revisionNumber: number; readonly key: string } | undefined => {
  const parsed = cursorRecord(value);
  if (parsed === undefined) return undefined;
  if (
    parsed.kind === 'output' &&
    typeof parsed.revisionNumber === 'number' &&
    Number.isInteger(parsed.revisionNumber) &&
    parsed.revisionNumber > 0 &&
    typeof parsed.key === 'string' &&
    parsed.key.length > 0 &&
    parsed.key.length <= 500
  ) {
    return { revisionNumber: parsed.revisionNumber, key: parsed.key };
  }
  throw new AppError(400, 'validation_error', 'Use a valid Project output cursor.');
};

const outputContentUrl = (projectId: string, versionId: string): string =>
  `/api/projects/${encodeURIComponent(projectId)}/outputs/${encodeURIComponent(versionId)}/content`;

const referenceRevisionFor = (
  revision: ProjectRevision | null,
  output: ProjectOutputLink,
): ProjectOutputHistoryItem['referenceRevision'] => {
  const reference = revision?.snapshot.lastSuccessfulOutput;
  return revision?.source === 'output-save' &&
    revision.parentRevisionId === output.producingRevisionId &&
    revision.parentRevisionNumber === output.producingRevisionNumber &&
    reference?.savedVideoId === output.savedVideoId &&
    reference.videoVersionId === output.videoVersionId
    ? {
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        createdAt: revision.createdAt,
      }
    : null;
};

export class ProjectHistoryService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly savedVideos: SavedVideoRepository,
  ) {}

  async revisions(
    ownerUserId: string,
    projectId: string,
    query: ProjectHistoryQuery,
  ): Promise<ProjectHistoryResponse> {
    const beforeRevisionNumber = revisionCursor(query.cursor);
    const page = await this.projects.listRevisionHistory(ownerUserId, projectId, {
      ...(beforeRevisionNumber === undefined ? {} : { beforeRevisionNumber }),
      pageSize: query.pageSize,
    });
    if (page === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    return {
      revisions: page.revisions.map((revision) => ({
        kind: 'project-change',
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        parentRevisionId: revision.parentRevisionId,
        parentRevisionNumber: revision.parentRevisionNumber,
        source: revision.source,
        authorKind: revision.author.kind,
        workflowPhase: revision.snapshot.workflowPhase,
        outputReference: revision.snapshot.lastSuccessfulOutput,
        exportSpecification: revision.snapshot.exportSpecification,
        createdAt: revision.createdAt,
      })),
      nextCursor:
        page.nextRevisionNumber === null
          ? null
          : encodeCursor({
              kind: 'revision',
              beforeRevisionNumber: page.nextRevisionNumber,
            }),
    };
  }

  async outputs(
    ownerUserId: string,
    projectId: string,
    query: ProjectHistoryQuery,
  ): Promise<ProjectOutputHistoryResponse> {
    const cursor = outputCursor(query.cursor);
    const [current, page] = await Promise.all([
      this.projects.getCurrent(ownerUserId, projectId),
      this.projects.listLinkHistory(ownerUserId, projectId, {
        kind: 'output',
        ...(cursor === undefined ? {} : { cursor }),
        pageSize: query.pageSize,
      }),
    ]);
    if (current === null || page === null) {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    const links = page.links.map((link) => {
      if (!('producingRevisionId' in link)) {
        throw new Error('Project output history returned a non-output relation.');
      }
      return link;
    });
    // Two batched reads for the whole page, rather than two per row.
    const [retainedVersions, referenceRevisions] = await Promise.all([
      this.savedVideos.getRetainedVersions(
        ownerUserId,
        links.map((link) => ({ videoId: link.savedVideoId, versionId: link.videoVersionId })),
      ),
      this.projects.getRevisions(
        ownerUserId,
        projectId,
        links.map((link) => link.producingRevisionNumber + 1),
      ),
    ]);
    const retainedByVersionId = new Map(
      retainedVersions.map((retained) => [retained.version.id, retained]),
    );
    const revisionByNumber = new Map(
      referenceRevisions.map((revision) => [revision.revisionNumber, revision]),
    );
    const outputs = links.map((link) =>
      this.#outputItemFrom(
        projectId,
        link,
        current.revision,
        retainedByVersionId.get(link.videoVersionId) ?? null,
        revisionByNumber.get(link.producingRevisionNumber + 1) ?? null,
      ),
    );
    return {
      outputs,
      nextCursor:
        page.nextCursor === null ? null : encodeCursor({ kind: 'output', ...page.nextCursor }),
    };
  }

  async output(
    ownerUserId: string,
    projectId: string,
    videoVersionId: string,
  ): Promise<ProjectOutputHistoryItem> {
    const [current, output] = await Promise.all([
      this.projects.getCurrent(ownerUserId, projectId),
      this.projects.getOutput(ownerUserId, projectId, videoVersionId),
    ]);
    if (current === null || output === null) {
      throw new AppError(404, 'not_found', 'That Project output is unavailable.');
    }
    return this.#outputItem(ownerUserId, projectId, output, current.revision);
  }

  async #outputItem(
    ownerUserId: string,
    projectId: string,
    output: ProjectOutputLink,
    currentRevision: ProjectRevision,
  ): Promise<ProjectOutputHistoryItem> {
    const [retained, referenceRevision] = await Promise.all([
      this.savedVideos.getRetainedVersion(ownerUserId, output.savedVideoId, output.videoVersionId),
      this.projects.getRevision(ownerUserId, projectId, output.producingRevisionNumber + 1),
    ]);
    return this.#outputItemFrom(projectId, output, currentRevision, retained, referenceRevision);
  }

  /** Pure projection, so a page can resolve its reads in bulk and then build every row locally. */
  #outputItemFrom(
    projectId: string,
    output: ProjectOutputLink,
    currentRevision: ProjectRevision,
    retained: StoredVideoVersionRead | null,
    referenceRevision: ProjectRevision | null,
  ): ProjectOutputHistoryItem {
    if (retained === null) {
      throw new AppError(404, 'not_found', 'That Project output is unavailable.');
    }
    const currentOutput = currentRevision.snapshot.lastSuccessfulOutput;
    return {
      kind: 'saved-video-version',
      output: {
        projectId: output.projectId,
        savedVideoId: output.savedVideoId,
        videoVersionId: output.videoVersionId,
        producingRevisionId: output.producingRevisionId,
        producingRevisionNumber: output.producingRevisionNumber,
        createdAt: output.createdAt,
      },
      savedVideo: {
        id: retained.video.id,
        title: retained.video.title,
        libraryStatus:
          retained.video.deletedAt !== null
            ? 'removed'
            : retained.video.status === 'missing'
              ? 'missing'
              : 'ready',
        currentVersionId: retained.video.currentVersionId,
      },
      version: publicSavedVideoVersion(retained.version),
      referenceRevision: referenceRevisionFor(referenceRevision, output),
      thumbnailAvailable: savedVideoVersionHasThumbnail(retained.version),
      isCurrentForProject:
        currentOutput?.savedVideoId === output.savedVideoId &&
        currentOutput.videoVersionId === output.videoVersionId,
      contentUrl: outputContentUrl(projectId, output.videoVersionId),
    };
  }
}
