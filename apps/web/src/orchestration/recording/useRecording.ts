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
  UseRecordingOptions,
} from '../../features/recording/types';
import { createOriginalRecordingArtifact, createRecordingSidecar } from './recordingArtifacts';
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

export type {
  AutomaticRecordingStopEvent,
  AutomaticRecordingStopReason,
  RecordingController,
  UseRecordingOptions,
} from '../../features/recording/types';

export const useRecording = ({
  onAutomaticStop,
}: UseRecordingOptions = {}): RecordingController => {
  const [lifecycle, setLifecycle] = useState<RecordingLifecycle>('idle');
  const [activeSource, setActiveSource] = useState<RecordingSource | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const artifacts = useRecordingArtifacts();

  const attemptRef = useRef<RecordingAttempt | null>(null);
  const domainLifecycleRef = useRef<DomainRecordingLifecycle<Blob>>(
    createRecordingLifecycle<Blob>(),
  );
  const stopPromiseRef = useRef<Promise<RecordingArtifact | null> | null>(null);
  const stopResolverRef = useRef<((artifact: RecordingArtifact | null) => void) | null>(null);
  const stopTimerRef = useRef<number | null>(null);
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

  const finalizeAttempt = useCallback(
    (attempt: RecordingAttempt) => {
      if (attemptRef.current !== attempt || !attempt.mainStopped) return;
      cleanupRecordingAttempt(attempt);
      attemptRef.current = null;
      setActiveSource(null);

      if (disposedRef.current) {
        resolveStop(null);
        return;
      }

      const artifact = createOriginalRecordingArtifact(attempt);
      if (!artifact) {
        domainLifecycleRef.current = failRecordingLifecycle(
          createSafeError('recording-failure', 'The browser produced an empty recording.'),
        );
        setLifecycle(domainLifecycleRef.current.status);
        artifacts.reportRecordingError('The browser produced an empty recording.');
        notifyAutomaticStop(attempt);
        resolveStop(null);
        return;
      }

      artifacts.publishOriginal(artifact, createRecordingSidecar(attempt));
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
      }

      notifyAutomaticStop(attempt);
      resolveStop(artifact);
    },
    [artifacts, notifyAutomaticStop, resolveStop],
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

    attempt.stopRequested = true;
    domainLifecycleRef.current = stopRecordingLifecycle(domainLifecycleRef.current);
    setLifecycle(domainLifecycleRef.current.status);
    const stopPromise = new Promise<RecordingArtifact | null>((resolve) => {
      stopResolverRef.current = resolve;
    });
    stopPromiseRef.current = stopPromise;
    stopTimerRef.current = window.setTimeout(() => {
      if (attemptRef.current !== attempt) return;
      if (attempt.mainStopped) {
        attempt.sidecarStopped = true;
        attempt.sidecarError = 'Audio sidecar did not finish; the video take was preserved.';
        finalizeAttempt(attempt);
        return;
      }
      cleanupRecordingAttempt(attempt);
      attemptRef.current = null;
      setActiveSource(null);
      domainLifecycleRef.current = failRecordingLifecycle(
        createSafeError('recording-failure', 'The browser did not finish the recording in time.'),
      );
      setLifecycle(domainLifecycleRef.current.status);
      artifacts.reportRecordingError(
        'The browser did not finish the recording in time. The live source can now be released safely.',
      );
      markAutomaticStop(attempt, 'finalization-timeout');
      notifyAutomaticStop(attempt);
      resolveStop(null);
    }, RECORDING_FINALIZATION_TIMEOUT_MS);
    if (attempt.sidecarRecorder?.state !== 'inactive') attempt.sidecarRecorder?.stop();
    else attempt.sidecarStopped = true;
    if (attempt.mainRecorder.state !== 'inactive') attempt.mainRecorder.stop();
    else attempt.mainStopped = true;
    tryFinalize();
    return stopPromise;
  }, [
    artifacts,
    finalizeAttempt,
    markAutomaticStop,
    notifyAutomaticStop,
    resolveStop,
    tryFinalize,
  ]);

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
            videoSource:
              source.videoSource === 'transformed'
                ? ('model-output' as const)
                : ('local-camera' as const),
            audioSource:
              source.audioSource === 'provider'
                ? ('model-output' as const)
                : source.audioSource === 'microphone'
                  ? ('local-microphone' as const)
                  : ('none' as const),
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
        setElapsedSeconds(0);
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
        cleanupRecordingAttempt(attempt);
        attemptRef.current = null;
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
    setActiveSource(null);
    domainLifecycleRef.current = createRecordingLifecycle<Blob>();
    setLifecycle(domainLifecycleRef.current.status);
  }, [artifacts]);

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
      if (attempt?.mainRecorder.state !== 'inactive') attempt?.mainRecorder.stop();
      if (attempt?.sidecarRecorder?.state !== 'inactive') attempt?.sidecarRecorder?.stop();
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      resolveStop(null);
    };
  }, [resolveStop]);

  return useMemo(
    () => ({
      lifecycle,
      activeSource,
      original: artifacts.original,
      processed: artifacts.processed,
      presented: artifacts.processed ?? artifacts.original,
      sidecar: artifacts.sidecar,
      processingState: artifacts.processingState,
      processingError: artifacts.processingError,
      elapsedSeconds,
      downloaded: artifacts.downloaded,
      start,
      stop,
      discard,
      markDownloaded: artifacts.markDownloaded,
      beginProcessing: artifacts.beginProcessing,
      cancelProcessing: artifacts.cancelProcessing,
      completeProcessing: artifacts.completeProcessing,
      failProcessing: artifacts.failProcessing,
      restoreOriginal: artifacts.restoreOriginal,
    }),
    [lifecycle, activeSource, artifacts, elapsedSeconds, start, stop, discard],
  );
};
