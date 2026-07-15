import type { StudioSessionController } from './types';

export const studioModeOptions = [
  { value: 'local', label: 'Local Camera', shortLabel: 'Local' },
  { value: 'lucy-2.5', label: 'Character · Lucy 2.5', shortLabel: 'Character' },
  { value: 'lucy-vton-3', label: 'Virtual Try-On · VTON 3', shortLabel: 'Try-On' },
] as const;

export const isModelSessionActive = (session: StudioSessionController): boolean =>
  [
    'requesting-media',
    'requesting-token',
    'connecting',
    'connected',
    'generating',
    'reconnecting',
  ].includes(session.lifecycle);
