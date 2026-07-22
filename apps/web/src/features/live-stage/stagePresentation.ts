import type { RecordingArtifact } from '../recording/types';
import type { StudioMode } from '../media-session';

export type StagePresentation =
  | { kind: 'idle'; mode: StudioMode }
  | { kind: 'live'; stream: MediaStream; origin: 'local' | 'provider'; mirrored: boolean }
  | { kind: 'finalizing'; retainedStream: MediaStream | null; startedAt: number }
  | { kind: 'playback'; artifact: RecordingArtifact; controlsLocked: boolean };

export type StreamDetails = {
  hasLiveVideo: boolean;
  resolution: string;
  videoSource: string;
  audioSource: string | null;
};

const isFinitePositive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const formatFrameRate = (frameRate: number): string =>
  Number.isInteger(frameRate) ? String(frameRate) : frameRate.toFixed(2).replace(/0+$/, '');

const trackSettings = (track: MediaStreamTrack): MediaTrackSettings => {
  try {
    return track.getSettings();
  } catch {
    return {};
  }
};

export const describeStream = (stream: MediaStream | null, transformed: boolean): StreamDetails => {
  const videoTrack = stream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null;
  const audioTrack = stream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;

  if (!videoTrack) {
    return {
      hasLiveVideo: false,
      resolution: 'Video idle',
      videoSource: transformed ? 'AI output unavailable' : 'Camera off',
      audioSource: audioTrack?.label.trim() || (audioTrack ? 'Live audio' : null),
    };
  }

  const settings = trackSettings(videoTrack);
  const size =
    isFinitePositive(settings.width) && isFinitePositive(settings.height)
      ? `${Math.round(settings.width)} × ${Math.round(settings.height)}`
      : 'Live video';
  const resolution = isFinitePositive(settings.frameRate)
    ? `${size} · ${formatFrameRate(settings.frameRate)} fps`
    : size;

  return {
    hasLiveVideo: true,
    resolution,
    videoSource: transformed ? 'AI output' : videoTrack.label.trim() || 'Local camera',
    audioSource: audioTrack
      ? transformed
        ? 'Provider audio'
        : audioTrack.label.trim() || 'Microphone'
      : null,
  };
};

export const describeStageMedia = (
  presentation: StagePresentation,
  stream: MediaStream | null,
  transformed: boolean,
): StreamDetails => {
  if (presentation.kind === 'playback') {
    return {
      hasLiveVideo: true,
      resolution: 'Recorded take',
      videoSource: 'Recorded playback',
      audioSource: null,
    };
  }

  const details = describeStream(stream, transformed);
  if (presentation.kind !== 'finalizing' || !details.hasLiveVideo) return details;
  return { ...details, resolution: 'Finalizing take', videoSource: 'Last live frame' };
};
