import { requireOpaqueId } from '../common/identity';
import type { VideoEditAudio } from '../video-editing/types';
import {
  DEFAULT_VIDEO_EDIT_AUDIO,
  VIDEO_EDIT_MINIMUM_TRIM_MS,
  normalizeVideoEditAudio,
} from '../video-editing/rules';
import { subtitleCuesEqual } from '../video-editing/subtitles';
import { CompositionRuleError, normalizeComposition } from './rules';
import { projectMediaReferencesEqual } from '../projects/relations';
import type { ProjectMediaReference } from '../projects/media-reference';
import { compositionPlacementAt, clipMediaMsAt } from './sequence';
import {
  COMPOSITION_CLIP_LIMIT,
  type Composition,
  type CompositionClip,
  type CompositionClipTrim,
} from './types';

/**
 * The gestures a timeline makes on an arrangement.
 *
 * Every one of them is pure, returns a whole new `Composition`, and is identity-preserving the way
 * `normalizeComposition` is: a gesture that changes nothing returns the same reference, so an
 * editor that re-renders on identity does not re-render on a no-op, and an undo stack does not
 * grow an entry for a drag that landed where it started.
 *
 * Ids come from the caller. The domain is pure TypeScript and mints nothing — the convention the
 * Project rules already follow (`requireId(context.createId(), ...)`) — so a split takes the id its
 * new half will carry rather than reaching for `crypto`.
 */

const fail = (message: string): never => {
  throw new CompositionRuleError(message);
};

/** A clip the operator points at, or a refusal naming why that clip is not there. */
const clipIndexOf = (composition: Composition, clipId: string): number => {
  const index = composition.clips.findIndex((clip) => clip.id === clipId);
  return index === -1 ? fail('That clip is not part of this arrangement.') : index;
};

const withClips = (composition: Composition, clips: readonly CompositionClip[]): Composition =>
  normalizeComposition({ ...composition, clips });

export const appendClip = (composition: Composition, clip: CompositionClip): Composition => {
  if (composition.clips.length >= COMPOSITION_CLIP_LIMIT) {
    fail(`A composition holds at most ${COMPOSITION_CLIP_LIMIT} clips.`);
  }
  requireOpaqueId(clip.id, 'Composition clip', fail);
  if (composition.clips.some((held) => held.id === clip.id)) {
    fail('Each composition clip needs its own identifier.');
  }
  return withClips(composition, [...composition.clips, clip]);
};

/**
 * The first arrangement over one piece of media, trimmed to the whole of it.
 *
 * A Project holds media long before anyone arranges it, so the first clip is made rather than found.
 * It lives here because it is the only composition this product mints, and a clip assembled in a
 * component would be the one clip no rule shapes: the trim floor, the audio default and the id check
 * all have one owner, and this is how a surface reaches them without restating any of them.
 */
export const compositionOverMedia = (
  media: ProjectMediaReference,
  durationMs: number,
  createId: () => string,
): Composition =>
  appendClip(
    { clips: [], subtitles: [] },
    {
      id: createId(),
      media,
      // Normalized on the way in, so a media record with no duration still yields a storable clip.
      trim: { startMs: 0, endMs: Math.max(durationMs, VIDEO_EDIT_MINIMUM_TRIM_MS) },
      audio: DEFAULT_VIDEO_EDIT_AUDIO,
    },
  );

/**
 * The arrangement without one clip, or `null` when that was the last of them.
 *
 * `null` rather than an empty sequence, because an arrangement with no clips is not an arrangement —
 * the same answer `compositionWithoutMedia` gives when a Project lets go of the media a clip stood
 * over, and the same shape a Project has before anyone arranges anything.
 */
export const removeClip = (composition: Composition, clipId: string): Composition | null => {
  clipIndexOf(composition, clipId);
  const clips = composition.clips.filter((clip) => clip.id !== clipId);
  return clips.length === 0 ? null : withClips(composition, clips);
};

/** The arrangement with one clip moved to a new position, counted over the list without it. */
export const moveClip = (
  composition: Composition,
  clipId: string,
  toIndex: number,
): Composition => {
  const from = clipIndexOf(composition, clipId);
  const remaining = composition.clips.filter((clip) => clip.id !== clipId);
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), remaining.length);
  if (to === from) return composition;
  const moved = composition.clips[from]!;
  return withClips(composition, [...remaining.slice(0, to), moved, ...remaining.slice(to)]);
};

export const setClipTrim = (
  composition: Composition,
  clipId: string,
  trim: CompositionClipTrim,
): Composition => {
  const index = clipIndexOf(composition, clipId);
  const clip = composition.clips[index]!;
  if (trim.startMs === clip.trim.startMs && trim.endMs === clip.trim.endMs) return composition;
  return withClips(composition, composition.clips.with(index, { ...clip, trim }));
};

export const setClipAudio = (
  composition: Composition,
  clipId: string,
  audio: VideoEditAudio,
): Composition => {
  const index = clipIndexOf(composition, clipId);
  const clip = composition.clips[index]!;
  const next = normalizeVideoEditAudio(audio);
  if (next.level === clip.audio.level && next.muted === clip.audio.muted) return composition;
  return withClips(composition, composition.clips.with(index, { ...clip, audio: next }));
};

/**
 * Why a split at this instant would not produce two clips.
 *
 * Answered before the press rather than by refusing it, so the control can be off with its reason on
 * screen instead of offering a cut that can only fail — the same shape `projectOriginalIsRemovable`
 * gives the Project surface. `null` means the split is available.
 */
export type CompositionSplitRefusal = 'empty' | 'at-cut' | 'too-short' | 'at-limit';

export const compositionSplitRefusal = (
  composition: Composition,
  sequenceMs: number,
): CompositionSplitRefusal | null => {
  const placement = compositionPlacementAt(composition, sequenceMs);
  if (placement === null) return 'empty';
  if (composition.clips.length >= COMPOSITION_CLIP_LIMIT) return 'at-limit';
  const mediaMs = clipMediaMsAt(placement, sequenceMs);
  // On a cut the instant belongs to the clip starting there, so the left half would be empty. The
  // end of the sequence lands the same way on the right half; both are "there is no cut to make".
  if (mediaMs <= placement.clip.trim.startMs || mediaMs >= placement.clip.trim.endMs)
    return 'at-cut';
  if (
    mediaMs - placement.clip.trim.startMs < VIDEO_EDIT_MINIMUM_TRIM_MS ||
    placement.clip.trim.endMs - mediaMs < VIDEO_EDIT_MINIMUM_TRIM_MS
  ) {
    return 'too-short';
  }
  return null;
};

/**
 * The arrangement cut in two at a sequence instant.
 *
 * The **left** half keeps the clip's id. Both halves are the same media and neither is more the
 * original than the other, so the tie is broken by what it costs: keeping the left id leaves every
 * clip before the cut untouched and leaves a selection on the left where the operator put it, while
 * keeping the right would re-key the tail of the list for nothing. Subtitle cues are anchored to
 * sequence time and the total duration does not change, so a split moves no cue at all.
 *
 * Throws when {@link compositionSplitRefusal} would have named a reason — the caller is expected to
 * have asked, and a split that mints an unstorable clip is a bug rather than an operator condition.
 */
export const splitCompositionAt = (
  composition: Composition,
  sequenceMs: number,
  createId: () => string,
): Composition => {
  const refusal = compositionSplitRefusal(composition, sequenceMs);
  if (refusal !== null) fail('That arrangement cannot be split there.');
  const placement = compositionPlacementAt(composition, sequenceMs)!;
  const cutMs = clipMediaMsAt(placement, sequenceMs);
  const left: CompositionClip = {
    ...placement.clip,
    trim: { startMs: placement.clip.trim.startMs, endMs: cutMs },
  };
  const right: CompositionClip = {
    ...placement.clip,
    id: requireOpaqueId(createId(), 'Composition clip', fail),
    trim: { startMs: cutMs, endMs: placement.clip.trim.endMs },
  };
  if (composition.clips.some((clip) => clip.id === right.id)) {
    fail('Each composition clip needs its own identifier.');
  }
  return withClips(composition, composition.clips.toSpliced(placement.index, 1, left, right));
};

/** Whether two arrangements say the same thing, so a gesture that changed nothing is not stored. */
export const compositionsEqual = (left: Composition, right: Composition): boolean =>
  left === right ||
  (left.clips.length === right.clips.length &&
    left.clips.every((clip, index) => {
      const other = right.clips[index]!;
      return (
        clip.id === other.id &&
        clip.trim.startMs === other.trim.startMs &&
        clip.trim.endMs === other.trim.endMs &&
        clip.audio.level === other.audio.level &&
        clip.audio.muted === other.audio.muted &&
        projectMediaReferencesEqual(clip.media, other.media)
      );
    }) &&
    subtitleCuesEqual(left.subtitles, right.subtitles));
