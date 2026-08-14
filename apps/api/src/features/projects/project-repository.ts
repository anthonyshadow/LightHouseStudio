import type {
  Project,
  ProjectAggregate,
  ProjectAssetLink,
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
import type { ProjectOutputSaveResult } from '@studio/contracts';

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
}

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
  readonly cursor?: ProjectSummaryCursor;
  readonly pageSize: number;
}

export interface ProjectSummaryPage {
  readonly projects: readonly Project[];
  readonly nextCursor: ProjectSummaryCursor | null;
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
      | {
          readonly kind: 'create';
          readonly aggregate: StoredSavedVideoAggregate;
        }
      | {
          readonly kind: 'append';
          readonly videoId: string;
          readonly expectedVersionId: string;
          readonly version: StoredVideoVersion;
        };
    readonly projectRevision: AppendProjectRevisionPersistenceInput;
    readonly output: ProjectOutputLink;
    /** Hydration record for the post-save revision's exact presented Saved Video Version. */
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
