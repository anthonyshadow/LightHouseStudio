import type { ProjectMediaReference } from '../projects/media-reference';
import type { SubtitleCue, VideoEditAudio } from '../video-editing/types';

/** Bounds one snapshot row: far more clips than a phone-shot deliverable, still one revision. */
export const COMPOSITION_CLIP_LIMIT = 100;

/**
 * In and out points in the clip's own media time, like `VideoEditSpec.trim`, so a clip survives
 * its neighbours changing. The domain holds the order and the minimum; the upper bound needs the
 * media's duration, which is known where the media record is, not here.
 */
export type CompositionClipTrim = Readonly<{ startMs: number; endMs: number }>;

/**
 * A reference into media the Project holds — a source, an adopted result or a borrowed Library
 * Version — occupying one position in the sequence. It copies no bytes; a split makes two
 * references, one keeping the id.
 */
export interface CompositionClip {
  /** App-generated UUID: the editor's selection key. */
  readonly id: string;
  readonly media: ProjectMediaReference;
  readonly trim: CompositionClipTrim;
  /** The clip's own level and mute; the gain the render applies is `videoEditAudioGain`. */
  readonly audio: VideoEditAudio;
}

/**
 * The arrangement that turns a Project's material into one deliverable: an ordered sequence of
 * clips and one list of subtitle cues over the whole sequence. Cue times are **sequence time** —
 * milliseconds from the start of the stitched output — because a cue may span a cut. Sorted by
 * start then id, like the single-clip list; cues may overlap.
 */
export interface Composition {
  readonly clips: readonly CompositionClip[];
  readonly subtitles: readonly SubtitleCue[];
}
