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
  TakeMetadata,
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

type TrackMeasurements = Pick<TakeMetadata, 'width' | 'height' | 'frameRate'>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const positiveNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const fixedCapabilityValue = (value: unknown): number | undefined => {
  const direct = positiveNumber(value);
  if (direct !== undefined) return direct;
  const range = asRecord(value);
  if (!range) return undefined;
  const minimum = positiveNumber(range.min);
  const maximum = positiveNumber(range.max);
  return minimum !== undefined && minimum === maximum ? minimum : undefined;
};

const safeTrackRecord = (
  reader: (() => MediaTrackSettings | MediaTrackCapabilities) | undefined,
): Record<string, unknown> | null => {
  if (!reader) return null;
  try {
    return asRecord(reader());
  } catch {
    return null;
  }
};

const captureTrackMeasurements = (track: MediaStreamTrack): TrackMeasurements => {
  const settings = safeTrackRecord(
    typeof track.getSettings === 'function' ? () => track.getSettings() : undefined,
  );
  const capabilities = safeTrackRecord(
    typeof track.getCapabilities === 'function' ? () => track.getCapabilities() : undefined,
  );
  const measurement = (key: keyof TrackMeasurements): number | undefined =>
    positiveNumber(settings?.[key]) ?? fixedCapabilityValue(capabilities?.[key]);
  const width = measurement('width');
  const height = measurement('height');
  const frameRate = measurement('frameRate');
  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(frameRate !== undefined ? { frameRate } : {}),
  };
};

const safeTrackLabel = (track: MediaStreamTrack | null): string | undefined => {
  if (!track) return undefined;
  try {
    const label = track.label.trim();
    return label || undefined;
  } catch {
    return undefined;
  }
};

const domainVideoSource = (
  source: RecordingSource['videoSource'],
): 'local-camera' | 'model-output' => (source === 'transformed' ? 'model-output' : 'local-camera');

const domainAudioSource = (
  source: RecordingSource['audioSource'],
): 'local-microphone' | 'model-output' | 'none' => {
  switch (source) {
    case 'provider':
      return 'model-output';
    case 'microphone':
      return 'local-microphone';
    case 'none':
      return 'none';
  }
};

const captureTakeMetadata = (
  source: RecordingSource,
  mode: StudioMode,
  startedAt: Date,
  videoTrack: MediaStreamTrack,
  audioTrack: MediaStreamTrack | null,
): TakeMetadata => {
  const videoSourceLabel = safeTrackLabel(videoTrack);
  const audioSourceLabel = safeTrackLabel(audioTrack);
  return Object.freeze({
    mode,
    startedAt: startedAt.toISOString(),
    videoSource: source.videoSource,
    audioSource: audioTrack ? source.audioSource : 'none',
    ...captureTrackMeasurements(videoTrack),
    ...(videoSourceLabel ? { videoSourceLabel } : {}),
    ...(audioSourceLabel ? { audioSourceLabel } : {}),
  });
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
        pendingMetadataRef.current = null;
        resolveStop(null);
        return;
      }

      const artifact = createOriginalRecordingArtifact(attempt);
      if (!artifact) {
        pendingMetadataRef.current = null;
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
      setMetadata(pendingMetadataRef.current);
      pendingMetadataRef.current = null;
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
      pendingMetadataRef.current = null;
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
    setMetadata(null);
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
      pendingMetadataRef.current = null;
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
      metadata,
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
    [lifecycle, activeSource, metadata, artifacts, elapsedSeconds, start, stop, discard],
  );
};
