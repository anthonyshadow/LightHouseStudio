import { randomUUID } from 'node:crypto';
import {
  projectSourceResponseSchema,
  type InspectedVideo,
  type ProjectSourceResponse,
} from '@studio/contracts';
import {
  acceptProjectSource,
  ProjectRuleError,
  removeProjectSource,
  type ProjectConflict,
  type ProjectMediaReference,
  type ProjectSourceKind,
} from '@studio/domain';
import { KeyedLock } from '../../application/keyed-lock.js';
import type { AssetByteStore, AssetReadHandle } from '../../storage/asset-byte-store.js';
import { AppError } from '../../http/app-error.js';
import type { SavedVideoRepository } from '../saved-videos/saved-video-repository.js';
import { inspectSavedVideoFile } from '../saved-videos/saved-video-inspection.js';
import { safeSavedVideoFilename } from '../saved-videos/saved-video-service.js';
import {
  projectAggregateForCurrent,
  type ProjectCurrentRead,
  type ProjectRepository,
  type ProjectRetentionPolicy,
  type ProjectSourceRecord,
} from './project-repository.js';
import { acceptIdempotentUpload } from './project-byte-acceptance.js';
import { projectRequestFingerprint } from './project-request-fingerprint.js';
import { projectAssetLinksForRevision } from './project-snapshot-relations.js';
import { publicProjectCurrent, type ProjectServiceMutationResult } from './project-service.js';
import {
  inspectStoredProjectMedia,
  storedVideoVersionMatchesInspection,
} from './project-media-inspection.js';

export type ProjectSourceMutationResult =
  | { readonly ok: true; readonly response: ProjectSourceResponse; readonly replayed: boolean }
  | { readonly ok: false; readonly conflict: ProjectConflict };

interface UploadSourceInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly operationKey: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly kind: 'uploaded' | 'recorded';
  readonly sourcePath: string;
  readonly checksumSha256: string;
  readonly filename: string;
}

interface RemoveSourceInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
}

interface ReuseSourceInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly operationKey: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly savedVideoId: string;
  readonly videoVersionId: string;
}

const sourceContentUrl = (projectId: string): string =>
  `/api/projects/${encodeURIComponent(projectId)}/source/content`;

const sourceResponse = (
  current: ProjectCurrentRead,
  source: ProjectSourceRecord,
): ProjectSourceResponse =>
  projectSourceResponseSchema.parse({
    ...publicProjectCurrent(current),
    source: {
      kind: source.kind,
      savedVideoId: source.savedVideoId,
      videoVersionId: source.videoVersionId,
      mimeType: source.mimeType,
      filename: source.filename,
      sizeBytes: source.sizeBytes,
      container: source.container,
      videoCodec: source.videoCodec,
      audioCodec: source.audioCodec,
      durationMs: source.durationMs,
      width: source.width,
      height: source.height,
      hasAudio: source.hasAudio,
      acceptedAt: source.acceptedAt,
      contentUrl: sourceContentUrl(source.projectId),
    },
  });

const versionMediaReference = (
  savedVideoId: string,
  videoVersionId: string,
): ProjectMediaReference => ({ kind: 'saved-video-version', savedVideoId, videoVersionId });

export class ProjectSourceService {
  readonly #lock = new KeyedLock();

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

  /**
   * Refuses an unreachable Project before any expensive work starts.
   *
   * `#accept` reads the Project again through `getCurrentWithSource`, so this looks like a
   * redundant query and has been flagged as one. It is not: between here and there sit a full
   * media inspection and a byte-store write. Paying one indexed read to avoid inspecting and
   * storing bytes for a Project that does not exist — and then having to delete them again — is
   * the cheaper order, and it keeps a 404 from arriving only after the upload was durably written.
   */
  async #assertProjectAccessible(ownerUserId: string, projectId: string): Promise<void> {
    if ((await this.projects.getCurrent(ownerUserId, projectId)) === null) {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
  }

  async #deleteIfUnretained(ownerUserId: string, assetId: string): Promise<void> {
    if (await this.options.projectRetention?.retainsAsset(ownerUserId, assetId)) return;
    await this.bytes.delete(ownerUserId, assetId).catch(() => undefined);
  }

  async upload(input: UploadSourceInput): Promise<ProjectSourceMutationResult> {
    return this.#lock.run(`${input.ownerUserId}:${input.operationKey}`, async () => {
      await this.#assertProjectAccessible(input.ownerUserId, input.projectId);
      const inspected = await this.#inspect(input.sourcePath);
      const filename = safeSavedVideoFilename(input.filename, inspected.mimeType);
      const requestFingerprint = projectRequestFingerprint({
        version: 1,
        projectId: input.projectId,
        expectedVersion: input.expectedVersion,
        expectedRevisionNumber: input.expectedRevisionNumber,
        kind: input.kind,
        filename,
        checksumSha256: input.checksumSha256,
        inspected,
      });
      return acceptIdempotentUpload({
        bytes: this.bytes,
        ownerUserId: input.ownerUserId,
        operationKey: input.operationKey,
        sourcePath: input.sourcePath,
        checksumSha256: input.checksumSha256,
        mimeType: inspected.mimeType,
        filename,
        sizeBytes: inspected.sizeBytes,
        now: this.#now().toISOString(),
        conflictMessage: 'That source operation was already used for different media.',
        commit: (manifest) =>
          this.#accept({
            ownerUserId: input.ownerUserId,
            projectId: input.projectId,
            operationKey: input.operationKey,
            requestFingerprint,
            expectedVersion: input.expectedVersion,
            expectedRevisionNumber: input.expectedRevisionNumber,
            kind: input.kind,
            assetId: manifest.assetId,
            savedVideoId: null,
            videoVersionId: null,
            mediaReference: { kind: 'asset', assetId: manifest.assetId },
            inspected,
            manifest,
          }),
        discard: (assetId) => this.#deleteIfUnretained(input.ownerUserId, assetId),
      });
    });
  }

  async reuseSavedVideo(input: ReuseSourceInput): Promise<ProjectSourceMutationResult> {
    return this.#lock.run(`${input.ownerUserId}:${input.operationKey}`, async () => {
      await this.#assertProjectAccessible(input.ownerUserId, input.projectId);
      const savedVersion = await this.savedVideos.getVersion(
        input.ownerUserId,
        input.savedVideoId,
        input.videoVersionId,
      );
      if (savedVersion === null || savedVersion.video.status !== 'ready') {
        throw new AppError(404, 'not_found', 'That Saved Video Version is unavailable.');
      }
      const { version } = savedVersion;
      const asset = await this.bytes.open(input.ownerUserId, version.assetId);
      if (asset === null) {
        throw new AppError(404, 'asset_missing', 'That Saved Video source file is unavailable.');
      }
      const inspected = await inspectStoredProjectMedia(asset, this.#inspect);
      if (!storedVideoVersionMatchesInspection(version, inspected, asset)) {
        throw new AppError(
          409,
          'conflict',
          'That Saved Video Version no longer matches its inspected media.',
        );
      }
      return this.#accept({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        operationKey: input.operationKey,
        requestFingerprint: projectRequestFingerprint({
          version: 1,
          projectId: input.projectId,
          expectedVersion: input.expectedVersion,
          expectedRevisionNumber: input.expectedRevisionNumber,
          kind: 'saved-video-version',
          savedVideoId: input.savedVideoId,
          videoVersionId: input.videoVersionId,
          assetId: version.assetId,
          checksumSha256: asset.manifest.checksumSha256,
        }),
        expectedVersion: input.expectedVersion,
        expectedRevisionNumber: input.expectedRevisionNumber,
        kind: 'saved-video-version',
        assetId: version.assetId,
        savedVideoId: input.savedVideoId,
        videoVersionId: input.videoVersionId,
        mediaReference: versionMediaReference(input.savedVideoId, input.videoVersionId),
        inspected,
        manifest: asset.manifest,
      });
    });
  }

  async #accept(input: {
    readonly ownerUserId: string;
    readonly projectId: string;
    readonly operationKey: string;
    readonly requestFingerprint: string;
    readonly expectedVersion: number;
    readonly expectedRevisionNumber: number;
    readonly kind: ProjectSourceKind;
    readonly assetId: string;
    readonly savedVideoId: string | null;
    readonly videoVersionId: string | null;
    readonly mediaReference: ProjectMediaReference;
    readonly inspected: InspectedVideo;
    readonly manifest: AssetReadHandle['manifest'];
  }): Promise<ProjectSourceMutationResult> {
    const projectRead = await this.projects.getCurrentWithSource(
      input.ownerUserId,
      input.projectId,
    );
    if (projectRead === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    const { current, source: existingSource } = projectRead;
    if (existingSource !== null) {
      if (
        existingSource.operationKey === input.operationKey &&
        existingSource.requestFingerprint === input.requestFingerprint
      ) {
        return {
          ok: true,
          response: sourceResponse(current, existingSource),
          replayed: true,
        };
      }
      return {
        ok: false,
        conflict: { kind: 'immutable-source', projectId: input.projectId },
      };
    }
    let accepted;
    try {
      accepted = acceptProjectSource(
        projectAggregateForCurrent(current),
        {
          expectedProjectVersion: input.expectedVersion,
          expectedRevisionNumber: input.expectedRevisionNumber,
          assetId: input.assetId,
          mediaReference: input.mediaReference,
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
    if (!accepted.ok) return { ok: false, conflict: accepted.conflict };
    const revision = accepted.value.revisions.at(-1)!;
    const source: ProjectSourceRecord = {
      projectId: input.projectId,
      ownerUserId: input.ownerUserId,
      assetId: input.assetId,
      kind: input.kind,
      savedVideoId: input.savedVideoId,
      videoVersionId: input.videoVersionId,
      acceptedRevisionId: revision.id,
      acceptedRevisionNumber: revision.revisionNumber,
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
      acceptedAt: revision.createdAt,
    };
    const persisted = await this.projects.acceptSource({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      expectedVersion: input.expectedVersion,
      expectedRevisionNumber: input.expectedRevisionNumber,
      nextProject: accepted.value.project,
      revision,
      assetLinks: projectAssetLinksForRevision(revision),
      source,
    });
    if (persisted.kind === 'not-found') {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    if (persisted.kind === 'conflict') return { ok: false, conflict: persisted.conflict };
    return {
      ok: true,
      response: sourceResponse(persisted.current, persisted.source),
      replayed: persisted.kind === 'replayed',
    };
  }

  /**
   * Detaches the current source so a different original can be chosen.
   *
   * Deliberately does **not** consult `#deleteIfUnretained`: the historical `role='source'` asset
   * link survives the removal, so Project retention still protects the bytes for any output Version
   * already produced from them. Deleting them here would strand those Versions.
   */
  async remove(input: RemoveSourceInput): Promise<ProjectServiceMutationResult> {
    const projectRead = await this.projects.getCurrentWithSource(
      input.ownerUserId,
      input.projectId,
    );
    if (projectRead === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    const { current, source } = projectRead;
    // Removing a source that is already gone is the requested end state, so it succeeds with
    // current authority instead of conflicting. That is what makes an operation key unnecessary:
    // a replay after a lost response converges rather than reporting a confusing version conflict.
    if (source === null && current.revision.snapshot.sourceAssetId === null) {
      return { ok: true, current: publicProjectCurrent(current) };
    }
    if (source === null || current.revision.snapshot.sourceAssetId !== source.assetId) {
      throw new AppError(404, 'not_found', 'This Project does not have an accepted source.');
    }
    let removed;
    try {
      removed = removeProjectSource(
        projectAggregateForCurrent(current),
        {
          expectedProjectVersion: input.expectedVersion,
          expectedRevisionNumber: input.expectedRevisionNumber,
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
    if (!removed.ok) return { ok: false, conflict: removed.conflict };
    const revision = removed.value.revisions.at(-1)!;
    const persisted = await this.projects.removeSource({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      expectedVersion: input.expectedVersion,
      expectedRevisionNumber: input.expectedRevisionNumber,
      nextProject: removed.value.project,
      revision,
      assetLinks: projectAssetLinksForRevision(revision),
      removedAssetId: source.assetId,
    });
    if (persisted.kind === 'not-found') {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    if (persisted.kind === 'conflict') return { ok: false, conflict: persisted.conflict };
    return { ok: true, current: publicProjectCurrent(persisted.current) };
  }

  async get(ownerUserId: string, projectId: string): Promise<ProjectSourceResponse> {
    const projectRead = await this.projects.getCurrentWithSource(ownerUserId, projectId);
    if (projectRead === null) {
      throw new AppError(404, 'not_found', 'That Project is unavailable.');
    }
    const { current, source } = projectRead;
    if (source === null || current.revision.snapshot.sourceAssetId !== source.assetId) {
      throw new AppError(404, 'not_found', 'This Project does not have an accepted source.');
    }
    if ((await this.bytes.open(ownerUserId, source.assetId)) === null) {
      throw new AppError(404, 'asset_missing', 'The Project source file is unavailable.');
    }
    return sourceResponse(current, source);
  }

  async content(
    ownerUserId: string,
    projectId: string,
  ): Promise<{ readonly source: ProjectSourceRecord; readonly asset: AssetReadHandle }> {
    const source = await this.projects.getSource(ownerUserId, projectId);
    if (source === null) {
      throw new AppError(404, 'not_found', 'This Project does not have an accepted source.');
    }
    const asset = await this.bytes.open(ownerUserId, source.assetId);
    if (asset === null) {
      throw new AppError(404, 'asset_missing', 'The Project source file is unavailable.');
    }
    return { source, asset };
  }
}
