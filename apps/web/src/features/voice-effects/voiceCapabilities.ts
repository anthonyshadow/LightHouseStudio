import type { BrowserCapabilities } from '../../application/types';

export type VoiceBrowserCapabilities = Pick<BrowserCapabilities, 'webAudio' | 'offlineAudio'>;

export const detectVoiceBrowserCapabilities = (): VoiceBrowserCapabilities => ({
  webAudio: 'AudioContext' in window || 'webkitAudioContext' in window,
  offlineAudio: 'OfflineAudioContext' in window || 'webkitOfflineAudioContext' in window,
});
