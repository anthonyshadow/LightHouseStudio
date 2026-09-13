import { requireOpaqueId } from '../common/identity';
import { clamp } from '../video-editing/clamp';
import { VIDEO_EDIT_MINIMUM_TRIM_MS, normalizeVideoEditAudio } from '../video-editing/rules';
import {
  SUBTITLE_CUE_LIMIT,
  SUBTITLE_CUE_MINIMUM_DURATION_MS,
  SUBTITLE_CUE_TEXT_MAX_LENGTH,
  normalizeSubtitleCues,
} from '../video-editing/subtitles';
import { VIDEO_EDIT_AUDIO_LEVEL_MAX } from '../video-editing/types';
import { COMPOSITION_CLIP_LIMIT, type Composition, type CompositionClip } from './types';

export class CompositionRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompositionRuleError';
  }
}

const fail = (message: string): never => {
  throw new CompositionRuleError(message);
};

/**
 * The timeline composition cues are normalized against. Deliberately unbounded: clamping cues to
 * the sum of the trims would truncate every trailing cue the moment an upstream clip is shortened,
 * which is the loss the single-clip list avoids by living in source time. What is on screen is
 * intersected with the sequence at render, as the trim does for the single clip.
 */
const UNBOUNDED_TIMELINE = { durationMs: Number.POSITIVE_INFINITY } as const;

const validateClipMedia = (clip: CompositionClip): void => {
  if (clip.media.kind === 'asset') {
    requireOpaqueId(clip.media.assetId, 'Composition clip asset', fail);
    return;
  }
  requireOpaqueId(clip.media.savedVideoId, 'Composition clip Saved Video', fail);
  requireOpaqueId(clip.media.videoVersionId, 'Composition clip Video Version', fail);
};

/**
 * The invariants every stored composition holds. Throws `CompositionRuleError`; the snapshot rule
 * that composes this reports it as its own invalid-snapshot reason.
 */
export const validateComposition = (composition: Composition): Composition => {
  if (composition.clips.length === 0) fail('A composition needs at least one clip.');
  if (composition.clips.length > COMPOSITION_CLIP_LIMIT) {
    fail(`A composition holds at most ${COMPOSITION_CLIP_LIMIT} clips.`);
  }
  const clipIds = new Set<string>();
  for (const clip of composition.clips) {
    const id = requireOpaqueId(clip.id, 'Composition clip', fail);
    if (clipIds.has(id)) fail('Each composition clip needs its own identifier.');
    clipIds.add(id);
    validateClipMedia(clip);
    if (
      !Number.isFinite(clip.trim.startMs) ||
      !Number.isFinite(clip.trim.endMs) ||
      clip.trim.startMs < 0 ||
      clip.trim.endMs - clip.trim.startMs < VIDEO_EDIT_MINIMUM_TRIM_MS
    ) {
      fail('A clip must keep at least a tenth of a second of its media.');
    }
    if (
      !Number.isInteger(clip.audio.level) ||
      clip.audio.level < 0 ||
      clip.audio.level > VIDEO_EDIT_AUDIO_LEVEL_MAX ||
      typeof clip.audio.muted !== 'boolean'
    ) {
      fail('A clip level is a whole percentage of its own audio.');
    }
  }
  if (composition.subtitles.length > SUBTITLE_CUE_LIMIT) {
    fail(`A composition holds at most ${SUBTITLE_CUE_LIMIT} subtitles.`);
  }
  const cueIds = new Set<string>();
  composition.subtitles.forEach((cue, index) => {
    const id = requireOpaqueId(cue.id, 'Composition subtitle', fail);
    if (cueIds.has(id)) fail('Each composition subtitle needs its own identifier.');
    cueIds.add(id);
    if (cue.text.trim().length === 0 || cue.text.length > SUBTITLE_CUE_TEXT_MAX_LENGTH) {
      fail('A composition subtitle needs bounded, non-empty text.');
    }
    if (
      !Number.isFinite(cue.startMs) ||
      !Number.isFinite(cue.endMs) ||
      cue.startMs < 0 ||
      cue.endMs - cue.startMs < SUBTITLE_CUE_MINIMUM_DURATION_MS
    ) {
      fail('A composition subtitle must last at least a tenth of a second.');
    }
    const previous = composition.subtitles[index - 1];
    // Start order only, which is what the wire checks and what the single-clip list is held to.
    // `normalizeSubtitleCues` still sorts equal starts by id, so a canonical list is unchanged;
    // refusing a stored list the contract accepts would have made a read unreadable on its next
    // write rather than at the boundary that let it in.
    if (previous !== undefined && previous.startMs > cue.startMs) {
      fail('Composition subtitles must be listed in start order.');
    }
  });
  return composition;
};

/**
 * The composition in canonical form: each clip's trim ordered and at least the minimum, its level a
 * whole percentage, the cue list in the single-clip list's canonical form over an unbounded
 * timeline. Identity-preserving, like every normalizer beside it: a composition already in form is
 * returned as itself, so an editor gesture that changes nothing re-renders nothing.
 */
export const normalizeComposition = (composition: Composition): Composition => {
  let clipsChanged = false;
  const clips = composition.clips.map((clip) => {
    const startMs = clamp(clip.trim.startMs, 0, Number.POSITIVE_INFINITY);
    const endMs = clamp(
      clip.trim.endMs,
      startMs + VIDEO_EDIT_MINIMUM_TRIM_MS,
      Number.POSITIVE_INFINITY,
    );
    const audio = normalizeVideoEditAudio(clip.audio);
    if (startMs === clip.trim.startMs && endMs === clip.trim.endMs && audio === clip.audio) {
      return clip;
    }
    clipsChanged = true;
    return { ...clip, trim: { startMs, endMs }, audio };
  });
  const subtitles = normalizeSubtitleCues(composition.subtitles, UNBOUNDED_TIMELINE);
  return !clipsChanged && subtitles === composition.subtitles
    ? composition
    : { clips: clipsChanged ? clips : composition.clips, subtitles };
};

/** The length of the stitched output — the timeline the cues are anchored to. */
export const compositionDurationMs = (composition: Composition): number =>
  composition.clips.reduce((total, clip) => total + (clip.trim.endMs - clip.trim.startMs), 0);
