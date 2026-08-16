import type {
  ProjectProcessingAttemptFacts,
  ProjectProcessingPublicPhase,
  ProjectProcessingRestartTransition,
  ProjectProcessingRetryPolicy,
  UploadedVideoFacts,
  UploadedVideoValidationIssue,
  VideoTransformOperationId,
  VideoTransformStep,
} from './types';

const ACTIVE_PROJECT_PROCESSING_STATUSES = new Set([
  'pending',
  'validating',
  'submitting',
  'accepted',
  'queued',
  'processing',
  'retrieving',
]);

const FAILED_PROJECT_PROCESSING_STATUSES = new Set(['ambiguous', 'failed', 'expired']);

export const projectProcessingPhase = (
  attempt: Pick<ProjectProcessingAttemptFacts, 'status' | 'outputAssetId'>,
): ProjectProcessingPublicPhase => {
  switch (attempt.status) {
    case 'pending':
    case 'validating':
    case 'submitting':
      return 'submitting';
    case 'accepted':
    case 'queued':
      return 'accepted';
    case 'processing':
      return 'processing';
    case 'retrieving':
      return 'retrieving';
    case 'ready':
      return attempt.outputAssetId === null ? 'saving-result' : 'complete';
    case 'cancelled':
      return 'cancelled';
    case 'ambiguous':
    case 'failed':
    case 'expired':
      return 'needs-attention';
  }
};

export const projectProcessingRetryPolicy = (
  status: ProjectProcessingAttemptFacts['status'],
): ProjectProcessingRetryPolicy => {
  if (status === 'ambiguous') return 'explicit-cost-confirmation';
  if (status === 'failed' || status === 'expired' || status === 'cancelled') return 'explicit';
  return 'not-allowed';
};

/** A status an explicit retry may follow — the complement of a `not-allowed` retry policy. */
export const projectProcessingAttemptIsRetryable = (
  status: ProjectProcessingAttemptFacts['status'],
): boolean => projectProcessingRetryPolicy(status) !== 'not-allowed';

export const projectProcessingBlocksArchive = (
  status: ProjectProcessingAttemptFacts['status'],
): boolean => ACTIVE_PROJECT_PROCESSING_STATUSES.has(status) || status === 'ambiguous';

type ProjectProcessingArchiveAttempt = Pick<
  ProjectProcessingAttemptFacts,
  'operationId' | 'status' | 'createdAt'
> & {
  readonly retryOfOperationId: string | null;
};

const projectProcessingAttemptIsLater = (
  candidate: ProjectProcessingArchiveAttempt,
  attempt: ProjectProcessingArchiveAttempt,
): boolean =>
  candidate.createdAt > attempt.createdAt ||
  (candidate.createdAt === attempt.createdAt && candidate.operationId > attempt.operationId);

export const projectProcessingAmbiguityIsSuperseded = (
  attempt: ProjectProcessingArchiveAttempt,
  projectAttempts: readonly ProjectProcessingArchiveAttempt[],
): boolean =>
  attempt.status === 'ambiguous' &&
  // A later durable attempt proves the Project moved on; the older uncertainty stays in history
  // but must not become an invisible permanent lifecycle lock.
  projectAttempts.some(
    (candidate) =>
      candidate.operationId !== attempt.operationId &&
      (candidate.retryOfOperationId === attempt.operationId ||
        projectProcessingAttemptIsLater(candidate, attempt)),
  );

export const projectProcessingAttemptBlocksArchive = (
  attempt: ProjectProcessingArchiveAttempt,
  projectAttempts: readonly ProjectProcessingArchiveAttempt[],
): boolean =>
  projectProcessingBlocksArchive(attempt.status) &&
  !projectProcessingAmbiguityIsSuperseded(attempt, projectAttempts);

export const projectProcessingNeedsAttention = (
  status: ProjectProcessingAttemptFacts['status'],
): boolean => FAILED_PROJECT_PROCESSING_STATUSES.has(status);

export const projectProcessingRestartTransition = (
  attempt: Pick<ProjectProcessingAttemptFacts, 'status' | 'providerJobId' | 'outputAssetId'> & {
    readonly expiresAt: string;
  },
  now: string,
): ProjectProcessingRestartTransition | null => {
  if (attempt.outputAssetId !== null || attempt.status === 'ambiguous') return null;
  if (
    attempt.expiresAt <= now &&
    attempt.status !== 'failed' &&
    attempt.status !== 'expired' &&
    attempt.status !== 'cancelled'
  ) {
    return { status: 'expired', safeErrorCode: 'job_expired', completedAt: now };
  }
  if (
    attempt.providerJobId === null &&
    (attempt.status === 'submitting' || attempt.status === 'accepted')
  ) {
    return {
      status: 'ambiguous',
      safeErrorCode: 'submission_ambiguous',
      completedAt: now,
    };
  }
  if (attempt.status === 'pending' || attempt.status === 'validating') {
    return { status: 'failed', safeErrorCode: 'processing_failed', completedAt: now };
  }
  if (attempt.providerJobId !== null && attempt.status === 'submitting') {
    return { status: 'queued', safeErrorCode: null, completedAt: null };
  }
  if (attempt.providerJobId !== null && attempt.status === 'ready') {
    return { status: 'retrieving', safeErrorCode: null, completedAt: null };
  }
  return null;
};

export const currentProjectProcessingAttempt = <Attempt extends ProjectProcessingAttemptFacts>(
  currentRevision: Readonly<{ id: string; revisionNumber: number }>,
  attempts: readonly Attempt[],
): Attempt | null => {
  const candidates = attempts.filter(
    (attempt) =>
      (attempt.initiatingRevisionId === currentRevision.id &&
        attempt.initiatingRevisionNumber === currentRevision.revisionNumber) ||
      (attempt.resultRevisionId === currentRevision.id &&
        attempt.resultRevisionNumber === currentRevision.revisionNumber),
  );
  return (
    candidates.sort(
      (left, right) =>
        right.attemptNumber - left.attemptNumber ||
        right.createdAt.localeCompare(left.createdAt) ||
        right.operationId.localeCompare(left.operationId),
    )[0] ?? null
  );
};

export const canPromoteProjectProcessingResult = (input: {
  readonly currentRevisionId: string;
  readonly currentRevisionNumber: number;
  readonly initiatingRevisionId: string;
  readonly initiatingRevisionNumber: number;
  readonly currentOperationId: string | null;
  readonly operationId: string;
}): boolean =>
  input.currentRevisionId === input.initiatingRevisionId &&
  input.currentRevisionNumber === input.initiatingRevisionNumber &&
  input.currentOperationId === input.operationId;

export const VIDEO_DURATION_LIMIT_MS = 300_000;
export const GENERAL_VIDEO_SIZE_LIMIT_BYTES = 300_000_000;
export const VTON_VIDEO_SIZE_LIMIT_BYTES = 200_000_000;
export const VIDEO_ASPECT_TOLERANCE = 0.01;

export type CanonicalVideoTransformInputGeometry = Readonly<{
  width: number;
  height: number;
  aspect: '16:9' | '9:16';
}>;

const hasValidDimensions = (width: number, height: number): boolean =>
  Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;

const supportedAspect = (width: number, height: number): boolean => {
  if (!hasValidDimensions(width, height)) return false;
  const ratio = width / height;
  return (
    Math.abs(ratio - 16 / 9) / (16 / 9) <= VIDEO_ASPECT_TOLERANCE ||
    Math.abs(ratio - 9 / 16) / (9 / 16) <= VIDEO_ASPECT_TOLERANCE
  );
};

/**
 * Returns the smallest canonical provider-input canvas that contains the
 * inspected source without cropping. Callers still own the actual local
 * contain/letterbox render and its validation.
 */
export const canonicalVideoTransformInputGeometry = (
  source: Readonly<{ width: number; height: number }>,
): CanonicalVideoTransformInputGeometry => {
  if (!hasValidDimensions(source.width, source.height)) {
    throw new Error('Video transform input dimensions must be positive and finite.');
  }

  if (source.width > source.height) {
    const scale = Math.max(1, Math.ceil(Math.max(source.width / 32, source.height / 18)));
    return { width: scale * 32, height: scale * 18, aspect: '16:9' };
  }

  const scale = Math.max(1, Math.ceil(Math.max(source.width / 18, source.height / 32)));
  return { width: scale * 18, height: scale * 32, aspect: '9:16' };
};

export const validateUploadedVideoFacts = (
  facts: UploadedVideoFacts,
  operations: readonly VideoTransformOperationId[],
): readonly UploadedVideoValidationIssue[] => {
  const issues: UploadedVideoValidationIssue[] = [];
  if (
    !Number.isFinite(facts.durationMs) ||
    facts.durationMs <= 0 ||
    !Number.isInteger(facts.sizeBytes) ||
    facts.sizeBytes <= 0
  ) {
    issues.push({ code: 'invalid-video', message: 'Choose a non-empty, playable video file.' });
  }
  if (!['mp4', 'quicktime', 'webm'].includes(facts.container)) {
    issues.push({
      code: 'unsupported-container',
      message: 'Use an MP4, H.264 MOV, or VP8 WebM video.',
    });
  }
  const supportedCodec =
    ((facts.container === 'mp4' || facts.container === 'quicktime') &&
      facts.videoCodec === 'avc') ||
    (facts.container === 'webm' && facts.videoCodec === 'vp8');
  if (!supportedCodec) {
    issues.push({
      code: 'unsupported-codec',
      message:
        'Use H.264 video in MP4/MOV or VP8 video in WebM. HEVC and ProRes are not qualified.',
    });
  }
  if (facts.durationMs > VIDEO_DURATION_LIMIT_MS) {
    issues.push({
      code: 'duration-exceeded',
      message: 'Choose a video that is 5 minutes or shorter.',
    });
  }
  if (operations.length > 0 && !supportedAspect(facts.width, facts.height)) {
    issues.push({
      code: 'unsupported-aspect-ratio',
      message: 'Use a 16:9 landscape or 9:16 portrait video.',
    });
  }
  const includesVton = operations.includes('virtual-try-on');
  const maximumBytes = includesVton ? VTON_VIDEO_SIZE_LIMIT_BYTES : GENERAL_VIDEO_SIZE_LIMIT_BYTES;
  if (facts.sizeBytes > maximumBytes) {
    issues.push({
      code: 'payload-too-large',
      message: includesVton
        ? 'Videos used with Virtual Try-On must be 200 MB or smaller.'
        : 'Choose a video that is 300 MB or smaller.',
    });
  }
  return issues;
};

export const validateVideoTransformPlan = (
  steps: readonly VideoTransformStep[],
): readonly string[] => {
  const issues: string[] = [];
  if (steps.length > 1) issues.push('Choose only one visual transformation.');
  for (const step of steps) {
    if (!step.prompt.trim() && !step.hasReferenceImage) {
      issues.push(
        `${step.modelId === 'lucy-latest' ? 'Character' : 'Virtual Try-On'} needs a prompt, reference image, or both.`,
      );
    }
    if (step.modelId === 'lucy-latest') {
      if (step.inputKind !== undefined && step.inputKind !== 'character') {
        issues.push('Character edits must use character input.');
      }
      continue;
    }
    if (step.inputKind === undefined) {
      issues.push('Choose a Virtual Try-On input type.');
      continue;
    }
    if (step.inputKind === 'character') {
      issues.push('Choose a Virtual Try-On input type.');
    } else if (
      step.inputKind === 'reference-image' &&
      (!step.hasReferenceImage || step.prompt.trim() || step.enhancePrompt)
    ) {
      issues.push('Reference-image input cannot include prompt text or enhancement.');
    } else if (step.inputKind === 'prompt' && (!step.prompt.trim() || step.hasReferenceImage)) {
      issues.push('Prompt input cannot include a reference image.');
    } else if (step.inputKind === 'saved-outfit' && step.enhancePrompt) {
      issues.push('Saved outfits cannot enable prompt enhancement.');
    }
  }
  return issues;
};
