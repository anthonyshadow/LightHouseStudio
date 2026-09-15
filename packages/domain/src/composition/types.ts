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
 * A reference into media the Project holds — a source, the cut it currently works from, or a
 * borrowed Library Version — occupying one position in the sequence. It copies no bytes; a split
 * makes two references, the left one keeping the id.
 *
 * "An adopted result" is deliberately narrower than it reads: the source collection addresses every
 * source, and the working-media read addresses the *current* adoption, but an adoption an earlier
 * revision made has no read at all (`GET /working-media` takes no revision). A clip over one of
 * those is unresolvable, and the editor says so rather than pretending. Widening that is a server
 * change, not a clip-model one.
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

/**
 * The length a clip contributes to the sequence: its trimmed span, never its media's own length.
 *
 * Beside the type rather than with the sequence arithmetic that uses it most, because the snapshot's
 * own duration rule needs it too — and a validator reaching it through the editor's module would put
 * the whole arrangement editor on the path of every route that parses a Project.
 */
export const compositionClipDurationMs = (clip: CompositionClip): number =>
  clip.trim.endMs - clip.trim.startMs;
