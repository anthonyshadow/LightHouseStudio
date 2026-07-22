import type { StudioMode } from '../../features/media-session';
import type { RecordingSource, TakeMetadata } from '../../features/recording/types';

type TrackMeasurements = Pick<TakeMetadata, 'width' | 'height' | 'frameRate'>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const positiveNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const fixedCapabilityValue = (value: unknown): number | undefined => {
  const direct = positiveNumber(value);
  if (direct !== undefined) return direct;
  const range = asRecord(value);
  if (!range) return undefined;
  const minimum = positiveNumber(range.min);
  const maximum = positiveNumber(range.max);
  return minimum !== undefined && minimum === maximum ? minimum : undefined;
};

const safeTrackRecord = (
  reader: (() => MediaTrackSettings | MediaTrackCapabilities) | undefined,
): Record<string, unknown> | null => {
  if (!reader) return null;
  try {
    return asRecord(reader());
  } catch {
    return null;
  }
};

export const captureTrackMeasurements = (track: MediaStreamTrack): TrackMeasurements => {
  const settings = safeTrackRecord(
    typeof track.getSettings === 'function' ? () => track.getSettings() : undefined,
  );
  const capabilities = safeTrackRecord(
    typeof track.getCapabilities === 'function' ? () => track.getCapabilities() : undefined,
  );
  const measurement = (key: keyof TrackMeasurements): number | undefined =>
    positiveNumber(settings?.[key]) ?? fixedCapabilityValue(capabilities?.[key]);
  const width = measurement('width');
  const height = measurement('height');
  const frameRate = measurement('frameRate');
  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(frameRate !== undefined ? { frameRate } : {}),
  };
};

const safeTrackLabel = (track: MediaStreamTrack | null): string | undefined => {
  if (!track) return undefined;
  try {
    const label = track.label.trim();
    return label || undefined;
  } catch {
    return undefined;
  }
};

export const domainVideoSource = (
  source: RecordingSource['videoSource'],
): 'local-camera' | 'model-output' => (source === 'transformed' ? 'model-output' : 'local-camera');

export const domainAudioSource = (
  source: RecordingSource['audioSource'],
): 'local-microphone' | 'model-output' | 'none' => {
  switch (source) {
    case 'provider':
      return 'model-output';
    case 'microphone':
      return 'local-microphone';
    case 'none':
      return 'none';
  }
};

export const captureTakeMetadata = (
  source: RecordingSource,
  mode: StudioMode,
  startedAt: Date,
  videoTrack: MediaStreamTrack,
  audioTrack: MediaStreamTrack | null,
): TakeMetadata => {
  const videoSourceLabel = safeTrackLabel(videoTrack);
  const audioSourceLabel = safeTrackLabel(audioTrack);
  return Object.freeze({
    mode,
    startedAt: startedAt.toISOString(),
    videoSource: source.videoSource,
    audioSource: audioTrack ? source.audioSource : 'none',
    ...captureTrackMeasurements(videoTrack),
    ...(videoSourceLabel ? { videoSourceLabel } : {}),
    ...(audioSourceLabel ? { audioSourceLabel } : {}),
  });
};
