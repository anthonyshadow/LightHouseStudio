import { clamp } from './clamp';
import type { SubtitleCue, VideoEditSourceGeometry, VideoEditSpec } from './types';

/*
 * What every reader of an edit specification needs: what a valid cue list is, when two are the
 * same, and how a cue is made or retimed. Where a cue is drawn lives in `subtitleLayout.ts`; the
 * split is a bundle boundary, explained once in `scripts/check-build-manifest.mjs`.
 */

export const SUBTITLE_CUE_LIMIT = 200;
export const SUBTITLE_CUE_TEXT_MAX_LENGTH = 200;
export const SUBTITLE_CUE_MAX_LINES = 3;
/** Matches the minimum trim, so word-by-word timing is not ruled out. */
export const SUBTITLE_CUE_MINIMUM_DURATION_MS = 100;
/** Long enough to read a short line; the operator retimes from there. */
export const SUBTITLE_CUE_DEFAULT_DURATION_MS = 2_000;

/** Start order, then id, so equal starts are stable wherever cues are sorted. */
export const compareSubtitleCues = (left: SubtitleCue, right: SubtitleCue): number =>
  left.startMs !== right.startMs
    ? left.startMs - right.startMs
    : left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : 0;

/**
 * Bounds the text without touching the whitespace the operator is in the middle of typing: a
 * trailing space is what the next word attaches to, so trimming belongs to `finalizeSubtitleCues`.
 */
export const normalizeSubtitleText = (text: string): string =>
  text
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .slice(0, SUBTITLE_CUE_MAX_LINES)
    .join('\n')
    .slice(0, SUBTITLE_CUE_TEXT_MAX_LENGTH);

/**
 * The cue list in its canonical form: one cue per id, times inside the source, at least the
 * minimum duration, sorted by start then id, capped. Overlaps are left exactly as set, and empty
 * text is kept — an empty cue is the operator mid-edit, and this runs on every keystroke.
 */
export const normalizeSubtitleCues = (
  cues: readonly SubtitleCue[],
  source: Pick<VideoEditSourceGeometry, 'durationMs'>,
): readonly SubtitleCue[] => {
  const durationMs = Math.max(SUBTITLE_CUE_MINIMUM_DURATION_MS, source.durationMs);
  const seen = new Set<string>();
  const normalized = cues
    .filter((cue) => !seen.has(cue.id) && seen.add(cue.id))
    .map((cue) => {
      const startMs = clamp(cue.startMs, 0, durationMs - SUBTITLE_CUE_MINIMUM_DURATION_MS);
      const endMs = clamp(cue.endMs, startMs + SUBTITLE_CUE_MINIMUM_DURATION_MS, durationMs);
      const text = normalizeSubtitleText(cue.text);
      // A cue already in form is returned as itself, so the list is too when nothing changed —
      // this runs on every slider and crop gesture, and a stable identity is what keeps those
      // gestures from re-rendering every cue.
      return startMs === cue.startMs && endMs === cue.endMs && text === cue.text
        ? cue
        : { ...cue, text, startMs, endMs };
    })
    .sort(compareSubtitleCues)
    .slice(0, SUBTITLE_CUE_LIMIT);
  return sameCues(normalized, cues) ? cues : normalized;
};

/** What leaves the editor: trimmed text, and no cue that says nothing. */
export const finalizeSubtitleCues = (cues: readonly SubtitleCue[]): readonly SubtitleCue[] => {
  const finalized = cues
    .map((cue) => (cue.text === cue.text.trim() ? cue : { ...cue, text: cue.text.trim() }))
    .filter((cue) => cue.text.length > 0);
  return sameCues(finalized, cues) ? cues : finalized;
};

const sameCues = (left: readonly SubtitleCue[], right: readonly SubtitleCue[]): boolean =>
  left.length === right.length && left.every((cue, index) => cue === right[index]);

export const subtitleCuesEqual = (
  left: readonly SubtitleCue[],
  right: readonly SubtitleCue[],
): boolean =>
  left === right ||
  (left.length === right.length &&
    left.every((cue, index) => {
      const other = right[index]!;
      return (
        cue.id === other.id &&
        cue.text === other.text &&
        cue.startMs === other.startMs &&
        cue.endMs === other.endMs &&
        cue.placement === other.placement
      );
    }));

/**
 * A new, untyped cue starting at the playhead: the default length, or to the trim end if that
 * comes first, and never shorter than the minimum. It is created inside the trim because that is
 * what the operator is looking at; a cue may later be moved past it and is then kept, unrendered.
 */
export const createSubtitleCueAt = (
  spec: Pick<VideoEditSpec, 'trim'>,
  playheadMs: number,
  id: string,
): SubtitleCue => {
  const latestStart = Math.max(0, spec.trim.endMs - SUBTITLE_CUE_MINIMUM_DURATION_MS);
  const startMs = clamp(playheadMs, 0, latestStart);
  const endMs = Math.min(
    startMs + SUBTITLE_CUE_DEFAULT_DURATION_MS,
    Math.max(startMs + SUBTITLE_CUE_MINIMUM_DURATION_MS, spec.trim.endMs),
  );
  return { id, text: '', startMs, endMs, placement: 'bottom' };
};

export type SubtitleCueEdge = 'start' | 'end';

/** The range one edge of a cue may take while the other stays put and the minimum holds. */
export const subtitleCueBounds = (
  cue: Pick<SubtitleCue, 'startMs' | 'endMs'>,
  edge: SubtitleCueEdge,
  source: Pick<VideoEditSourceGeometry, 'durationMs'>,
): Readonly<{ minimum: number; maximum: number }> =>
  edge === 'start'
    ? { minimum: 0, maximum: cue.endMs - SUBTITLE_CUE_MINIMUM_DURATION_MS }
    : { minimum: cue.startMs + SUBTITLE_CUE_MINIMUM_DURATION_MS, maximum: source.durationMs };

/** One edge moved to a time, held inside `subtitleCueBounds`. */
export const retimeSubtitleCue = (
  cue: SubtitleCue,
  edge: SubtitleCueEdge,
  timeMs: number,
  source: Pick<VideoEditSourceGeometry, 'durationMs'>,
): SubtitleCue => {
  const { minimum, maximum } = subtitleCueBounds(cue, edge, source);
  const value = clamp(timeMs, minimum, maximum);
  return edge === 'start' ? { ...cue, startMs: value } : { ...cue, endMs: value };
};

/** The whole cue moved so it starts at a time, keeping its length inside the source. */
export const moveSubtitleCue = (
  cue: SubtitleCue,
  startMs: number,
  source: Pick<VideoEditSourceGeometry, 'durationMs'>,
): SubtitleCue => {
  const length = cue.endMs - cue.startMs;
  const boundedStart = clamp(startMs, 0, Math.max(0, source.durationMs - length));
  return { ...cue, startMs: boundedStart, endMs: boundedStart + length };
};
