import { readFile } from 'node:fs/promises';
import { ALL_FORMATS, BlobSource, Input, MP4 } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import {
  assertEditedVideoOutput,
  extractExistingVideoAudioSidecar,
  firstExistingVideoValidationIssue,
  type EditedVideoValidationExpectation,
  type ValidatedExistingVideo,
} from './videoValidation';

const deterministicRecordingFixture = new URL(
  '../../../../../e2e/fixtures/deterministic-recording-mp4.base64',
  import.meta.url,
);

describe('extractExistingVideoAudioSidecar', () => {
  it('losslessly preserves playable AAC packets after negative encoder priming', async () => {
    const fixture = await readFile(deterministicRecordingFixture, 'utf8');
    const video = new Blob([Buffer.from(fixture.trim(), 'base64')], { type: 'video/mp4' });

    const sidecar = await extractExistingVideoAudioSidecar(
      video,
      'mp4',
      new AbortController().signal,
    );

    expect(sidecar).not.toBeNull();
    expect(sidecar?.blob.size).toBeGreaterThan(0);
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(sidecar?.blob ?? new Blob()),
    });
    try {
      expect(await input.canRead()).toBe(true);
      expect(await input.getFormat()).toBe(MP4);
      const audioTrack = await input.getPrimaryAudioTrack();
      expect(audioTrack).not.toBeNull();
      expect(await audioTrack?.getCodec()).toBe('aac');
      expect(await audioTrack?.getFirstTimestamp()).toBe(0);
    } finally {
      input.dispose();
    }
  });
});

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
  it('accepts non-canonical immutable source aspect ratios', () => {
    expect(firstExistingVideoValidationIssue(resultFacts(), false, 'source')).toBeUndefined();
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
