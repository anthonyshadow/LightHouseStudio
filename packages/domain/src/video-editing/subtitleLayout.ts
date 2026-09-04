import { SUBTITLE_CUE_MAX_LINES, compareSubtitleCues } from './subtitles';
import {
  SUBTITLE_CUE_PLACEMENTS,
  type NormalizedVideoCrop,
  type SubtitleCue,
  type SubtitleCuePlacement,
  type VideoEditSpec,
} from './types';

/*
 * Where a cue is drawn and when it is on screen. Imported by the editor, its worker and the
 * placement chooser, never by `rules.ts` — a bundle boundary, explained once in
 * `scripts/check-build-manifest.mjs`.
 */

/**
 * How a cue is laid out, as fractions of the frame it is drawn on, so the preview, the export
 * worker and the placement chooser agree on where text goes. A portrait frame keeps a deep band
 * clear at both ends: Reels, TikTok and Shorts draw their own controls there, and it is exactly
 * the band a centred square or 4:5 re-frame of a phone cut removes — so a caption placed inside
 * it survives both.
 */
export const SUBTITLE_LAYOUT = {
  maxWidthRatio: 0.8,
  fontHeightRatio: 0.045,
  lineHeightRatio: 1.25,
  /** Space between two cues on screen at once, in line heights. */
  cueGapRatio: 0.16,
  portraitInsets: { top: 0.22, bottom: 0.22 },
  landscapeInsets: { top: 0.08, bottom: 0.1 },
} as const;

/**
 * The tallest block one cue can be: its line limit at the layout's type size. A function rather
 * than a computed constant on purpose: a top-level expression over imported bindings is one the
 * bundler will not prove pure, and an impure top level keeps this whole module in the shell.
 */
const cueBlockHeightRatio = (): number =>
  SUBTITLE_CUE_MAX_LINES * SUBTITLE_LAYOUT.fontHeightRatio * SUBTITLE_LAYOUT.lineHeightRatio;

export type SubtitleFrameSize = Readonly<{ width: number; height: number }>;

/** Every cue covering a moment, in start order — often none, sometimes several. */
export const subtitleCuesAt = (
  cues: readonly SubtitleCue[],
  timeMs: number,
): readonly SubtitleCue[] => cues.filter((cue) => cue.startMs <= timeMs && timeMs < cue.endMs);

/**
 * The cues as the rendered output sees them: intersected with the trim and re-based so zero is
 * the trim start. The one owner of that mapping — the worker receives frames in output time.
 */
export const outputSubtitleCues = (
  spec: Pick<VideoEditSpec, 'trim' | 'subtitles'>,
): readonly SubtitleCue[] =>
  spec.subtitles.flatMap((cue) => {
    const startMs = Math.max(cue.startMs, spec.trim.startMs) - spec.trim.startMs;
    const endMs = Math.min(cue.endMs, spec.trim.endMs) - spec.trim.startMs;
    return endMs > startMs ? [{ ...cue, startMs, endMs }] : [];
  });

/**
 * The draw order when several cues are on screen at once, per region, from the frame's edge
 * inward: at the bottom the earliest cue sits lowest and later ones rise above it; at the top the
 * earliest sits highest and later ones drop below; in the middle the group is centred with the
 * earliest on top. A function of the data, never of the order things were edited in.
 */
export const stackSubtitleCues = (
  active: readonly SubtitleCue[],
): Readonly<Record<SubtitleCuePlacement, readonly SubtitleCue[]>> => {
  const ordered = [...active].sort(compareSubtitleCues);
  return {
    top: ordered.filter((cue) => cue.placement === 'top'),
    middle: ordered.filter((cue) => cue.placement === 'middle'),
    bottom: ordered.filter((cue) => cue.placement === 'bottom'),
  };
};

const isPortrait = (frame: SubtitleFrameSize): boolean => frame.height > frame.width;

/**
 * Where a region lays out on a frame of this shape, in the same normalized space as a crop
 * rectangle: the box one cue occupies at its line limit. The renderer anchors to the box's outer
 * edge and grows inward; the placement chooser asks the same box whether a crop would cut it.
 */
export const subtitleRegionBox = (
  placement: SubtitleCuePlacement,
  frame: SubtitleFrameSize,
): NormalizedVideoCrop => {
  const insets = isPortrait(frame)
    ? SUBTITLE_LAYOUT.portraitInsets
    : SUBTITLE_LAYOUT.landscapeInsets;
  const width = SUBTITLE_LAYOUT.maxWidthRatio;
  const x = (1 - width) / 2;
  const height = cueBlockHeightRatio();
  switch (placement) {
    case 'top':
      return { x, y: insets.top, width, height };
    case 'bottom':
      return { x, y: 1 - insets.bottom - height, width, height };
    case 'middle':
      return { x, y: 0.5 - height / 2, width, height };
  }
};

/**
 * The box a stack of cues actually occupies in one region: the region's edge as the anchor, the
 * block growing toward the frame's centre by however many lines it has. In normalized units, so
 * the renderer's pixels and the chooser's crop check come from the same statement.
 */
export const subtitleBlockBox = (
  placement: SubtitleCuePlacement,
  frame: SubtitleFrameSize,
  lineCount: number,
  cueCount: number,
): NormalizedVideoCrop => {
  const region = subtitleRegionBox(placement, frame);
  const lineHeight = SUBTITLE_LAYOUT.fontHeightRatio * SUBTITLE_LAYOUT.lineHeightRatio;
  /*
   * Never taller than the region it sits in. The region is what the placement chooser measures
   * against a crop, so a block that outgrew it made the chooser promise captions survive a shape
   * that cuts them. Wrapping bounds one cue's lines; several cues stacked in one region can still
   * sum past the limit, and this is the one statement both the renderer and the chooser read.
   */
  const height = Math.min(
    region.height,
    lineCount * lineHeight + Math.max(0, cueCount - 1) * SUBTITLE_LAYOUT.cueGapRatio * lineHeight,
  );
  switch (placement) {
    case 'top':
      return { ...region, height };
    case 'bottom':
      return { ...region, y: region.y + region.height - height, height };
    case 'middle':
      return { ...region, y: 0.5 - height / 2, height };
  }
};

/** The distinct regions a cue list uses, in layout order. */
export const subtitlePlacementsUsed = (
  cues: readonly SubtitleCue[],
): readonly SubtitleCuePlacement[] =>
  SUBTITLE_CUE_PLACEMENTS.filter((placement) => cues.some((cue) => cue.placement === placement));

const CROP_TOLERANCE = 0.001;

/**
 * Which regions a normalized crop of this frame would cut into. Stated once so the chooser can
 * say it in words before the bytes exist.
 */
export const subtitlePlacementsCutByCrop = (
  placements: readonly SubtitleCuePlacement[],
  crop: NormalizedVideoCrop,
  frame: SubtitleFrameSize,
): readonly SubtitleCuePlacement[] =>
  placements.filter((placement) => {
    const box = subtitleRegionBox(placement, frame);
    return (
      box.x < crop.x - CROP_TOLERANCE ||
      box.y < crop.y - CROP_TOLERANCE ||
      box.x + box.width > crop.x + crop.width + CROP_TOLERANCE ||
      box.y + box.height > crop.y + crop.height + CROP_TOLERANCE
    );
  });
