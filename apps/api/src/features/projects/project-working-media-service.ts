import { randomUUID } from 'node:crypto';
import {
  projectWorkingMediaResponseSchema,
  type InspectedVideo,
  type ProjectWorkingMediaResponse,
} from '@studio/contracts';
import {
  adoptProjectWorkingMedia,
  ProjectRuleError,
  type ProjectConflict,
  type ProjectMediaReference,
  type VideoEditSpec,
} from '@studio/domain';
import { AppError } from '../../http/app-error.js';
import type { AssetByteStore, AssetReadHandle } from '../../storage/asset-byte-store.js';
import type {
  SavedVideoRepository,
  StoredVideoVersion,
} from '../saved-videos/saved-video-repository.js';
import { inspectSavedVideoFile } from '../saved-videos/saved-video-inspection.js';
import { safeSavedVideoFilename } from '../saved-videos/saved-video-service.js';
import { inspectStoredProjectMedia } from './project-media-inspection.js';
import {
  projectAggregateForCurrent,
  type ProjectCurrentRead,
  type ProjectRepository,
  type ProjectRetentionPolicy,
  type ProjectWorkingMediaKind,
  type ProjectWorkingMediaRead,
  type ProjectWorkingMediaRecord,
} from './project-repository.js';
import { projectRequestFingerprint } from './project-request-fingerprint.js';
import {
  projectAssetLinksForRevision,
  projectMediaReferencesEqual,
} from './project-snapshot-relations.js';
import { publicProjectCurrent } from './project-service.js';

export type ProjectWorkingMediaMutationResult =
  | {
      readonly ok: true;
      readonly response: ProjectWorkingMediaResponse;
      readonly replayed: boolean;
    }
  | { readonly ok: false; readonly conflict: ProjectConflict };

interface UploadProjectWorkingMediaInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly operationKey: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly sourcePath: string;
  readonly checksumSha256: string;
  readonly filename: string;
  readonly localEdit: VideoEditSpec;
}

interface ReuseProjectWorkingMediaInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly operationKey: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly media:
    | { readonly kind: 'asset'; readonly assetId: string }
    | {
        readonly kind: 'saved-video-version';
        readonly savedVideoId: string;
        readonly videoVersionId: string;
      };
  readonly localEdit: VideoEditSpec | null;
}

const workingMediaContentUrl = (projectId: string, revisionId: string): string =>
  `/api/projects/${encodeURIComponent(projectId)}/working-media/${encodeURIComponent(revisionId)}/content`;

const responseFor = (read: ProjectWorkingMediaRead): ProjectWorkingMediaResponse =>
  projectWorkingMediaResponseSchema.parse({
    ...publicProjectCurrent({ project: read.project, revision: read.revision }),
    isCurrent:
      projectMediaReferencesEqual(read.revision.snapshot.workingMedia, read.media.mediaReference) &&
      projectMediaReferencesEqual(read.revision.snapshot.presentedMedia, read.media.mediaReference),
    media: {
      kind: read.media.kind,
      reference: read.media.mediaReference,
      assetId: read.media.assetId,
      savedVideoId: read.media.savedVideoId,
      videoVersionId: read.media.videoVersionId,
      mimeType: read.media.mimeType,
      filename: read.media.filename,
      sizeBytes: read.media.sizeBytes,
      checksumSha256: read.media.checksumSha256,
      container: read.media.container,
      videoCodec: read.media.videoCodec,
      audioCodec: read.media.audioCodec,
      durationMs: read.media.durationMs,
      width: read.media.width,
      height: read.media.height,
      hasAudio: read.media.hasAudio,
      adoptedRevisionId: read.media.adoptedRevisionId,
      adoptedRevisionNumber: read.media.adoptedRevisionNumber,
      adoptedAt: read.media.adoptedAt,
      contentUrl: workingMediaContentUrl(read.project.id, read.media.adoptedRevisionId),
    },
  });

export class ProjectWorkingMediaService {
  readonly #locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly projects: ProjectRepository,
    private readonly savedVideos: SavedVideoRepository,
    private readonly bytes: AssetByteStore,
    private readonly options: {
      readonly now?: () => Date;
      readonly createId?: () => string;
      readonly inspect?: (filePath: string) => Promise<InspectedVideo>;
      readonly projectRetention?: ProjectRetentionPolicy;
    } = {},
  ) {}

  get #now(): () => Date {
    return this.options.now ?? (() => new Date());
  }

  get #createId(): () => string {
    return this.options.createId ?? randomUUID;
  }

  get #inspect(): (filePath: string) => Promise<InspectedVideo> {
    return this.options.inspect ?? inspectSavedVideoFile;
  }

  async #withLock<Result>(key: string, operation: () => Promise<Result>): Promise<Result> {
    const prior = this.#locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prior.then(() => next);
    this.#locks.set(key, chain);
    await prior;
    try {
      return await operation();
    } finally {
      release();
      if (this.#locks.get(key) === chain) this.#locks.delete(key);
    }
  }

  async #requireProject(ownerUserId: string, projectId: string): Promise<ProjectCurrentRead> {
    const current = await this.projects.getCurrent(ownerUserId, projectId);
    if (current === null) {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    return current;
  }

  async #deleteIfUnretained(ownerUserId: string, assetId: string): Promise<void> {
    if (await this.options.projectRetention?.retainsAsset(ownerUserId, assetId)) return;
    await this.bytes.delete(ownerUserId, assetId).catch(() => undefined);
  }

  async uploadLocalRender(
    input: UploadProjectWorkingMediaInput,
  ): Promise<ProjectWorkingMediaMutationResult> {
    return this.#withLock(`${input.ownerUserId}:${input.operationKey}`, async () => {
      const current = await this.#requireProject(input.ownerUserId, input.projectId);
      const inspected = await this.#inspect(input.sourcePath);
      const filename = safeSavedVideoFilename(input.filename, inspected.mimeType);
      const requestFingerprint = projectRequestFingerprint({
        version: 1,
        operation: 'adopt-project-working-media',
        projectId: input.projectId,
        expectedVersion: input.expectedVersion,
        expectedRevisionNumber: input.expectedRevisionNumber,
        kind: 'local-render',
        filename,
        checksumSha256: input.checksumSha256,
        inspected,
        localEdit: input.localEdit,
      });
      const existing = await this.bytes.open(input.ownerUserId, input.operationKey);
      let created = false;
      let manifest = existing?.manifest;
      if (manifest !== undefined) {
        if (
          manifest.checksumSha256 !== input.checksumSha256 ||
          manifest.sizeBytes !== inspected.sizeBytes ||
          manifest.mimeType !== inspected.mimeType ||
          manifest.filename !== filename
        ) {
          throw new AppError(
            409,
            'conflict',
            'That working-media operation was already used for different media.',
          );
        }
      } else {
        manifest = await this.bytes.storeFile({
          assetId: input.operationKey,
          ownerUserId: input.ownerUserId,
          sourcePath: input.sourcePath,
          checksumSha256: input.checksumSha256,
          mimeType: inspected.mimeType,
          filename,
          createdAt: this.#now().toISOString(),
        });
        created = true;
      }
      try {
        const result = await this.#adopt(
          {
            ownerUserId: input.ownerUserId,
            projectId: input.projectId,
            operationKey: input.operationKey,
            requestFingerprint,
            expectedVersion: input.expectedVersion,
            expectedRevisionNumber: input.expectedRevisionNumber,
            kind: 'local-render',
            assetId: manifest.assetId,
            savedVideoId: null,
            videoVersionId: null,
            mediaReference: { kind: 'asset', assetId: manifest.assetId },
            localEdit: input.localEdit,
            inspected,
            manifest,
          },
          current,
        );
        if (!result.ok && created) {
          await this.#deleteIfUnretained(input.ownerUserId, manifest.assetId);
        }
        return result;
      } catch (error) {
        if (created) await this.#deleteIfUnretained(input.ownerUserId, manifest.assetId);
        throw error;
      }
    });
  }

  async reuse(input: ReuseProjectWorkingMediaInput): Promise<ProjectWorkingMediaMutationResult> {
    return this.#withLock(`${input.ownerUserId}:${input.operationKey}`, async () => {
      const current = await this.#requireProject(input.ownerUserId, input.projectId);
      if (input.media.kind === 'saved-video-version') {
        const saved = await this.savedVideos.getVersion(
          input.ownerUserId,
          input.media.savedVideoId,
          input.media.videoVersionId,
        );
        if (saved === null || saved.video.status !== 'ready') {
          throw new AppError(404, 'not_found', 'That retained media is unavailable.');
        }
        const asset = await this.bytes.open(input.ownerUserId, saved.version.assetId);
        if (asset === null) {
          throw new AppError(404, 'not_found', 'That retained media is unavailable.');
        }
        const inspected = await inspectStoredProjectMedia(asset, this.#inspect);
        this.#assertVersionMatches(saved.version, inspected, asset);
        return this.#adoptRetained(
          input,
          current,
          'saved-video-version',
          asset,
          inspected,
          {
            kind: 'saved-video-version',
            savedVideoId: input.media.savedVideoId,
            videoVersionId: input.media.videoVersionId,
          },
          input.media.savedVideoId,
          input.media.videoVersionId,
        );
      }
      const asset = await this.bytes.open(input.ownerUserId, input.media.assetId);
      if (asset === null) {
        throw new AppError(404, 'not_found', 'That retained media is unavailable.');
      }
      const inspected = await inspectStoredProjectMedia(asset, this.#inspect);
      return this.#adoptRetained(
        input,
        current,
        'media-asset',
        asset,
        inspected,
        { kind: 'asset', assetId: input.media.assetId },
        null,
        null,
      );
    });
  }

  #adoptRetained(
    input: ReuseProjectWorkingMediaInput,
    current: ProjectCurrentRead,
    kind: ProjectWorkingMediaKind,
    asset: AssetReadHandle,
    inspected: InspectedVideo,
    mediaReference: ProjectMediaReference,
    savedVideoId: string | null,
    videoVersionId: string | null,
  ): Promise<ProjectWorkingMediaMutationResult> {
    if (
      asset.manifest.mimeType !== inspected.mimeType ||
      asset.manifest.sizeBytes !== inspected.sizeBytes
    ) {
      throw new AppError(409, 'conflict', 'That retained media no longer matches its inspection.');
    }
    return this.#adopt(
      {
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        operationKey: input.operationKey,
        requestFingerprint: projectRequestFingerprint({
          version: 1,
          operation: 'adopt-project-working-media',
          projectId: input.projectId,
          expectedVersion: input.expectedVersion,
          expectedRevisionNumber: input.expectedRevisionNumber,
          kind,
          mediaReference,
          assetId: asset.manifest.assetId,
          checksumSha256: asset.manifest.checksumSha256,
          localEdit: input.localEdit,
        }),
        expectedVersion: input.expectedVersion,
        expectedRevisionNumber: input.expectedRevisionNumber,
        kind,
        assetId: asset.manifest.assetId,
        savedVideoId,
        videoVersionId,
        mediaReference,
        localEdit: input.localEdit,
        inspected,
        manifest: asset.manifest,
      },
      current,
    );
  }

  async #adopt(
    input: {
      readonly ownerUserId: string;
      readonly projectId: string;
      readonly operationKey: string;
      readonly requestFingerprint: string;
      readonly expectedVersion: number;
      readonly expectedRevisionNumber: number;
      readonly kind: ProjectWorkingMediaKind;
      readonly assetId: string;
      readonly savedVideoId: string | null;
      readonly videoVersionId: string | null;
      readonly mediaReference: ProjectMediaReference;
      readonly localEdit: VideoEditSpec | null;
      readonly inspected: InspectedVideo;
      readonly manifest: AssetReadHandle['manifest'];
    },
    current: ProjectCurrentRead,
  ): Promise<ProjectWorkingMediaMutationResult> {
    const prior = await this.projects.getWorkingMediaByOperationKey(
      input.ownerUserId,
      input.operationKey,
    );
    if (prior !== null) {
      return prior.media.projectId === input.projectId &&
        prior.media.requestFingerprint === input.requestFingerprint
        ? { ok: true, response: responseFor(prior), replayed: true }
        : {
            ok: false,
            conflict: { kind: 'operation-key', operation: 'working-media-adopt' },
          };
    }
    let adopted;
    try {
      adopted = adoptProjectWorkingMedia(
        projectAggregateForCurrent(current),
        {
          expectedProjectVersion: input.expectedVersion,
          expectedRevisionNumber: input.expectedRevisionNumber,
          mediaReference: input.mediaReference,
          localEdit: input.localEdit,
          author: { kind: 'user', authorId: input.ownerUserId },
        },
        { now: this.#now().toISOString(), createId: this.#createId },
      );
    } catch (error) {
      if (error instanceof ProjectRuleError) {
        throw new AppError(409, 'conflict', error.message);
      }
      throw error;
    }
    if (!adopted.ok) return { ok: false, conflict: adopted.conflict };
    const revision = adopted.value.revisions.at(-1)!;
    const media: ProjectWorkingMediaRecord = {
      projectId: input.projectId,
      ownerUserId: input.ownerUserId,
      kind: input.kind,
      mediaReference: input.mediaReference,
      assetId: input.assetId,
      savedVideoId: input.savedVideoId,
      videoVersionId: input.videoVersionId,
      adoptedRevisionId: revision.id,
      adoptedRevisionNumber: revision.revisionNumber,
      operationKey: input.operationKey,
      requestFingerprint: input.requestFingerprint,
      mimeType: input.inspected.mimeType,
      filename: input.manifest.filename,
      sizeBytes: input.inspected.sizeBytes,
      checksumSha256: input.manifest.checksumSha256,
      container: input.inspected.container,
      videoCodec: input.inspected.videoCodec,
      audioCodec: input.inspected.audioCodec,
      durationMs: Math.max(1, Math.round(input.inspected.durationMs)),
      width: input.inspected.width,
      height: input.inspected.height,
      hasAudio: input.inspected.hasAudio,
      adoptedAt: revision.createdAt,
    };
    const persisted = await this.projects.adoptWorkingMedia({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      expectedVersion: input.expectedVersion,
      expectedRevisionNumber: input.expectedRevisionNumber,
      nextProject: adopted.value.project,
      revision,
      assetLinks: projectAssetLinksForRevision(revision),
      media,
    });
    if (persisted.kind === 'not-found') {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    if (persisted.kind === 'conflict') return { ok: false, conflict: persisted.conflict };
    return {
      ok: true,
      response: responseFor(persisted.value),
      replayed: persisted.kind === 'replayed',
    };
  }

  #assertVersionMatches(
    version: StoredVideoVersion,
    inspected: InspectedVideo,
    asset: AssetReadHandle,
  ): void {
    if (
      version.assetId !== asset.manifest.assetId ||
      version.mimeType !== inspected.mimeType ||
      version.sizeBytes !== inspected.sizeBytes ||
      version.durationMs !== Math.round(inspected.durationMs) ||
      version.width !== inspected.width ||
      version.height !== inspected.height
    ) {
      throw new AppError(409, 'conflict', 'That retained media no longer matches its inspection.');
    }
  }

  async get(ownerUserId: string, projectId: string): Promise<ProjectWorkingMediaResponse> {
    const read = await this.projects.getWorkingMedia(ownerUserId, projectId);
    if (read === null) {
      throw new AppError(404, 'not_found', 'This Project has no adopted working media.');
    }
    if ((await this.bytes.open(ownerUserId, read.media.assetId)) === null) {
      throw new AppError(404, 'asset_missing', 'The Project working media is unavailable.');
    }
    return responseFor(read);
  }

  async content(
    ownerUserId: string,
    projectId: string,
    revisionId: string,
  ): Promise<{ readonly media: ProjectWorkingMediaRecord; readonly asset: AssetReadHandle }> {
    const read = await this.projects.getWorkingMedia(ownerUserId, projectId, revisionId);
    if (read === null) {
      throw new AppError(404, 'not_found', 'That Project working media is unavailable.');
    }
    const asset = await this.bytes.open(ownerUserId, read.media.assetId);
    if (asset === null) {
      throw new AppError(404, 'asset_missing', 'The Project working media is unavailable.');
    }
    return { media: read.media, asset };
  }
}
