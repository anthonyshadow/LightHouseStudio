import { randomUUID } from 'node:crypto';
import {
  attachProjectAssetResponseSchema,
  projectAssetsResponseSchema,
  projectAssetMembershipSchema,
  type AttachProjectAssetRequest,
  type ProjectAssetKindContract,
  type ProjectAssetsQuery,
} from '@studio/contracts';
import { createProjectAssetMembership, type ProjectAssetMembership } from '@studio/domain';
import { AppError } from '../../http/app-error.js';
import { decodePageCursor, encodePageCursor } from '../../http/page-cursor.js';
import type { CreativeLibraryRepository } from '../creative-libraries/creative-library-repository.js';
import type { SavedVideoRepository } from '../saved-videos/saved-video-repository.js';
import { publicSavedVideoSummary } from '../saved-videos/saved-video-service.js';
import type { SavedVoiceRepository } from '../voices/saved-voice-repository.js';
import type { ProjectAssetMembershipCursor, ProjectRepository } from './project-repository.js';

const cursorCriteria = (projectId: string, query: ProjectAssetsQuery): string =>
  JSON.stringify({ projectId, kind: query.kind ?? null, pageSize: query.pageSize });

const ASSET_MEMBERSHIP_CURSOR = {
  timestampKey: 'createdAt',
  idKey: 'membershipId',
  invalidMessage: 'Use a valid Project asset page cursor.',
} as const;

const encodeCursor = (
  cursor: ProjectAssetMembershipCursor,
  projectId: string,
  query: ProjectAssetsQuery,
): string => encodePageCursor(cursor, cursorCriteria(projectId, query));

const decodeCursor = (
  cursor: string | undefined,
  projectId: string,
  query: ProjectAssetsQuery,
): ProjectAssetMembershipCursor | undefined =>
  decodePageCursor(cursor, cursorCriteria(projectId, query), ASSET_MEMBERSHIP_CURSOR);

const publicMembership = (membership: ProjectAssetMembership) =>
  projectAssetMembershipSchema.parse({
    id: membership.id,
    projectId: membership.projectId,
    kind: membership.kind,
    resourceId: membership.resourceId,
    createdAt: membership.createdAt,
  });

export class ProjectAssetService {
  readonly #repository: ProjectRepository;
  readonly #savedVideos: SavedVideoRepository;
  readonly #savedVoices: SavedVoiceRepository;
  readonly #creativeLibraries: CreativeLibraryRepository | undefined;
  readonly #now: () => Date;
  readonly #createId: () => string;

  constructor(
    repository: ProjectRepository,
    savedVideos: SavedVideoRepository,
    savedVoices: SavedVoiceRepository,
    creativeLibraries?: CreativeLibraryRepository,
    options: { readonly now?: () => Date; readonly createId?: () => string } = {},
  ) {
    this.#repository = repository;
    this.#savedVideos = savedVideos;
    this.#savedVoices = savedVoices;
    this.#creativeLibraries = creativeLibraries;
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async list(ownerUserId: string, projectId: string, query: ProjectAssetsQuery) {
    const cursor = decodeCursor(query.cursor, projectId, query);
    const page = await this.#repository.listAssetMemberships(ownerUserId, projectId, {
      ...(query.kind === undefined ? {} : { kind: query.kind }),
      ...(cursor === undefined ? {} : { cursor }),
      pageSize: query.pageSize,
    });
    if (page === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    const videoSummaries = await this.#savedVideos.getSummaries(
      ownerUserId,
      page.memberships.filter(({ kind }) => kind === 'video').map(({ resourceId }) => resourceId),
    );
    return projectAssetsResponseSchema.parse({
      assets: page.memberships.map(publicMembership),
      videoSummaries: videoSummaries.map((summary) => publicSavedVideoSummary(summary)),
      nextCursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor, projectId, query),
    });
  }

  async #assertResourceExists(
    ownerUserId: string,
    kind: ProjectAssetKindContract,
    resourceId: string,
  ): Promise<void> {
    let exists: boolean;
    switch (kind) {
      case 'video': {
        const video = await this.#savedVideos.get(ownerUserId, resourceId);
        exists = video !== null && video.video.status === 'ready' && video.video.deletedAt === null;
        break;
      }
      case 'voice':
        exists = await this.#savedVoices.has(ownerUserId, resourceId);
        break;
      case 'character':
      case 'outfit': {
        if (this.#creativeLibraries === undefined) {
          // Browser-local IDs are opaque organizational references, never media capabilities.
          return;
        }
        const { store } = await this.#creativeLibraries.load(ownerUserId);
        exists =
          kind === 'character'
            ? store.savedCharacterPrompts.some(({ id }) => id === resourceId)
            : store.savedPrompts.some(
                ({ id, modelModeId }) => id === resourceId && modelModeId === 'lucy-vton-latest',
              );
        break;
      }
    }
    if (!exists) {
      throw new AppError(404, 'not_found', 'That asset is unavailable.');
    }
  }

  async attach(ownerUserId: string, projectId: string, input: AttachProjectAssetRequest) {
    const current = await this.#repository.getCurrent(ownerUserId, projectId);
    if (current === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    if (current.project.status === 'archived') {
      throw new AppError(409, 'conflict', 'Restore the Project before changing its assets.');
    }

    const existing = await this.#repository.getAssetMembership(
      ownerUserId,
      projectId,
      input.kind,
      input.resourceId,
    );
    if (existing !== null) {
      return attachProjectAssetResponseSchema.parse({
        membership: publicMembership(existing),
        created: false,
      });
    }

    await this.#assertResourceExists(ownerUserId, input.kind, input.resourceId);
    const membership = createProjectAssetMembership({
      id: this.#createId(),
      projectId,
      ownerUserId,
      kind: input.kind,
      resourceId: input.resourceId,
      createdAt: this.#now().toISOString(),
    });
    const result = await this.#repository.attachAssetMembership(membership);
    if (result.kind === 'not-found') {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    if (result.kind === 'archived') {
      throw new AppError(409, 'conflict', 'Restore the Project before changing its assets.');
    }
    if (!('membership' in result)) {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    return attachProjectAssetResponseSchema.parse({
      membership: publicMembership(result.membership),
      created: result.kind === 'attached',
    });
  }

  async detach(ownerUserId: string, projectId: string, membershipId: string): Promise<void> {
    const result = await this.#repository.detachAssetMembership(
      ownerUserId,
      projectId,
      membershipId,
    );
    if (result.kind === 'not-found') {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    if (result.kind === 'archived') {
      throw new AppError(409, 'conflict', 'Restore the Project before changing its assets.');
    }
  }
}
