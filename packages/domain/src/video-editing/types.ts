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

export type VideoEditSpec = Readonly<{
  trim: Readonly<{ startMs: number; endMs: number }>;
  crop: Readonly<{ preset: VideoEditCropPreset; rectangle: NormalizedVideoCrop }>;
  rotation: VideoEditRotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  adjustments: VideoEditAdjustments;
  filter: VideoEditFilter;
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
