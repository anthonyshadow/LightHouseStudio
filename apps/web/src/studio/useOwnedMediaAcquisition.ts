import { formatFileSize, GENERAL_VIDEO_SIZE_LIMIT_BYTES } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError, apiFetch } from '../adapters/api-client/apiClient';
import { readBoundedBlob } from '../adapters/api-client/readBoundedBlob';
import type { StageNotice } from '../features/live-stage/stageNotices';
import type { RecordingController } from '../features/recording/types';

export type OwnedMediaAcquisitionState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{
      status: 'fetching';
      artifactId: string;
      receivedBytes: number;
      totalBytes: number;
    }>
  | Readonly<{ status: 'error'; artifactId: string; message: string }>;

const IDLE: OwnedMediaAcquisitionState = { status: 'idle' };

const safeAcquisitionMessage = (error: unknown): string =>
  error instanceof ApiClientError
    ? error.message
    : 'The original video could not be fetched. Playback still streams; try again to edit.';

interface UseOwnedMediaAcquisitionOptions {
  readonly recording: RecordingController;
}

/**
 * Fetches the complete bytes for a URL-backed stage presentation, on demand.
 *
 * The stage keeps streaming while this runs: the fetch is deliberately not a recording
 * "processing" operation, so it never blocks playback, never counts as unsafe work for the exit
 * guard, and leaving the workspace mid-fetch simply aborts it. On success the owned bytes are
 * republished as the original artifact — through the same bounded reader and artifact machinery
 * every other owned source uses — and the superseded URL-backed presentation is released by the
 * ordinary commit-then-revoke path.
 */
export const useOwnedMediaAcquisition = ({ recording }: UseOwnedMediaAcquisitionOptions) => {
  const [state, setState] = useState<OwnedMediaAcquisitionState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<Readonly<{ artifactId: string; promise: Promise<boolean> }> | null>(
    null,
  );
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  const cancel = useCallback(() => {
    controllerRef.current?.abort('owned-media-acquisition-cancelled');
    controllerRef.current = null;
    inFlightRef.current = null;
    setState(IDLE);
  }, []);

  const dismissError = useCallback(() => {
    setState((current) => (current.status === 'error' ? IDLE : current));
  }, []);

  /**
   * Resolves true once the presented original is owned bytes — immediately when it already is.
   * Resolves false when cancelled, failed, or when there is nothing to acquire.
   */
  const acquire = useCallback((): Promise<boolean> => {
    const artifact = recordingRef.current.original;
    if (!artifact) return Promise.resolve(false);
    if (artifact.media instanceof Blob) return Promise.resolve(true);
    if (inFlightRef.current?.artifactId === artifact.id) return inFlightRef.current.promise;
    const remoteMedia = artifact.media;

    controllerRef.current?.abort('owned-media-acquisition-replaced');
    const controller = new AbortController();
    controllerRef.current = controller;
    let announcedPercent = -1;
    setState({
      status: 'fetching',
      artifactId: artifact.id,
      receivedBytes: 0,
      totalBytes: remoteMedia.sizeBytes,
    });

    const run = async (): Promise<boolean> => {
      try {
        const response = await apiFetch(remoteMedia.contentUrl, {
          cache: 'no-store',
          headers: { Accept: remoteMedia.mimeType },
          signal: controller.signal,
        });
        const blob = await readBoundedBlob(response, {
          maximumBytes: GENERAL_VIDEO_SIZE_LIMIT_BYTES,
          signal: controller.signal,
          acceptsContentType: (contentType) => contentType === remoteMedia.mimeType,
          createError: (failure) =>
            new ApiClientError(
              failure === 'too-large'
                ? 'The Project source exceeded the app-owned 300 MB safety limit.'
                : 'The Project source response was empty or invalid.',
              502,
              failure === 'too-large' ? 'result_too_large' : 'result_invalid',
            ),
          abortMessage: 'Fetching the original video was cancelled.',
          onProgress: (receivedBytes, totalBytes) => {
            const declaredTotal = totalBytes ?? remoteMedia.sizeBytes;
            // Throttled to whole-percent steps so a large fetch does not thrash renders.
            const percent = Math.floor((receivedBytes / Math.max(1, declaredTotal)) * 100);
            if (percent === announcedPercent) return;
            announcedPercent = percent;
            setState({
              status: 'fetching',
              artifactId: artifact.id,
              receivedBytes,
              totalBytes: declaredTotal,
            });
          },
        });
        controller.signal.throwIfAborted();
        recordingRef.current.restorePersistedOriginal({
          blob,
          artifactMetadata: {
            id: artifact.id,
            ...(artifact.name !== undefined ? { name: artifact.name } : {}),
            ...(artifact.createdAt !== undefined ? { createdAt: artifact.createdAt } : {}),
            ...(artifact.kind !== undefined ? { kind: artifact.kind } : {}),
            parentArtifactId: artifact.parentArtifactId ?? null,
            characterName: artifact.characterName ?? null,
            characterVariantName: artifact.characterVariantName ?? null,
            mimeType: artifact.mimeType,
            filename: artifact.filename,
            sourceModeId: artifact.sourceModeId,
            startedAt: artifact.startedAt,
            durationMs: artifact.durationMs,
          },
          takeMetadata: recordingRef.current.metadata,
        });
        setState(IDLE);
        return true;
      } catch (error) {
        if (controller.signal.aborted) return false;
        setState({
          status: 'error',
          artifactId: artifact.id,
          message: safeAcquisitionMessage(error),
        });
        return false;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        if (inFlightRef.current?.artifactId === artifact.id) inFlightRef.current = null;
      }
    };
    const promise = run();
    inFlightRef.current = { artifactId: artifact.id, promise };
    return promise;
  }, []);

  // The acquisition belongs to one presented artifact. When that artifact is replaced, discarded,
  // or already owned, an in-flight fetch is stale — abort it and drop stale error notices.
  const presentedArtifactId = recording.original?.id ?? null;
  const presentedIsRemote =
    recording.original !== null && !(recording.original.media instanceof Blob);
  useEffect(() => {
    const active = inFlightRef.current;
    if (active && (presentedArtifactId !== active.artifactId || !presentedIsRemote)) {
      controllerRef.current?.abort('owned-media-acquisition-stale');
      controllerRef.current = null;
      inFlightRef.current = null;
      setState(IDLE);
      return;
    }
    setState((current) =>
      current.status === 'error' && current.artifactId !== presentedArtifactId ? IDLE : current,
    );
  }, [presentedArtifactId, presentedIsRemote]);

  useEffect(
    () => () => {
      controllerRef.current?.abort('owned-media-acquisition-unmounted');
      controllerRef.current = null;
      inFlightRef.current = null;
    },
    [],
  );

  return useMemo(
    () => ({ state, acquire, cancel, dismissError }) as const,
    [acquire, cancel, dismissError, state],
  );
};

export const deriveOwnedMediaAcquisitionNotices = (
  state: OwnedMediaAcquisitionState,
  handlers: Readonly<{
    onCancel: () => void;
    onRetry: () => void;
    onDismissError: () => void;
  }>,
): readonly StageNotice[] => {
  if (state.status === 'fetching') {
    return [
      {
        id: 'owned-media-acquisition',
        severity: 'info',
        title: 'Preparing the full video',
        message:
          'Fetching the original video for editing. Playback keeps streaming while this downloads.',
        action: { label: 'Cancel', onAction: handlers.onCancel },
        progress: {
          value: state.totalBytes > 0 ? state.receivedBytes / state.totalBytes : null,
          label: `${formatFileSize(state.receivedBytes)} of ${formatFileSize(state.totalBytes)}`,
        },
      },
    ];
  }
  if (state.status === 'error') {
    return [
      {
        id: 'owned-media-acquisition-error',
        severity: 'error',
        title: 'Full video not fetched',
        message: state.message,
        action: { label: 'Retry', onAction: handlers.onRetry },
        onDismiss: handlers.onDismissError,
      },
    ];
  }
  return [];
};
