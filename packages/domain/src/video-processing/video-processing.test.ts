import { describe, expect, it } from 'vitest';
import {
  canSubmitPilotBatchJob,
  validateUploadedVideoFacts,
  validateVideoTransformOrder,
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

const step = (
  modelId: VideoTransformStep['modelId'],
  id: string = modelId,
): VideoTransformStep => ({
  id,
  modelId,
  prompt: 'Transform the subject',
  hasReferenceImage: false,
  enhancePrompt: false,
});

describe('uploaded video policy', () => {
  it('accepts the conservative five-minute H.264 policy', () => {
    expect(validateUploadedVideoFacts(video(), [step('lucy-2.5')])).toEqual([]);
  });

  it('uses the lower VTO size limit anywhere in the selected order', () => {
    const issues = validateUploadedVideoFacts(video({ sizeBytes: 200_000_001 }), [
      step('lucy-2.5'),
      step('lucy-vton-3'),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('payload-too-large');
    expect(issues[0]?.message).toContain('200 MB');
  });

  it('rejects undocumented codecs, ratios, and overlong clips', () => {
    const issues = validateUploadedVideoFacts(
      video({ videoCodec: 'hevc', width: 1_000, height: 1_000, durationMs: 300_001 }),
      [],
    );
    expect(issues.map((issue) => issue.code)).toEqual([
      'unsupported-codec',
      'duration-exceeded',
      'unsupported-aspect-ratio',
    ]);
  });
});

describe('ordered visual policy', () => {
  it('allows either two-model order', () => {
    expect(validateVideoTransformOrder([step('lucy-2.5'), step('lucy-vton-3')])).toEqual([]);
    expect(validateVideoTransformOrder([step('lucy-vton-3'), step('lucy-2.5')])).toEqual([]);
  });

  it('rejects duplicates and empty recipes', () => {
    const empty = { ...step('lucy-2.5', 'empty'), prompt: '' };
    expect(validateVideoTransformOrder([step('lucy-2.5'), empty])).toEqual([
      'Each visual model can be used at most once.',
      'Character needs a prompt, reference image, or both.',
    ]);
  });

  it('enforces four total and two per model in the pilot', () => {
    expect(canSubmitPilotBatchJob(['lucy-2.5'], 'lucy-2.5')).toBe(true);
    expect(canSubmitPilotBatchJob(['lucy-2.5', 'lucy-2.5'], 'lucy-2.5')).toBe(false);
    expect(
      canSubmitPilotBatchJob(['lucy-2.5', 'lucy-vton-3', 'lucy-2.5', 'lucy-vton-3'], 'lucy-vton-3'),
    ).toBe(false);
  });
});
