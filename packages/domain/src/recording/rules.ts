import { DomainRuleError, type SafeError } from '../errors/safe-error';
import type {
  AudioSidecar,
  RecordingArtifact,
  RecordingLifecycle,
  RecordingLifecycleStatus,
  RecordingReleaseReason,
  RecordingSourceAvailability,
  RecordingSourceDescriptor,
} from './types';

export const createRecordingLifecycle = <TMedia = unknown>(
  sourceReady = false,
): RecordingLifecycle<TMedia> => (sourceReady ? { status: 'ready' } : { status: 'idle' });

export const prepareRecordingLifecycle = <TMedia>(
  state: RecordingLifecycle<TMedia>,
  source: RecordingSourceDescriptor | null,
): RecordingLifecycle<TMedia> => {
  if (state.status === 'recording' || state.status === 'stopping' || state.status === 'recorded') {
    return state;
  }
  return source ? { status: 'ready' } : { status: 'idle' };
};

export const startRecordingLifecycle = <TMedia>(
  state: RecordingLifecycle<TMedia>,
  source: RecordingSourceDescriptor | null,
  startedAt: string,
): RecordingLifecycle<TMedia> => {
  if (!canStartRecording(state.status, source)) {
    throw new DomainRuleError('recording-failure', 'Recording is not ready for this media source.');
  }
  const date = new Date(startedAt);
  if (!Number.isFinite(date.valueOf())) {
    throw new DomainRuleError('invalid-input', 'A valid recording start time is required.');
  }
  return { status: 'recording', startedAt: date.toISOString() };
};

export const stopRecordingLifecycle = <TMedia>(
  state: RecordingLifecycle<TMedia>,
): RecordingLifecycle<TMedia> => {
  if (state.status !== 'recording') {
    throw new DomainRuleError('recording-failure', 'No active recording can be stopped.');
  }
  return { status: 'stopping', startedAt: state.startedAt };
};

export const completeRecordingLifecycle = <TMedia>(
  state: RecordingLifecycle<TMedia>,
  artifact: RecordingArtifact<TMedia>,
): RecordingLifecycle<TMedia> => {
  if (state.status !== 'stopping') {
    throw new DomainRuleError(
      'recording-failure',
      'Recording must stop before it can be finalized.',
    );
  }
  if (
    !artifact.objectUrl ||
    !artifact.mimeType ||
    !artifact.filename ||
    artifact.sizeBytes <= 0 ||
    artifact.durationMs < 0 ||
    !Number.isFinite(artifact.durationMs)
  ) {
    throw new DomainRuleError('recording-failure', 'The completed recording artifact is invalid.');
  }
  return { status: 'recorded', artifact };
};

export const failRecordingLifecycle = <TMedia>(error: SafeError): RecordingLifecycle<TMedia> => ({
  status: 'error',
  error,
});

export const startAudioSidecar = <TAudio>(
  attemptId: string,
  audioAvailable: boolean,
): AudioSidecar<TAudio> =>
  audioAvailable ? { status: 'capturing', attemptId } : { status: 'unavailable' };

export const completeAudioSidecar = <TAudio>(
  state: AudioSidecar<TAudio>,
  attemptId: string,
  audio: TAudio,
  sizeBytes: number,
): AudioSidecar<TAudio> => {
  if (state.status !== 'capturing' || state.attemptId !== attemptId) return state;
  if (sizeBytes <= 0) return { status: 'unavailable' };
  return { status: 'ready', attemptId, audio, sizeBytes };
};

export const failAudioSidecar = <TAudio>(
  state: AudioSidecar<TAudio>,
  attemptId: string,
  error: SafeError,
): AudioSidecar<TAudio> =>
  state.status === 'capturing' && state.attemptId === attemptId
    ? { status: 'error', attemptId, error }
    : state;

export const selectRecordingSource = (
  availability: RecordingSourceAvailability,
): RecordingSourceDescriptor | null => {
  if (availability.modeId === 'local') {
    if (!availability.localVideoLive) return null;
    return {
      modeId: availability.modeId,
      videoSource: 'local-camera',
      audioSource: availability.localAudioLive ? 'local-microphone' : 'none',
      hasLiveVideo: true,
      hasLiveAudio: availability.localAudioLive,
    };
  }

  if (!availability.modelVideoLive) return null;
  const audioSource = availability.modelAudioLive
    ? 'model-output'
    : availability.localAudioLive
      ? 'local-microphone'
      : 'none';
  return {
    modeId: availability.modeId,
    videoSource: 'model-output',
    audioSource,
    hasLiveVideo: true,
    hasLiveAudio: audioSource !== 'none',
  };
};

export const canStartRecording = (
  status: RecordingLifecycleStatus,
  source: RecordingSourceDescriptor | null,
): boolean => (status === 'idle' || status === 'ready' || status === 'recorded') && source !== null;

export const canUseVoiceEffects = (sidecar: AudioSidecar): boolean =>
  sidecar.status === 'ready' && sidecar.sizeBytes > 0;

export const shouldRevokeRecordingObjectUrl = (reason: RecordingReleaseReason): boolean =>
  reason === 'discard' || reason === 'replacement' || reason === 'unmount';

export type RecordingFinishAction =
  'finalize-recording' | 'release-live-resources' | 'enter-recorded-review';

/**
 * A finished take follows the same privacy boundary for every source mode:
 * finalize borrowed recorder data before releasing its live owners, then enter
 * review without reacquiring media.
 */
export const recordingFinishOrder = (): readonly RecordingFinishAction[] => [
  'finalize-recording',
  'release-live-resources',
  'enter-recorded-review',
];
