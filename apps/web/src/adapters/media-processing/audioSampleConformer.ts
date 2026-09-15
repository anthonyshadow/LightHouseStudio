import { COMPOSITION_AUDIO_MAX_CHANNELS, type CompositionAudioTarget } from '@studio/domain';
import type { AudioSample } from 'mediabunny';

/**
 * Brings one clip's decoded audio to the format the whole output was given.
 *
 * mediabunny's audio encoder refuses a sample whose rate or channel count differs from the first it
 * saw, and it refuses *before* the resampling it was asked for — so an arrangement of clips from two
 * phones would throw mid-encode, after the video had been paid for. Its own resampler is not
 * exported and fixes its source format the same way. This is the stage that has to sit in front of
 * the encoder instead: one per clip, all conforming to one target, so the encoder only ever sees
 * one format.
 *
 * Resampling is linear interpolation, continuous across sample boundaries: a per-sample resample
 * clicks at every seam, because the first output frame of each sample would be interpolated against
 * nothing. The last mixed frame of the previous sample is carried, and the phase is recomputed
 * exactly from integer positions rather than accumulated, so the seam is continuous and the count
 * is exact. No low-pass on downsampling — the same trade the library makes, and it names it.
 *
 * It owns the clip's place in the output clock, in frames. The caller states where the clip starts
 * and exactly how many frames it occupies — both from the domain's `compositionAudioFrames`, so the
 * milliseconds the sequence is kept in and the frames the encoder counts are reconciled once — and
 * the conformer lands on that count: it stops at the budget and pads to it. Consecutive clips then
 * meet exactly by arithmetic, not by wording. The encoder pads any gap of 64 frames or more with
 * silence and does not correct an overlap; landing on the budget is what keeps it from doing either.
 *
 * The `AudioSample` class is a parameter rather than an import, as the worker's private gain helper
 * has it: mediabunny is dynamically imported in every media path, and a static import here would put
 * the whole library in whichever closure imports this module. Emitted samples are the caller's to
 * close once the encoder has taken them, which is the library's own contract for `add`.
 */

/** Where a clip sits in the output, in target frames. Both numbers come from the domain. */
export interface AudioClipPlacement {
  /** The sum of the budgets of every clip before it. */
  readonly offsetFrames: number;
  /** Exactly how many frames the clip occupies; `flush` lands on this count. */
  readonly frameBudget: number;
}

export interface AudioSampleConformer {
  /** The samples to hand the encoder for this decoded sample — possibly none until more arrives. */
  readonly push: (sample: AudioSample) => readonly AudioSample[];
  /** What the clip still owes to reach its budget once its last sample is in; empty when called again. */
  readonly flush: () => readonly AudioSample[];
}

type ChannelMixer = (
  source: Float32Array,
  frame: number,
  sourceChannels: number,
  targetChannel: number,
) => number;

/**
 * Web Audio's up- and down-mixing, for the layouts this product meets: any source into one or two
 * channels. The same coefficients mediabunny's resampler carries for these pairs, with a discrete
 * drop-or-zero fallback for a layout neither names. Wider targets are refused at construction, so
 * the branches the library has for them are deliberately not here.
 */
const channelMixer = (sourceChannels: number, targetChannels: number): ChannelMixer => {
  if (sourceChannels === targetChannels) {
    return (source, frame, channels, channel) => source[frame * channels + channel]!;
  }
  if (sourceChannels === 1) {
    // Mono to one or two channels: the one channel goes to each.
    return (source, frame, channels) => source[frame * channels]!;
  }
  if (sourceChannels === 2 && targetChannels === 1) {
    return (source, frame, channels) =>
      0.5 * (source[frame * channels]! + source[frame * channels + 1]!);
  }
  if (sourceChannels === 4 && targetChannels === 1) {
    return (source, frame, channels) => {
      const base = frame * channels;
      return 0.25 * (source[base]! + source[base + 1]! + source[base + 2]! + source[base + 3]!);
    };
  }
  if (sourceChannels === 4 && targetChannels === 2) {
    return (source, frame, channels, channel) => {
      const base = frame * channels;
      return 0.5 * (source[base + channel]! + source[base + channel + 2]!);
    };
  }
  if (sourceChannels === 6 && targetChannels === 1) {
    return (source, frame, channels) => {
      const base = frame * channels;
      return (
        Math.SQRT1_2 * (source[base]! + source[base + 1]!) +
        source[base + 2]! +
        0.5 * (source[base + 4]! + source[base + 5]!)
      );
    };
  }
  if (sourceChannels === 6 && targetChannels === 2) {
    return (source, frame, channels, channel) => {
      const base = frame * channels;
      return (
        source[base + channel]! + Math.SQRT1_2 * (source[base + 2]! + source[base + channel + 4]!)
      );
    };
  }
  return (source, frame, channels, channel) =>
    channel < channels ? source[frame * channels + channel]! : 0;
};

/** Interleaved `f32` frames of one sample, whatever format the decoder produced. */
const interleavedFrames = (sample: AudioSample): Float32Array => {
  const data = new Float32Array(sample.numberOfFrames * sample.numberOfChannels);
  sample.copyTo(data, { planeIndex: 0, format: 'f32' });
  return data;
};

const requireWholeFrames = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `A clip's ${label} must be a whole number of frames; use compositionAudioFrames.`,
    );
  }
  return value;
};

const requireTarget = (target: CompositionAudioTarget): CompositionAudioTarget => {
  if (!Number.isInteger(target.sampleRate) || target.sampleRate <= 0) {
    throw new Error('An audio target needs a positive whole sample rate.');
  }
  if (
    !Number.isInteger(target.numberOfChannels) ||
    target.numberOfChannels <= 0 ||
    target.numberOfChannels > COMPOSITION_AUDIO_MAX_CHANNELS
  ) {
    throw new Error(
      `An audio target carries one to ${COMPOSITION_AUDIO_MAX_CHANNELS} channels; wider layouts are folded, never produced.`,
    );
  }
  return target;
};

export const createAudioSampleConformer = (
  Sample: typeof AudioSample,
  target: CompositionAudioTarget,
  placement: AudioClipPlacement,
): AudioSampleConformer => {
  requireTarget(target);
  const offsetFrames = requireWholeFrames(placement.offsetFrames, 'offset');
  const budget = requireWholeFrames(placement.frameBudget, 'frame budget');
  const targetChannels = target.numberOfChannels;
  let mixer: ChannelMixer | null = null;
  let sourceChannels = 0;
  let sourceRate = 0;
  /** Source frames consumed so far, so a sample's frames can be addressed in the stream. */
  let consumed = 0;
  /** The last mixed frame seen, for the seam — and for padding to the budget. */
  let carry: Float32Array | null = null;
  let emitted = 0;
  let flushed = false;

  const emit = (data: Float32Array): AudioSample => {
    const sample = new Sample({
      data,
      format: 'f32',
      numberOfChannels: targetChannels,
      sampleRate: target.sampleRate,
      timestamp: (offsetFrames + emitted) / target.sampleRate,
    });
    emitted += data.length / targetChannels;
    return sample;
  };

  const mix = (sample: AudioSample): Float32Array => {
    const source = interleavedFrames(sample);
    const frames = sample.numberOfFrames;
    if (sourceChannels === targetChannels) return source;
    const mixed = new Float32Array(frames * targetChannels);
    for (let frame = 0; frame < frames; frame += 1) {
      for (let channel = 0; channel < targetChannels; channel += 1) {
        mixed[frame * targetChannels + channel] = mixer!(source, frame, sourceChannels, channel);
      }
    }
    return mixed;
  };

  /*
   * Target frame `k` reads source position `k × sourceRate / targetRate`. That position is kept as
   * the integer pair it is, never as an accumulated float: `position += ratio` drifts by a few
   * ulps over a clip, and at a boundary that lands exactly on a source frame — a whole number of
   * seconds, the common case — the drift decides whether one more frame is owed. Comparing
   * `k × sourceRate` against `frames × targetRate` cannot drift.
   */
  const sourceIndexOf = (k: number) => Math.floor((k * sourceRate) / target.sampleRate);
  const fractionOf = (k: number) => ((k * sourceRate) % target.sampleRate) / target.sampleRate;

  /**
   * Target frames whose two source neighbours are both known, up to the budget. Frames that need
   * the *next* sample's first frame as their upper neighbour wait for it — or for `flush`, which
   * holds the last frame.
   */
  const resample = (mixed: Float32Array, lastIndex: number): Float32Array => {
    const out: number[] = [];
    let k = emitted;
    // `lower + 1 <= lastIndex`, as integers: k × sourceRate < lastIndex × targetRate.
    while (k < budget && k * sourceRate < lastIndex * target.sampleRate) {
      const lower = sourceIndexOf(k);
      const fraction = fractionOf(k);
      // The guard puts the upper neighbour inside this sample; the lower one is either inside it
      // too or the frame carried over from the last — never further back, because the previous
      // call stopped exactly one frame short of its own end.
      const upperOffset = (lower + 1 - consumed) * targetChannels;
      for (let channel = 0; channel < targetChannels; channel += 1) {
        const lowerValue =
          lower < consumed
            ? carry![channel]!
            : mixed[(lower - consumed) * targetChannels + channel]!;
        const upperValue = mixed[upperOffset + channel]!;
        out.push(lowerValue + fraction * (upperValue - lowerValue));
      }
      k += 1;
    }
    return Float32Array.from(out);
  };

  return {
    push: (sample) => {
      if (flushed || sample.numberOfFrames === 0 || emitted >= budget) return [];
      if (mixer === null) {
        sourceChannels = sample.numberOfChannels;
        sourceRate = sample.sampleRate;
        mixer = channelMixer(sourceChannels, targetChannels);
      }
      const mixed = mix(sample);
      const frames = sample.numberOfFrames;
      const lastFrame = mixed.subarray((frames - 1) * targetChannels, frames * targetChannels);
      // Same rate: frames map one to one, whatever the channel count did, so nothing is held back
      // — only cut where the clip would run past its budget.
      if (sourceRate === target.sampleRate) {
        carry = lastFrame;
        consumed += frames;
        const kept = Math.min(frames, budget - emitted);
        return [emit(kept === frames ? mixed : mixed.slice(0, kept * targetChannels))];
      }
      // Resample against the frame carried from the *previous* sample; only then does this one's
      // last frame become the carry. Advancing it first is a click at every seam.
      const out = resample(mixed, consumed + frames - 1);
      carry = lastFrame;
      consumed += frames;
      return out.length === 0 ? [] : [emit(out)];
    },
    flush: () => {
      if (flushed) return [];
      flushed = true;
      // Everything still owed up to the budget: the resampler's natural tail, whose neighbour
      // never came, and any padding after it — both the held last frame, or silence when no frame
      // ever arrived, so a clip that decoded short still occupies the span the sequence gave it.
      const owed = budget - emitted;
      if (owed <= 0) return [];
      const out = new Float32Array(owed * targetChannels);
      if (carry !== null) {
        for (let frame = 0; frame < owed; frame += 1) out.set(carry, frame * targetChannels);
      }
      return [emit(out)];
    },
  };
};

/**
 * The frames a clip with no audio owes the timeline, so the clips after it land where they should.
 *
 * Explicit rather than left to the encoder's gap-filler: that pads only gaps of 64 frames or more,
 * measured by rounding, and a silent clip is not a gap in the arrangement — it is media of a known
 * length, placed like any other. Chunked to a second so a long silent clip is not one allocation.
 */
export const silentAudioSamples = (
  Sample: typeof AudioSample,
  target: CompositionAudioTarget,
  placement: AudioClipPlacement,
): readonly AudioSample[] => {
  requireTarget(target);
  const offsetFrames = requireWholeFrames(placement.offsetFrames, 'offset');
  const frames = requireWholeFrames(placement.frameBudget, 'frame budget');
  const samples: AudioSample[] = [];
  for (let start = 0; start < frames; start += target.sampleRate) {
    const count = Math.min(target.sampleRate, frames - start);
    samples.push(
      new Sample({
        data: new Float32Array(count * target.numberOfChannels),
        format: 'f32',
        numberOfChannels: target.numberOfChannels,
        sampleRate: target.sampleRate,
        timestamp: (offsetFrames + start) / target.sampleRate,
      }),
    );
  }
  return samples;
};
