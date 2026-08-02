import type { LocalCaptureAspectRatio, LocalCaptureProfileId } from '../../application/types';
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

export const localMediaRequirements = (
  profile: LocalCaptureProfileId,
  aspectRatio: LocalCaptureAspectRatio,
): MediaRequirements => {
  const landscape = LOCAL_MEDIA_PROFILES[profile];
  return aspectRatio === '16:9'
    ? landscape
    : { ...landscape, width: landscape.height, height: landscape.width };
};
