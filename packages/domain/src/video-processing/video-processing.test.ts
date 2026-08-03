import { describe, expect, it } from 'vitest';
import {
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
