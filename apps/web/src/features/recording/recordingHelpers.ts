import {
  formatDuration as formatDomainDuration,
  formatFileSize,
  selectRecordingMimeType,
  selectRecordingSource,
  shouldRevokeRecordingObjectUrl,
  type RecordingReleaseReason,
} from '@studio/domain';
import type { RecordingSource, RecordingArtifact } from './types';
import type { StudioMode } from '../media-session';

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

export const selectSupportedMime = (candidates: string[]): string | undefined => {
  if (!('MediaRecorder' in window) || typeof MediaRecorder.isTypeSupported !== 'function')
    return undefined;
  return selectRecordingMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder), candidates);
};

export const selectVideoMime = (): string | undefined => {
  if (!('MediaRecorder' in window) || typeof MediaRecorder.isTypeSupported !== 'function')
    return undefined;
  return selectRecordingMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder));
};
export const selectAudioMime = (): string | undefined => selectSupportedMime(AUDIO_MIME_CANDIDATES);

const live = (track: MediaStreamTrack): boolean => track.readyState === 'live';

export const composeRecordingSource = (
  mode: StudioMode,
  local: MediaStream | null,
  remote: MediaStream | null,
): RecordingSource | null => {
  const localVideo = local?.getVideoTracks().find(live);
  const microphone = local?.getAudioTracks().find(live);
  const modelVideo = remote?.getVideoTracks().find(live);
  const providerAudio = remote?.getAudioTracks().find(live);
  const descriptor = selectRecordingSource({
    modeId: mode,
    localVideoLive: Boolean(localVideo),
    localAudioLive: Boolean(microphone),
    modelVideoLive: Boolean(modelVideo),
    modelAudioLive: Boolean(providerAudio),
  });
  if (!descriptor) return null;
  const video = descriptor.videoSource === 'model-output' ? modelVideo : localVideo;
  if (!video) return null;
  const audio =
    descriptor.audioSource === 'model-output'
      ? providerAudio
      : descriptor.audioSource === 'local-microphone'
        ? microphone
        : undefined;
  return {
    stream: new MediaStream(audio ? [video, audio] : [video]),
    videoSource: descriptor.videoSource === 'model-output' ? 'transformed' : 'local',
    audioSource:
      descriptor.audioSource === 'model-output'
        ? 'provider'
        : descriptor.audioSource === 'local-microphone'
          ? 'microphone'
          : 'none',
  };
};

const selectedLiveTracks = (source: RecordingSource | null) => ({
  video: source?.stream.getVideoTracks().find(live) ?? null,
  audio: source?.stream.getAudioTracks().find(live) ?? null,
});

export const hasSameRecordingTracks = (
  active: RecordingSource | null,
  candidate: RecordingSource | null,
): boolean => {
  if (!active || !candidate) return false;
  const activeTracks = selectedLiveTracks(active);
  const candidateTracks = selectedLiveTracks(candidate);
  return (
    activeTracks.video === candidateTracks.video && activeTracks.audio === candidateTracks.audio
  );
};

export const revokeArtifactUrl = (
  artifact: RecordingArtifact | null,
  reason: RecordingReleaseReason,
): void => {
  if (artifact && shouldRevokeRecordingObjectUrl(reason)) URL.revokeObjectURL(artifact.objectUrl);
};

export const formatBytes = (bytes: number): string => formatFileSize(bytes);

export const formatDuration = (seconds: number): string => formatDomainDuration(seconds * 1_000);
