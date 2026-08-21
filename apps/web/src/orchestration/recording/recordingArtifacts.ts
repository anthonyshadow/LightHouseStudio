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
  PresentedRecordingArtifact,
  RecordingArtifact,
  RecordingAudioSidecar,
  RemotePresentationInput,
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

const artifactTimestamp = (value: string | number | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isFinite(date.valueOf()) ? date : new Date();
  return safeDate
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z');
};

const artifactSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48) || 'video';

const createRuntimeArtifactIdentity = (
  label: string,
  createdAt = new Date().toISOString(),
): Readonly<{ id: string; name: string; createdAt: string; suffix: string }> => {
  const uuid = crypto.randomUUID();
  const suffix = uuid.slice(0, 8);
  return {
    id: `video-${uuid}`,
    name: `${label} · ${artifactTimestamp(createdAt)} · ${suffix}`,
    createdAt,
    suffix,
  };
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
    name: input.artifactMetadata.name ?? `Restored video · ${id.slice(-8)}`,
    createdAt: input.artifactMetadata.createdAt ?? startedAt,
    kind: input.artifactMetadata.kind ?? 'uploaded',
    parentArtifactId: input.artifactMetadata.parentArtifactId ?? null,
    characterName: input.artifactMetadata.characterName ?? null,
    characterVariantName: input.artifactMetadata.characterVariantName ?? null,
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

/**
 * Builds a URL-backed stage artifact from durable media. No bytes are held and no object URL is
 * created: the stage streams from the app-owned content URL, and the browser has nothing to
 * revoke when the artifact is replaced or discarded.
 */
export const createRemotePresentationRecording = (
  input: RemotePresentationInput,
): PresentedRecordingArtifact => {
  if (input.remoteMedia.kind !== 'remote-presentation' || !input.remoteMedia.contentUrl.trim()) {
    throw new Error('Remote presentation media is missing its content URL.');
  }
  if (!Number.isFinite(input.remoteMedia.sizeBytes) || input.remoteMedia.sizeBytes <= 0) {
    throw new Error('Remote presentation media size is invalid.');
  }
  const id = requireNonEmptyText(input.artifactMetadata.id, 'ID');
  const mimeType = requireNonEmptyText(
    input.artifactMetadata.mimeType || input.remoteMedia.mimeType,
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
  return Object.freeze({
    id,
    name: input.artifactMetadata.name ?? `Streamed video · ${id.slice(-8)}`,
    createdAt: input.artifactMetadata.createdAt ?? startedAt,
    kind: input.artifactMetadata.kind ?? 'uploaded',
    parentArtifactId: input.artifactMetadata.parentArtifactId ?? null,
    characterName: input.artifactMetadata.characterName ?? null,
    characterVariantName: input.artifactMetadata.characterVariantName ?? null,
    media: input.remoteMedia,
    objectUrl: input.remoteMedia.contentUrl,
    mimeType,
    filename,
    sourceModeId: input.artifactMetadata.sourceModeId,
    startedAt,
    durationMs,
    sizeBytes: input.remoteMedia.sizeBytes,
  });
};

export const createOriginalRecordingArtifact = (
  attempt: RecordingAttempt,
  blob: Blob,
  mimeType: string,
  mainStoppedAt = performance.now(),
): RecordingArtifact | null => {
  if (blob.size === 0) return null;

  const identity = createRuntimeArtifactIdentity(
    `${attempt.mode === 'local' ? 'Local' : attempt.mode === 'lucy-latest' ? 'Character' : 'Virtual Try-On'} take`,
    attempt.startedAt.toISOString(),
  );
  const recordingFilename = createRecordingFilename(attempt.mode, attempt.startedAt, mimeType);
  const uniqueFilename = recordingFilename.replace(/(\.[a-z0-9]+)$/iu, `-${identity.suffix}$1`);

  return {
    id: identity.id,
    name: identity.name,
    createdAt: identity.createdAt,
    kind: 'recorded',
    parentArtifactId: null,
    characterName: attempt.characterAttribution?.characterName ?? null,
    characterVariantName: attempt.characterAttribution?.characterVariantName ?? null,
    media: blob,
    objectUrl: createArtifactObjectUrl(blob),
    mimeType,
    filename: uniqueFilename,
    sourceModeId: attempt.mode,
    startedAt: attempt.startedAt.toISOString(),
    durationMs: Math.max(0, mainStoppedAt - attempt.startTime),
    sizeBytes: blob.size,
  };
};

export const createRawRecordingBlob = (attempt: RecordingAttempt): Blob | null => {
  const mimeType =
    firstChunkMimeType(attempt.mainChunks) ||
    attempt.mainRecorder.mimeType ||
    selectVideoMime() ||
    'video/webm';
  const blob = new Blob(attempt.mainChunks, { type: mimeType });
  return blob.size > 0 ? blob : null;
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
  source: PresentedRecordingArtifact,
  blob: Blob,
  mimeType: string,
  label: string,
  characterAttribution?: Readonly<{
    characterName: string;
    characterVariantName: string | null;
  }> | null,
): RecordingArtifact => {
  const extension = mimeType.includes('mp4')
    ? 'mp4'
    : mimeType.includes('quicktime')
      ? 'mov'
      : 'webm';
  const base = source.filename.replace(/\.(mp4|mov|webm)$/i, '');
  const createdAt = new Date().toISOString();
  const identity = createRuntimeArtifactIdentity(label, createdAt);
  return {
    ...source,
    id: identity.id,
    name: identity.name,
    createdAt,
    kind: label === 'voice' || label.startsWith('voice-') ? 'voice' : 'visual',
    parentArtifactId: source.id,
    ...(characterAttribution === undefined
      ? {}
      : {
          characterName: characterAttribution?.characterName ?? null,
          characterVariantName: characterAttribution?.characterVariantName ?? null,
        }),
    media: blob,
    objectUrl: createArtifactObjectUrl(blob),
    mimeType,
    filename: `${artifactSlug(base)}-${artifactSlug(label)}-${artifactTimestamp(createdAt)}-${identity.suffix}.${extension}`,
    sizeBytes: blob.size,
  };
};
