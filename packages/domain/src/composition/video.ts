import { evenDimension } from '../video-editing/rules';
import { failComposition, requirePositiveWholeNumber } from './rules';

/**
 * The video half of a stitched output's format, decided once for the whole arrangement.
 *
 * Every clip's frames reach one encoder, and the encoder refuses a frame whose size differs from
 * the first it saw. So the frame is not something each clip can bring; it is chosen here, for all
 * of them, and every clip is drawn into it on the way in. The audio half of the same decision is
 * `./audio`, and the two state one rule twice: the widest source is the target, and no clip is
 * narrowed for a neighbour.
 *
 * The normalization policy has three halves, and this is where all three are named:
 *
 * - **Frame** — one frame for the whole arrangement: the largest clip's by pixel area, the earliest
 *   on a tie, both dimensions evened. Every clip is drawn into it with a contain fit over black.
 *   Nothing is downscaled; a smaller clip of the same shape is scaled up; a clip of another shape
 *   gets bars. Stable under reorder, trim and split — it changes only when the largest clip enters
 *   or leaves — and under an export placement, which crops the stitched cut, it only ever scales
 *   down rather than down and then up again.
 * - **Frame rate** — carried, never normalized to a constant. Each clip keeps its own frame timing,
 *   re-based onto the sequence clock by `sequenceMsAt`; no frame is dropped or duplicated. That is
 *   what the single-clip render already produces, an MP4 carries per-frame durations, and no
 *   frame-rate fact exists anywhere a render could read one from.
 * - **Codec** — not a target dimension. Nothing varies per clip: every render transcodes to the one
 *   output the validator gates, so a mixed-codec arrangement costs nothing here and the domain
 *   states no codec constant, which would be a second owner beside the validator.
 */

/** A clip's display frame after rotation — what the media record and the catalogue carry. */
export interface ClipVideoProfile {
  readonly width: number;
  readonly height: number;
}

/** The one frame every clip is drawn into. Both dimensions even. */
export interface CompositionVideoTarget {
  readonly width: number;
  readonly height: number;
}

/**
 * One frame for the whole output.
 *
 * Not nullable, unlike the audio target: every clip stands over video, and an arrangement with no
 * clips is not an arrangement, so an empty list is a refusal rather than an answer.
 */
export const compositionVideoTarget = (
  profiles: readonly ClipVideoProfile[],
): CompositionVideoTarget => {
  let chosen: ClipVideoProfile | null = null;
  for (const profile of profiles) {
    const width = requirePositiveWholeNumber(profile.width, 'video width');
    const height = requirePositiveWholeNumber(profile.height, 'video height');
    // Strictly larger, so the earliest of equal frames keeps the frame.
    if (chosen === null || width * height > chosen.width * chosen.height) {
      chosen = { width, height };
    }
  }
  if (chosen === null) return failComposition('An arrangement needs a clip before it has a frame.');
  return { width: evenDimension(chosen.width), height: evenDimension(chosen.height) };
};

/**
 * What drawing a clip into the frame does to it, in the words a notice will need.
 *
 * `scaled` is the same shape at another size — under the rule above only ever larger. `letterboxed`
 * covers bars on either axis; one word, because the bars are visible and the numbers say the rest.
 */
export type ClipVideoConformance = 'kept' | 'scaled' | 'letterboxed';

export const clipVideoConformance = (
  profile: ClipVideoProfile,
  target: CompositionVideoTarget,
): ClipVideoConformance => {
  // Read as the encoder will size it: a clip evened by a pixel is not shown with a one-pixel bar.
  const width = evenDimension(profile.width);
  const height = evenDimension(profile.height);
  // Exact integer cross-multiplication, not a tolerance: display dimensions are whole pixels.
  if (width * target.height !== height * target.width) return 'letterboxed';
  return width === target.width && height === target.height ? 'kept' : 'scaled';
};
