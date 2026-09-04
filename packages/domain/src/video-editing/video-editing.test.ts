import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_EDIT_AUDIO,
  VIDEO_EDIT_AUDIO_LEVEL_MAX,
  clampVideoEditAudioLevel,
  normalizeVideoEditAudio,
  videoEditAudioGain,
  SUBTITLE_CUE_DEFAULT_DURATION_MS,
  SUBTITLE_CUE_LIMIT,
  SUBTITLE_CUE_MINIMUM_DURATION_MS,
  SUBTITLE_CUE_TEXT_MAX_LENGTH,
  SUBTITLE_LAYOUT,
  createSubtitleCueAt,
  cropForVideoEditPreset,
  createDefaultVideoEditSpec,
  finalizeSubtitleCues,
  finalizeVideoEditSpec,
  getVideoEditOutputGeometry,
  getVideoEditProviderCompatibility,
  moveSubtitleCue,
  normalizeSubtitleCues,
  normalizeVideoEditSpec,
  outputSubtitleCues,
  retimeSubtitleCue,
  stackSubtitleCues,
  subtitleBlockBox,
  subtitleCueBounds,
  subtitleCuesAt,
  subtitlePlacementsCutByCrop,
  subtitlePlacementsUsed,
  subtitleRegionBox,
  videoEditSpecsEqual,
  type SubtitleCue,
} from '.';

const source = { width: 1920, height: 1080, durationMs: 10_000 };

const cue = (overrides: Partial<SubtitleCue> & Pick<SubtitleCue, 'id'>): SubtitleCue => ({
  text: 'Hello',
  startMs: 0,
  endMs: 1_000,
  placement: 'bottom',
  ...overrides,
});

describe('video editing rules', () => {
  it('creates a clean full-duration baseline', () => {
    const baseline = createDefaultVideoEditSpec(source.durationMs);
    expect(baseline.trim).toEqual({ startMs: 0, endMs: 10_000 });
    expect(baseline.crop.rectangle).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(videoEditSpecsEqual(baseline, createDefaultVideoEditSpec(source.durationMs))).toBe(true);
  });

  it.each([
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['1:1', 1],
    ['4:5', 4 / 5],
  ] as const)('centers the %s crop preset', (preset, expectedAspect) => {
    const crop = cropForVideoEditPreset(preset, source.width, source.height);
    const actualAspect = (source.width * crop.width) / (source.height * crop.height);
    expect(actualAspect).toBeCloseTo(expectedAspect, 5);
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
  });

  it('preserves a fixed-ratio crop position while keeping its requested aspect', () => {
    const crop = cropForVideoEditPreset('1:1', source.width, source.height, {
      x: 0.3,
      y: 0,
      width: 0.5625,
      height: 1,
    });

    expect(crop.x).toBeCloseTo(0.3);
    expect(crop).toMatchObject({ y: 0, width: 0.5625, height: 1 });
    expect((source.width * crop.width) / (source.height * crop.height)).toBeCloseTo(1, 5);
  });

  it('clamps trim, crop, and adjustment values', () => {
    const normalized = normalizeVideoEditSpec(
      {
        ...createDefaultVideoEditSpec(source.durationMs),
        trim: { startMs: -10, endMs: 99_000 },
        crop: { preset: 'freeform', rectangle: { x: -1, y: 2, width: 2, height: 0 } },
        adjustments: {
          brightness: -200,
          contrast: 200,
          saturation: 0,
          temperature: 0,
          highlights: 0,
          shadows: 0,
        },
      },
      source,
    );
    expect(normalized.trim).toEqual({ startMs: 0, endMs: 10_000 });
    expect(normalized.crop.rectangle).toEqual({ x: 0, y: 0.98, width: 1, height: 0.02 });
    expect(normalized.adjustments.brightness).toBe(-100);
    expect(normalized.adjustments.contrast).toBe(100);
  });

  it('swaps dimensions for quarter-turn rotation and keeps encoder dimensions even', () => {
    const spec = {
      ...createDefaultVideoEditSpec(source.durationMs),
      rotation: 90 as const,
      crop: {
        preset: 'freeform' as const,
        rectangle: { x: 0, y: 0, width: 0.77, height: 0.83 },
      },
    };
    const output = getVideoEditOutputGeometry(source, spec);
    expect(output.width % 2).toBe(0);
    expect(output.height % 2).toBe(0);
    expect(output.width).toBeLessThan(source.height);
    expect(output.height).toBeLessThan(source.width);
  });

  it('normalizes fixed crop presets against post-rotation geometry', () => {
    const normalized = normalizeVideoEditSpec(
      {
        ...createDefaultVideoEditSpec(source.durationMs),
        rotation: 90,
        crop: {
          preset: '4:5',
          rectangle: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
        },
      },
      source,
    );
    const rotatedWidth = source.height;
    const rotatedHeight = source.width;
    const actualAspect =
      (rotatedWidth * normalized.crop.rectangle.width) /
      (rotatedHeight * normalized.crop.rectangle.height);
    expect(actualAspect).toBeCloseTo(4 / 5, 5);
  });

  it('gates visual providers while preserving local and Voice eligibility', () => {
    expect(getVideoEditProviderCompatibility({ width: 1280, height: 720 })).toMatchObject({
      compatible: true,
      aspect: '16:9',
    });
    expect(getVideoEditProviderCompatibility({ width: 1080, height: 1080 })).toMatchObject({
      compatible: false,
      aspect: 'unsupported',
    });
  });
});

describe('subtitle rules', () => {
  it('starts with no subtitles and counts them in equality', () => {
    const baseline = createDefaultVideoEditSpec(source.durationMs);
    expect(baseline.subtitles).toEqual([]);
    const withCue = { ...baseline, subtitles: [cue({ id: 'a' })] };
    expect(videoEditSpecsEqual(baseline, withCue)).toBe(false);
    expect(videoEditSpecsEqual(withCue, { ...withCue, subtitles: [cue({ id: 'a' })] })).toBe(true);
    expect(
      videoEditSpecsEqual(withCue, { ...withCue, subtitles: [cue({ id: 'a', text: 'Hi' })] }),
    ).toBe(false);
  });

  it('normalizes cues into the source, sorts them, keeps overlaps and keeps empty text', () => {
    const normalized = normalizeVideoEditSpec(
      {
        ...createDefaultVideoEditSpec(source.durationMs),
        subtitles: [
          cue({ id: 'late', startMs: 9_950, endMs: 20_000 }),
          cue({ id: 'b', startMs: 500, endMs: 1_500 }),
          cue({ id: 'a', startMs: 500, endMs: 520, text: '' }),
          cue({ id: 'negative', startMs: -50, endMs: 10 }),
        ],
      },
      source,
    );
    expect(normalized.subtitles.map((entry) => entry.id)).toEqual(['negative', 'a', 'b', 'late']);
    expect(normalized.subtitles[0]).toMatchObject({ startMs: 0, endMs: 100 });
    expect(normalized.subtitles[1]).toMatchObject({ startMs: 500, endMs: 600, text: '' });
    expect(normalized.subtitles[2]).toMatchObject({ startMs: 500, endMs: 1_500 });
    expect(normalized.subtitles[3]).toMatchObject({ startMs: 9_900, endMs: 10_000 });
  });

  it('keeps one cue per id and returns the list as itself when nothing had to change', () => {
    const first = cue({ id: 'a', startMs: 0, endMs: 1_000 });
    const twin = cue({ id: 'a', startMs: 5_000, endMs: 6_000, text: 'Twin' });
    const second = cue({ id: 'b', startMs: 2_000, endMs: 3_000 });
    expect(normalizeSubtitleCues([first, twin, second], source)).toEqual([first, second]);

    const settled = [first, second];
    expect(normalizeSubtitleCues(settled, source)).toBe(settled);
    expect(finalizeSubtitleCues(settled)).toBe(settled);
    expect(normalizeSubtitleCues([second, first], source)).not.toBe(settled);
  });

  it('creates a cue at the playhead inside the trim, and retimes or moves it within bounds', () => {
    const spec = {
      ...createDefaultVideoEditSpec(source.durationMs),
      trim: { startMs: 0, endMs: 3_000 },
    };
    expect(createSubtitleCueAt(spec, 500, 'new')).toEqual({
      id: 'new',
      text: '',
      startMs: 500,
      endMs: 500 + SUBTITLE_CUE_DEFAULT_DURATION_MS,
      placement: 'bottom',
    });
    // Near the trim end the cue is shortened to fit, and never shorter than the minimum.
    expect(createSubtitleCueAt(spec, 2_950, 'late')).toMatchObject({
      startMs: 3_000 - SUBTITLE_CUE_MINIMUM_DURATION_MS,
      endMs: 3_000,
    });

    const existing = cue({ id: 'a', startMs: 1_000, endMs: 2_000 });
    expect(subtitleCueBounds(existing, 'start', source)).toEqual({
      minimum: 0,
      maximum: 2_000 - SUBTITLE_CUE_MINIMUM_DURATION_MS,
    });
    expect(subtitleCueBounds(existing, 'end', source)).toEqual({
      minimum: 1_000 + SUBTITLE_CUE_MINIMUM_DURATION_MS,
      maximum: source.durationMs,
    });
    expect(retimeSubtitleCue(existing, 'start', 1_990, source).startMs).toBe(1_900);
    expect(retimeSubtitleCue(existing, 'end', 99_000, source).endMs).toBe(source.durationMs);
    expect(moveSubtitleCue(existing, 9_500, source)).toMatchObject({
      startMs: 9_000,
      endMs: 10_000,
    });
  });

  it('bounds text to three lines and 200 characters without trimming what is being typed', () => {
    const normalized = normalizeSubtitleCues(
      [
        cue({ id: 'a', text: 'one\r\ntwo\nthree\nfour' }),
        cue({ id: 'b', text: 'x'.repeat(250) }),
        cue({ id: 'c', text: 'hello ' }),
      ],
      source,
    );
    expect(normalized[0]!.text).toBe('one\ntwo\nthree');
    expect(normalized[1]!.text).toHaveLength(SUBTITLE_CUE_TEXT_MAX_LENGTH);
    expect(normalized[2]!.text).toBe('hello ');
  });

  it('caps the list at the limit, keeping the earliest', () => {
    const count = SUBTITLE_CUE_LIMIT + 5;
    const many = Array.from({ length: count }, (_, index) =>
      cue({ id: `c${index}`, startMs: (count - index) * 10, endMs: (count - index) * 10 + 100 }),
    );
    const normalized = normalizeSubtitleCues(many, { durationMs: 100_000 });
    expect(normalized).toHaveLength(SUBTITLE_CUE_LIMIT);
    expect(normalized[0]!.startMs).toBe(10);
    expect(normalized.at(-1)!.startMs).toBe(SUBTITLE_CUE_LIMIT * 10);
  });

  it('finalizes by trimming text and dropping cues that say nothing', () => {
    const finalized = finalizeVideoEditSpec({
      ...createDefaultVideoEditSpec(source.durationMs),
      subtitles: [cue({ id: 'a', text: '  Hello  ' }), cue({ id: 'b', text: ' \n ' })],
    });
    expect(finalized.subtitles).toEqual([cue({ id: 'a', text: 'Hello' })]);
    expect(finalizeSubtitleCues([])).toEqual([]);
  });

  it('answers which cues cover a moment and stacks them per region in start order', () => {
    const cues = [
      cue({ id: 'a', startMs: 0, endMs: 2_000 }),
      cue({ id: 'b', startMs: 1_000, endMs: 3_000, placement: 'top' }),
      cue({ id: 'c', startMs: 1_500, endMs: 1_800 }),
    ];
    expect(subtitleCuesAt(cues, 999).map((entry) => entry.id)).toEqual(['a']);
    expect(subtitleCuesAt(cues, 1_600).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(subtitleCuesAt(cues, 2_000).map((entry) => entry.id)).toEqual(['b']);
    expect(subtitleCuesAt(cues, 3_000)).toEqual([]);

    const stacked = stackSubtitleCues([cues[2]!, cues[1]!, cues[0]!]);
    expect(stacked.bottom.map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(stacked.top.map((entry) => entry.id)).toEqual(['b']);
    expect(stacked.middle).toEqual([]);
  });

  it('re-bases cues to output time through the trim and drops what the trim excludes', () => {
    const output = outputSubtitleCues({
      trim: { startMs: 1_000, endMs: 4_000 },
      subtitles: [
        cue({ id: 'before', startMs: 0, endMs: 1_000 }),
        cue({ id: 'straddles', startMs: 500, endMs: 2_500 }),
        cue({ id: 'inside', startMs: 2_000, endMs: 3_000 }),
        cue({ id: 'after', startMs: 4_000, endMs: 5_000 }),
      ],
    });
    expect(output).toEqual([
      cue({ id: 'straddles', startMs: 0, endMs: 1_500 }),
      cue({ id: 'inside', startMs: 1_000, endMs: 2_000 }),
    ]);
  });

  it('grows a stacked block from the region edge toward the centre, in the crop-check units', () => {
    const frame = { width: 1_000, height: 1_000 };
    const lineHeight = SUBTITLE_LAYOUT.fontHeightRatio * SUBTITLE_LAYOUT.lineHeightRatio;
    const region = subtitleRegionBox('bottom', frame);
    const oneLine = subtitleBlockBox('bottom', frame, 1, 1);
    expect(oneLine.y + oneLine.height).toBeCloseTo(region.y + region.height);
    expect(oneLine.height).toBeCloseTo(lineHeight);
    const stacked = subtitleBlockBox('bottom', frame, 2, 2);
    expect(stacked.height).toBeCloseTo(2 * lineHeight + SUBTITLE_LAYOUT.cueGapRatio * lineHeight);
    expect(subtitleBlockBox('top', frame, 2, 1).y).toBeCloseTo(subtitleRegionBox('top', frame).y);
    expect(subtitleBlockBox('middle', frame, 1, 1).y).toBeCloseTo(0.5 - lineHeight / 2);
  });

  it('keeps portrait captions inside the band a square or tall re-frame preserves', () => {
    const portrait = { width: 1_080, height: 1_920 };
    const landscape = { width: 1_920, height: 1_080 };
    // A portrait frame keeps a deeper band clear at the bottom, so its region sits higher.
    expect(subtitleRegionBox('bottom', portrait).y).toBeLessThan(
      subtitleRegionBox('bottom', landscape).y,
    );
    const everywhere = ['top', 'middle', 'bottom'] as const;
    for (const preset of ['1:1', '4:5', '9:16'] as const) {
      const crop = cropForVideoEditPreset(preset, portrait.width, portrait.height);
      expect(subtitlePlacementsCutByCrop(everywhere, crop, portrait)).toEqual([]);
    }
    const widescreenOfPortrait = cropForVideoEditPreset('16:9', portrait.width, portrait.height);
    expect(subtitlePlacementsCutByCrop(everywhere, widescreenOfPortrait, portrait)).toEqual([
      'top',
      'bottom',
    ]);
    const phoneOfLandscape = cropForVideoEditPreset('9:16', landscape.width, landscape.height);
    expect(subtitlePlacementsCutByCrop(['bottom'], phoneOfLandscape, landscape)).toEqual([
      'bottom',
    ]);
    expect(
      subtitlePlacementsUsed([
        cue({ id: 'a', placement: 'bottom' }),
        cue({ id: 'b', placement: 'top' }),
      ]),
    ).toEqual(['top', 'bottom']);
  });
});

describe('audio level', () => {
  const source = { width: 1_280, height: 720, durationMs: 12_000 };

  it('starts at the source as recorded and is last in the spec, the wire order', () => {
    const spec = createDefaultVideoEditSpec(12_000);
    expect(spec.audio).toEqual({ level: VIDEO_EDIT_AUDIO_LEVEL_MAX, muted: false });
    expect(Object.keys(spec).at(-1)).toBe('audio');
    expect(DEFAULT_VIDEO_EDIT_AUDIO).toEqual({ level: 100, muted: false });
  });

  it('clamps the level to a whole percentage of the source, never a boost', () => {
    expect(clampVideoEditAudioLevel(150)).toBe(100);
    expect(clampVideoEditAudioLevel(-5)).toBe(0);
    expect(clampVideoEditAudioLevel(33.6)).toBe(34);
    expect(clampVideoEditAudioLevel(Number.NaN)).toBe(0);
  });

  it('turns level and mute into the one gain the render and the preview both apply', () => {
    expect(videoEditAudioGain({ level: 100, muted: false })).toBe(1);
    expect(videoEditAudioGain({ level: 25, muted: false })).toBe(0.25);
    expect(videoEditAudioGain({ level: 25, muted: true })).toBe(0);
    expect(videoEditAudioGain({ level: 250, muted: false })).toBe(1);
  });

  it('normalizes through the spec and keeps identity when nothing changed', () => {
    const spec = { ...createDefaultVideoEditSpec(12_000), audio: { level: 140, muted: true } };
    const normalized = normalizeVideoEditSpec(spec, source);
    expect(normalized.audio).toEqual({ level: 100, muted: true });
    expect(normalizeVideoEditAudio(normalized.audio)).toBe(normalized.audio);
  });

  it('is part of what makes two specs equal', () => {
    const left = createDefaultVideoEditSpec(12_000);
    expect(videoEditSpecsEqual(left, { ...left, audio: { level: 100, muted: true } })).toBe(false);
    expect(videoEditSpecsEqual(left, { ...left, audio: { level: 60, muted: false } })).toBe(false);
    expect(videoEditSpecsEqual(left, { ...left, audio: { ...left.audio } })).toBe(true);
  });
});
