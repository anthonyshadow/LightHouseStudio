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
  isProjectExportPlacementAspect,
  projectExportAspectOf,
  projectExportMatchesFrame,
  projectOutputPrimaryPlacement,
  ProjectRuleError,
  saveProjectOutput,
  type ProjectConflict,
  type ProjectExportPlacementAspect,
  type ProjectMediaReference,
  type ProjectOutputLink,
} from '@studio/domain';
import { deterministicUuid } from './deterministic-uuid';
import { AppError } from '../../http/app-error.js';
import type { AssetByteStore, AssetReadHandle } from '../../storage/asset-byte-store.js';
import { inspectSavedVideoFile } from '../saved-videos/saved-video-inspection.js';
import {
  appendStoredVideoVersions,
  SAVED_VIDEO_VERSION_LIMIT,
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
  /**
   * `video-version` is the Version holding the cut; a rendition's Version is named by its
   * placement, so the id is the same however the browser ordered its attempt and whichever member
   * turned out to lead. Every purpose that existed before a save could make several is unchanged,
   * which is what keeps an older receipt reproducing the ids it already recorded.
   */
  purpose:
    | 'saved-video'
    | 'video-version'
    | 'project-revision'
    | `video-version:${ProjectExportPlacementAspect}`,
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
   * Which placements this save produced, in canonical order, and which of them leads.
   *
   * Every refusal that can be made from metadata alone is made here, before a single asset is
   * streamed: a malformed set, a join that no longer holds, a video that would pass its Version
   * cap. The revision's own placement is the operator's intent, not a gate — a save may carry
   * placements it did not choose, and a set whose chosen member failed still has a leader.
   */
  #placementSet(
    current: ProjectCurrentRead,
    request: SaveProjectOutputRequest,
    targetAggregate: StoredSavedVideoAggregate | null,
  ): {
    readonly members: readonly {
      readonly specification: ProjectExportSpecificationValue;
      readonly assetId: string;
    }[];
    readonly primary: number | null;
    readonly presentsOutput: boolean;
    readonly joinedTo: StoredVideoVersion | null;
  } {
    const joining = request.variantSetId !== undefined;
    let set;
    try {
      set = projectOutputPrimaryPlacement(
        current.revision.snapshot.exportSpecification,
        request.renditions.map(({ specification }) => specification),
        { joining },
      );
    } catch (error) {
      if (error instanceof ProjectRuleError) throw new AppError(409, 'conflict', error.message);
      throw error;
    }
    // The set is distinct by aspect, so each canonical member names exactly one of the renditions.
    const members = set.order.map((specification) => ({
      specification,
      assetId: request.renditions.find(
        (rendition) => rendition.specification.aspect === specification.aspect,
      )!.media.assetId,
    }));

    let joinedTo: StoredVideoVersion | null = null;
    if (joining) {
      const currentVersion =
        targetAggregate?.versions.find(({ id }) => id === targetAggregate.video.currentVersionId) ??
        null;
      const reference = current.revision.snapshot.lastSuccessfulOutput;
      /*
       * One comparison saying three things: the set exists on this owner's own video, the Project
       * has not moved on since that set was saved, and no unrelated Version has landed in between.
       * The last is what keeps a set's members at consecutive ordinals, which is all the surfaces
       * need to show them together. The set id arrives in the body and is never trusted on its
       * own — it is only ever checked against what this owner's session can already reach.
       */
      if (
        targetAggregate === null ||
        currentVersion === null ||
        currentVersion.variantSetId !== request.variantSetId ||
        reference === null ||
        reference.savedVideoId !== targetAggregate.video.id ||
        reference.videoVersionId !== currentVersion.id
      ) {
        throw new AppError(
          409,
          'conflict',
          'This Project has changed since those placements were saved. Save again to make new ones.',
        );
      }
      const held = new Set(
        targetAggregate.versions
          .filter(({ variantSetId }) => variantSetId === request.variantSetId)
          .map(({ exportSpecification }) => projectExportAspectOf(exportSpecification)),
      );
      const clash = members.find(({ specification }) => held.has(specification.aspect));
      if (clash !== undefined) {
        throw new AppError(
          409,
          'conflict',
          `This video already has a Version for the ${clash.specification.aspect} placement.`,
        );
      }
      joinedTo = currentVersion;
    }

    // The cut is stored as its own Version exactly when it leads; a join never stores it again.
    const writes = members.length + (set.primary === null ? 1 : 0);
    if ((targetAggregate?.versions.length ?? 0) + writes > SAVED_VIDEO_VERSION_LIMIT) {
      throw new AppError(
        409,
        'conflict',
        `A video holds at most ${SAVED_VIDEO_VERSION_LIMIT} Versions. Save these placements to a new video.`,
      );
    }
    return { members, primary: set.primary, presentsOutput: set.presentsOutput, joinedTo };
  }

  /**
   * The bytes each placement of this save is made of.
   *
   * One member at a time: inspecting an asset streams the whole file to a private temp copy that
   * the inspection removes before the next member opens one, so a four-placement save costs one
   * asset copy on disk at a time rather than four. The stage's own media is still resolved and
   * checked separately, because the save is still a statement about that exact cut.
   */
  async #resolveRenditions(
    ownerUserId: string,
    members: readonly {
      readonly specification: ProjectExportSpecificationValue;
      readonly assetId: string;
    }[],
  ): Promise<
    readonly {
      asset: AssetReadHandle;
      inspected: InspectedVideo;
      specification: ProjectExportSpecificationValue;
    }[]
  > {
    const resolved = [];
    for (const { specification, assetId } of members) {
      const asset = await this.bytes.open(ownerUserId, assetId);
      if (asset === null) {
        throw new AppError(
          404,
          'asset_missing',
          `The re-framed video for the ${specification.aspect} placement is unavailable.`,
        );
      }
      const inspected = await inspectStoredProjectMedia(asset, this.#inspect);
      assertManifestMatchesInspection(asset, inspected);
      if (!projectExportMatchesFrame(specification, inspected)) {
        throw new AppError(
          409,
          'conflict',
          `The re-framed video no longer matches the ${specification.aspect} placement it was saved for.`,
        );
      }
      resolved.push({ asset, inspected, specification });
    }
    return resolved;
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
    const targetAggregate =
      request.target.kind === 'version'
        ? await this.savedVideos.get(ownerUserId, request.target.savedVideoId)
        : null;
    if (request.target.kind === 'version' && targetAggregate === null) {
      throw new AppError(404, 'not_found', 'That Saved Video is unavailable.');
    }
    // Everything a refusal can be decided from without reading bytes is decided first.
    const placement = this.#placementSet(current, request, targetAggregate);
    // Independent reads, each of which streams a whole asset out of storage to inspect it. Run
    // together so a placement save costs one asset read's wall-clock rather than two, while the
    // members themselves stay serial so only one rendition copy exists on disk at a time.
    const [media, renditions] = await Promise.all([
      this.#resolveReadyMedia(ownerUserId, current, request.media),
      this.#resolveRenditions(ownerUserId, placement.members),
    ]);
    /*
     * A re-framed file is a deliverable, not the next thing to work from. Presenting it would make
     * the stage show the crop and make every later save re-frame an already-re-framed video, while
     * the Project still holds the untouched cut it came from. So the Project presents what it
     * stored only when the cut itself is what led this save.
     */
    const presentsOutput = placement.presentsOutput;
    const now = this.#now().toISOString();
    const savedVideoId =
      request.target.kind === 'new'
        ? projectOutputId(ownerUserId, operationId, 'saved-video')
        : request.target.savedVideoId;
    /*
     * A join takes its attribution from the set it joins rather than from the producing revision,
     * whose creative selections the save that made that set already cleared. Copying keeps every
     * member of one set naming the same Character.
     */
    const attribution =
      placement.joinedTo === null
        ? outputAttribution(current, media)
        : {
            characterName: placement.joinedTo.characterName,
            characterVariantName: placement.joinedTo.characterVariantName,
          };
    const sourceVersionId =
      request.target.kind === 'version'
        ? request.target.expectedVersionId
        : media.reference.kind === 'saved-video-version'
          ? media.reference.videoVersionId
          : null;
    /**
     * The set this save's Versions belong to. Its own operation id when it starts one, so any
     * Project-saved Version can later be joined, and the id it was handed when it joins one.
     */
    const variantSetId = request.variantSetId ?? operationId;
    const versionFor = (
      bytes: { asset: AssetReadHandle; inspected: InspectedVideo },
      specification: ProjectExportSpecificationValue | null,
      ordinal: number,
    ): StoredVideoVersion => ({
      id: projectOutputId(
        ownerUserId,
        operationId,
        specification === null || !isProjectExportPlacementAspect(specification.aspect)
          ? 'video-version'
          : `video-version:${specification.aspect}`,
      ),
      videoId: savedVideoId,
      ownerUserId,
      ordinal,
      origin: outputOrigin(current, media),
      ...attribution,
      sourceVersionId,
      assetId: bytes.asset.manifest.assetId,
      thumbnailAssetId: null,
      mimeType: bytes.inspected.mimeType,
      filename: bytes.asset.manifest.filename,
      sizeBytes: bytes.inspected.sizeBytes,
      durationMs: Math.max(1, Math.round(bytes.inspected.durationMs)),
      width: bytes.inspected.width,
      height: bytes.inspected.height,
      // The placement these bytes were produced for, so the Version states its own shape rather
      // than borrowing the intent recorded on the revision, which the two can outlive separately.
      exportSpecification: specification,
      variantSetId,
      createdAt: now,
    });
    /*
     * Write order: the siblings, then the primary. Because the primary is written last it is the
     * Saved Video's current Version, the receipt's scalar, the Project's `lastSuccessfulOutput`
     * and the result's one `output` — so every pointer and validator that predates sets keeps the
     * meaning it had. The ordinal a member receives therefore follows write order, not the order
     * the browser rendered them in.
     */
    const cut = { asset: media.asset, inspected: media.inspected };
    const stored = placement.primary === null ? cut : renditions[placement.primary]!;
    const ordered: readonly {
      readonly bytes: { readonly asset: AssetReadHandle; readonly inspected: InspectedVideo };
      readonly specification: ProjectExportSpecificationValue | null;
    }[] = [
      ...renditions
        .filter((_, index) => index !== placement.primary)
        .map((member) => ({ bytes: member, specification: member.specification })),
      {
        bytes: stored,
        specification:
          placement.primary === null ? null : renditions[placement.primary]!.specification,
      },
    ];
    const firstOrdinal = (targetAggregate?.versions.length ?? 0) + 1;
    const versions = ordered.map(({ bytes, specification }, index) =>
      versionFor(bytes, specification, firstOrdinal + index),
    );
    const version = versions.at(-1)!;
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
            versions,
            revision: 1,
          }
        : appendStoredVideoVersions(targetAggregate, versions);

    let transition;
    try {
      transition = saveProjectOutput(
        projectAggregateForCurrent(current),
        {
          expectedProjectVersion: request.expectedVersion,
          expectedRevisionNumber: request.expectedRevisionNumber,
          savedVideoId,
          videoVersionId: version.id,
          siblingVersionIds: versions.slice(0, -1).map(({ id }) => id),
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
    // One link per Version this save wrote, in the same order; the primary's is the last of them.
    const outputs = transition.value.outputLinks.slice(-versions.length);
    const output = outputs.at(-1)!;
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
              versions,
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
      outputs,
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
