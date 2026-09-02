import {
  projectOutputSaveResultSchema,
  saveProjectOutputResponseSchema,
  type InspectedVideo,
  type ProjectExportSpecificationValue,
  type SaveProjectOutputRequest,
  type SaveProjectOutputResponse,
  type SavedVideoOrigin,
} from '@studio/contracts';
import {
  normalizeSavedVideoTitle,
  projectExportMatchesFrame,
  ProjectRuleError,
  saveProjectOutput,
  type ProjectConflict,
  type ProjectMediaReference,
  type ProjectOutputLink,
} from '@studio/domain';
import { deterministicUuid } from './deterministic-uuid';
import { AppError } from '../../http/app-error.js';
import type { AssetByteStore, AssetReadHandle } from '../../storage/asset-byte-store.js';
import { inspectSavedVideoFile } from '../saved-videos/saved-video-inspection.js';
import {
  appendStoredVideoVersion,
  type SavedVideoRepository,
  type StoredSavedVideoAggregate,
  type StoredVideoVersion,
} from '../saved-videos/saved-video-repository.js';
import { publicSavedVideoDetail } from '../saved-videos/saved-video-service.js';
import { inspectStoredProjectMedia } from './project-media-inspection.js';
import {
  projectAggregateForCurrent,
  type ProjectCurrentRead,
  type ProjectOutputMetadataUnitOfWork,
  type ProjectOutputOperationReceipt,
  type ProjectRepository,
  type ProjectSourceRecord,
  type ProjectWorkingMediaRecord,
} from './project-repository.js';
import { projectRequestFingerprint } from './project-request-fingerprint.js';
import {
  projectAssetLinksForRevision,
  projectMediaReferencesEqual,
} from './project-snapshot-relations.js';
import { publicProjectCurrent } from './project-service.js';

export type ProjectOutputSaveMutationResult =
  | { readonly ok: true; readonly response: SaveProjectOutputResponse }
  | { readonly ok: false; readonly conflict: ProjectConflict };

interface ReadyProjectMedia {
  readonly reference: ProjectMediaReference;
  readonly asset: AssetReadHandle;
  readonly inspected: InspectedVideo;
  readonly savedVersion: StoredVideoVersion | null;
  readonly source: ProjectSourceRecord | null;
}

const projectOutputId = (
  ownerUserId: string,
  operationId: string,
  purpose: 'saved-video' | 'video-version' | 'project-revision',
): string =>
  deterministicUuid(`lightframe:project-output:v1:${ownerUserId}:${operationId}:${purpose}`);

const publicOutput = (output: ProjectOutputLink) => ({
  projectId: output.projectId,
  savedVideoId: output.savedVideoId,
  videoVersionId: output.videoVersionId,
  producingRevisionId: output.producingRevisionId,
  producingRevisionNumber: output.producingRevisionNumber,
  createdAt: output.createdAt,
});

const contentUrl = (projectId: string, versionId: string): string =>
  `/api/projects/${encodeURIComponent(projectId)}/outputs/${encodeURIComponent(versionId)}/content`;

const assertManifestMatchesInspection = (
  asset: AssetReadHandle,
  inspected: InspectedVideo,
): void => {
  if (
    asset.manifest.mimeType !== inspected.mimeType ||
    asset.manifest.sizeBytes !== inspected.sizeBytes
  ) {
    throw new AppError(
      409,
      'conflict',
      'The current Project media no longer matches its durable byte manifest.',
    );
  }
};

const assertRecordedMediaMatches = (
  record: ProjectSourceRecord | ProjectWorkingMediaRecord,
  asset: AssetReadHandle,
  inspected: InspectedVideo,
): void => {
  if (
    record.assetId !== asset.manifest.assetId ||
    record.checksumSha256 !== asset.manifest.checksumSha256 ||
    record.mimeType !== inspected.mimeType ||
    record.filename !== asset.manifest.filename ||
    record.sizeBytes !== inspected.sizeBytes ||
    record.container !== inspected.container ||
    record.videoCodec !== inspected.videoCodec ||
    record.audioCodec !== inspected.audioCodec ||
    record.durationMs !== Math.max(1, Math.round(inspected.durationMs)) ||
    record.width !== inspected.width ||
    record.height !== inspected.height ||
    record.hasAudio !== inspected.hasAudio
  ) {
    throw new AppError(
      409,
      'conflict',
      'The current Project media no longer matches its retained metadata.',
    );
  }
};

const assertVersionMatches = (
  version: StoredVideoVersion,
  asset: AssetReadHandle,
  inspected: InspectedVideo,
): void => {
  if (
    version.assetId !== asset.manifest.assetId ||
    version.mimeType !== inspected.mimeType ||
    version.filename !== asset.manifest.filename ||
    version.sizeBytes !== inspected.sizeBytes ||
    version.durationMs !== Math.max(1, Math.round(inspected.durationMs)) ||
    version.width !== inspected.width ||
    version.height !== inspected.height
  ) {
    throw new AppError(
      409,
      'conflict',
      'The current Project Version no longer matches its retained media.',
    );
  }
};

const outputOrigin = (current: ProjectCurrentRead, media: ReadyProjectMedia): SavedVideoOrigin => {
  const snapshot = current.revision.snapshot;
  if (snapshot.visualTreatment.kind === 'character-swap') return 'character-swap';
  if (snapshot.visualTreatment.kind === 'virtual-try-on') return 'virtual-try-on';
  if (snapshot.selectedVoice !== null) return 'voice-treatment';
  if (snapshot.localEdit !== null) return 'editor';
  if (media.savedVersion !== null) return media.savedVersion.origin;
  if (media.source?.kind === 'recorded') return 'recorded';
  return 'uploaded';
};

const outputAttribution = (
  current: ProjectCurrentRead,
  media: ReadyProjectMedia,
): Pick<StoredVideoVersion, 'characterName' | 'characterVariantName'> => ({
  characterName:
    current.revision.snapshot.selectedCharacter?.characterLabel ??
    media.savedVersion?.characterName ??
    null,
  characterVariantName:
    current.revision.snapshot.selectedCharacter?.variantLabel ??
    media.savedVersion?.characterVariantName ??
    null,
});

export class ProjectOutputService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly metadata: ProjectOutputMetadataUnitOfWork,
    private readonly savedVideos: SavedVideoRepository,
    private readonly bytes: AssetByteStore,
    private readonly options: {
      readonly now?: () => Date;
      readonly inspect?: (filePath: string) => Promise<InspectedVideo>;
    } = {},
  ) {}

  get #now(): () => Date {
    return this.options.now ?? (() => new Date());
  }

  get #inspect(): (filePath: string) => Promise<InspectedVideo> {
    return this.options.inspect ?? inspectSavedVideoFile;
  }

  async #resolveReadyMedia(
    ownerUserId: string,
    current: ProjectCurrentRead,
    reference: ProjectMediaReference,
  ): Promise<ReadyProjectMedia> {
    const [working, source] = await Promise.all([
      // The adoption is looked up by the media the current revision presents, not by the revision
      // that adopted it: an ordinary Project change (a creative checkpoint, a placement choice)
      // appends a revision without re-adopting unchanged media, and the durable record still
      // describes exactly these bytes. Keying on the current revision id made every save after
      // such a change report the ready media as having no durable record.
      this.projects.getWorkingMedia(ownerUserId, current.project.id),
      this.projects.getSource(ownerUserId, current.project.id),
    ]);
    let assetId: string;
    let savedVersion: StoredVideoVersion | null = null;
    if (reference.kind === 'saved-video-version') {
      const retained = await this.savedVideos.getRetainedVersion(
        ownerUserId,
        reference.savedVideoId,
        reference.videoVersionId,
      );
      if (retained === null) {
        throw new AppError(404, 'not_found', 'The current Project media is unavailable.');
      }
      savedVersion = retained.version;
      assetId = retained.version.assetId;
    } else {
      assetId = reference.assetId;
    }
    const asset = await this.bytes.open(ownerUserId, assetId);
    if (asset === null) {
      throw new AppError(404, 'asset_missing', 'The current Project media file is unavailable.');
    }
    const inspected = await inspectStoredProjectMedia(asset, this.#inspect);
    assertManifestMatchesInspection(asset, inspected);
    if (working !== null && projectMediaReferencesEqual(working.media.mediaReference, reference)) {
      assertRecordedMediaMatches(working.media, asset, inspected);
    } else if (
      source !== null &&
      projectMediaReferencesEqual(
        source.kind === 'saved-video-version'
          ? {
              kind: 'saved-video-version',
              savedVideoId: source.savedVideoId!,
              videoVersionId: source.videoVersionId!,
            }
          : { kind: 'asset', assetId: source.assetId },
        reference,
      )
    ) {
      assertRecordedMediaMatches(source, asset, inspected);
    } else if (savedVersion === null) {
      throw new AppError(
        409,
        'conflict',
        'The current Project media has no durable ready-media record.',
      );
    }
    if (savedVersion !== null) assertVersionMatches(savedVersion, asset, inspected);
    return { reference, asset, inspected, savedVersion, source };
  }

  /**
   * The bytes a Version is actually made of.
   *
   * With no rendition the stored cut is used unchanged, which is what "Keep as it is" means and
   * what every save did before placements were produced. With one, its asset supplies the bytes —
   * the stage's own media is still resolved and checked first, because the save is still a
   * statement about that exact cut.
   */
  async #resolveRendition(
    ownerUserId: string,
    current: ProjectCurrentRead,
    request: SaveProjectOutputRequest,
  ): Promise<{
    asset: AssetReadHandle;
    inspected: InspectedVideo;
    specification: ProjectExportSpecificationValue;
  } | null> {
    const rendition = request.renditions.at(0);
    if (rendition === undefined) return null;
    // A save states what the revision chose. Bytes produced for some other placement would put a
    // shape on the Version that Project History never records, so the two are held together here.
    const chosen = current.revision.snapshot.exportSpecification;
    if (chosen === null || JSON.stringify(chosen) !== JSON.stringify(rendition.specification)) {
      throw new AppError(
        409,
        'conflict',
        'The re-framed video was made for a different placement than this Project has chosen.',
      );
    }
    const asset = await this.bytes.open(ownerUserId, rendition.media.assetId);
    if (asset === null) {
      throw new AppError(404, 'asset_missing', 'The re-framed video for this save is unavailable.');
    }
    const inspected = await inspectStoredProjectMedia(asset, this.#inspect);
    assertManifestMatchesInspection(asset, inspected);
    if (!projectExportMatchesFrame(rendition.specification, inspected)) {
      throw new AppError(
        409,
        'conflict',
        'The re-framed video no longer matches the placement it was saved for.',
      );
    }
    return { asset, inspected, specification: rendition.specification };
  }

  async save(
    ownerUserId: string,
    projectId: string,
    operationId: string,
    request: SaveProjectOutputRequest,
  ): Promise<ProjectOutputSaveMutationResult> {
    const requestFingerprint = projectRequestFingerprint({
      version: 1,
      operation: 'save-project-output',
      projectId,
      ...request,
    });
    const prior = await this.metadata.findReceipt(ownerUserId, operationId);
    if (prior !== null) {
      return prior.projectId === projectId && prior.requestFingerprint === requestFingerprint
        ? {
            ok: true,
            response: saveProjectOutputResponseSchema.parse({
              ...prior.result,
              replayed: true,
            }),
          }
        : {
            ok: false,
            conflict: { kind: 'operation-key', operation: 'output-save' },
          };
    }

    const current = await this.projects.getCurrent(ownerUserId, projectId);
    if (current === null) throw new AppError(404, 'not_found', 'That Project is unavailable.');
    const { workingMedia, presentedMedia } = current.revision.snapshot;
    if (
      workingMedia === null ||
      presentedMedia === null ||
      !projectMediaReferencesEqual(workingMedia, presentedMedia) ||
      !projectMediaReferencesEqual(workingMedia, request.media)
    ) {
      throw new AppError(
        409,
        'conflict',
        'Save the exact current ready Project media after all pending changes finish.',
      );
    }
    // Independent reads, each of which streams a whole asset out of storage to inspect it. Run
    // together so a placement save costs one asset read's wall-clock rather than two.
    const [media, rendition] = await Promise.all([
      this.#resolveReadyMedia(ownerUserId, current, request.media),
      this.#resolveRendition(ownerUserId, current, request),
    ]);
    // What the operator receives: the re-framed file when one was produced, the cut itself when
    // not — and, either way, the placement that describes it.
    const stored = rendition ?? {
      asset: media.asset,
      inspected: media.inspected,
      specification: null,
    };
    /*
     * A re-framed file is a deliverable, not the next thing to work from. Presenting it would make
     * the stage show the crop and make every later save re-frame an already-re-framed video, while
     * the Project still holds the untouched cut it came from.
     */
    const presentsOutput = rendition === null;
    const now = this.#now().toISOString();
    const savedVideoId =
      request.target.kind === 'new'
        ? projectOutputId(ownerUserId, operationId, 'saved-video')
        : request.target.savedVideoId;
    const versionId = projectOutputId(ownerUserId, operationId, 'video-version');
    const targetAggregate =
      request.target.kind === 'version'
        ? await this.savedVideos.get(ownerUserId, request.target.savedVideoId)
        : null;
    if (request.target.kind === 'version' && targetAggregate === null) {
      throw new AppError(404, 'not_found', 'That Saved Video is unavailable.');
    }
    const attribution = outputAttribution(current, media);
    const version: StoredVideoVersion = {
      id: versionId,
      videoId: savedVideoId,
      ownerUserId,
      ordinal: targetAggregate === null ? 1 : targetAggregate.versions.length + 1,
      origin: outputOrigin(current, media),
      ...attribution,
      sourceVersionId:
        request.target.kind === 'version'
          ? request.target.expectedVersionId
          : media.reference.kind === 'saved-video-version'
            ? media.reference.videoVersionId
            : null,
      assetId: stored.asset.manifest.assetId,
      thumbnailAssetId: null,
      mimeType: stored.inspected.mimeType,
      filename: stored.asset.manifest.filename,
      sizeBytes: stored.inspected.sizeBytes,
      durationMs: Math.max(1, Math.round(stored.inspected.durationMs)),
      width: stored.inspected.width,
      height: stored.inspected.height,
      // The placement these bytes were produced for, so the Version states its own shape rather
      // than borrowing the intent recorded on the revision, which the two can outlive separately.
      exportSpecification: stored.specification,
      createdAt: now,
    };
    const nextSavedVideo: StoredSavedVideoAggregate =
      targetAggregate === null
        ? {
            video: {
              id: savedVideoId,
              ownerUserId,
              title: normalizeSavedVideoTitle(
                request.target.kind === 'new' ? request.target.title : '',
              ),
              currentVersionId: version.id,
              sourceVideoId:
                media.reference.kind === 'saved-video-version'
                  ? media.reference.savedVideoId
                  : null,
              status: 'ready',
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            },
            versions: [version],
            revision: 1,
          }
        : appendStoredVideoVersion(targetAggregate, version);

    let transition;
    try {
      transition = saveProjectOutput(
        projectAggregateForCurrent(current),
        {
          expectedProjectVersion: request.expectedVersion,
          expectedRevisionNumber: request.expectedRevisionNumber,
          savedVideoId,
          videoVersionId: version.id,
          presentsOutput,
          author: { kind: 'user', authorId: ownerUserId },
        },
        {
          now,
          createId: () => projectOutputId(ownerUserId, operationId, 'project-revision'),
        },
      );
    } catch (error) {
      if (error instanceof ProjectRuleError) {
        throw new AppError(409, 'conflict', error.message);
      }
      throw error;
    }
    if (!transition.ok) return { ok: false, conflict: transition.conflict };
    const revision = transition.value.revisions.at(-1)!;
    const output = transition.value.outputLinks.at(-1)!;
    const result = projectOutputSaveResultSchema.parse({
      operationId,
      ...publicProjectCurrent({ project: transition.value.project, revision }),
      output: publicOutput(output),
      savedVideo: publicSavedVideoDetail(nextSavedVideo, true),
      contentUrl: contentUrl(projectId, version.id),
    });
    const receipt: ProjectOutputOperationReceipt = {
      operationId,
      requestFingerprint,
      projectId,
      savedVideoId,
      videoVersionId: version.id,
      resultRevisionId: revision.id,
      resultRevisionNumber: revision.revisionNumber,
      result,
      createdAt: now,
    };
    /*
     * The record hydrates whatever the post-save revision presents: the Version when that Version
     * is the cut, otherwise the cut it was produced from. Only the identity differs — the bytes are
     * the same either way, because a presented Version is made of exactly the media resolved above.
     * Sourcing every byte field from that one place is what keeps the record describing the bytes
     * its reference names, rather than two literals that agree by coincidence.
     */
    const presentedReference: ProjectMediaReference = presentsOutput
      ? { kind: 'saved-video-version', savedVideoId, videoVersionId: version.id }
      : media.reference;
    const presentedVersion =
      presentedReference.kind === 'saved-video-version' ? presentedReference : null;
    const outputMedia: ProjectWorkingMediaRecord = {
      projectId,
      ownerUserId,
      kind: presentedVersion === null ? 'media-asset' : 'saved-video-version',
      mediaReference: presentedReference,
      assetId: media.asset.manifest.assetId,
      savedVideoId: presentedVersion?.savedVideoId ?? null,
      videoVersionId: presentedVersion?.videoVersionId ?? null,
      adoptedRevisionId: revision.id,
      adoptedRevisionNumber: revision.revisionNumber,
      operationKey: operationId,
      requestFingerprint,
      mimeType: media.inspected.mimeType,
      filename: media.asset.manifest.filename,
      sizeBytes: media.inspected.sizeBytes,
      checksumSha256: media.asset.manifest.checksumSha256,
      container: media.inspected.container,
      videoCodec: media.inspected.videoCodec,
      audioCodec: media.inspected.audioCodec,
      durationMs: Math.max(1, Math.round(media.inspected.durationMs)),
      width: media.inspected.width,
      height: media.inspected.height,
      hasAudio: media.inspected.hasAudio,
      adoptedAt: now,
    };
    const committed = await this.metadata.commit({
      ownerUserId,
      receipt,
      savedVideo:
        request.target.kind === 'new'
          ? { kind: 'create', aggregate: nextSavedVideo }
          : {
              kind: 'append',
              videoId: savedVideoId,
              expectedVersionId: request.target.expectedVersionId,
              // The receipt above serializes this read's revision + 1 as the video's new token;
              // the commit CASes on it so the recorded value is the written value, never a guess.
              expectedRevision: targetAggregate!.revision,
              version,
            },
      projectRevision: {
        ownerUserId,
        projectId,
        expectedVersion: request.expectedVersion,
        expectedRevisionNumber: request.expectedRevisionNumber,
        nextProject: transition.value.project,
        revision,
        assetLinks: projectAssetLinksForRevision(revision),
      },
      output,
      media: outputMedia,
    });
    if (committed.kind === 'not-found') {
      throw new AppError(404, 'not_found', 'The Project or Saved Video is unavailable.');
    }
    if (committed.kind === 'conflict') return { ok: false, conflict: committed.conflict };
    return {
      ok: true,
      response: saveProjectOutputResponseSchema.parse({
        ...committed.receipt.result,
        replayed: committed.kind === 'replayed',
      }),
    };
  }

  async content(
    ownerUserId: string,
    projectId: string,
    videoVersionId: string,
  ): Promise<{ readonly version: StoredVideoVersion; readonly asset: AssetReadHandle }> {
    const output = await this.projects.getOutput(ownerUserId, projectId, videoVersionId);
    if (output === null) {
      throw new AppError(404, 'not_found', 'That Project output is unavailable.');
    }
    const retained = await this.savedVideos.getRetainedVersion(
      ownerUserId,
      output.savedVideoId,
      output.videoVersionId,
    );
    if (retained === null) {
      throw new AppError(404, 'not_found', 'That Project output is unavailable.');
    }
    const asset = await this.bytes.open(ownerUserId, retained.version.assetId);
    if (asset === null) {
      throw new AppError(404, 'asset_missing', 'The Project output file is unavailable.');
    }
    return { version: retained.version, asset };
  }
}
