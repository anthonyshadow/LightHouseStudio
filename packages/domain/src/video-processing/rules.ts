import type {
  UploadedVideoFacts,
  UploadedVideoValidationIssue,
  VideoTransformOperationId,
  VideoTransformStep,
} from './types';

export const VIDEO_DURATION_LIMIT_MS = 300_000;
export const GENERAL_VIDEO_SIZE_LIMIT_BYTES = 300_000_000;
export const VTON_VIDEO_SIZE_LIMIT_BYTES = 200_000_000;
export const VIDEO_ASPECT_TOLERANCE = 0.01;

const supportedAspect = (width: number, height: number): boolean => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return false;
  }
  const ratio = width / height;
  return (
    Math.abs(ratio - 16 / 9) / (16 / 9) <= VIDEO_ASPECT_TOLERANCE ||
    Math.abs(ratio - 9 / 16) / (9 / 16) <= VIDEO_ASPECT_TOLERANCE
  );
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
  if (!supportedAspect(facts.width, facts.height)) {
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
