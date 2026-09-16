import { describe, expect, it } from 'vitest';
import {
  CompositionRuleError,
  clipVideoConformance,
  compositionVideoTarget,
  type ClipVideoProfile,
} from './index';

const landscape: ClipVideoProfile = { width: 1_920, height: 1_080 };
const portrait: ClipVideoProfile = { width: 1_080, height: 1_920 };
const small: ClipVideoProfile = { width: 1_280, height: 720 };
const ultra: ClipVideoProfile = { width: 3_840, height: 2_160 };

describe('compositionVideoTarget', () => {
  it('leaves clips that already agree exactly as they are', () => {
    expect(compositionVideoTarget([landscape, landscape, landscape])).toEqual(landscape);
  });

  it('takes the largest frame whichever order the clips are in, so nothing is downscaled', () => {
    expect(compositionVideoTarget([small, landscape])).toEqual(landscape);
    expect(compositionVideoTarget([landscape, small])).toEqual(landscape);
    expect(compositionVideoTarget([portrait, ultra])).toEqual(ultra);
  });

  it('gives an equal-area tie to the earliest clip, so the operator can see which frame wins', () => {
    expect(compositionVideoTarget([landscape, portrait])).toEqual(landscape);
    expect(compositionVideoTarget([portrait, landscape])).toEqual(portrait);
  });

  it('evens an odd frame the way every single-clip output is evened', () => {
    expect(compositionVideoTarget([{ width: 1_081, height: 1_919 }])).toEqual({
      width: 1_080,
      height: 1_918,
    });
  });

  it('refuses a profile that could not describe a frame, and an arrangement with no clips', () => {
    expect(() => compositionVideoTarget([{ width: 0, height: 1_080 }])).toThrow(
      CompositionRuleError,
    );
    expect(() => compositionVideoTarget([{ width: 1_920, height: 1_079.5 }])).toThrow(
      CompositionRuleError,
    );
    expect(() => compositionVideoTarget([])).toThrow(CompositionRuleError);
  });
});

describe('clipVideoConformance', () => {
  it('names what drawing each clip into the frame does to it', () => {
    expect(clipVideoConformance(landscape, landscape)).toBe('kept');
    expect(clipVideoConformance(small, landscape)).toBe('scaled');
    expect(clipVideoConformance({ width: 320, height: 180 }, landscape)).toBe('scaled');
    expect(clipVideoConformance(portrait, landscape)).toBe('letterboxed');
    expect(clipVideoConformance(landscape, portrait)).toBe('letterboxed');
  });

  it('reads an odd clip as the encoder will size it, rather than reporting a one-pixel bar', () => {
    const target = compositionVideoTarget([{ width: 1_081, height: 1_919 }]);
    expect(clipVideoConformance({ width: 1_081, height: 1_919 }, target)).toBe('kept');
  });
});
