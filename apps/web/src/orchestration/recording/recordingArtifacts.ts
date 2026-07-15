import {
  completeAudioSidecar,
  createRecordingFilename,
  createSafeError,
  failAudioSidecar,
  startAudioSidecar,
} from '@studio/domain';
import { selectAudioMime, selectVideoMime } from '../../features/recording/recordingHelpers';
import type { RecordingArtifact, RecordingAudioSidecar } from '../../features/recording/types';
import type { RecordingAttempt } from './recordingAttempt';

export const IDLE_AUDIO_SIDECAR: RecordingAudioSidecar = {
  state: 'unavailable',
  blob: null,
  mimeType: null,
  error: null,
};

const firstChunkMimeType = (chunks: Blob[]): string | undefined =>
  chunks.map((chunk) => chunk.type.trim()).find(Boolean);

export const createOriginalRecordingArtifact = (
  attempt: RecordingAttempt,
): RecordingArtifact | null => {
  const mimeType =
    firstChunkMimeType(attempt.mainChunks) ||
    attempt.mainRecorder.mimeType ||
    selectVideoMime() ||
    'video/webm';
  const blob = new Blob(attempt.mainChunks, { type: mimeType });
  if (blob.size === 0) return null;

  return {
    id: `${attempt.mode}-${attempt.startedAt.toISOString()}-${attempt.startTime}`,
    media: blob,
    objectUrl: URL.createObjectURL(blob),
    mimeType,
    filename: createRecordingFilename(attempt.mode, attempt.startedAt, mimeType),
    sourceModeId: attempt.mode,
    startedAt: attempt.startedAt.toISOString(),
    durationMs: Math.max(0, performance.now() - attempt.startTime),
    sizeBytes: blob.size,
  };
};

export const createRecordingSidecar = (attempt: RecordingAttempt): RecordingAudioSidecar => {
  const attemptId = `${attempt.mode}:${attempt.startedAt.toISOString()}:${attempt.startTime}`;
  const capture = startAudioSidecar<Blob>(attemptId, attempt.audioTrack !== null);
  if (attempt.sidecarError) {
    const failed = failAudioSidecar(
      capture,
      attemptId,
      createSafeError('recording-failure', attempt.sidecarError),
    );
    return {
      ...IDLE_AUDIO_SIDECAR,
      state: 'error',
      error: failed.status === 'error' ? failed.error.message : attempt.sidecarError,
    };
  }
  if (attempt.sidecarRecorder && attempt.sidecarStopped) {
    const mimeType =
      firstChunkMimeType(attempt.sidecarChunks) ||
      attempt.sidecarRecorder.mimeType ||
      selectAudioMime() ||
      'audio/webm';
    const blob = new Blob(attempt.sidecarChunks, { type: mimeType });
    const completed = completeAudioSidecar(capture, attemptId, blob, blob.size);
    return completed.status === 'ready'
      ? { state: 'ready', blob: completed.audio, mimeType, error: null }
      : { ...IDLE_AUDIO_SIDECAR, state: 'error', error: 'The audio sidecar was empty.' };
  }
  return IDLE_AUDIO_SIDECAR;
};

export const createProcessedRecordingArtifact = (
  source: RecordingArtifact,
  blob: Blob,
  mimeType: string,
  label: string,
): RecordingArtifact => {
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const base = source.filename.replace(/\.(mp4|webm)$/i, '');
  return {
    ...source,
    id: `${source.id}-${label}`,
    media: blob,
    objectUrl: URL.createObjectURL(blob),
    mimeType,
    filename: `${base}-${label}.${extension}`,
    sizeBytes: blob.size,
  };
};
