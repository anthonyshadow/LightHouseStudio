import { describe, expect, it } from 'vitest';
import {
  canPromoteProjectProcessingResult,
  canonicalVideoTransformInputGeometry,
  currentProjectProcessingAttempt,
  projectProcessingBlocksArchive,
  projectProcessingNeedsAttention,
  projectProcessingPhase,
  projectProcessingRestartTransition,
  projectProcessingRetryPolicy,
  validateUploadedVideoFacts,
  validateVideoTransformPlan,
  type UploadedVideoFacts,
  type VideoTransformStep,
} from '.';

const video = (overrides: Partial<UploadedVideoFacts> = {}): UploadedVideoFacts => ({
  container: 'mp4',
  videoCodec: 'avc',
  durationMs: 30_000,
  width: 1_920,
  height: 1_080,
  sizeBytes: 10_000_000,
  hasAudio: true,
  ...overrides,
});

const step = (modelId: VideoTransformStep['modelId']): VideoTransformStep => ({
  id: modelId,
  modelId,
  prompt: 'Transform the subject',
  hasReferenceImage: false,
  enhancePrompt: false,
  inputKind: modelId === 'lucy-vton-latest' ? 'prompt' : 'character',
});

describe('uploaded video policy', () => {
  it('accepts the conservative five-minute H.264 policy', () => {
    expect(validateUploadedVideoFacts(video(), ['character-swap'])).toEqual([]);
  });

  it('uses the lower size limit for a selected VTO transformation', () => {
    const issues = validateUploadedVideoFacts(video({ sizeBytes: 200_000_001 }), [
      'virtual-try-on',
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('payload-too-large');
    expect(issues[0]?.message).toContain('200 MB');
  });

  it('accepts any upload aspect while rejecting undocumented codecs and overlong clips', () => {
    const issues = validateUploadedVideoFacts(
      video({ videoCodec: 'hevc', width: 1_000, height: 1_000, durationMs: 300_001 }),
      [],
    );
    expect(issues.map((issue) => issue.code)).toEqual(['unsupported-codec', 'duration-exceeded']);
  });

  it('keeps canonical aspect requirements scoped to visual provider operations', () => {
    expect(
      validateUploadedVideoFacts(video({ width: 1_000, height: 1_000 }), ['character-swap']),
    ).toEqual([
      {
        code: 'unsupported-aspect-ratio',
        message: 'Use a 16:9 landscape or 9:16 portrait video.',
      },
    ]);
  });

  it('derives the smallest canonical contain canvas for approximate provider results', () => {
    expect(canonicalVideoTransformInputGeometry({ width: 1_920, height: 1_024 })).toEqual({
      width: 1_920,
      height: 1_080,
      aspect: '16:9',
    });
    expect(canonicalVideoTransformInputGeometry({ width: 1_024, height: 1_920 })).toEqual({
      width: 1_080,
      height: 1_920,
      aspect: '9:16',
    });
    expect(canonicalVideoTransformInputGeometry({ width: 1_280, height: 736 })).toEqual({
      width: 1_312,
      height: 738,
      aspect: '16:9',
    });
  });
});

describe('single visual policy', () => {
  it('allows either model by itself and rejects using both together', () => {
    expect(validateVideoTransformPlan([step('lucy-latest')])).toEqual([]);
    expect(validateVideoTransformPlan([step('lucy-vton-latest')])).toEqual([]);
    expect(validateVideoTransformPlan([step('lucy-latest'), step('lucy-vton-latest')])).toEqual([
      'Choose only one visual transformation.',
    ]);
  });

  it('rejects an empty recipe', () => {
    const empty = { ...step('lucy-latest'), prompt: '' };
    expect(validateVideoTransformPlan([empty])).toEqual([
      'Character needs a prompt, reference image, or both.',
    ]);
  });

  it('enforces mutually exclusive VTO input modes and enhancement rules', () => {
    expect(
      validateVideoTransformPlan([
        {
          ...step('lucy-vton-latest'),
          inputKind: 'reference-image',
          prompt: 'must be cleared',
          hasReferenceImage: true,
        },
      ]),
    ).toEqual(['Reference-image input cannot include prompt text or enhancement.']);
    expect(
      validateVideoTransformPlan([
        {
          ...step('lucy-vton-latest'),
          inputKind: 'saved-outfit',
          enhancePrompt: true,
        },
      ]),
    ).toEqual(['Saved outfits cannot enable prompt enhancement.']);
    const legacyVtoStep = { ...step('lucy-vton-latest') };
    delete legacyVtoStep.inputKind;
    expect(validateVideoTransformPlan([legacyVtoStep])).toEqual([
      'Choose a Virtual Try-On input type.',
    ]);
  });

  it('derives finite current-attempt, ambiguity, and stale-promotion policy', () => {
    const attempt = {
      operationId: 'op-1',
      initiatingRevisionId: 'revision-1',
      initiatingRevisionNumber: 1,
      resultRevisionId: null,
      resultRevisionNumber: null,
      attemptNumber: 1,
      status: 'submitting' as const,
      providerJobId: null,
      outputAssetId: null,
      createdAt: '2026-08-13T12:00:00.000Z',
    };
    const retry = {
      ...attempt,
      operationId: 'op-2',
      attemptNumber: 2,
      status: 'ambiguous' as const,
      createdAt: '2026-08-13T12:01:00.000Z',
    };
    expect(
      currentProjectProcessingAttempt({ id: 'revision-1', revisionNumber: 1 }, [attempt, retry]),
    ).toEqual(retry);
    expect(projectProcessingPhase(retry)).toBe('needs-attention');
    expect(projectProcessingRetryPolicy(retry.status)).toBe('explicit-cost-confirmation');
    expect(projectProcessingBlocksArchive(retry.status)).toBe(true);
    expect(projectProcessingNeedsAttention(retry.status)).toBe(true);
    expect(
      canPromoteProjectProcessingResult({
        currentRevisionId: 'revision-1',
        currentRevisionNumber: 1,
        initiatingRevisionId: 'revision-1',
        initiatingRevisionNumber: 1,
        currentOperationId: 'op-2',
        operationId: 'op-1',
      }),
    ).toBe(false);
  });

  it('normalizes interrupted attempts with one persistence-neutral restart policy', () => {
    const attempt = {
      status: 'submitting' as const,
      providerJobId: null,
      outputAssetId: null,
      expiresAt: '2026-08-13T13:00:00.000Z',
    };
    const now = '2026-08-13T12:30:00.000Z';

    expect(projectProcessingRestartTransition(attempt, now)).toEqual({
      status: 'ambiguous',
      safeErrorCode: 'submission_ambiguous',
      completedAt: now,
    });
    expect(
      projectProcessingRestartTransition({ ...attempt, providerJobId: 'provider-job' }, now),
    ).toEqual({ status: 'queued', safeErrorCode: null, completedAt: null });
    expect(
      projectProcessingRestartTransition(
        { ...attempt, status: 'ready', providerJobId: 'provider-job' },
        now,
      ),
    ).toEqual({ status: 'retrieving', safeErrorCode: null, completedAt: null });
    expect(
      projectProcessingRestartTransition(
        { ...attempt, status: 'processing', expiresAt: '2026-08-13T12:00:00.000Z' },
        now,
      ),
    ).toEqual({ status: 'expired', safeErrorCode: 'job_expired', completedAt: now });
    expect(projectProcessingRestartTransition({ ...attempt, status: 'ambiguous' }, now)).toBeNull();
  });
});
