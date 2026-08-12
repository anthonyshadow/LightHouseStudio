import type {
  Project,
  ProjectAggregate,
  ProjectAssetLink,
  ProjectConflict,
  ProjectJobLink,
  ProjectOutputLink,
  ProjectRevision,
  ProjectVersionReferenceLink,
} from '@studio/domain';
import type {
  SavedVideoReceipt,
  StoredSavedVideoAggregate,
  StoredVideoVersion,
} from '../saved-videos/saved-video-repository.js';

export type ProjectPersistenceMutationResult =
  | { readonly kind: 'updated' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict'; readonly conflict: ProjectConflict };

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

export interface ProjectRevisionHistoryPage {
  readonly revisions: readonly ProjectRevision[];
  readonly nextRevisionNumber: number | null;
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

/**
 * Application seam for Prompt 11's crash-safe composite save. Implementations must commit all
 * metadata in one authority transaction; no caller may emulate this with sequential repository
 * calls.
 */
export interface ProjectOutputMetadataUnitOfWork {
  commit(input: {
    readonly ownerUserId: string;
    readonly savedVideo:
      | {
          readonly kind: 'create';
          readonly aggregate: StoredSavedVideoAggregate;
          readonly receipt: SavedVideoReceipt;
        }
      | {
          readonly kind: 'append';
          readonly videoId: string;
          readonly expectedVersionId: string;
          readonly version: StoredVideoVersion;
          readonly receipt: SavedVideoReceipt;
        };
    readonly projectRevision: AppendProjectRevisionPersistenceInput;
    readonly output: ProjectOutputLink;
  }): Promise<ProjectPersistenceMutationResult>;
}

/** Common owner-scoped media-retention policy; local Project authority will implement this port. */
export interface ProjectRetentionPolicy {
  retainsAsset(ownerUserId: string, assetId: string): Promise<boolean>;
  retainedAssetIds(ownerUserId: string, assetIds: readonly string[]): Promise<ReadonlySet<string>>;
}

export interface ProjectRepository {
  create(aggregate: ProjectAggregate): Promise<void>;
  getCurrent(ownerUserId: string, projectId: string): Promise<ProjectCurrentRead | null>;
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
  updateMetadata(
    ownerUserId: string,
    expectedVersion: number,
    nextProject: Project,
  ): Promise<ProjectPersistenceMutationResult>;
  linkJob(link: ProjectJobLink): Promise<ProjectLinkMutationResult>;
  linkOutput(link: ProjectOutputLink): Promise<ProjectLinkMutationResult>;
}
