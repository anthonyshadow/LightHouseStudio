import { describe, expect, it } from 'vitest';
import {
  canonicalVideoTransformInputGeometry,
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
});
