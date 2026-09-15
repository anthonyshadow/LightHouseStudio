import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_AUDIO_FALLBACK_TARGET,
  COMPOSITION_AUDIO_MAX_CHANNELS,
  CompositionRuleError,
  clipAudioConformance,
  compositionAudioFrames,
  compositionAudioTarget,
} from './index';

const phone = { sampleRate: 48_000, numberOfChannels: 2 };
const voiceMemo = { sampleRate: 44_100, numberOfChannels: 1 };
const surround = { sampleRate: 96_000, numberOfChannels: 6 };

describe('compositionAudioTarget', () => {
  it('leaves clips that already agree exactly as they are', () => {
    expect(compositionAudioTarget([phone, phone, phone])).toEqual(phone);
  });

  it('takes the highest rate and the widest layout, so no clip is narrowed for a neighbour', () => {
    expect(compositionAudioTarget([voiceMemo, phone])).toEqual({
      sampleRate: 48_000,
      numberOfChannels: 2,
    });
  });

  it('never asks for more channels than the product delivers', () => {
    expect(compositionAudioTarget([surround, phone])).toEqual({
      sampleRate: 96_000,
      numberOfChannels: COMPOSITION_AUDIO_MAX_CHANNELS,
    });
  });

  it('ignores clips with no audio, and answers null when none has any', () => {
    expect(compositionAudioTarget([null, voiceMemo, null])).toEqual(voiceMemo);
    expect(compositionAudioTarget([null, null])).toBeNull();
    expect(compositionAudioTarget([])).toBeNull();
  });

  it('refuses a profile that could not describe a track', () => {
    expect(() => compositionAudioTarget([{ sampleRate: 0, numberOfChannels: 2 }])).toThrow(
      CompositionRuleError,
    );
    expect(() => compositionAudioTarget([{ sampleRate: 48_000, numberOfChannels: 1.5 }])).toThrow(
      CompositionRuleError,
    );
  });

  it('states where to go when the chosen target cannot be encoded', () => {
    // The rule can pick a rate an encoder refuses; the fallback is a rule too, not a call-site number.
    expect(COMPOSITION_AUDIO_FALLBACK_TARGET).toEqual({ sampleRate: 48_000, numberOfChannels: 2 });
    expect(COMPOSITION_AUDIO_FALLBACK_TARGET.numberOfChannels).toBeLessThanOrEqual(
      COMPOSITION_AUDIO_MAX_CHANNELS,
    );
  });
});

describe('compositionAudioFrames', () => {
  it('rounds a span of the sequence to whole frames at the target rate', () => {
    expect(compositionAudioFrames(100, 48_000)).toBe(4_800);
    // One frame of 29.97 fps video does not divide into 48 kHz frames; the rounding lives here.
    expect(compositionAudioFrames(1_001 / 30, 48_000)).toBe(1_602);
    expect(compositionAudioFrames(0, 48_000)).toBe(0);
  });

  it('adds up: the budgets of consecutive spans land the next clip where the sequence says', () => {
    const rate = 44_100;
    const spans = [1_001 / 30, 2_500, 333.3];
    const total = spans.reduce((sum, span) => sum + span, 0);
    const budgets = spans.map((span) => compositionAudioFrames(span, rate));
    // Each clip is placed at the sum of the budgets before it, so a per-clip rounding never
    // accumulates into more than a frame against the whole.
    expect(Math.abs(budgets.reduce((sum, b) => sum + b, 0) - (total * rate) / 1_000)).toBeLessThan(
      spans.length,
    );
  });

  it('refuses a span that is not a duration', () => {
    expect(() => compositionAudioFrames(-1, 48_000)).toThrow(CompositionRuleError);
    expect(() => compositionAudioFrames(Number.NaN, 48_000)).toThrow(CompositionRuleError);
    expect(() => compositionAudioFrames(100, 0)).toThrow(CompositionRuleError);
  });
});

describe('clipAudioConformance', () => {
  const target = { sampleRate: 48_000, numberOfChannels: 2 };

  it('names what conforming does to each clip', () => {
    expect(clipAudioConformance(phone, target)).toBe('kept');
    expect(clipAudioConformance({ sampleRate: 44_100, numberOfChannels: 2 }, target)).toBe(
      'resampled',
    );
    expect(clipAudioConformance({ sampleRate: 48_000, numberOfChannels: 1 }, target)).toBe(
      'remixed',
    );
    expect(clipAudioConformance(voiceMemo, target)).toBe('resampled-and-remixed');
    expect(clipAudioConformance(null, target)).toBe('silence');
  });
});
