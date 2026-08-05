import { describe, expect, it } from 'vitest';
import {
  cropForVideoEditPreset,
  createDefaultVideoEditSpec,
  getVideoEditOutputGeometry,
  getVideoEditProviderCompatibility,
  normalizeVideoEditSpec,
  videoEditSpecsEqual,
} from '.';

const source = { width: 1920, height: 1080, durationMs: 10_000 };

describe('video editing rules', () => {
  it('creates a clean full-duration baseline', () => {
    const baseline = createDefaultVideoEditSpec(source.durationMs);
    expect(baseline.trim).toEqual({ startMs: 0, endMs: 10_000 });
    expect(baseline.crop.rectangle).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(videoEditSpecsEqual(baseline, createDefaultVideoEditSpec(source.durationMs))).toBe(true);
  });

  it.each([
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['1:1', 1],
    ['4:5', 4 / 5],
  ] as const)('centers the %s crop preset', (preset, expectedAspect) => {
    const crop = cropForVideoEditPreset(preset, source.width, source.height);
    const actualAspect = (source.width * crop.width) / (source.height * crop.height);
    expect(actualAspect).toBeCloseTo(expectedAspect, 5);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
  });

  it('preserves a fixed-ratio crop position while keeping its requested aspect', () => {
    const crop = cropForVideoEditPreset('1:1', source.width, source.height, {
      x: 0.3,
      y: 0,
      width: 0.5625,
      height: 1,
    });

    expect(crop.x).toBeCloseTo(0.3);
    expect(crop).toMatchObject({ y: 0, width: 0.5625, height: 1 });
    expect((source.width * crop.width) / (source.height * crop.height)).toBeCloseTo(1, 5);
  });

  it('clamps trim, crop, and adjustment values', () => {
    const normalized = normalizeVideoEditSpec(
      {
        ...createDefaultVideoEditSpec(source.durationMs),
        trim: { startMs: -10, endMs: 99_000 },
        crop: { preset: 'freeform', rectangle: { x: -1, y: 2, width: 2, height: 0 } },
        adjustments: {
          brightness: -200,
          contrast: 200,
          saturation: 0,
          temperature: 0,
          highlights: 0,
          shadows: 0,
        },
      },
      source,
    );
    expect(normalized.trim).toEqual({ startMs: 0, endMs: 10_000 });
    expect(normalized.crop.rectangle).toEqual({ x: 0, y: 0.98, width: 1, height: 0.02 });
    expect(normalized.adjustments.brightness).toBe(-100);
    expect(normalized.adjustments.contrast).toBe(100);
  });

  it('swaps dimensions for quarter-turn rotation and keeps encoder dimensions even', () => {
    const spec = {
      ...createDefaultVideoEditSpec(source.durationMs),
      rotation: 90 as const,
      crop: {
        preset: 'freeform' as const,
        rectangle: { x: 0, y: 0, width: 0.77, height: 0.83 },
      },
    };
    const output = getVideoEditOutputGeometry(source, spec);
    expect(output.width % 2).toBe(0);
    expect(output.height % 2).toBe(0);
    expect(output.width).toBeLessThan(source.height);
    expect(output.height).toBeLessThan(source.width);
  });

  it('normalizes fixed crop presets against post-rotation geometry', () => {
    const normalized = normalizeVideoEditSpec(
      {
        ...createDefaultVideoEditSpec(source.durationMs),
        rotation: 90,
        crop: {
          preset: '4:5',
          rectangle: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
        },
      },
      source,
    );
    const rotatedWidth = source.height;
    const rotatedHeight = source.width;
    const actualAspect =
      (rotatedWidth * normalized.crop.rectangle.width) /
      (rotatedHeight * normalized.crop.rectangle.height);
    expect(actualAspect).toBeCloseTo(4 / 5, 5);
  });

  it('gates visual providers while preserving local and Voice eligibility', () => {
    expect(getVideoEditProviderCompatibility({ width: 1280, height: 720 })).toMatchObject({
      compatible: true,
      aspect: '16:9',
    });
    expect(getVideoEditProviderCompatibility({ width: 1080, height: 1080 })).toMatchObject({
      compatible: false,
      aspect: 'unsupported',
    });
  });
});
