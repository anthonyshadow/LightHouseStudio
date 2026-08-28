import {
  projectRenditionUploadResponseSchema,
  type InspectedVideo,
  type ProjectExportSpecificationValue,
  type ProjectRenditionUploadResponse,
} from '@studio/contracts';
import { projectExportMatchesFrame } from '@studio/domain';
import { KeyedLock } from '../../application/keyed-lock.js';
import { AppError } from '../../http/app-error.js';
import type { AssetByteStore } from '../../storage/asset-byte-store.js';
import { inspectSavedVideoFile } from '../saved-videos/saved-video-inspection.js';
import { safeSavedVideoFilename } from '../saved-videos/saved-video-service.js';
import { acceptIdempotentUpload } from './project-byte-acceptance.js';
import type { ProjectRepository, ProjectRetentionPolicy } from './project-repository.js';

export interface UploadProjectRenditionInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly operationKey: string;
  readonly sourcePath: string;
  readonly checksumSha256: string;
  readonly filename: string;
  readonly specification: ProjectExportSpecificationValue;
}

/**
 * Bytes re-framed in the browser for a placement, held until a save stores them.
 *
 * Deliberately not the working-media path: adopting a rendition would make the deliverable the
 * Project's current cut and bump its revision, and a rendition is neither. Nothing here touches a
 * revision — it accepts bytes, checks they are what the placement asked for, and hands back a
 * reference the save request can carry.
 *
 * Idempotent by the same mechanism as every other Project upload: the operation key *is* the asset
 * id, so replaying an upload returns the bytes already stored rather than a second copy. That is
 * what lets a save that was interrupted after uploading resume without re-rendering.
 */
export class ProjectRenditionService {
  readonly #lock = new KeyedLock();

  constructor(
    private readonly projects: ProjectRepository,
    private readonly bytes: AssetByteStore,
    private readonly options: {
      readonly now?: () => Date;
      readonly inspect?: (filePath: string) => Promise<InspectedVideo>;
      readonly projectRetention?: ProjectRetentionPolicy;
    } = {},
  ) {}

  get #now(): () => Date {
    return this.options.now ?? (() => new Date());
  }

  get #inspect(): (filePath: string) => Promise<InspectedVideo> {
    return this.options.inspect ?? inspectSavedVideoFile;
  }

  async upload(input: UploadProjectRenditionInput): Promise<ProjectRenditionUploadResponse> {
    return this.#lock.run(`${input.ownerUserId}:${input.operationKey}`, async () => {
      const current = await this.projects.getCurrent(input.ownerUserId, input.projectId);
      if (current === null) {
        throw new AppError(404, 'not_found', 'That Project is unavailable.');
      }
      const inspected = await this.#inspect(input.sourcePath);
      // The browser states the placement it rendered for; the bytes have to agree, or a save would
      // record a placement the file does not have.
      if (!projectExportMatchesFrame(input.specification, inspected)) {
        throw new AppError(
          400,
          'validation_error',
          'The re-framed video does not match the placement it was rendered for.',
        );
      }
      const filename = safeSavedVideoFilename(input.filename, inspected.mimeType);
      const result = await acceptIdempotentUpload({
        bytes: this.bytes,
        ownerUserId: input.ownerUserId,
        operationKey: input.operationKey,
        sourcePath: input.sourcePath,
        checksumSha256: input.checksumSha256,
        mimeType: inspected.mimeType,
        filename,
        sizeBytes: inspected.sizeBytes,
        now: this.#now().toISOString(),
        conflictMessage:
          'That rendition operation was already used for a different re-framed video.',
        commit: (manifest) =>
          Promise.resolve({
            ok: true as const,
            response: projectRenditionUploadResponseSchema.parse({
              media: { kind: 'asset', assetId: manifest.assetId },
              assetId: manifest.assetId,
              specification: input.specification,
              filename: manifest.filename,
              sizeBytes: inspected.sizeBytes,
              checksumSha256: manifest.checksumSha256,
              durationMs: Math.max(1, Math.round(inspected.durationMs)),
              width: inspected.width,
              height: inspected.height,
              hasAudio: inspected.hasAudio,
            }),
          } satisfies { ok: true; response: ProjectRenditionUploadResponse }),
        discard: async (assetId) => {
          if (await this.options.projectRetention?.retainsAsset(input.ownerUserId, assetId)) return;
          await this.bytes.delete(input.ownerUserId, assetId).catch(() => undefined);
        },
      });
      return result.response;
    });
  }
}
