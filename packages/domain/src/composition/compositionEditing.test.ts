import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_CLIP_LIMIT,
  CompositionRuleError,
  clipMediaMsAt,
  compositionClipDurationMs,
  compositionDurationMs,
  compositionPlacementAt,
  compositionPlacements,
  sequenceMsAt,
  validateComposition,
  type Composition,
  type CompositionClip,
} from './index';
import {
  appendClip,
  clipOverMedia,
  compositionIsFull,
  compositionOverMedia,
  compositionSplitRefusal,
  compositionsEqual,
  moveClip,
  removeClip,
  setClipAudio,
  setClipTrim,
  splitCompositionAt,
} from './operations';
import { VIDEO_EDIT_MINIMUM_TRIM_MS } from '../video-editing';

const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const clipId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const cueId = (index: number) => `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`;

const clip = (index: number, overrides: Partial<CompositionClip> = {}): CompositionClip => ({
  id: clipId(index),
  media: { kind: 'asset', assetId: sourceAssetId },
  trim: { startMs: 0, endMs: 4_000 },
  audio: { level: 100, muted: false },
  ...overrides,
});

/** Two clips of 4s and 2.5s: sequence spans [0, 4000) and [4000, 6500). */
const composition = (overrides: Partial<Composition> = {}): Composition => ({
  clips: [clip(1), clip(2, { trim: { startMs: 1_000, endMs: 3_500 } })],
  subtitles: [
    { id: cueId(1), text: 'Across the cut', startMs: 3_000, endMs: 5_000, placement: 'top' },
  ],
  ...overrides,
});

const ids = (value: Composition): readonly string[] => value.clips.map(({ id }) => id);
const spans = (value: Composition): readonly string[] =>
  value.clips.map(({ trim }) => `${trim.startMs}-${trim.endMs}`);

describe('composition sequence arithmetic', () => {
  it('places clips end to end in sequence time, whatever their own media times are', () => {
    expect(
      compositionPlacements(composition()).map(({ startMs, endMs }) => [startMs, endMs]),
    ).toEqual([
      [0, 4_000],
      [4_000, 6_500],
    ]);
    expect(compositionDurationMs(composition())).toBe(6_500);
    expect(compositionClipDurationMs(clip(2, { trim: { startMs: 1_000, endMs: 3_500 } }))).toBe(
      2_500,
    );
  });

  it('gives a cut instant to the clip that starts there, and the last frame to the last clip', () => {
    const value = composition();
    expect(compositionPlacementAt(value, 0)?.index).toBe(0);
    expect(compositionPlacementAt(value, 3_999)?.index).toBe(0);
    // The cut itself: half-open spans mean it belongs to the clip beginning at it, which is what
    // makes splitting on a boundary a no-op rather than a way to mint an empty clip.
    expect(compositionPlacementAt(value, 4_000)?.index).toBe(1);
    // The very end is nobody's start, and a playhead parked there is still looking at the last frame.
    expect(compositionPlacementAt(value, 6_500)?.index).toBe(1);
    expect(compositionPlacementAt(value, 99_999)?.index).toBe(1);
  });

  it('converts between the two clocks and clamps a question about a neighbour', () => {
    const [first, second] = compositionPlacements(composition());
    // The second clip starts 1s into its own media, so sequence 4_500 is media 1_500.
    expect(clipMediaMsAt(second!, 4_500)).toBe(1_500);
    expect(clipMediaMsAt(first!, 2_222)).toBe(2_222);
    // An instant outside the placement clamps rather than seeking frames the operator cut away.
    expect(clipMediaMsAt(second!, 0)).toBe(1_000);
    expect(clipMediaMsAt(second!, 99_999)).toBe(3_500);
  });

  it('reads a media instant back on the sequence clock, which is where a rendered frame lands', () => {
    const [first, second] = compositionPlacements(composition());
    expect(sequenceMsAt(second!, 1_500)).toBe(4_500);
    expect(sequenceMsAt(first!, 2_222)).toBe(2_222);
    // Inverse of clipMediaMsAt inside the trim, including a cut that is not a whole millisecond.
    const uneven = compositionPlacements(
      composition({
        clips: [clip(1, { trim: { startMs: 0, endMs: 1_001 / 3 } }), clip(2)],
      }),
    );
    expect(sequenceMsAt(uneven[1]!, clipMediaMsAt(uneven[1]!, 1_234.5))).toBeCloseTo(1_234.5, 9);
    // The trim's own end is the placement's end, which is exactly the next clip's start.
    expect(sequenceMsAt(uneven[0]!, 1_001 / 3)).toBe(uneven[1]!.startMs);
    // Outside the trim it clamps, the way its inverse refuses to seek frames the operator cut away.
    expect(sequenceMsAt(second!, 0)).toBe(4_000);
    expect(sequenceMsAt(second!, 99_999)).toBe(6_500);
  });
});

describe('composition clip operations', () => {
  it('appends, removes and reorders, and un-arranges when the last clip goes', () => {
    const value = composition();
    expect(ids(appendClip(value, clip(3)))).toEqual([clipId(1), clipId(2), clipId(3)]);
    expect(ids(removeClip(value, clipId(1))!)).toEqual([clipId(2)]);
    expect(ids(moveClip(value, clipId(2), 0))).toEqual([clipId(2), clipId(1)]);
    // The same answer `compositionWithoutMedia` gives: an arrangement with no clips is not one.
    expect(removeClip({ ...value, clips: [clip(1)] }, clipId(1))).toBeNull();
  });

  it('returns the same arrangement when a gesture changes nothing, so no undo entry is minted', () => {
    const value = composition();
    expect(moveClip(value, clipId(1), 0)).toBe(value);
    expect(setClipTrim(value, clipId(1), { startMs: 0, endMs: 4_000 })).toBe(value);
    expect(setClipAudio(value, clipId(1), { level: 100, muted: false })).toBe(value);
  });

  it('refuses a clip that is not there, a duplicate id, and a clip past the limit', () => {
    const value = composition();
    expect(() => moveClip(value, clipId(9), 0)).toThrow(CompositionRuleError);
    expect(() => appendClip(value, clip(1))).toThrow(CompositionRuleError);
    const full = {
      ...value,
      clips: Array.from({ length: COMPOSITION_CLIP_LIMIT }, (_, index) => clip(index + 1)),
    };
    expect(() => appendClip(full, clip(COMPOSITION_CLIP_LIMIT + 1))).toThrow(CompositionRuleError);
  });

  it('makes one clip over the whole of a piece of media, carrying the id the caller minted', () => {
    const media = { kind: 'asset', assetId: sourceAssetId } as const;
    const whole = clipOverMedia(media, 7_250, clipId(4));
    expect(whole).toEqual({
      id: clipId(4),
      media,
      trim: { startMs: 0, endMs: 7_250 },
      audio: { level: 100, muted: false },
    });
    // A media record with no duration still yields a storable clip; a bad id never yields one.
    expect(clipOverMedia(media, 0, clipId(5)).trim.endMs).toBe(VIDEO_EDIT_MINIMUM_TRIM_MS);
    expect(() => clipOverMedia(media, 1_000, '')).toThrow(CompositionRuleError);
    // Added to an arrangement it is the last clip; alone, it is the arrangement a Project starts from.
    expect(ids(appendClip(composition(), whole))).toEqual([clipId(1), clipId(2), clipId(4)]);
    expect(compositionOverMedia(media, 7_250, () => clipId(4))).toEqual({
      clips: [whole],
      subtitles: [],
    });
    expect(() => validateComposition(appendClip(composition(), whole))).not.toThrow();
  });

  it('says when the arrangement is full before a clip is offered, and refuses one past it', () => {
    const value = composition();
    expect(compositionIsFull(value)).toBe(false);
    const full = {
      ...value,
      clips: Array.from({ length: COMPOSITION_CLIP_LIMIT }, (_, index) => clip(index + 1)),
    };
    expect(compositionIsFull(full)).toBe(true);
    expect(() =>
      appendClip(
        full,
        clipOverMedia({ kind: 'asset', assetId: sourceAssetId }, 1_000, clipId(101)),
      ),
    ).toThrow(CompositionRuleError);
  });

  it('keeps every trim and level storable, so an edited arrangement still validates', () => {
    const edited = setClipAudio(
      setClipTrim(composition(), clipId(1), { startMs: 500, endMs: 3_000 }),
      clipId(2),
      { level: 55, muted: true },
    );
    expect(() => validateComposition(edited)).not.toThrow();
    expect(spans(edited)).toEqual(['500-3000', '1000-3500']);
  });
});

describe('splitting an arrangement at the playhead', () => {
  const nextId = (value: string) => () => value;

  it('cuts the placed clip in two, leaving the left half holding the id', () => {
    const split = splitCompositionAt(composition(), 1_500, nextId(clipId(9)));
    expect(ids(split)).toEqual([clipId(1), clipId(9), clipId(2)]);
    // 1_500 into a clip that starts at media 0: the halves meet exactly where the playhead was.
    expect(spans(split)).toEqual(['0-1500', '1500-4000', '1000-3500']);
    // The total is unchanged, which is why a split moves no cue: they are anchored to sequence time.
    expect(compositionDurationMs(split)).toBe(compositionDurationMs(composition()));
    expect(split.subtitles).toEqual(composition().subtitles);
  });

  it('cuts inside the second clip using its own media time, not the sequence time', () => {
    const split = splitCompositionAt(composition(), 5_000, nextId(clipId(9)));
    // Sequence 5_000 is 1_000 into a clip whose media starts at 1_000, so the cut is at media 2_000.
    expect(spans(split)).toEqual(['0-4000', '1000-2000', '2000-3500']);
    expect(ids(split)).toEqual([clipId(1), clipId(2), clipId(9)]);
  });

  it('names why a cut is unavailable before it is offered, rather than refusing the press', () => {
    const value = composition();
    expect(compositionSplitRefusal(value, 1_500)).toBeNull();
    // On a cut, at the very start, and at the very end there is no cut to make.
    expect(compositionSplitRefusal(value, 4_000)).toBe('at-cut');
    expect(compositionSplitRefusal(value, 0)).toBe('at-cut');
    expect(compositionSplitRefusal(value, 6_500)).toBe('at-cut');
    // There is a cut to make, but one half would be under the minimum a clip must keep.
    expect(compositionSplitRefusal(value, VIDEO_EDIT_MINIMUM_TRIM_MS - 1)).toBe('too-short');
    expect(compositionSplitRefusal(value, 4_000 - (VIDEO_EDIT_MINIMUM_TRIM_MS - 1))).toBe(
      'too-short',
    );
    // Exactly the minimum on both sides is a cut that can be made, so the bound is inclusive.
    expect(compositionSplitRefusal(value, VIDEO_EDIT_MINIMUM_TRIM_MS)).toBeNull();
    expect(compositionSplitRefusal(value, 4_000 - VIDEO_EDIT_MINIMUM_TRIM_MS)).toBeNull();
    const full = {
      ...value,
      clips: Array.from({ length: COMPOSITION_CLIP_LIMIT }, (_, index) => clip(index + 1)),
    };
    expect(compositionSplitRefusal(full, 1_500)).toBe('at-limit');
    expect(() => splitCompositionAt(value, 4_000, nextId(clipId(9)))).toThrow(CompositionRuleError);
  });

  it('produces an arrangement the snapshot would store', () => {
    const split = splitCompositionAt(composition(), 1_500, nextId(clipId(9)));
    expect(() => validateComposition(split)).not.toThrow();
  });
});

describe('comparing two arrangements', () => {
  it('reads a re-derived copy as equal and any real change as different', () => {
    const value = composition();
    expect(compositionsEqual(value, composition())).toBe(true);
    expect(compositionsEqual(value, moveClip(value, clipId(2), 0))).toBe(false);
    expect(
      compositionsEqual(value, setClipTrim(value, clipId(1), { startMs: 0, endMs: 3_000 })),
    ).toBe(false);
    expect(
      compositionsEqual(value, setClipAudio(value, clipId(1), { level: 50, muted: false })),
    ).toBe(false);
    expect(compositionsEqual(value, { ...value, subtitles: [] })).toBe(false);
    expect(compositionsEqual(value, removeClip(value, clipId(1))!)).toBe(false);
  });

  it('tells two clips over different media apart even at the same position and trim', () => {
    const value = { ...composition(), clips: [clip(1)] };
    const borrowed = {
      ...value,
      clips: [
        clip(1, {
          media: {
            kind: 'saved-video-version' as const,
            savedVideoId: 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338',
            videoVersionId: 'b276694b-58c4-40d3-8fb6-315e32b66fd0',
          },
        }),
      ],
    };
    expect(compositionsEqual(value, borrowed)).toBe(false);
  });
});
