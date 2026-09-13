import { describe, expect, it } from 'vitest';
import {
  COMPOSITION_CLIP_LIMIT,
  CompositionRuleError,
  compositionDurationMs,
  normalizeComposition,
  validateComposition,
  type Composition,
  type CompositionClip,
} from './index';
import { SUBTITLE_CUE_LIMIT, VIDEO_EDIT_MINIMUM_TRIM_MS } from '../video-editing';

const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const savedVideoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const videoVersionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const clipId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const cueId = (index: number) => `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`;

const clip = (index: number, overrides: Partial<CompositionClip> = {}): CompositionClip => ({
  id: clipId(index),
  media: { kind: 'asset', assetId: sourceAssetId },
  trim: { startMs: 0, endMs: 4_000 },
  audio: { level: 100, muted: false },
  ...overrides,
});

const composition = (overrides: Partial<Composition> = {}): Composition => ({
  clips: [
    clip(1),
    clip(2, {
      media: { kind: 'saved-video-version', savedVideoId, videoVersionId },
      trim: { startMs: 1_000, endMs: 3_500 },
      audio: { level: 40, muted: true },
    }),
  ],
  subtitles: [
    { id: cueId(1), text: 'First', startMs: 0, endMs: 1_500, placement: 'bottom' },
    { id: cueId(2), text: 'Across the cut', startMs: 3_000, endMs: 5_000, placement: 'top' },
  ],
  ...overrides,
});

const issueOf = (value: Composition): string | null => {
  try {
    validateComposition(value);
    return null;
  } catch (error) {
    if (error instanceof CompositionRuleError) return error.message;
    throw error;
  }
};

describe('composition invariants', () => {
  it('accepts an ordered sequence over held media with sequence-time cues', () => {
    const value = composition();
    expect(validateComposition(value)).toBe(value);
    // The cue at 3,000–5,000 ms starts inside the first clip and ends inside the second: a cue
    // spans a cut, which is what a composition-level list is for.
    expect(compositionDurationMs(value)).toBe(6_500);
  });

  it('needs at least one clip and holds a bounded number of them', () => {
    expect(issueOf(composition({ clips: [] }))).toMatch(/at least one clip/u);
    const many = Array.from({ length: COMPOSITION_CLIP_LIMIT + 1 }, (_, index) => clip(index));
    expect(issueOf(composition({ clips: many }))).toMatch(/at most 100 clips/u);
    expect(issueOf(composition({ clips: many.slice(0, COMPOSITION_CLIP_LIMIT) }))).toBeNull();
  });

  it('gives every clip its own durable identifier and a durable media reference', () => {
    expect(issueOf(composition({ clips: [clip(1), clip(1)] }))).toMatch(/own identifier/u);
    expect(issueOf(composition({ clips: [clip(1, { id: 'blob:local' })] }))).toMatch(
      /opaque durable identifier/u,
    );
    expect(
      issueOf(composition({ clips: [clip(1, { media: { kind: 'asset', assetId: '' } })] })),
    ).toMatch(/clip asset/u);
    expect(
      issueOf(
        composition({
          clips: [
            clip(1, {
              media: { kind: 'saved-video-version', savedVideoId, videoVersionId: 'https://x' },
            }),
          ],
        }),
      ),
    ).toMatch(/Video Version/u);
    expect(
      issueOf(
        composition({
          clips: [
            clip(1, { media: { kind: 'saved-video-version', savedVideoId: '', videoVersionId } }),
          ],
        }),
      ),
    ).toMatch(/Saved Video/u);
  });

  it('holds a clip to an ordered trim of at least the minimum, in its own media time', () => {
    const shortest = clip(1, { trim: { startMs: 500, endMs: 500 + VIDEO_EDIT_MINIMUM_TRIM_MS } });
    expect(issueOf(composition({ clips: [shortest] }))).toBeNull();
    expect(
      issueOf(composition({ clips: [clip(1, { trim: { startMs: 500, endMs: 599 } })] })),
    ).toMatch(/tenth of a second/u);
    expect(
      issueOf(composition({ clips: [clip(1, { trim: { startMs: -1, endMs: 4_000 } })] })),
    ).toMatch(/tenth of a second/u);
    expect(
      issueOf(composition({ clips: [clip(1, { trim: { startMs: 0, endMs: Number.NaN } })] })),
    ).toMatch(/tenth of a second/u);
  });

  it('keeps a clip level a whole percentage of its own audio', () => {
    expect(
      issueOf(composition({ clips: [clip(1, { audio: { level: 101, muted: false } })] })),
    ).toMatch(/whole percentage/u);
    expect(
      issueOf(composition({ clips: [clip(1, { audio: { level: 33.5, muted: false } })] })),
    ).toMatch(/whole percentage/u);
    expect(
      issueOf(composition({ clips: [clip(1, { audio: { level: -1, muted: false } })] })),
    ).toMatch(/whole percentage/u);
    expect(issueOf(composition({ clips: [clip(1, { audio: { level: 0, muted: true } })] }))).toBe(
      null,
    );
  });

  it('applies the single-clip cue rules to the composition list, without a duration bound', () => {
    const [first, second] = composition().subtitles;
    expect(issueOf(composition({ subtitles: [second!, first!] }))).toMatch(/start order/u);
    expect(issueOf(composition({ subtitles: [first!, { ...second!, id: first!.id }] }))).toMatch(
      /own identifier/u,
    );
    expect(issueOf(composition({ subtitles: [{ ...first!, id: 'blob:cue' }] }))).toMatch(
      /opaque durable identifier/u,
    );
    expect(issueOf(composition({ subtitles: [{ ...first!, text: '   ' }] }))).toMatch(/text/u);
    expect(issueOf(composition({ subtitles: [{ ...first!, startMs: -1 }] }))).toMatch(
      /tenth of a second/u,
    );
    expect(issueOf(composition({ subtitles: [{ ...first!, startMs: Number.NaN }] }))).toMatch(
      /tenth of a second/u,
    );
    expect(
      issueOf(composition({ subtitles: [{ ...first!, endMs: first!.startMs + 99 }] })),
    ).toMatch(/tenth of a second/u);
    // Past the end of the sequence is allowed: cues are anchored to sequence time and intersected
    // with the sequence at render, never truncated by an upstream edit.
    expect(
      issueOf(composition({ subtitles: [{ ...first!, startMs: 60_000, endMs: 62_000 }] })),
    ).toBeNull();
    const overflow = Array.from({ length: SUBTITLE_CUE_LIMIT + 1 }, (_, index) => ({
      ...first!,
      id: cueId(index),
      startMs: index * 200,
      endMs: index * 200 + 150,
    }));
    expect(issueOf(composition({ subtitles: overflow }))).toMatch(/at most 200 subtitles/u);
  });

  /*
   * Order is checked on the start alone, which is what the wire checks. Equal starts in any id
   * order are a list the contract admits, so refusing one here would make a stored composition
   * readable but unwritable — it would fail on the next checkpoint rather than at the boundary
   * that accepted it. `normalizeSubtitleCues` still settles equal starts by id.
   */
  it('holds equal-start cues to no id order, as the wire does', () => {
    const [first] = composition().subtitles;
    const together = [
      { ...first!, id: cueId(8), startMs: 1_000, endMs: 1_500 },
      { ...first!, id: cueId(7), startMs: 1_000, endMs: 1_500 },
    ];
    expect(issueOf(composition({ subtitles: together }))).toBeNull();
    expect(normalizeComposition(composition({ subtitles: together })).subtitles[0]?.id).toBe(
      cueId(7),
    );
  });
});

describe('normalizeComposition', () => {
  it('returns a composition already in form as itself', () => {
    const value = composition();
    expect(normalizeComposition(value)).toBe(value);
  });

  it('orders and bounds each clip, rounds its level, and canonicalizes the cue list', () => {
    const [first, second] = composition().subtitles;
    const messy = composition({
      clips: [
        clip(1, { trim: { startMs: -20, endMs: 30 }, audio: { level: 140.4, muted: false } }),
        clip(2),
      ],
      subtitles: [second!, { ...first!, text: `${first!.text}\n\n\n\nfive lines` }],
    });
    const normalized = normalizeComposition(messy);
    expect(normalized.clips[0]).toMatchObject({
      trim: { startMs: 0, endMs: VIDEO_EDIT_MINIMUM_TRIM_MS },
      audio: { level: 100, muted: false },
    });
    // The untouched clip keeps its identity, so a list re-render can skip it.
    expect(normalized.clips[1]).toBe(messy.clips[1]);
    expect(normalized.subtitles.map((cue) => cue.id)).toEqual([first!.id, second!.id]);
    expect(normalized.subtitles[0]?.text.split('\n')).toHaveLength(3);
    expect(issueOf(normalized)).toBeNull();
  });

  it('never clamps a cue to the sequence length', () => {
    const late = composition({
      subtitles: [{ id: cueId(9), text: 'Late', startMs: 90_000, endMs: 92_000, placement: 'top' }],
    });
    expect(normalizeComposition(late)).toBe(late);
  });
});
