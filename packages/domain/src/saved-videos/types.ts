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

export interface SavedVideoRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly currentVersionId: string;
  readonly sourceVideoId: string | null;
  readonly status: 'ready' | 'missing' | 'deleted';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface VideoVersionRecord {
  readonly id: string;
  readonly videoId: string;
  readonly ownerUserId: string;
  readonly ordinal: number;
  readonly origin: SavedVideoOrigin;
  readonly sourceVersionId: string | null;
  readonly assetId: string;
  readonly mimeType: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly durationMs: number;
  readonly width: number;
  readonly height: number;
  readonly createdAt: string;
}

export interface SavedVideoAggregate {
  readonly video: SavedVideoRecord;
  readonly versions: readonly VideoVersionRecord[];
  readonly revision: number;
}
