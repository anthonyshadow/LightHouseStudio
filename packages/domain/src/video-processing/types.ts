import type { ModelModeId } from '../session';

export type UploadedVideoContainer = 'mp4' | 'quicktime' | 'webm';
export type UploadedVideoCodec = 'avc' | 'vp8';

export type UploadedVideoFacts = Readonly<{
  container: UploadedVideoContainer;
  videoCodec: string;
  durationMs: number;
  width: number;
  height: number;
  sizeBytes: number;
  hasAudio: boolean;
}>;

export type VideoTransformOperationId = 'character-swap' | 'virtual-try-on';

export type VideoTransformStep = Readonly<{
  id: string;
  modelId: ModelModeId;
  prompt: string;
  hasReferenceImage: boolean;
  enhancePrompt: boolean;
  inputKind?: 'character' | 'saved-outfit' | 'reference-image' | 'prompt';
}>;

export type UploadedVideoValidationCode =
  | 'invalid-video'
  | 'unsupported-container'
  | 'unsupported-codec'
  | 'unsupported-aspect-ratio'
  | 'duration-exceeded'
  | 'payload-too-large';

export type UploadedVideoValidationIssue = Readonly<{
  code: UploadedVideoValidationCode;
  message: string;
}>;

export const PROJECT_PROCESSING_JOB_STATUSES = [
  'pending',
  'validating',
  'submitting',
  'accepted',
  'ambiguous',
  'queued',
  'processing',
  'retrieving',
  'ready',
  'failed',
  'expired',
  'cancelled',
] as const;

export type ProjectProcessingJobStatus = (typeof PROJECT_PROCESSING_JOB_STATUSES)[number];

export type ProjectProcessingAttemptFacts = Readonly<{
  operationId: string;
  initiatingRevisionId: string;
  initiatingRevisionNumber: number;
  resultRevisionId: string | null;
  resultRevisionNumber: number | null;
  attemptNumber: number;
  status: ProjectProcessingJobStatus;
  providerJobId: string | null;
  outputAssetId: string | null;
  createdAt: string;
}>;

export type ProjectProcessingPublicPhase =
  | 'submitting'
  | 'accepted'
  | 'processing'
  | 'retrieving'
  | 'saving-result'
  | 'complete'
  | 'needs-attention'
  | 'cancelled';

/**
 * What became of a retained provider result, which the boolean it replaces could not express.
 *
 * `historical` used to mean only "not attached to the head revision", and the head moves for
 * ordinary reasons — saving a Version moves it. So a successful result the operator was looking at
 * read as though it had been discarded. These three are the causes that actually exist.
 */
export const PROJECT_PROCESSING_RESULT_STATES = ['current', 'superseded', 'unapplied'] as const;

export type ProjectProcessingResultState = (typeof PROJECT_PROCESSING_RESULT_STATES)[number];

export type ProjectProcessingRetryPolicy =
  'not-allowed' | 'explicit' | 'explicit-cost-confirmation';

export type ProjectProcessingRestartTransition =
  | Readonly<{
      status: 'expired';
      safeErrorCode: 'job_expired';
      completedAt: string;
    }>
  | Readonly<{
      status: 'ambiguous';
      safeErrorCode: 'submission_ambiguous';
      completedAt: string;
    }>
  | Readonly<{
      status: 'failed';
      safeErrorCode: 'processing_failed';
      completedAt: string;
    }>
  | Readonly<{
      status: 'queued' | 'retrieving';
      safeErrorCode: null;
      completedAt: null;
    }>;
