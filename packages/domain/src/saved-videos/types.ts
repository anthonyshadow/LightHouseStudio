export const SAVED_VIDEO_ORIGINS = [
  'recorded',
  'uploaded',
  'character-swap',
  'virtual-try-on',
  'voice-treatment',
  'editor',
  'legacy-import',
] as const;

export type SavedVideoOrigin = (typeof SAVED_VIDEO_ORIGINS)[number];
