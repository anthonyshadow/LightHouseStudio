import { describe, expect, it, vi } from 'vitest';
import {
  assertProviderOutputDimensions,
  expectedProviderOutputDimensions,
  validateRawInspectedVideo,
  type RawInspectedVideo,
} from './media-inspection.js';

const rawVideo = (overrides: Partial<RawInspectedVideo> = {}): RawInspectedVideo => ({
  mimeType: 'video/mp4',
  container: 'mp4',
  videoCodec: 'avc',
  audioCodec: 'aac',
  durationMs: 20_000,
  width: 1_280,
  height: 720,
  sizeBytes: 5_000_000,
  hasAudio: true,
  ...overrides,
});

describe('validateRawInspectedVideo', () => {
  it.each([
    [{ videoCodec: 'hevc' }, 'unsupported_codec', 400],
    [{ durationMs: 300_001 }, 'duration_exceeded', 400],
    [{ sizeBytes: 300_000_001 }, 'payload_too_large', 413],
  ] as const)(
    'classifies invalid upload facts before contract narrowing',
    (overrides, code, status) => {
      expect(() => validateRawInspectedVideo(rawVideo(overrides), 'character-swap')).toThrowError(
        expect.objectContaining({ code, statusCode: status }),
      );
    },
  );

  it('maps the same invalid raw provider facts to a safe 502', () => {
    expect(() =>
      validateRawInspectedVideo(rawVideo({ videoCodec: 'hevc' }), 'character-swap', {
        requireProviderOutputSize: true,
      }),
    ).toThrowError(expect.objectContaining({ code: 'result_invalid', statusCode: 502 }));
  });
});

describe('expectedProviderOutputDimensions', () => {
  it.each([
    ['720p', 'landscape', 1_280, 720],
    ['720p', 'portrait', 720, 1_280],
    ['1080p', 'landscape', 1_920, 1_080],
    ['1080p', 'portrait', 1_080, 1_920],
  ] as const)('maps %s %s to canonical dimensions', (resolution, orientation, width, height) => {
    expect(expectedProviderOutputDimensions(resolution, orientation)).toEqual({ width, height });
  });

  it('accepts only the configured canonical dimensions for the source orientation', () => {
    expect(() =>
      assertProviderOutputDimensions(
        { width: 1_080, height: 1_920 },
        '1080p',
        'exact-canonical',
        'portrait',
      ),
    ).not.toThrow();

    expect(() =>
      assertProviderOutputDimensions(
        { width: 810, height: 1_440 },
        '1080p',
        'exact-canonical',
        'portrait',
      ),
    ).toThrowError(
      'The visual result dimensions were 810 × 1440; expected 1080 × 1920 for the source orientation.',
    );
  });

  it.each([
    ['720p', 'portrait', 768, 1_408],
    ['720p', 'portrait', 1_024, 1_024],
    ['1080p', 'landscape', 1_920, 1_024],
  ] as const)(
    'records and continues for non-canonical %s megapixel-budget %s output',
    (resolution, orientation, width, height) => {
      const information = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      expect(() =>
        assertProviderOutputDimensions(
          { width, height },
          resolution,
          'megapixel-budget',
          orientation,
        ),
      ).not.toThrow();
      expect(information).toHaveBeenCalledWith(
        expect.stringContaining('Accepted provider-selected dimensions'),
        expect.objectContaining({
          actualWidth: width,
          actualHeight: height,
          resolution,
          expectedOrientation: orientation,
        }),
      );
      information.mockRestore();
    },
  );

  it('keeps the same non-canonical dimensions fatal for exact-canonical output', () => {
    expect(() =>
      assertProviderOutputDimensions(
        { width: 768, height: 1_408 },
        '720p',
        'exact-canonical',
        'portrait',
      ),
    ).toThrowError(
      'The visual result dimensions were 768 × 1408; expected 720 × 1280 for the source orientation.',
    );
  });
});
