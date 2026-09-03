import { it } from '@fast-check/vitest';
import fc from 'fast-check';
import { expect } from 'vitest';
import {
  createDefaultVideoEditSpec,
  getVideoEditOutputGeometry,
  normalizeSubtitleCues,
  normalizeVideoEditSpec,
  outputSubtitleCues,
  SUBTITLE_CUE_LIMIT,
  SUBTITLE_CUE_MAX_LINES,
  SUBTITLE_CUE_MINIMUM_DURATION_MS,
  SUBTITLE_CUE_TEXT_MAX_LENGTH,
  VIDEO_EDIT_MINIMUM_TRIM_MS,
} from '.';

const finiteInput = fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true });
const sourceGeometry = fc.record({
  width: fc.integer({ min: 1, max: 7_680 }),
  height: fc.integer({ min: 1, max: 7_680 }),
  durationMs: fc.integer({ min: 1, max: 3_600_000 }),
});
const cueInput = fc.record({
  id: fc.uuid(),
  text: fc.string({ maxLength: 260 }),
  startMs: finiteInput,
  endMs: finiteInput,
  placement: fc.constantFrom('top' as const, 'middle' as const, 'bottom' as const),
});

it.prop([sourceGeometry, fc.array(cueInput, { maxLength: 230 })], {
  seed: 0x53554254,
  numRuns: 100,
})('normalizes arbitrary cue lists into a sorted, bounded, idempotent form', (source, cues) => {
  const normalized = normalizeSubtitleCues(cues, source);
  const durationMs = Math.max(SUBTITLE_CUE_MINIMUM_DURATION_MS, source.durationMs);

  expect(normalizeSubtitleCues(normalized, source)).toEqual(normalized);
  expect(normalized.length).toBeLessThanOrEqual(SUBTITLE_CUE_LIMIT);
  for (const [index, cue] of normalized.entries()) {
    expect(cue.startMs).toBeGreaterThanOrEqual(0);
    expect(cue.endMs).toBeLessThanOrEqual(durationMs);
    expect(cue.endMs - cue.startMs).toBeGreaterThanOrEqual(SUBTITLE_CUE_MINIMUM_DURATION_MS - 1e-6);
    expect(cue.text.length).toBeLessThanOrEqual(SUBTITLE_CUE_TEXT_MAX_LENGTH);
    expect(cue.text.split('\n').length).toBeLessThanOrEqual(SUBTITLE_CUE_MAX_LINES);
    const previous = normalized[index - 1];
    if (previous) expect(previous.startMs).toBeLessThanOrEqual(cue.startMs);
  }

  const trim = { startMs: 0, endMs: durationMs };
  for (const cue of outputSubtitleCues({ trim, subtitles: normalized })) {
    expect(cue.startMs).toBeGreaterThanOrEqual(0);
    expect(cue.endMs).toBeLessThanOrEqual(durationMs);
    expect(cue.endMs).toBeGreaterThan(cue.startMs);
  }
});

it.prop(
  [
    sourceGeometry,
    finiteInput,
    finiteInput,
    fc.array(finiteInput, { minLength: 10, maxLength: 10 }),
  ],
  { seed: 0x5452494d, numRuns: 100 },
)(
  'normalizes arbitrary trim, crop, and adjustment inputs into stable rendering bounds',
  (source, trimStart, trimEnd, values) => {
    const baseline = createDefaultVideoEditSpec(source.durationMs);
    const input = {
      ...baseline,
      trim: { startMs: trimStart, endMs: trimEnd },
      crop: {
        preset: 'freeform' as const,
        rectangle: { x: values[0]!, y: values[1]!, width: values[2]!, height: values[3]! },
      },
      adjustments: {
        brightness: values[4]!,
        contrast: values[5]!,
        saturation: values[6]!,
        temperature: values[7]!,
        highlights: values[8]!,
        shadows: values[9]!,
      },
    };

    const normalized = normalizeVideoEditSpec(input, source);
    const normalizedAgain = normalizeVideoEditSpec(normalized, source);
    const effectiveDuration = Math.max(VIDEO_EDIT_MINIMUM_TRIM_MS, source.durationMs);

    expect(normalizedAgain).toEqual(normalized);
    expect(normalized.trim.startMs).toBeGreaterThanOrEqual(0);
    expect(normalized.trim.endMs).toBeLessThanOrEqual(effectiveDuration);
    expect(normalized.trim.endMs - normalized.trim.startMs).toBeGreaterThanOrEqual(
      VIDEO_EDIT_MINIMUM_TRIM_MS,
    );
    expect(normalized.crop.rectangle.x).toBeGreaterThanOrEqual(0);
    expect(normalized.crop.rectangle.y).toBeGreaterThanOrEqual(0);
    expect(normalized.crop.rectangle.x + normalized.crop.rectangle.width).toBeLessThanOrEqual(1);
    expect(normalized.crop.rectangle.y + normalized.crop.rectangle.height).toBeLessThanOrEqual(1);
    for (const adjustment of Object.values(normalized.adjustments)) {
      expect(Number.isInteger(adjustment)).toBe(true);
      expect(adjustment).toBeGreaterThanOrEqual(-100);
      expect(adjustment).toBeLessThanOrEqual(100);
    }

    const output = getVideoEditOutputGeometry(source, normalized);
    expect(output.width).toBeGreaterThanOrEqual(2);
    expect(output.height).toBeGreaterThanOrEqual(2);
    expect(output.width % 2).toBe(0);
    expect(output.height % 2).toBe(0);
    expect(output.durationMs).toBe(normalized.trim.endMs - normalized.trim.startMs);
  },
);
