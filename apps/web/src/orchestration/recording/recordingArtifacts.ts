import {
  completeAudioSidecar,
  createRecordingFilename,
  createSafeError,
  failAudioSidecar,
  isSessionModeId,
  startAudioSidecar,
} from '@studio/domain';
import { selectAudioMime, selectVideoMime } from '../../features/recording/recordingHelpers';
import type {
  RecordingArtifact,
  RecordingAudioSidecar,
  RestorePersistedOriginalInput,
} from '../../features/recording/types';
import type { RecordingAttempt } from './recordingAttempt';

export const IDLE_AUDIO_SIDECAR: RecordingAudioSidecar = {
  state: 'unavailable',
  blob: null,
  mimeType: null,
  error: null,
};

const firstChunkMimeType = (chunks: Blob[]): string | undefined =>
  chunks.map((chunk) => chunk.type.trim()).find(Boolean);

const createArtifactObjectUrl = (blob: Blob): string => {
  const objectUrl = URL.createObjectURL(blob);
  if (!objectUrl) throw new Error('The browser did not create a recording URL.');
  return objectUrl;
};

const requireNonEmptyText = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Persisted recording ${field} is required.`);
  return normalized;
};

/**
 * Rebuilds runtime-owned recording objects from IndexedDB-safe data. Object
 * URLs are always created here so callers never persist or transfer their
 * ownership across application sessions.
 */
export const createPersistedOriginalRecording = (
  input: RestorePersistedOriginalInput,
): Readonly<{ artifact: RecordingArtifact; sidecar: RecordingAudioSidecar }> => {
  if (!(input.blob instanceof Blob) || input.blob.size <= 0) {
    throw new Error('Persisted recording media is empty or invalid.');
  }
  const id = requireNonEmptyText(input.artifactMetadata.id, 'ID');
  const mimeType = requireNonEmptyText(
    input.artifactMetadata.mimeType || input.blob.type,
    'MIME type',
  );
  const filename = requireNonEmptyText(input.artifactMetadata.filename, 'filename');
  if (!isSessionModeId(input.artifactMetadata.sourceModeId)) {
    throw new Error('Persisted recording source mode is invalid.');
  }
  const startedAt = input.artifactMetadata.startedAt;
  if (!Number.isFinite(new Date(startedAt).valueOf())) {
    throw new Error('Persisted recording start time is invalid.');
  }
  const durationMs = input.artifactMetadata.durationMs;
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error('Persisted recording duration is invalid.');
  }

  let sidecar: RecordingAudioSidecar = IDLE_AUDIO_SIDECAR;
  if (input.audioSidecar) {
    if (!(input.audioSidecar.blob instanceof Blob) || input.audioSidecar.blob.size <= 0) {
      throw new Error('Persisted recording audio is empty or invalid.');
    }
    sidecar = {
      state: 'ready',
      blob: input.audioSidecar.blob,
      mimeType: requireNonEmptyText(
        input.audioSidecar.mimeType || input.audioSidecar.blob.type,
        'audio MIME type',
      ),
      error: null,
    };
  }

  const artifact = Object.freeze({
    id,
    media: input.blob,
    objectUrl: createArtifactObjectUrl(input.blob),
    mimeType,
    filename,
    sourceModeId: input.artifactMetadata.sourceModeId,
    startedAt,
    durationMs,
    sizeBytes: input.blob.size,
  });
  return Object.freeze({ artifact, sidecar });
};

export const createOriginalRecordingArtifact = (
  attempt: RecordingAttempt,
  mainStoppedAt = performance.now(),
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
    objectUrl: createArtifactObjectUrl(blob),
    mimeType,
    filename: createRecordingFilename(attempt.mode, attempt.startedAt, mimeType),
    sourceModeId: attempt.mode,
    startedAt: attempt.startedAt.toISOString(),
    durationMs: Math.max(0, mainStoppedAt - attempt.startTime),
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
    let blob: Blob;
    try {
      blob = new Blob(attempt.sidecarChunks, { type: mimeType });
    } catch {
      return {
        ...IDLE_AUDIO_SIDECAR,
        state: 'error',
        error: 'The audio sidecar could not be finalized; the video take was preserved.',
      };
    }
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
    objectUrl: createArtifactObjectUrl(blob),
    mimeType,
    filename: `${base}-${label}.${extension}`,
    sizeBytes: blob.size,
  };
};
