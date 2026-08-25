import type { LocalCaptureAspectRatio, LocalCaptureProfileId } from '../../application/types';

/**
 * How a capture choice is named, in one place.
 *
 * A leaf module rather than part of the capture panel: Settings names the same choices from the
 * persistent shell, and importing them from the panel would pull a whole component — and the
 * Studio-only graph behind it — into the shell's eager bundle for two string maps.
 */
export const profileLabels: Record<LocalCaptureProfileId, string> = {
  '720p30': '720p · 30 fps',
  '1080p30': '1080p · 30 fps',
};

export const aspectRatioLabels: Record<LocalCaptureAspectRatio, string> = {
  '16:9': 'Landscape · 16:9',
  '9:16': 'Portrait · 9:16',
};
