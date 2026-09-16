import { failComposition, requirePositiveWholeNumber } from './rules';

/**
 * The audio half of a stitched output's format, decided once for the whole arrangement.
 *
 * Every clip's audio reaches one encoder, and the encoder refuses a sample whose rate or channel
 * count differs from the first it saw — before any resampling it was asked for. So the format is
 * not something each clip can bring; it is chosen here, for all of them, and every clip is conformed
 * to it on the way in. This module decides. The conforming is the browser's, because it needs the
 * library's sample type and the domain does not.
 */

/** What a clip's own audio track is, or `null` for a clip that has none. */
export interface ClipAudioProfile {
  readonly sampleRate: number;
  readonly numberOfChannels: number;
}

export interface CompositionAudioTarget {
  readonly sampleRate: number;
  readonly numberOfChannels: number;
}

/**
 * The widest output this product makes — a decision made here, not read from anywhere else. What
 * it ships is phone-shot mono and stereo; nothing downstream asks for more than two channels, and
 * a wider source is folded down rather than carried because no placement would keep it.
 */
export const COMPOSITION_AUDIO_MAX_CHANNELS = 2;

/**
 * Where to go when the chosen target cannot be encoded.
 *
 * The rule below can legitimately choose a rate an encoder refuses — every clip at 16 kHz picks
 * 16 kHz, and AAC below 24 kHz is a different profile that not every browser encodes. The library's
 * own fallback applies only inside its single-input conversion, not on the path a stitched render
 * feeds, so the fallback has to be a stated rule here: the concat loop probes the target it was
 * given before any paid work and, on refusal, conforms every clip to this instead.
 */
export const COMPOSITION_AUDIO_FALLBACK_TARGET: CompositionAudioTarget = {
  sampleRate: 48_000,
  numberOfChannels: 2,
};

/**
 * One format for the whole output, or `null` when no clip carries audio at all.
 *
 * The highest sample rate among the clips, and the highest channel count capped at two. Upsampling
 * loses nothing, so the common case — every clip shot on the same phone — is left exactly as it
 * was; a lower target would have resampled all of them for no reason. `null` rather than a default
 * format when nothing has audio: an output with no audio track is the honest description of an
 * arrangement of silent clips, and the placement's keep-or-drop still decides at save time.
 */
export const compositionAudioTarget = (
  profiles: readonly (ClipAudioProfile | null)[],
): CompositionAudioTarget | null => {
  let sampleRate = 0;
  let numberOfChannels = 0;
  for (const profile of profiles) {
    if (profile === null) continue;
    sampleRate = Math.max(
      sampleRate,
      requirePositiveWholeNumber(profile.sampleRate, 'audio sample rate'),
    );
    numberOfChannels = Math.max(
      numberOfChannels,
      requirePositiveWholeNumber(profile.numberOfChannels, 'audio channel count'),
    );
  }
  return sampleRate === 0
    ? null
    : { sampleRate, numberOfChannels: Math.min(numberOfChannels, COMPOSITION_AUDIO_MAX_CHANNELS) };
};

/**
 * How many output frames a span of the sequence occupies, at the target rate.
 *
 * The sequence is kept in milliseconds and the encoder counts frames, and the two do not divide
 * evenly — a frame of 29.97 fps video is 1601.6 frames at 48 kHz. Rounded here, once, so every
 * clip's budget and the offset of the clip after it come from the same arithmetic and the
 * arrangement's audio lands on exactly the frames its clips add up to.
 */
export const compositionAudioFrames = (durationMs: number, sampleRate: number): number => {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    failComposition('A span of the sequence must be a non-negative number of milliseconds.');
  }
  return Math.round(
    (durationMs * requirePositiveWholeNumber(sampleRate, 'audio sample rate')) / 1_000,
  );
};

/**
 * What conforming does to one clip, in the words a notice will need.
 *
 * `silence` is a clip that contributes no sound — no audio track, or muted: it still occupies its
 * span of the output, and the timeline owes it frames of nothing so the clips after it land where
 * they should. A muted clip is also left out of the target decision, since nothing of its own
 * format reaches the output.
 */
export type ClipAudioConformance =
  'kept' | 'resampled' | 'remixed' | 'resampled-and-remixed' | 'silence';

export const clipAudioConformance = (
  profile: ClipAudioProfile | null,
  target: CompositionAudioTarget,
): ClipAudioConformance => {
  if (profile === null) return 'silence';
  const resampled = profile.sampleRate !== target.sampleRate;
  const remixed = profile.numberOfChannels !== target.numberOfChannels;
  if (resampled && remixed) return 'resampled-and-remixed';
  if (resampled) return 'resampled';
  if (remixed) return 'remixed';
  return 'kept';
};
