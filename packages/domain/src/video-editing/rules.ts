import { clamp } from './clamp';
import { VIDEO_EDIT_AUDIO_LEVEL_MAX } from './types';
import { finalizeSubtitleCues, normalizeSubtitleCues, subtitleCuesEqual } from './subtitles';
import type {
  NormalizedVideoCrop,
  VideoEditAdjustments,
  VideoEditAudio,
  VideoEditCropPreset,
  VideoEditOutputGeometry,
  VideoEditProviderCompatibility,
  VideoEditSourceGeometry,
  VideoEditSpec,
} from './types';

export const VIDEO_EDIT_MINIMUM_TRIM_MS = 100;
export const VIDEO_EDIT_HISTORY_LIMIT = 50;
export const VIDEO_EDIT_PROVIDER_ASPECT_TOLERANCE = 0.01;

/*
 * Plain objects, not `Object.freeze`: the types are already read-only, and a top-level freeze is a
 * call the bundler cannot prove pure, which keeps this whole module in every closure that imports
 * the domain barrel — the shell's included — whether or not anything there edits video.
 */
export const DEFAULT_VIDEO_EDIT_ADJUSTMENTS: VideoEditAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  highlights: 0,
  shadows: 0,
};

export const FULL_VIDEO_CROP: NormalizedVideoCrop = { x: 0, y: 0, width: 1, height: 1 };

/** Plain object, not frozen, for the same bundle reason as the adjustments above. */
export const DEFAULT_VIDEO_EDIT_AUDIO: VideoEditAudio = {
  level: VIDEO_EDIT_AUDIO_LEVEL_MAX,
  muted: false,
};

const evenDimension = (value: number): number => Math.max(2, Math.floor(value / 2) * 2);

export const createDefaultVideoEditSpec = (durationMs: number): VideoEditSpec => ({
  trim: { startMs: 0, endMs: Math.max(VIDEO_EDIT_MINIMUM_TRIM_MS, durationMs) },
  crop: { preset: 'original', rectangle: FULL_VIDEO_CROP },
  rotation: 0,
  flipHorizontal: false,
  flipVertical: false,
  adjustments: DEFAULT_VIDEO_EDIT_ADJUSTMENTS,
  filter: 'original',
  subtitles: [],
  audio: DEFAULT_VIDEO_EDIT_AUDIO,
});

export const clampVideoEditAdjustment = (value: number): number =>
  Math.round(clamp(value, -100, 100));

export const clampVideoEditAudioLevel = (value: number): number =>
  Math.round(clamp(value, 0, VIDEO_EDIT_AUDIO_LEVEL_MAX));

export const normalizeVideoEditAudio = (audio: VideoEditAudio): VideoEditAudio => {
  const level = clampVideoEditAudioLevel(audio.level);
  const muted = audio.muted === true;
  return level === audio.level && muted === audio.muted ? audio : { level, muted };
};

/**
 * The one number the render and the preview both apply: a linear multiplier on the source's
 * samples, silence when muted. Stated once so the file and the stage cannot disagree by a decibel.
 */
export const videoEditAudioGain = (audio: VideoEditAudio): number =>
  audio.muted ? 0 : clampVideoEditAudioLevel(audio.level) / VIDEO_EDIT_AUDIO_LEVEL_MAX;

export const normalizeVideoCrop = (crop: NormalizedVideoCrop): NormalizedVideoCrop => {
  const width = clamp(crop.width, 0.02, 1);
  const height = clamp(crop.height, 0.02, 1);
  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height,
  };
};

const cropAspect = (preset: Exclude<VideoEditCropPreset, 'original' | 'freeform'>): number => {
  switch (preset) {
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
    case '4:5':
      return 4 / 5;
    case '1:1':
      return 1;
  }
};

export const cropForVideoEditPreset = (
  preset: VideoEditCropPreset,
  sourceWidth: number,
  sourceHeight: number,
  current: NormalizedVideoCrop = FULL_VIDEO_CROP,
): NormalizedVideoCrop => {
  if (preset === 'original') return FULL_VIDEO_CROP;
  if (preset === 'freeform') return normalizeVideoCrop(current);
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = cropAspect(preset);
  if (!Number.isFinite(sourceAspect) || sourceAspect <= 0) return FULL_VIDEO_CROP;
  const normalizedCurrent = normalizeVideoCrop(current);
  const centerX = normalizedCurrent.x + normalizedCurrent.width / 2;
  const centerY = normalizedCurrent.y + normalizedCurrent.height / 2;
  if (sourceAspect > targetAspect) {
    const width = targetAspect / sourceAspect;
    return {
      x: clamp(centerX - width / 2, 0, 1 - width),
      y: 0,
      width,
      height: 1,
    };
  }
  const height = sourceAspect / targetAspect;
  return {
    x: 0,
    y: clamp(centerY - height / 2, 0, 1 - height),
    width: 1,
    height,
  };
};

export const normalizeVideoEditSpec = (
  spec: VideoEditSpec,
  source: VideoEditSourceGeometry,
): VideoEditSpec => {
  const durationMs = Math.max(VIDEO_EDIT_MINIMUM_TRIM_MS, source.durationMs);
  const startMs = clamp(spec.trim.startMs, 0, durationMs - VIDEO_EDIT_MINIMUM_TRIM_MS);
  const endMs = clamp(spec.trim.endMs, startMs + VIDEO_EDIT_MINIMUM_TRIM_MS, durationMs);
  const adjustments = Object.fromEntries(
    Object.entries(spec.adjustments).map(([key, value]) => [key, clampVideoEditAdjustment(value)]),
  ) as unknown as VideoEditAdjustments;
  const normalizedCrop = normalizeVideoCrop(spec.crop.rectangle);
  const rotated = rotatedVideoEditDimensions(source.width, source.height, spec.rotation);
  const cropRectangle = cropForVideoEditPreset(
    spec.crop.preset,
    rotated.width,
    rotated.height,
    normalizedCrop,
  );
  return {
    ...spec,
    trim: { startMs, endMs },
    crop: { ...spec.crop, rectangle: cropRectangle },
    adjustments,
    subtitles: normalizeSubtitleCues(spec.subtitles, source),
    audio: normalizeVideoEditAudio(spec.audio),
  };
};

/**
 * The spec as it is rendered and recorded: the draft with its subtitles finalized. The draft may
 * hold an empty cue the operator has not typed into yet; what renders and what the server accepts
 * may not.
 */
export const finalizeVideoEditSpec = (spec: VideoEditSpec): VideoEditSpec => ({
  ...spec,
  subtitles: finalizeSubtitleCues(spec.subtitles),
});

export const rotatedVideoEditDimensions = (
  sourceWidth: number,
  sourceHeight: number,
  rotation: VideoEditSpec['rotation'],
): Readonly<{ width: number; height: number }> =>
  rotation === 90 || rotation === 270
    ? { width: sourceHeight, height: sourceWidth }
    : { width: sourceWidth, height: sourceHeight };

export const getVideoEditOutputGeometry = (
  source: VideoEditSourceGeometry,
  inputSpec: VideoEditSpec,
): VideoEditOutputGeometry => {
  const spec = normalizeVideoEditSpec(inputSpec, source);
  const rotated = rotatedVideoEditDimensions(source.width, source.height, spec.rotation);
  const width = evenDimension(rotated.width * spec.crop.rectangle.width);
  const height = evenDimension(rotated.height * spec.crop.rectangle.height);
  return {
    width,
    height,
    durationMs: spec.trim.endMs - spec.trim.startMs,
    aspectRatio: width / height,
  };
};

const withinAspectTolerance = (actual: number, expected: number): boolean =>
  Math.abs(actual / expected - 1) <= VIDEO_EDIT_PROVIDER_ASPECT_TOLERANCE;

export const getVideoEditProviderCompatibility = (
  geometry: Pick<VideoEditOutputGeometry, 'width' | 'height'>,
): VideoEditProviderCompatibility => {
  const aspect = geometry.width / geometry.height;
  if (withinAspectTolerance(aspect, 16 / 9)) {
    return { compatible: true, aspect: '16:9', reason: null };
  }
  if (withinAspectTolerance(aspect, 9 / 16)) {
    return { compatible: true, aspect: '9:16', reason: null };
  }
  return {
    compatible: false,
    aspect: 'unsupported',
    reason:
      'Character Swap and Virtual Try On require a 16:9 or 9:16 source. Local saving and Voice remain available.',
  };
};

export const videoEditSpecsEqual = (left: VideoEditSpec, right: VideoEditSpec): boolean =>
  left.trim.startMs === right.trim.startMs &&
  left.trim.endMs === right.trim.endMs &&
  left.crop.preset === right.crop.preset &&
  left.crop.rectangle.x === right.crop.rectangle.x &&
  left.crop.rectangle.y === right.crop.rectangle.y &&
  left.crop.rectangle.width === right.crop.rectangle.width &&
  left.crop.rectangle.height === right.crop.rectangle.height &&
  left.rotation === right.rotation &&
  left.flipHorizontal === right.flipHorizontal &&
  left.flipVertical === right.flipVertical &&
  left.filter === right.filter &&
  Object.keys(left.adjustments).every(
    (key) =>
      left.adjustments[key as keyof VideoEditAdjustments] ===
      right.adjustments[key as keyof VideoEditAdjustments],
  ) &&
  subtitleCuesEqual(left.subtitles, right.subtitles) &&
  left.audio.level === right.audio.level &&
  left.audio.muted === right.audio.muted;
