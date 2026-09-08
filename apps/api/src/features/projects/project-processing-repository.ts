import type {
  InspectedVideo,
  ProjectProcessingCapability,
  VideoJobErrorCode,
  VideoOutputResolution,
} from '@studio/contracts';
import type {
  ProjectAssetLink,
  ProjectConflict,
  ProjectJobLink,
  ProjectMediaReference,
} from '@studio/domain';
import type {
  DurableProcessingJobOutcome,
  ResumableVideoProcessingJob,
  VideoProcessingJobTrace,
} from '../processing-jobs/file-processing-job-repository.js';
import type { StoredAssetManifest } from '../../storage/asset-byte-store.js';
import type {
  AppendProjectRevisionPersistenceInput,
  ProjectWorkingMediaRead,
  ProjectWorkingMediaRecord,
} from './project-repository.js';

export type PersistedProcessingJobStatus =
  | 'pending'
  | 'validating'
  | 'submitting'
  | 'accepted'
  | 'ambiguous'
  | 'queued'
  | 'processing'
  | 'retrieving'
  | 'ready'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface ProjectProcessingAttemptRecord {
  readonly operationId: string;
  readonly ownerUserId: string;
  readonly projectId: string;
  readonly capability: ProjectProcessingCapability;
  readonly provider: string;
  readonly providerJobId: string | null;
  readonly requestFingerprint: string;
  readonly inputAssetId: string;
  /** Preallocated before submission so partial byte retention is discoverable after restart. */
  readonly resultAssetId: string;
  readonly outputAssetId: string | null;
  readonly result: InspectedVideo | null;
  readonly retryOfOperationId: string | null;
  readonly attemptNumber: number;
  readonly initiatingRevisionId: string;
  readonly initiatingRevisionNumber: number;
  readonly resultRevisionId: string | null;
  readonly resultRevisionNumber: number | null;
  readonly status: PersistedProcessingJobStatus;
  readonly safeErrorCode: VideoJobErrorCode | 'processing_failed' | null;
  readonly outputResolution: VideoOutputResolution;
  readonly providerOutputLocation: string | null;
  readonly sourceDurationMs: number;
  readonly sourceOrientation: 'landscape' | 'portrait';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly acceptedAt: string | null;
  readonly completedAt: string | null;
  readonly expiresAt: string;
}

export type ProjectProcessingAdmissionResult =
  | { readonly kind: 'admitted' | 'replayed'; readonly attempt: ProjectProcessingAttemptRecord }
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'conflict';
      readonly conflict:
        | Extract<ProjectConflict, { readonly kind: 'project-version' | 'revision' }>
        | { readonly kind: 'operation-key' }
        | { readonly kind: 'active-attempt'; readonly operationId: string }
        | { readonly kind: 'retry-mismatch' };
    };

export interface ProjectProcessingHistoryPage {
  readonly attempts: readonly ProjectProcessingAttemptRecord[];
  readonly currentOperationId: string | null;
  readonly supersededOperationIds: readonly string[];
  readonly heldMedia: readonly ProjectMediaReference[];
  readonly nextCursor: { readonly createdAt: string; readonly operationId: string } | null;
}

/**
 * What the head revision says, for the two questions a public attempt has to answer: which attempt
 * the Project is on, and what media it actually holds. Both come from one read of the current
 * revision, so they are returned together rather than able to disagree.
 */
export interface ProjectProcessingCurrentAuthority {
  readonly attempt: ProjectProcessingAttemptRecord | null;
  readonly heldMedia: readonly ProjectMediaReference[];
}

export type ProjectProcessingResultRetentionResult =
  | {
      readonly kind: 'retained-current' | 'replayed-current';
      readonly attempt: ProjectProcessingAttemptRecord;
      readonly workingMedia: ProjectWorkingMediaRead;
    }
  | {
      readonly kind: 'retained-historical' | 'replayed-historical';
      readonly attempt: ProjectProcessingAttemptRecord;
    }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'conflict' };

export interface ProjectProcessingRepository {
  admitProjectAttempt(input: {
    readonly attempt: ProjectProcessingAttemptRecord;
    readonly link: ProjectJobLink;
    readonly expectedVersion: number;
    readonly expectedRevisionNumber: number;
  }): Promise<ProjectProcessingAdmissionResult>;
  getProjectAttempt(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<ProjectProcessingAttemptRecord | null>;
  /**
   * The durable state of several of this owner's attempts at once, keyed by operation id and
   * holding only the ids that are Project-linked attempts of theirs. Read-only, and not scoped to
   * one Project: the caller has job ids, not the Projects they belong to.
   */
  findProjectAttemptOutcomes(
    ownerUserId: string,
    jobIds: readonly string[],
  ): Promise<ReadonlyMap<string, DurableProcessingJobOutcome>>;
  getCurrentProjectAuthority(
    ownerUserId: string,
    projectId: string,
  ): Promise<ProjectProcessingCurrentAuthority | null>;
  isProjectAttemptSuperseded(
    ownerUserId: string,
    projectId: string,
    operationId: string,
  ): Promise<boolean>;
  listProjectAttempts(
    ownerUserId: string,
    projectId: string,
    input: {
      readonly cursor?: { readonly createdAt: string; readonly operationId: string };
      readonly pageSize: number;
    },
  ): Promise<ProjectProcessingHistoryPage | null>;
  updateProjectAttemptTrace(trace: VideoProcessingJobTrace): Promise<boolean>;
  listResumableProjectAttempts(now: string): Promise<readonly ResumableVideoProcessingJob[]>;
  retainProjectResult(input: {
    readonly ownerUserId: string;
    readonly projectId: string;
    readonly operationId: string;
    readonly manifest: StoredAssetManifest;
    readonly inspected: InspectedVideo;
    readonly jobOutputLink: ProjectAssetLink;
    readonly currentPromotion: {
      readonly expectedVersion: number;
      readonly expectedRevisionNumber: number;
      readonly expectedCurrentOperationId: string;
      readonly revision: AppendProjectRevisionPersistenceInput;
      readonly media: ProjectWorkingMediaRecord;
    } | null;
    readonly retainedAt: string;
  }): Promise<ProjectProcessingResultRetentionResult>;
}

export const projectProcessingAttemptMatchesTrace = (
  attempt: ProjectProcessingAttemptRecord,
  trace: VideoProcessingJobTrace,
): boolean =>
  attempt.operationId === trace.jobId &&
  attempt.ownerUserId === trace.ownerUserId &&
  attempt.capability === trace.operation &&
  attempt.provider === trace.provider &&
  attempt.requestFingerprint === trace.requestFingerprint &&
  attempt.outputResolution === trace.outputResolution;

export const projectProcessingResultInputMatchesAttempt = (
  input: Parameters<ProjectProcessingRepository['retainProjectResult']>[0],
  attempt: ProjectProcessingAttemptRecord,
): boolean =>
  input.manifest.ownerUserId === input.ownerUserId &&
  input.manifest.assetId === attempt.resultAssetId &&
  input.manifest.mimeType === input.inspected.mimeType &&
  input.manifest.sizeBytes === input.inspected.sizeBytes &&
  input.jobOutputLink.projectId === input.projectId &&
  input.jobOutputLink.ownerUserId === input.ownerUserId &&
  input.jobOutputLink.assetId === attempt.resultAssetId &&
  input.jobOutputLink.role === 'job-output' &&
  input.jobOutputLink.revisionId === attempt.initiatingRevisionId &&
  input.jobOutputLink.revisionNumber === attempt.initiatingRevisionNumber;

export const retainedProjectProcessingResultMatches = (
  attempt: ProjectProcessingAttemptRecord,
  manifest: StoredAssetManifest,
  inspected: InspectedVideo,
): boolean =>
  attempt.outputAssetId === manifest.assetId &&
  JSON.stringify(attempt.result) === JSON.stringify(inspected);

/**
 * Whether the operation that produced this retained result is still the current one, so the result
 * may be promoted to current working media rather than recorded as historical.
 *
 * The four-value comparison both Project stores make under their own lock: the Project still sits
 * on the revision this attempt initiated from, and the attempt that revision holds is both
 * `expectedCurrentOperationId` and this attempt. Today the only producer sets
 * `expectedCurrentOperationId` to the retained attempt's own id, so the last clause is a tautology
 * and the third carries the whole operation test. The two are kept separate because both stores
 * compare them separately today; collapsing them would be a behaviour decision, not a refactor.
 *
 * Deliberately excludes CAS. `expectedVersion` and `expectedRevisionNumber` are a separate
 * optimistic-concurrency test, and the two stores apply it in different places to different effect:
 * the file store folds it into this decision, so a version bump makes the result a terminal
 * `retained-historical` that can never be promoted afterwards; the Drizzle store checks it after
 * this and answers `conflict`, which the service surfaces as a 409 that a later progression tick
 * can re-drive. Passing either value here would change one store's answer, and converging them is
 * a product decision that has not been taken.
 *
 * This is the under-lock half of a two-phase check. The other half is `promoteProjectJobResult` in
 * `@studio/domain`, which decides whether to BUILD a promotion from values read outside the lock.
 * Do not merge them.
 */
export const projectProcessingResultRemainsPromotable = (input: {
  readonly currentRevisionId: string | null;
  readonly currentRevisionNumber: number;
  readonly attemptInitiatingRevisionId: string;
  readonly attemptInitiatingRevisionNumber: number;
  readonly attemptOperationId: string;
  readonly currentAttemptOperationId: string | null | undefined;
  readonly expectedCurrentOperationId: string;
}): boolean =>
  input.currentRevisionId === input.attemptInitiatingRevisionId &&
  input.currentRevisionNumber === input.attemptInitiatingRevisionNumber &&
  input.currentAttemptOperationId === input.expectedCurrentOperationId &&
  input.expectedCurrentOperationId === input.attemptOperationId;

export const resumableProjectProcessingAttempt = (
  attempt: ProjectProcessingAttemptRecord,
  now: string,
): ResumableVideoProcessingJob | null => {
  if (
    attempt.expiresAt <= now ||
    attempt.capability === 'voice' ||
    attempt.providerJobId === null ||
    (attempt.status !== 'accepted' &&
      attempt.status !== 'queued' &&
      attempt.status !== 'processing' &&
      attempt.status !== 'retrieving')
  ) {
    return null;
  }
  return {
    jobId: attempt.operationId,
    ownerUserId: attempt.ownerUserId,
    projectId: attempt.projectId,
    operation: attempt.capability,
    provider: attempt.provider,
    providerJobId: attempt.providerJobId,
    requestFingerprint: attempt.requestFingerprint,
    status: attempt.status === 'accepted' ? 'queued' : attempt.status,
    outputResolution: attempt.outputResolution,
    providerOutputLocation: attempt.providerOutputLocation,
    sourceDurationMs: attempt.sourceDurationMs,
    sourceOrientation: attempt.sourceOrientation,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    expiresAt: attempt.expiresAt,
  };
};

export const isProjectProcessingRepository = (
  value: unknown,
): value is ProjectProcessingRepository =>
  typeof value === 'object' &&
  value !== null &&
  'admitProjectAttempt' in value &&
  typeof value.admitProjectAttempt === 'function' &&
  'isProjectAttemptSuperseded' in value &&
  typeof value.isProjectAttemptSuperseded === 'function' &&
  'retainProjectResult' in value &&
  typeof value.retainProjectResult === 'function';
