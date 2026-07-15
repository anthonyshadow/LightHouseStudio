import type { StudioMode } from '../../features/media-session';
import type { AutomaticRecordingStopReason } from '../../features/recording/types';
import { selectAudioMime, selectVideoMime } from '../../features/recording/recordingHelpers';
import type { RecordingSource } from '../../features/recording/types';

export const SIDECAR_FINALIZATION_GRACE_MS = 1_500;
export const RECORDING_FINALIZATION_TIMEOUT_MS = 10_000;

type RecordingAttemptListeners = {
  mainData: EventListener;
  mainStop: EventListener;
  mainError: EventListener;
  sidecarData: EventListener | null;
  sidecarStop: EventListener | null;
  sidecarError: EventListener | null;
};

export type RecordingAttempt = {
  mode: StudioMode;
  startedAt: Date;
  startTime: number;
  mainRecorder: MediaRecorder;
  sidecarRecorder: MediaRecorder | null;
  mainChunks: Blob[];
  sidecarChunks: Blob[];
  sidecarError: string | null;
  mainStopped: boolean;
  stopRequested: boolean;
  sidecarStopped: boolean;
  videoTrack: MediaStreamTrack;
  audioTrack: MediaStreamTrack | null;
  onVideoEnded: () => void;
  onAudioEnded: () => void;
  listeners: RecordingAttemptListeners | null;
  sidecarWaitTimer: number | null;
  automaticStopReason: AutomaticRecordingStopReason | null;
};

export type RecordingAttemptSetup =
  | { status: 'missing-video' }
  | { status: 'main-recorder-unavailable' }
  | { status: 'ready'; attempt: RecordingAttempt };

type RecordingAttemptEvents = {
  onMainStopped(): void;
  onMainError(): void;
  onSidecarStopped(): void;
  onSidecarError(message: string): void;
};

const liveTrack = (track: MediaStreamTrack): boolean => track.readyState === 'live';

export const createRecordingAttempt = (
  source: RecordingSource,
  mode: StudioMode,
  onSourceEnded: () => void,
): RecordingAttemptSetup => {
  const videoTrack = source.stream.getVideoTracks().find(liveTrack);
  if (!videoTrack) return { status: 'missing-video' };

  const videoMime = selectVideoMime();
  let mainRecorder: MediaRecorder;
  try {
    mainRecorder = videoMime
      ? new MediaRecorder(source.stream, { mimeType: videoMime })
      : new MediaRecorder(source.stream);
  } catch {
    return { status: 'main-recorder-unavailable' };
  }

  const audioTrack = source.stream.getAudioTracks().find(liveTrack);
  const audioMime = selectAudioMime();
  let sidecarRecorder: MediaRecorder | null = null;
  let sidecarError: string | null = null;
  if (audioTrack) {
    try {
      const audioStream = new MediaStream([audioTrack]);
      sidecarRecorder = audioMime
        ? new MediaRecorder(audioStream, { mimeType: audioMime })
        : new MediaRecorder(audioStream);
    } catch {
      sidecarError = 'Audio sidecar capture is unavailable for this source.';
    }
  }

  return {
    status: 'ready',
    attempt: {
      mode,
      startedAt: new Date(),
      startTime: performance.now(),
      mainRecorder,
      sidecarRecorder,
      mainChunks: [],
      sidecarChunks: [],
      sidecarError,
      mainStopped: false,
      stopRequested: false,
      sidecarStopped: !sidecarRecorder,
      videoTrack,
      audioTrack: audioTrack ?? null,
      onVideoEnded: onSourceEnded,
      onAudioEnded: onSourceEnded,
      listeners: null,
      sidecarWaitTimer: null,
      automaticStopReason: null,
    },
  };
};

export const attachRecordingAttemptListeners = (
  attempt: RecordingAttempt,
  events: RecordingAttemptEvents,
): void => {
  const mainData: EventListener = (event) => {
    const data = (event as BlobEvent).data;
    if (data.size > 0) attempt.mainChunks.push(data);
  };
  const mainStop: EventListener = () => {
    attempt.mainStopped = true;
    events.onMainStopped();
  };
  const mainError: EventListener = () => events.onMainError();
  const sidecarData: EventListener | null = attempt.sidecarRecorder
    ? (event) => {
        const data = (event as BlobEvent).data;
        if (data.size > 0) attempt.sidecarChunks.push(data);
      }
    : null;
  const sidecarStop: EventListener | null = attempt.sidecarRecorder
    ? () => {
        attempt.sidecarStopped = true;
        events.onSidecarStopped();
      }
    : null;
  const sidecarError: EventListener | null = attempt.sidecarRecorder
    ? () => {
        attempt.sidecarStopped = true;
        attempt.sidecarError = 'Audio sidecar capture failed.';
        events.onSidecarError(attempt.sidecarError);
      }
    : null;

  attempt.listeners = {
    mainData,
    mainStop,
    mainError,
    sidecarData,
    sidecarStop,
    sidecarError,
  };
  attempt.mainRecorder.addEventListener('dataavailable', mainData);
  attempt.mainRecorder.addEventListener('stop', mainStop);
  attempt.mainRecorder.addEventListener('error', mainError);
  if (attempt.sidecarRecorder) {
    if (sidecarData) attempt.sidecarRecorder.addEventListener('dataavailable', sidecarData);
    if (sidecarStop) attempt.sidecarRecorder.addEventListener('stop', sidecarStop);
    if (sidecarError) attempt.sidecarRecorder.addEventListener('error', sidecarError);
  }
};

export const cleanupRecordingAttempt = (attempt: RecordingAttempt): void => {
  attempt.videoTrack.removeEventListener('ended', attempt.onVideoEnded);
  attempt.audioTrack?.removeEventListener('ended', attempt.onAudioEnded);
  if (attempt.sidecarWaitTimer !== null) {
    window.clearTimeout(attempt.sidecarWaitTimer);
    attempt.sidecarWaitTimer = null;
  }
  const listeners = attempt.listeners;
  if (!listeners) return;

  attempt.mainRecorder.removeEventListener('dataavailable', listeners.mainData);
  attempt.mainRecorder.removeEventListener('stop', listeners.mainStop);
  attempt.mainRecorder.removeEventListener('error', listeners.mainError);
  if (attempt.sidecarRecorder) {
    if (listeners.sidecarData)
      attempt.sidecarRecorder.removeEventListener('dataavailable', listeners.sidecarData);
    if (listeners.sidecarStop)
      attempt.sidecarRecorder.removeEventListener('stop', listeners.sidecarStop);
    if (listeners.sidecarError)
      attempt.sidecarRecorder.removeEventListener('error', listeners.sidecarError);
  }
  attempt.listeners = null;
};

export const startRecordingAttempt = (attempt: RecordingAttempt): boolean => {
  attempt.mainRecorder.start(1_000);
  let sidecarStarted = false;
  try {
    attempt.sidecarRecorder?.start(1_000);
    sidecarStarted = attempt.sidecarRecorder !== null;
  } catch {
    attempt.sidecarStopped = true;
    attempt.sidecarError = 'Audio sidecar capture could not start.';
  }
  return sidecarStarted;
};
