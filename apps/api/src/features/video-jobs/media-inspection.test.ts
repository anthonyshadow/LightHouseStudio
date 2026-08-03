import { describe, expect, it, vi } from 'vitest';
import {
  assertProviderOutputDimensions,
  expectedProviderOutputDimensions,
} from './media-inspection.js';

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
    'warns and continues for non-canonical %s megapixel-budget %s output',
    (resolution, orientation, width, height) => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(() =>
        assertProviderOutputDimensions(
          { width, height },
          resolution,
          'megapixel-budget',
          orientation,
        ),
      ).not.toThrow();
      expect(warning).toHaveBeenCalledWith(
        expect.stringContaining('continuing with the inspected result'),
        expect.objectContaining({
          actualWidth: width,
          actualHeight: height,
          resolution,
          expectedOrientation: orientation,
        }),
      );
      warning.mockRestore();
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
