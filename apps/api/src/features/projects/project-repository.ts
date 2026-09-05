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
} from '@studio/domain';
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

export type ProjectLinkMutationResult =
  | { readonly kind: 'linked'; readonly replayed: boolean }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'conflict';
      readonly conflict: Extract<ProjectConflict, { readonly kind: 'relation-mismatch' }>;
    };

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
  linkJob(link: ProjectJobLink): Promise<ProjectLinkMutationResult>;
  linkOutput(link: ProjectOutputLink): Promise<ProjectLinkMutationResult>;
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
