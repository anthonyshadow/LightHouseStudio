export const VIDEO_EDIT_CROP_PRESETS = [
  'original',
  'freeform',
  '16:9',
  '9:16',
  '1:1',
  '4:5',
] as const;

export type VideoEditCropPreset = (typeof VIDEO_EDIT_CROP_PRESETS)[number];

export const VIDEO_EDIT_FILTERS = ['original', 'vivid', 'warm', 'cool', 'mono', 'fade'] as const;

export type VideoEditFilter = (typeof VIDEO_EDIT_FILTERS)[number];
export type VideoEditRotation = 0 | 90 | 180 | 270;

/**
 * Where a subtitle sits on the frame. A region rather than free coordinates, so one cue lays out
 * sensibly on every shape the product produces — a portrait cut, a landscape cut, and each of the
 * placements a save can re-frame it to.
 */
export const SUBTITLE_CUE_PLACEMENTS = ['top', 'middle', 'bottom'] as const;

export type SubtitleCuePlacement = (typeof SUBTITLE_CUE_PLACEMENTS)[number];

/**
 * Timed text over the clip. Times are source time, like the trim, so a cue outside the trim is
 * kept rather than lost when the trim is later loosened. Cues may overlap: what is on screen at a
 * moment is every cue covering it, stacked by `stackSubtitleCues`.
 */
export type SubtitleCue = Readonly<{
  /** App-generated UUID — the editor's selection key and what a retime keeps. */
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  placement: SubtitleCuePlacement;
}>;

export type NormalizedVideoCrop = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type VideoEditAdjustments = Readonly<{
  brightness: number;
  contrast: number;
  saturation: number;
  temperature: number;
  highlights: number;
  shadows: number;
}>;

/** The loudest the level goes: the source as recorded. A boost is a later slice, not this one. */
export const VIDEO_EDIT_AUDIO_LEVEL_MAX = 100;

/**
 * How loud the clip's own audio is in the output. `level` is a whole percentage of the source,
 * 0 to `VIDEO_EDIT_AUDIO_LEVEL_MAX`; `muted` silences it without forgetting the level, so a mute
 * is one undo entry away from the number it hid. Neither drops the track — whether an output
 * carries audio at all is the placement's keep-or-drop, decided at a save, not here.
 */
export type VideoEditAudio = Readonly<{
  level: number;
  muted: boolean;
}>;

export type VideoEditSpec = Readonly<{
  trim: Readonly<{ startMs: number; endMs: number }>;
  crop: Readonly<{ preset: VideoEditCropPreset; rectangle: NormalizedVideoCrop }>;
  rotation: VideoEditRotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  adjustments: VideoEditAdjustments;
  filter: VideoEditFilter;
  /** Sorted by start, then id. The wire mirrors this order. */
  subtitles: readonly SubtitleCue[];
  /** Last on purpose: the wire mirrors this order, and every field before it predates it. */
  audio: VideoEditAudio;
}>;

export type VideoEditSourceGeometry = Readonly<{
  width: number;
  height: number;
  durationMs: number;
}>;

export type VideoEditOutputGeometry = Readonly<{
  width: number;
  height: number;
  durationMs: number;
  aspectRatio: number;
}>;

export type VideoEditProviderCompatibility = Readonly<{
  compatible: boolean;
  aspect: '16:9' | '9:16' | 'unsupported';
  reason: string | null;
}>;
