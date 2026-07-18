import type { LocalCaptureProfileId } from '../../application/types';
import type { MediaRequirements } from '../../adapters/browser-media/browserMedia';

export const LOCAL_MEDIA_REQUIREMENTS: MediaRequirements = {
  width: 1_280,
  height: 720,
  frameRate: 30,
};

export const LOCAL_MEDIA_PROFILES: Record<LocalCaptureProfileId, MediaRequirements> = {
  '720p30': LOCAL_MEDIA_REQUIREMENTS,
  '1080p30': {
    width: 1_920,
    height: 1_080,
    frameRate: 30,
  },
};

export const localMediaRequirements = (profile: LocalCaptureProfileId): MediaRequirements =>
  LOCAL_MEDIA_PROFILES[profile];
