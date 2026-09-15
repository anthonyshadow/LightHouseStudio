import type { Composition, CompositionClip } from './types';

/**
 * Where the clips sit on the stitched timeline, and how to get between the two clocks.
 *
 * Two clocks exist and confusing them is the whole hazard this module removes. **Media time** is a
 * position inside one clip's own source, which is what `CompositionClipTrim` is written in and what
 * a `<video>` element reports. **Sequence time** is a position in the stitched output, which is what
 * the playhead means, what subtitle cues are anchored to, and what a split is asked for at. A clip
 * survives its neighbours changing precisely because it stores the first; everything the operator
 * points at is the second.
 *
 * Kept apart from `rules.ts` because that module is the snapshot's validator and normalizer — it
 * answers "may this be stored", and nothing here is a rule about storage. This answers "what is on
 * screen at this instant", which only an editor asks.
 */

/** The length a clip contributes to the sequence: its trimmed span, never its media's own length. */
export const compositionClipDurationMs = (clip: CompositionClip): number =>
  clip.trim.endMs - clip.trim.startMs;

/** One clip's span on the stitched timeline. `endMs` is exclusive, the way the lookup below reads it. */
export interface CompositionPlacement {
  readonly clip: CompositionClip;
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * Every clip's span, in order — a prefix sum over the trims.
 *
 * Computed as a list rather than looked up one clip at a time because every caller that wants one
 * placement is drawing or measuring all of them: the strip, the ruler, the cue lane. Asking per
 * clip would make each draw quadratic in the clip count, which the 100-clip limit makes real.
 */
export const compositionPlacements = (
  composition: Composition,
): readonly CompositionPlacement[] => {
  let startMs = 0;
  return composition.clips.map((clip, index) => {
    const placement = {
      clip,
      index,
      startMs,
      endMs: startMs + compositionClipDurationMs(clip),
    };
    startMs = placement.endMs;
    return placement;
  });
};

/**
 * The clip under a sequence instant, or `null` when the sequence is empty.
 *
 * Spans are half-open, so an instant exactly on a cut belongs to the clip that *starts* there —
 * which is what makes splitting at a boundary a no-op rather than a way to mint an empty clip. The
 * one exception is the very end: `durationMs` itself is nobody's start, and a playhead parked at the
 * end of the video is still looking at the last frame of the last clip, so it answers with that.
 */
export const compositionPlacementAt = (
  composition: Composition,
  sequenceMs: number,
): CompositionPlacement | null => {
  const placements = compositionPlacements(composition);
  const last = placements.at(-1);
  if (last === undefined) return null;
  if (sequenceMs >= last.endMs) return last;
  return placements.find((placement) => sequenceMs < placement.endMs) ?? last;
};

/**
 * A sequence instant read as a position inside the placed clip's own media.
 *
 * Clamped to the clip's trim: a caller that asks about an instant outside this placement is asking
 * about a neighbour, and answering with a media time outside the trim would seek a `<video>` to
 * frames the operator has cut away.
 */
export const clipMediaMsAt = (placement: CompositionPlacement, sequenceMs: number): number => {
  const offsetMs = Math.min(
    Math.max(sequenceMs - placement.startMs, 0),
    placement.endMs - placement.startMs,
  );
  return placement.clip.trim.startMs + offsetMs;
};
