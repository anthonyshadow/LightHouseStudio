import type {
  Project,
  ProjectAggregate,
  ProjectAssetLink,
  ProjectAssetMembership,
  ProjectAssetKind,
  ProjectConflict,
  ProjectJobLink,
  ProjectMediaReference,
  ProjectOutputLink,
  ProjectRevision,
  ProjectSourceKind,
  ProjectVersionReferenceLink,
  ProjectExportSpecification,
} from '@studio/domain';
import { projectMediaReferencesEqual } from '@studio/domain';
import type {
  StoredSavedVideoAggregate,
  StoredVideoVersion,
} from '../saved-videos/saved-video-repository.js';
import type { ListTotal, ProjectOutputSaveResult } from '@studio/contracts';

export type ProjectPersistenceMutationResult =
  | { readonly kind: 'updated' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict'; readonly conflict: ProjectConflict };

export interface ProjectCreateReceipt {
  readonly operationKey: string;
  readonly requestFingerprint: string;
  readonly projectId: string;
  readonly createdAt: string;
}

export type ProjectCreatePersistenceResult =
  | { readonly kind: 'created' | 'replayed'; readonly current: ProjectCurrentRead }
  | {
      readonly kind: 'conflict';
      readonly conflict: Extract<
        ProjectConflict,
        { readonly kind: 'operation-key' | 'campaign-membership' }
      >;
    };

export interface AppendProjectRevisionPersistenceInput {
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly nextProject: Project;
  readonly revision: ProjectRevision;
  readonly assetLinks: readonly ProjectAssetLink[];
  readonly assetMemberships?: readonly ProjectAssetMembership[];
}

export interface ProjectAssetMembershipCursor {
  readonly createdAt: string;
  readonly membershipId: string;
}

export interface ProjectAssetMembershipPageInput {
  readonly kind?: ProjectAssetKind;
  readonly cursor?: ProjectAssetMembershipCursor;
  readonly pageSize: number;
}

export interface ProjectAssetMembershipPage {
  readonly memberships: readonly ProjectAssetMembership[];
  readonly nextCursor: ProjectAssetMembershipCursor | null;
}

export type ProjectAssetMembershipAttachResult =
  | { readonly kind: 'attached' | 'existing'; readonly membership: ProjectAssetMembership }
  | { readonly kind: 'not-found' | 'archived' };

export type ProjectAssetMembershipDetachResult =
  | { readonly kind: 'detached'; readonly removed: boolean }
  | { readonly kind: 'not-found' | 'archived' };

export interface ProjectCurrentRead {
  readonly project: Project;
  readonly revision: ProjectRevision;
}

export const projectAggregateForCurrent = (current: ProjectCurrentRead): ProjectAggregate => ({
  project: current.project,
  revisions: [current.revision],
  assetLinks: [],
  versionReferenceLinks: [],
  jobLinks: [],
  outputLinks: [],
});

export interface ProjectSourceRecord {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly assetId: string;
  readonly kind: ProjectSourceKind;
  readonly savedVideoId: string | null;
  readonly videoVersionId: string | null;
  readonly acceptedRevisionId: string;
  readonly acceptedRevisionNumber: number;
  readonly operationKey: string;
  readonly requestFingerprint: string;
  readonly mimeType: 'video/mp4' | 'video/quicktime' | 'video/webm';
  readonly filename: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly container: 'mp4' | 'quicktime' | 'webm';
  readonly videoCodec: 'avc' | 'vp8';
  readonly audioCodec: string | null;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly hasAudio: boolean;
  readonly acceptedAt: string;
}

export type ProjectWorkingMediaKind = 'local-render' | 'media-asset' | 'saved-video-version';

/**
 * What the server learned about a re-framed video when it accepted the upload, kept so the save
 * that names it later can trust the bytes it is about to record without opening them again.
 *
 * One record per accepted asset. The specification is the placement the browser said it rendered
 * for, already checked against the frame at upload time; the rest is the inspection of those
 * bytes, keyed by the checksum the manifest still carries so a save can tell the record describes
 * the asset it is looking at.
 */
export interface ProjectRenditionRecord {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly assetId: string;
  /** The upload's idempotency key: one accepted upload, one record. */
  readonly operationKey: string;
  readonly specification: ProjectExportSpecification;
  readonly mimeType: 'video/mp4' | 'video/quicktime' | 'video/webm';
  readonly filename: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly container: 'mp4' | 'quicktime' | 'webm';
  readonly videoCodec: 'avc' | 'vp8';
  readonly audioCodec: string | null;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly hasAudio: boolean;
  readonly uploadedAt: string;
}

export interface ProjectWorkingMediaRecord {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly kind: ProjectWorkingMediaKind;
  readonly mediaReference: ProjectMediaReference;
  readonly assetId: string;
  readonly savedVideoId: string | null;
  readonly videoVersionId: string | null;
  readonly adoptedRevisionId: string;
  readonly adoptedRevisionNumber: number;
  readonly operationKey: string;
  readonly requestFingerprint: string;
  readonly mimeType: 'video/mp4' | 'video/quicktime' | 'video/webm';
  readonly filename: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly container: 'mp4' | 'quicktime' | 'webm';
  readonly videoCodec: 'avc' | 'vp8';
  readonly audioCodec: string | null;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly hasAudio: boolean;
  readonly adoptedAt: string;
}

export interface ProjectWorkingMediaRead {
  /** Current Project metadata and revision; media retains its original adoption revision. */
  readonly project: Project;
  readonly revision: ProjectRevision;
  readonly media: ProjectWorkingMediaRecord;
}

export type ProjectWorkingMediaAdoptionResult =
  | {
      readonly kind: 'adopted' | 'replayed';
      readonly value: ProjectWorkingMediaRead;
    }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'conflict';
      readonly conflict: Extract<
        ProjectConflict,
        | { readonly kind: 'operation-key' }
        | { readonly kind: 'project-version' }
        | { readonly kind: 'revision' }
      >;
    };

export interface AdoptProjectWorkingMediaPersistenceInput extends AppendProjectRevisionPersistenceInput {
  readonly media: ProjectWorkingMediaRecord;
}

export interface ProjectCurrentSourceRead {
  readonly current: ProjectCurrentRead;
  readonly source: ProjectSourceRecord | null;
}

export type ProjectSourceAcceptanceResult =
  | {
      readonly kind: 'accepted' | 'replayed';
      readonly current: ProjectCurrentRead;
      readonly source: ProjectSourceRecord;
    }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'conflict';
      readonly conflict: Extract<
        ProjectConflict,
        | { readonly kind: 'operation-key' }
        | { readonly kind: 'project-version' }
        | { readonly kind: 'revision' }
        | { readonly kind: 'immutable-source' }
      >;
    };

export interface AcceptProjectSourcePersistenceInput extends AppendProjectRevisionPersistenceInput {
  readonly source: ProjectSourceRecord;
}

export interface RemoveProjectSourcePersistenceInput extends AppendProjectRevisionPersistenceInput {
  /** The exact source asset the caller resolved; the transaction verifies it before deleting. */
  readonly removedAssetId: string;
}

export type ProjectSourceRemovalResult =
  | { readonly kind: 'removed'; readonly current: ProjectCurrentRead }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'conflict';
      readonly conflict: Extract<
        ProjectConflict,
        | { readonly kind: 'project-version' }
        | { readonly kind: 'revision' }
        | { readonly kind: 'active-jobs' }
      >;
    };

export interface ProjectRevisionHistoryPage {
  readonly revisions: readonly ProjectRevision[];
  readonly nextRevisionNumber: number | null;
}

export interface ProjectSummaryCursor {
  readonly updatedAt: string;
  readonly projectId: string;
}

export interface ProjectSummaryPageInput {
  readonly lifecycle: 'active' | 'archived';
  readonly campaignId?: string;
  /**
   * Matched case-insensitively against the Project title. Already trimmed and length-bounded by
   * the contract, so an implementation applies it rather than re-validating it.
   */
  readonly search?: string;
  readonly cursor?: ProjectSummaryCursor;
  readonly pageSize: number;
}

/**
 * The Saved Video Version a listed Project can be shown by, resolved from the Project's own current
 * revision. Only Projects that resolve to one appear here, so `previews` is never row-aligned with
 * `projects` — callers key it by `projectId`.
 */
export interface ProjectSummaryPreview {
  readonly projectId: string;
  readonly savedVideoId: string;
  readonly videoVersionId: string;
}

export interface ProjectSummaryPage {
  readonly projects: readonly Project[];
  /**
   * Resolved inside the page read, never per row: a list surface that showed the work by asking one
   * question per Project would turn a page into a round trip per row.
   */
  readonly previews: readonly ProjectSummaryPreview[];
  readonly nextCursor: ProjectSummaryCursor | null;
  /**
   * How many Projects match the query as a whole, independent of where the cursor is: a total that
   * shrank as the operator paged would not be a total. Bounded, so it never costs a full scan.
   */
  readonly total: ListTotal;
}

export type ProjectLinkHistoryKind = 'asset' | 'version-reference' | 'job' | 'output';

export type ProjectLinkHistoryItem =
  ProjectAssetLink | ProjectVersionReferenceLink | ProjectJobLink | ProjectOutputLink;

export interface ProjectLinkHistoryPage {
  readonly links: readonly ProjectLinkHistoryItem[];
  readonly nextCursor: { readonly revisionNumber: number; readonly key: string } | null;
}

export interface ProjectOutputOperationReceipt {
  readonly operationId: string;
  readonly requestFingerprint: string;
  readonly projectId: string;
  readonly savedVideoId: string;
  readonly videoVersionId: string;
  readonly resultRevisionId: string;
  readonly resultRevisionNumber: number;
  readonly result: ProjectOutputSaveResult;
  readonly createdAt: string;
}

export type ProjectOutputMetadataCommitResult =
  | {
      readonly kind: 'committed' | 'replayed';
      readonly receipt: ProjectOutputOperationReceipt;
    }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'conflict';
      readonly conflict: Extract<
        ProjectConflict,
        | { readonly kind: 'operation-key' }
        | { readonly kind: 'project-version' }
        | { readonly kind: 'revision' }
        | { readonly kind: 'saved-video-version' }
      >;
    };

/**
 * Application seam for Prompt 11's crash-safe composite save. Implementations must commit all
 * metadata in one authority transaction; no caller may emulate this with sequential repository
 * calls.
 */
export interface ProjectOutputMetadataUnitOfWork {
  findReceipt(
    ownerUserId: string,
    operationId: string,
  ): Promise<ProjectOutputOperationReceipt | null>;
  commit(input: {
    readonly ownerUserId: string;
    readonly receipt: ProjectOutputOperationReceipt;
    readonly savedVideo:
      /**
       * One save writes one Version per placement it produced, in write order, with the primary
       * last — so the Saved Video's current Version, the receipt's scalars and the result's single
       * `output` all name the primary without any of them learning what a set is.
       */
      | {
          readonly kind: 'create';
          readonly aggregate: StoredSavedVideoAggregate;
        }
      | {
          readonly kind: 'append';
          readonly videoId: string;
          readonly expectedVersionId: string;
          /**
           * The aggregate revision the caller composed its response and receipt from. The commit
           * writes `expectedRevision + 1`, so this expectation is what makes the recorded
           * `savedVideo.revision` true rather than a guess — a rename landing between the
           * caller's read and this transaction bumps the row and must surface as a conflict, not
           * as a durably recorded stale token.
           */
          readonly expectedRevision: number;
          readonly versions: readonly StoredVideoVersion[];
        };
    readonly projectRevision: AppendProjectRevisionPersistenceInput;
    /** One link per written Version, in the same order — every placement of one save has its own. */
    readonly outputs: readonly ProjectOutputLink[];
    /**
     * Hydration record for whatever the post-save revision presents: the Saved Video Version when
     * that Version is the cut itself, and the cut it was produced from when the Version holds bytes
     * re-framed for a placement. Its fields describe the bytes its reference names, either way.
     */
    readonly media: ProjectWorkingMediaRecord;
  }): Promise<ProjectOutputMetadataCommitResult>;
}

/**
 * The core of "the appended revision continues the row this transaction locked".
 *
 * Written identically at every Drizzle revision-append site; each caller keeps its own additional
 * clauses and its own `ProjectPersistenceError` message, so what varies stays local and only the
 * shared eleven clauses have one owner. Every clause is a pure comparison, so a caller may place
 * its extra clauses before or after this call without changing the result.
 *
 * Deliberately not called from `FileProjectRepository`: it raises no such error today, and adding
 * one would change file-mode behaviour.
 */
export const projectRevisionContinuesAggregate = (
  nextProject: Pick<
    Project,
    'id' | 'ownerUserId' | 'version' | 'currentRevisionId' | 'currentRevisionNumber'
  >,
  revision: Pick<
    ProjectRevision,
    | 'id'
    | 'projectId'
    | 'ownerUserId'
    | 'parentRevisionId'
    | 'parentRevisionNumber'
    | 'revisionNumber'
  >,
  current: Pick<Project, 'id' | 'ownerUserId' | 'version' | 'archivedAt'> & {
    readonly currentRevisionId: string | null;
    readonly currentRevisionNumber: number;
  },
): boolean =>
  nextProject.id === current.id &&
  nextProject.ownerUserId === current.ownerUserId &&
  nextProject.version === current.version + 1 &&
  current.archivedAt === null &&
  revision.projectId === current.id &&
  revision.ownerUserId === current.ownerUserId &&
  revision.parentRevisionId === current.currentRevisionId &&
  revision.parentRevisionNumber === current.currentRevisionNumber &&
  revision.revisionNumber === current.currentRevisionNumber + 1 &&
  nextProject.currentRevisionId === revision.id &&
  nextProject.currentRevisionNumber === revision.revisionNumber;

/**
 * Why a Project output commit would not continue the aggregate it was composed against — or
 * `null` when it would.
 *
 * The one rule both persistence modes hold a save to, stated once. Each mode still reads its own
 * current state under its own lock and raises its own error type; what they share is this
 * predicate over what the service composed: the Versions in write order with the primary last,
 * one output link per Version in the same order, the receipt naming the primary, the post-save
 * revision continuing the current one, and a hydration record that describes the bytes its
 * reference names — the Version when that Version is the cut, and never a re-framed deliverable.
 */
export const projectOutputCommitInconsistency = (
  input: Parameters<ProjectOutputMetadataUnitOfWork['commit']>[0],
  current: Pick<Project, 'id' | 'ownerUserId' | 'version' | 'archivedAt'> & {
    /** A stored row may hold no revision yet; a save always continues one. */
    readonly currentRevisionId: string | null;
    readonly currentRevisionNumber: number | null;
  },
  written: {
    /** Every Version this save writes, in write order; the last is the primary. */
    readonly versions: readonly StoredVideoVersion[];
    readonly savedVideoId: string;
    /** The Saved Video revision the receipt should record: 1 for a create, current + 1 for an append. */
    readonly savedVideoRevision: number;
  },
): string | null => {
  const { receipt, outputs, media, projectRevision } = input;
  const revision = projectRevision.revision;
  const nextProject = projectRevision.nextProject;
  const primary = written.versions.at(-1);
  if (primary === undefined) return 'A Project output save writes at least one Version.';
  const { savedVideoId } = written;
  const presentsOutput =
    media.mediaReference.kind === 'saved-video-version' &&
    media.mediaReference.savedVideoId === savedVideoId &&
    media.mediaReference.videoVersionId === primary.id;
  const hydratesPresentedMedia = presentsOutput
    ? media.kind === 'saved-video-version' &&
      media.assetId === primary.assetId &&
      media.savedVideoId === savedVideoId &&
      media.videoVersionId === primary.id &&
      media.mimeType === primary.mimeType &&
      media.filename === primary.filename &&
      media.sizeBytes === primary.sizeBytes &&
      media.durationMs === primary.durationMs &&
      media.width === primary.width &&
      media.height === primary.height
    : // No Version this save wrote, sibling or primary, may be claimed by a record that does not
      // present it; and its lineage columns have to agree with the reference it does name.
      !written.versions.some((candidate) => media.videoVersionId === candidate.id) &&
      (media.mediaReference.kind === 'saved-video-version'
        ? media.kind === 'saved-video-version' &&
          media.savedVideoId === media.mediaReference.savedVideoId &&
          media.videoVersionId === media.mediaReference.videoVersionId
        : media.kind !== 'saved-video-version' &&
          media.savedVideoId === null &&
          media.videoVersionId === null &&
          media.assetId === media.mediaReference.assetId);
  if (current.archivedAt !== null) return 'The Project is archived.';
  if (current.currentRevisionId === null || current.currentRevisionNumber === null) {
    return 'The Project has no current revision to continue.';
  }
  if (
    receipt.projectId !== current.id ||
    receipt.savedVideoId !== savedVideoId ||
    receipt.videoVersionId !== primary.id ||
    receipt.resultRevisionId !== revision.id ||
    receipt.resultRevisionNumber !== revision.revisionNumber ||
    receipt.result.project.version !== nextProject.version ||
    receipt.result.revision.id !== revision.id ||
    receipt.result.output.videoVersionId !== primary.id ||
    receipt.result.savedVideo.currentVersion.id !== primary.id ||
    receipt.result.savedVideo.revision !== written.savedVideoRevision
  ) {
    return 'The receipt does not name what this save writes.';
  }
  // The shared continuation clauses come from the one owner above; the three below are this
  // save's own. `archivedAt` is already proven null by the guard further up, so folding it back
  // in through the predicate cannot change the answer.
  if (
    projectRevision.ownerUserId !== current.ownerUserId ||
    nextProject.status !== 'completed' ||
    revision.source !== 'output-save' ||
    !projectRevisionContinuesAggregate(nextProject, revision, {
      id: current.id,
      ownerUserId: current.ownerUserId,
      version: current.version,
      archivedAt: current.archivedAt,
      currentRevisionId: current.currentRevisionId,
      currentRevisionNumber: current.currentRevisionNumber,
    })
  ) {
    return 'The post-save revision does not continue the current Project.';
  }
  if (
    outputs.length !== written.versions.length ||
    !outputs.every(
      (link, index) =>
        link.projectId === current.id &&
        link.ownerUserId === current.ownerUserId &&
        link.savedVideoId === savedVideoId &&
        link.videoVersionId === written.versions[index]!.id &&
        link.producingRevisionId === current.currentRevisionId &&
        link.producingRevisionNumber === current.currentRevisionNumber,
    )
  ) {
    return 'The output links do not name the Versions this save writes, in order.';
  }
  if (
    media.projectId !== current.id ||
    media.ownerUserId !== current.ownerUserId ||
    !hydratesPresentedMedia ||
    media.adoptedRevisionId !== revision.id ||
    media.adoptedRevisionNumber !== revision.revisionNumber ||
    media.operationKey !== receipt.operationId ||
    media.requestFingerprint !== receipt.requestFingerprint ||
    !projectMediaReferencesEqual(media.mediaReference, revision.snapshot.workingMedia) ||
    !projectMediaReferencesEqual(media.mediaReference, revision.snapshot.presentedMedia)
  ) {
    return 'The hydration record does not describe what the post-save revision presents.';
  }
  if (
    revision.snapshot.lastSuccessfulOutput?.savedVideoId !== savedVideoId ||
    revision.snapshot.lastSuccessfulOutput.videoVersionId !== primary.id
  ) {
    return 'The post-save revision does not point at the primary Version.';
  }
  return null;
};

export const isProjectOutputMetadataUnitOfWork = (
  value: unknown,
): value is ProjectOutputMetadataUnitOfWork =>
  typeof value === 'object' &&
  value !== null &&
  'findReceipt' in value &&
  typeof value.findReceipt === 'function' &&
  'commit' in value &&
  typeof value.commit === 'function';

/** Common owner-scoped media-retention policy; local Project authority will implement this port. */
export interface ProjectRetentionPolicy {
  retainsAsset(ownerUserId: string, assetId: string): Promise<boolean>;
  retainedAssetIds(ownerUserId: string, assetIds: readonly string[]): Promise<ReadonlySet<string>>;
}

export interface ProjectRepository {
  create(aggregate: ProjectAggregate): Promise<void>;
  createIdempotent(input: {
    readonly aggregate: ProjectAggregate;
    readonly receipt: ProjectCreateReceipt;
  }): Promise<ProjectCreatePersistenceResult>;
  getCurrent(ownerUserId: string, projectId: string): Promise<ProjectCurrentRead | null>;
  getRevision(
    ownerUserId: string,
    projectId: string,
    revisionNumber: number,
  ): Promise<ProjectRevision | null>;
  /**
   * Batched sibling of {@link getRevision} for page reads. History pages resolve one reference
   * revision per row; asking per row turns a page into a per-item round trip.
   */
  getRevisions(
    ownerUserId: string,
    projectId: string,
    revisionNumbers: readonly number[],
  ): Promise<readonly ProjectRevision[]>;
  getCurrentWithSource(
    ownerUserId: string,
    projectId: string,
  ): Promise<ProjectCurrentSourceRead | null>;
  getSource(ownerUserId: string, projectId: string): Promise<ProjectSourceRecord | null>;
  getWorkingMedia(
    ownerUserId: string,
    projectId: string,
    revisionId?: string,
  ): Promise<ProjectWorkingMediaRead | null>;
  getWorkingMediaByOperationKey(
    ownerUserId: string,
    operationKey: string,
  ): Promise<ProjectWorkingMediaRead | null>;
  list(ownerUserId: string, input: ProjectSummaryPageInput): Promise<ProjectSummaryPage>;
  ensureAssetMembershipBackfill(ownerUserId: string): Promise<void>;
  listAssetMemberships(
    ownerUserId: string,
    projectId: string,
    input: ProjectAssetMembershipPageInput,
  ): Promise<ProjectAssetMembershipPage | null>;
  getAssetMembership(
    ownerUserId: string,
    projectId: string,
    kind: ProjectAssetKind,
    resourceId: string,
  ): Promise<ProjectAssetMembership | null>;
  attachAssetMembership(
    membership: ProjectAssetMembership,
  ): Promise<ProjectAssetMembershipAttachResult>;
  detachAssetMembership(
    ownerUserId: string,
    projectId: string,
    membershipId: string,
  ): Promise<ProjectAssetMembershipDetachResult>;
  listRevisionHistory(
    ownerUserId: string,
    projectId: string,
    input: { readonly beforeRevisionNumber?: number; readonly pageSize: number },
  ): Promise<ProjectRevisionHistoryPage | null>;
  listLinkHistory(
    ownerUserId: string,
    projectId: string,
    input: {
      readonly kind: ProjectLinkHistoryKind;
      readonly cursor?: { readonly revisionNumber: number; readonly key: string };
      readonly pageSize: number;
    },
  ): Promise<ProjectLinkHistoryPage | null>;
  appendRevision(
    input: AppendProjectRevisionPersistenceInput,
  ): Promise<ProjectPersistenceMutationResult>;
  acceptSource(input: AcceptProjectSourcePersistenceInput): Promise<ProjectSourceAcceptanceResult>;
  removeSource(input: RemoveProjectSourcePersistenceInput): Promise<ProjectSourceRemovalResult>;
  adoptWorkingMedia(
    input: AdoptProjectWorkingMediaPersistenceInput,
  ): Promise<ProjectWorkingMediaAdoptionResult>;
  /**
   * Keep what an accepted rendition upload learned about its bytes. Recording the same asset
   * again is a no-op: an upload replay commits nothing new.
   */
  recordRendition(record: ProjectRenditionRecord): Promise<void>;
  /** The record for one of this owner's accepted rendition assets, or `null` if none was kept. */
  getRendition(ownerUserId: string, assetId: string): Promise<ProjectRenditionRecord | null>;

  updateMetadata(
    ownerUserId: string,
    expectedVersion: number,
    nextProject: Project,
  ): Promise<ProjectPersistenceMutationResult>;
  updateCampaignMembership(
    ownerUserId: string,
    expectedVersion: number,
    nextProject: Project,
  ): Promise<ProjectPersistenceMutationResult>;
  getOutput(
    ownerUserId: string,
    projectId: string,
    videoVersionId: string,
  ): Promise<ProjectOutputLink | null>;
  assignedSavedVideoIds(
    ownerUserId: string,
    savedVideoIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
}
