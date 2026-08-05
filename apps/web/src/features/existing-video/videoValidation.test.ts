import { describe, expect, it } from 'vitest';
import {
  assertEditedVideoOutput,
  firstExistingVideoValidationIssue,
  type EditedVideoValidationExpectation,
  type ValidatedExistingVideo,
} from './videoValidation';

const resultFacts = (overrides: Record<string, unknown> = {}) => ({
  container: 'mp4' as const,
  videoCodec: 'avc',
  durationMs: 1_000,
  width: 1_024,
  height: 1_920,
  sizeBytes: 10_000,
  hasAudio: true,
  ...overrides,
});

describe('firstExistingVideoValidationIssue', () => {
  it('keeps the 16:9/9:16 aspect gate for immutable source files', () => {
    expect(firstExistingVideoValidationIssue(resultFacts(), false, 'source')).toMatchObject({
      code: 'unsupported-aspect-ratio',
    });
  });

  it('defers only result aspect to exact server-approved metadata comparison', () => {
    expect(
      firstExistingVideoValidationIssue(resultFacts(), false, 'server-approved-result'),
    ).toBeUndefined();
    expect(
      firstExistingVideoValidationIssue(
        resultFacts({ videoCodec: 'vp9' }),
        false,
        'server-approved-result',
      ),
    ).toMatchObject({ code: 'unsupported-codec' });
  });
});

const editedExpectation: EditedVideoValidationExpectation = {
  width: 1_080,
  height: 1_080,
  durationMs: 2_000,
  requireAudio: true,
  filename: 'edited.mp4',
};

const editedVideo = (overrides: Partial<ValidatedExistingVideo> = {}): ValidatedExistingVideo => {
  const file = new File(['edited'], 'edited.mp4', { type: 'video/mp4' });
  return {
    file,
    mimeType: 'video/mp4',
    audioSidecar: { blob: new Blob(['audio']), mimeType: 'audio/mp4' },
    audioUnavailableReason: null,
    metadata: {
      kind: 'uploaded',
      mode: 'local',
      selectedAt: '2026-08-04T12:00:00.000Z',
      displayName: file.name,
      container: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      durationMs: 2_000,
      width: 1_080,
      height: 1_080,
      sizeBytes: file.size,
      hasAudio: true,
    },
    ...overrides,
  };
};

describe('assertEditedVideoOutput', () => {
  it('accepts exact locally decoded output and its immutable audio sidecar', () => {
    expect(() => assertEditedVideoOutput(editedVideo(), editedExpectation)).not.toThrow();
  });

  it('rejects wrong geometry, trim duration, codec, and a missing required track or sidecar', () => {
    expect(() =>
      assertEditedVideoOutput(
        editedVideo({ metadata: { ...editedVideo().metadata, width: 1_078 } }),
        editedExpectation,
      ),
    ).toThrow(/dimensions/iu);
    expect(() =>
      assertEditedVideoOutput(
        editedVideo({ metadata: { ...editedVideo().metadata, durationMs: 2_501 } }),
        editedExpectation,
      ),
    ).toThrow(/duration/iu);
    expect(() =>
      assertEditedVideoOutput(
        editedVideo({ metadata: { ...editedVideo().metadata, videoCodec: 'vp8' } }),
        editedExpectation,
      ),
    ).toThrow(/H\.264 MP4/iu);
    expect(() =>
      assertEditedVideoOutput(editedVideo({ audioSidecar: null }), editedExpectation),
    ).toThrow(/audio track/iu);
  });
});
