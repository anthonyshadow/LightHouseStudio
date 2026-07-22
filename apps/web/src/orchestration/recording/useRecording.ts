import {
  canStartRecording,
  completeRecordingLifecycle,
  createRecordingLifecycle,
  createSafeError,
  failRecordingLifecycle,
  prepareRecordingLifecycle,
  startRecordingLifecycle,
  stopRecordingLifecycle,
  type RecordingLifecycle as DomainRecordingLifecycle,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudioMode } from '../../features/media-session';
import type {
  AutomaticRecordingStopReason,
  RecordingArtifact,
  RecordingController,
  RecordingLifecycle,
  RecordingSource,
  RestorePersistedOriginalInput,
  TakeMetadata,
  UseRecordingOptions,
} from '../../features/recording/types';
import {
  createOriginalRecordingArtifact,
  createRecordingSidecar,
  IDLE_AUDIO_SIDECAR,
} from './recordingArtifacts';
import {
  attachRecordingAttemptListeners,
  cleanupRecordingAttempt,
  createRecordingAttempt,
  RECORDING_FINALIZATION_TIMEOUT_MS,
  SIDECAR_FINALIZATION_GRACE_MS,
  startRecordingAttempt,
  type RecordingAttempt,
} from './recordingAttempt';
import { useRecordingArtifacts } from './useRecordingArtifacts';
import { captureTakeMetadata, domainAudioSource, domainVideoSource } from './recordingMetadata';

export type {
  AutomaticRecordingStopEvent,
  AutomaticRecordingStopReason,
  PersistedRecordingArtifactMetadata,
  PersistedRecordingAudioSidecar,
  RecordingController,
  RestorePersistedOriginalInput,
  UseRecordingOptions,
} from '../../features/recording/types';

const stopRecorderBestEffort = (recorder: MediaRecorder | null): void => {
  if (!recorder || recorder.state === 'inactive') return;
  try {
    recorder.stop();
  } catch {
    // Resource owners still release the borrowed tracks after stop settles.
  }
};

export const useRecording = ({
  onAutomaticStop,
}: UseRecordingOptions = {}): RecordingController => {
  const [lifecycle, setLifecycle] = useState<RecordingLifecycle>('idle');
  const [activeSource, setActiveSource] = useState<RecordingSource | null>(null);
  const [metadata, setMetadata] = useState<TakeMetadata | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const artifacts = useRecordingArtifacts();

  const attemptRef = useRef<RecordingAttempt | null>(null);
  const pendingMetadataRef = useRef<TakeMetadata | null>(null);
  const domainLifecycleRef = useRef<DomainRecordingLifecycle<Blob>>(
    createRecordingLifecycle<Blob>(),
  );
  const stopPromiseRef = useRef<Promise<RecordingArtifact | null> | null>(null);
  const stopResolverRef = useRef<((artifact: RecordingArtifact | null) => void) | null>(null);
  const stopTimerRef = useRef<number | null>(null);
  const mainStoppedAtRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const automaticStopCallbackRef = useRef(onAutomaticStop);

  useEffect(() => {
    automaticStopCallbackRef.current = onAutomaticStop;
  }, [onAutomaticStop]);

  const markAutomaticStop = useCallback(
    (attempt: RecordingAttempt, reason: AutomaticRecordingStopReason) => {
      attempt.automaticStopReason ??= reason;
    },
    [],
  );

  const notifyAutomaticStop = useCallback((attempt: RecordingAttempt) => {
    const reason = attempt.automaticStopReason;
    if (!reason) return;
    attempt.automaticStopReason = null;
    automaticStopCallbackRef.current?.({ mode: attempt.mode, reason });
  }, []);

  const resolveStop = useCallback((artifact: RecordingArtifact | null) => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    stopResolverRef.current?.(artifact);
    stopResolverRef.current = null;
    stopPromiseRef.current = null;
  }, []);

  const failAttempt = useCallback(
    (
      attempt: RecordingAttempt,
      message: string,
      reportMessage = message,
      automaticReason?: AutomaticRecordingStopReason,
    ) => {
      cleanupRecordingAttempt(attempt);
      if (attemptRef.current === attempt) attemptRef.current = null;
      setActiveSource(null);
      pendingMetadataRef.current = null;
      mainStoppedAtRef.current = null;
      domainLifecycleRef.current = failRecordingLifecycle(
        createSafeError('recording-failure', message),
      );
      setLifecycle(domainLifecycleRef.current.status);
      artifacts.reportRecordingError(reportMessage);
      if (automaticReason) markAutomaticStop(attempt, automaticReason);
      notifyAutomaticStop(attempt);
      resolveStop(null);
    },
    [artifacts, markAutomaticStop, notifyAutomaticStop, resolveStop],
  );

  const finalizeAttempt = useCallback(
    (attempt: RecordingAttempt) => {
      if (attemptRef.current !== attempt || !attempt.mainStopped) return;
      cleanupRecordingAttempt(attempt);
      attemptRef.current = null;
      setActiveSource(null);

      if (disposedRef.current) {
        pendingMetadataRef.current = null;
        mainStoppedAtRef.current = null;
        resolveStop(null);
        return;
      }

      let artifact: RecordingArtifact | null;
      try {
        artifact = createOriginalRecordingArtifact(
          attempt,
          mainStoppedAtRef.current ?? performance.now(),
        );
      } catch {
        failAttempt(
          attempt,
          'The browser could not create a playable recording artifact.',
          'The browser could not create a playable recording artifact. The live source can now be released safely.',
        );
        return;
      }
      if (!artifact) {
        failAttempt(attempt, 'The browser produced an empty recording.');
        return;
      }

      let sidecar;
      try {
        sidecar = createRecordingSidecar(attempt);
      } catch {
        sidecar = {
          ...IDLE_AUDIO_SIDECAR,
          state: 'error' as const,
          error: 'The audio sidecar could not be finalized; the video take was preserved.',
        };
      }
      try {
        artifacts.publishOriginal(artifact, sidecar);
      } catch {
        try {
          URL.revokeObjectURL(artifact.objectUrl);
        } catch {
          // Best-effort cleanup for a browser URL implementation that has already failed.
        }
        failAttempt(
          attempt,
          'The browser could not publish the completed recording.',
          'The browser could not publish the completed recording. The live source can now be released safely.',
        );
        return;
      }
      setMetadata(pendingMetadataRef.current);
      pendingMetadataRef.current = null;
      mainStoppedAtRef.current = null;
      try {
        domainLifecycleRef.current = completeRecordingLifecycle(
          domainLifecycleRef.current,
          artifact,
        );
        setLifecycle(domainLifecycleRef.current.status);
      } catch {
        domainLifecycleRef.current = failRecordingLifecycle(
          createSafeError('recording-failure', 'The recording could not be finalized.'),
        );
        setLifecycle(domainLifecycleRef.current.status);
        artifacts.reportRecordingError(
          'The take was preserved, but the recording review state could not be finalized.',
        );
      }

      notifyAutomaticStop(attempt);
      resolveStop(artifact);
    },
    [artifacts, failAttempt, notifyAutomaticStop, resolveStop],
  );

  const tryFinalize = useCallback(() => {
    const attempt = attemptRef.current;
    if (!attempt || !attempt.mainStopped) return;
    if (attempt.sidecarStopped) {
      finalizeAttempt(attempt);
      return;
    }
    if (attempt.sidecarWaitTimer !== null) return;
    attempt.sidecarWaitTimer = window.setTimeout(() => {
      if (attemptRef.current !== attempt) return;
      attempt.sidecarWaitTimer = null;
      attempt.sidecarStopped = true;
      attempt.sidecarError = 'Audio sidecar did not finish; the video take was preserved.';
      finalizeAttempt(attempt);
    }, SIDECAR_FINALIZATION_GRACE_MS);
  }, [finalizeAttempt]);

  const stop = useCallback(async (): Promise<RecordingArtifact | null> => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    const attempt = attemptRef.current;
    if (!attempt) return artifacts.originalRef.current;

    const stopPromise = new Promise<RecordingArtifact | null>((resolve) => {
      stopResolverRef.current = resolve;
    });
    stopPromiseRef.current = stopPromise;
    attempt.stopRequested = true;
    try {
      if (domainLifecycleRef.current.status === 'recording') {
        domainLifecycleRef.current = stopRecordingLifecycle(domainLifecycleRef.current);
      } else if (domainLifecycleRef.current.status !== 'stopping') {
        throw new Error('Recording lifecycle is not active.');
      }
      setLifecycle(domainLifecycleRef.current.status);
    } catch {
      failAttempt(attempt, 'The active recording could not enter finalization.');
      return stopPromise;
    }
    stopTimerRef.current = window.setTimeout(() => {
      if (attemptRef.current !== attempt) return;
      if (attempt.mainStopped) {
        mainStoppedAtRef.current ??= performance.now();
        attempt.sidecarStopped = true;
        attempt.sidecarError = 'Audio sidecar did not finish; the video take was preserved.';
        finalizeAttempt(attempt);
        return;
      }
      failAttempt(
        attempt,
        'The browser did not finish the recording in time.',
        'The browser did not finish the recording in time. The live source can now be released safely.',
        'finalization-timeout',
      );
    }, RECORDING_FINALIZATION_TIMEOUT_MS);
    if (attempt.sidecarRecorder && attempt.sidecarRecorder.state !== 'inactive') {
      try {
        attempt.sidecarRecorder.stop();
      } catch {
        attempt.sidecarStopped = true;
        attempt.sidecarError = 'Audio sidecar capture failed while stopping.';
        artifacts.failSidecar(attempt.sidecarError);
      }
    } else {
      attempt.sidecarStopped = true;
    }
    if (attempt.mainRecorder.state !== 'inactive') {
      try {
        attempt.mainRecorder.stop();
      } catch {
        failAttempt(
          attempt,
          'The browser recorder could not be stopped safely.',
          'The browser recorder could not be stopped safely. The live source can now be released.',
        );
        return stopPromise;
      }
    } else {
      attempt.mainStopped = true;
      mainStoppedAtRef.current ??= performance.now();
    }
    tryFinalize();
    return stopPromise;
  }, [artifacts, failAttempt, finalizeAttempt, tryFinalize]);

  const start = useCallback(
    (source: RecordingSource, mode: StudioMode): Promise<void> => {
      if (artifacts.processingState === 'processing') return Promise.resolve();
      if (!('MediaRecorder' in window)) {
        domainLifecycleRef.current = failRecordingLifecycle(
          createSafeError('unsupported-browser', 'Recording is not supported in this browser.'),
        );
        setLifecycle(domainLifecycleRef.current.status);
        artifacts.reportRecordingError('Recording is not supported in this browser.');
        return Promise.resolve();
      }
      if (attemptRef.current) return Promise.resolve();
      const videoTrack = source.stream
        .getVideoTracks()
        .find((track) => track.readyState === 'live');
      const audioTrack = source.stream
        .getAudioTracks()
        .find((track) => track.readyState === 'live');
      const descriptor = videoTrack
        ? {
            modeId: mode,
            videoSource: domainVideoSource(source.videoSource),
            audioSource: domainAudioSource(source.audioSource),
            hasLiveVideo: true as const,
            hasLiveAudio: Boolean(audioTrack),
          }
        : null;
      const preparedLifecycle = prepareRecordingLifecycle(domainLifecycleRef.current, descriptor);
      if (!canStartRecording(preparedLifecycle.status, descriptor)) {
        domainLifecycleRef.current = failRecordingLifecycle(
          createSafeError('recording-failure', 'A live video source is required before recording.'),
        );
        setLifecycle(domainLifecycleRef.current.status);
        artifacts.reportRecordingError('A live video source is required before recording.');
        return Promise.resolve();
      }

      const setup = createRecordingAttempt(source, mode, () => {
        const activeAttempt = attemptRef.current;
        if (activeAttempt) markAutomaticStop(activeAttempt, 'source-ended');
        void stop();
      });
      if (setup.status === 'missing-video') {
        domainLifecycleRef.current = failRecordingLifecycle(
          createSafeError('recording-failure', 'A live video source is required before recording.'),
        );
        setLifecycle(domainLifecycleRef.current.status);
        artifacts.reportRecordingError('A live video source is required before recording.');
        return Promise.resolve();
      }
      if (setup.status === 'main-recorder-unavailable') {
        domainLifecycleRef.current = failRecordingLifecycle(
          createSafeError(
            'recording-failure',
            'The browser recorder could not use this media source or format.',
          ),
        );
        setLifecycle(domainLifecycleRef.current.status);
        artifacts.reportRecordingError(
          'The browser recorder could not use this media source or format.',
        );
        return Promise.resolve();
      }
      const { attempt } = setup;
      attemptRef.current = attempt;

      attachRecordingAttemptListeners(attempt, {
        onMainStopped: () => {
          mainStoppedAtRef.current ??= performance.now();
          if (!attempt.stopRequested) {
            markAutomaticStop(attempt, 'recorder-stopped');
            void stop();
            return;
          }
          tryFinalize();
        },
        onMainError: () => {
          artifacts.reportRecordingError('The browser recorder stopped unexpectedly.');
          markAutomaticStop(attempt, 'recorder-error');
          void stop();
        },
        onSidecarStopped: tryFinalize,
        onSidecarError: (message) => {
          artifacts.failSidecar(message);
          tryFinalize();
        },
      });

      attempt.videoTrack.addEventListener('ended', attempt.onVideoEnded, { once: true });
      attempt.audioTrack?.addEventListener('ended', attempt.onAudioEnded, { once: true });
      try {
        const sidecarStarted = startRecordingAttempt(attempt);
        pendingMetadataRef.current = captureTakeMetadata(
          source,
          mode,
          attempt.startedAt,
          attempt.videoTrack,
          attempt.audioTrack,
        );
        setMetadata(null);
        setElapsedSeconds(0);
        mainStoppedAtRef.current = null;
        artifacts.clearRecordingError();
        setActiveSource(source);
        artifacts.markSidecarRecording(sidecarStarted, attempt.sidecarError);
        domainLifecycleRef.current = startRecordingLifecycle(
          preparedLifecycle,
          descriptor,
          attempt.startedAt.toISOString(),
        );
        setLifecycle(domainLifecycleRef.current.status);
      } catch {
        pendingMetadataRef.current = null;
        cleanupRecordingAttempt(attempt);
        attemptRef.current = null;
        stopRecorderBestEffort(attempt.mainRecorder);
        stopRecorderBestEffort(attempt.sidecarRecorder);
        setActiveSource(null);
        domainLifecycleRef.current = failRecordingLifecycle(
          createSafeError(
            'recording-failure',
            'The browser recorder could not start with this media format.',
          ),
        );
        setLifecycle(domainLifecycleRef.current.status);
        artifacts.reportRecordingError(
          'The browser recorder could not start with this media format.',
        );
      }
      return Promise.resolve();
    },
    [artifacts, markAutomaticStop, stop, tryFinalize],
  );

  const discard = useCallback(() => {
    if (attemptRef.current) return;
    artifacts.discardArtifacts();
    pendingMetadataRef.current = null;
    mainStoppedAtRef.current = null;
    setMetadata(null);
    setActiveSource(null);
    domainLifecycleRef.current = createRecordingLifecycle<Blob>();
    setLifecycle(domainLifecycleRef.current.status);
  }, [artifacts]);

  const restorePersistedOriginal = useCallback(
    (input: RestorePersistedOriginalInput): RecordingArtifact => {
      const status = domainLifecycleRef.current.status;
      if (attemptRef.current || status === 'recording' || status === 'stopping') {
        throw new Error('A persisted take cannot be restored while recording is active.');
      }
      if (artifacts.processingState === 'processing') {
        throw new Error('A persisted take cannot be restored while voice processing is active.');
      }

      const artifact = artifacts.restorePersistedOriginal(input);
      pendingMetadataRef.current = null;
      mainStoppedAtRef.current = null;
      setMetadata(input.takeMetadata ? Object.freeze({ ...input.takeMetadata }) : null);
      setActiveSource(null);
      setElapsedSeconds(Math.max(0, Math.floor(artifact.durationMs / 1_000)));
      domainLifecycleRef.current = { status: 'recorded', artifact };
      setLifecycle(domainLifecycleRef.current.status);
      return artifact;
    },
    [artifacts],
  );

  useEffect(() => {
    if (lifecycle !== 'recording') return;
    const started = attemptRef.current?.startTime ?? performance.now();
    const update = () =>
      setElapsedSeconds(Math.max(0, Math.floor((performance.now() - started) / 1000)));
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [lifecycle]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      const attempt = attemptRef.current;
      if (attempt) cleanupRecordingAttempt(attempt);
      attemptRef.current = null;
      pendingMetadataRef.current = null;
      mainStoppedAtRef.current = null;
      stopRecorderBestEffort(attempt?.mainRecorder ?? null);
      stopRecorderBestEffort(attempt?.sidecarRecorder ?? null);
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      resolveStop(null);
    };
  }, [resolveStop]);

  return useMemo(
    () => ({
      lifecycle,
      activeSource,
      metadata,
      original: artifacts.original,
      processed: artifacts.processed,
      presented: artifacts.processed ?? artifacts.original,
      sidecar: artifacts.sidecar,
      recordingError: artifacts.recordingError,
      processingState: artifacts.processingState,
      processingError: artifacts.processingError,
      elapsedSeconds,
      downloaded: artifacts.downloaded,
      start,
      stop,
      restorePersistedOriginal,
      discard,
      markDownloaded: artifacts.markDownloaded,
      beginProcessing: artifacts.beginProcessing,
      cancelProcessing: artifacts.cancelProcessing,
      completeProcessing: artifacts.completeProcessing,
      failProcessing: artifacts.failProcessing,
      restoreOriginal: artifacts.restoreOriginal,
    }),
    [
      lifecycle,
      activeSource,
      metadata,
      artifacts,
      elapsedSeconds,
      start,
      stop,
      restorePersistedOriginal,
      discard,
    ],
  );
};
