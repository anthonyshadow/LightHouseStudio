import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { revokeArtifactUrl } from '../../features/recording/recordingHelpers';
import type {
  RecordingArtifact,
  RecordingAudioSidecar,
  VoiceProcessingState,
} from '../../features/recording/types';
import { createProcessedRecordingArtifact, IDLE_AUDIO_SIDECAR } from './recordingArtifacts';

export const useRecordingArtifacts = () => {
  const [original, setOriginal] = useState<RecordingArtifact | null>(null);
  const [processed, setProcessed] = useState<RecordingArtifact | null>(null);
  const [sidecar, setSidecar] = useState<RecordingAudioSidecar>(IDLE_AUDIO_SIDECAR);
  const [processingState, setProcessingState] = useState<VoiceProcessingState>('idle');
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const originalRef = useRef<RecordingArtifact | null>(null);
  const processedRef = useRef<RecordingArtifact | null>(null);

  const publishOriginal = useCallback(
    (artifact: RecordingArtifact, nextSidecar: RecordingAudioSidecar) => {
      revokeArtifactUrl(originalRef.current, 'replacement');
      revokeArtifactUrl(processedRef.current, 'replacement');
      originalRef.current = artifact;
      processedRef.current = null;
      setOriginal(artifact);
      setProcessed(null);
      setSidecar(nextSidecar);
      setProcessingState('idle');
      setProcessingError(null);
      setDownloaded(false);
    },
    [],
  );

  const discardArtifacts = useCallback(() => {
    revokeArtifactUrl(originalRef.current, 'discard');
    revokeArtifactUrl(processedRef.current, 'discard');
    originalRef.current = null;
    processedRef.current = null;
    setOriginal(null);
    setProcessed(null);
    setSidecar(IDLE_AUDIO_SIDECAR);
    setProcessingState('idle');
    setProcessingError(null);
    setDownloaded(false);
  }, []);

  const completeProcessing = useCallback(
    (blob: Blob, mimeType: string, label: string): RecordingArtifact => {
      const source = originalRef.current;
      if (!source) throw new Error('Original recording is unavailable.');
      revokeArtifactUrl(processedRef.current, 'replacement');
      const artifact = createProcessedRecordingArtifact(source, blob, mimeType, label);
      processedRef.current = artifact;
      setProcessed(artifact);
      setProcessingState('ready');
      setProcessingError(null);
      setDownloaded(false);
      return artifact;
    },
    [],
  );

  const restoreOriginal = useCallback(() => {
    revokeArtifactUrl(processedRef.current, 'replacement');
    processedRef.current = null;
    setProcessed(null);
    setProcessingState('idle');
    setProcessingError(null);
    setDownloaded(false);
  }, []);

  const markSidecarRecording = useCallback((started: boolean, error: string | null) => {
    setSidecar(
      started
        ? { ...IDLE_AUDIO_SIDECAR, state: 'recording' }
        : error
          ? { ...IDLE_AUDIO_SIDECAR, state: 'error', error }
          : IDLE_AUDIO_SIDECAR,
    );
  }, []);

  const failSidecar = useCallback((message: string) => {
    setSidecar({ ...IDLE_AUDIO_SIDECAR, state: 'error', error: message });
  }, []);

  const clearRecordingError = useCallback(() => setProcessingError(null), []);
  const reportRecordingError = useCallback((message: string) => setProcessingError(message), []);
  const markDownloaded = useCallback(() => setDownloaded(true), []);
  const beginProcessing = useCallback(() => {
    setProcessingState('processing');
    setProcessingError(null);
  }, []);
  const cancelProcessing = useCallback(() => {
    setProcessingState(processedRef.current ? 'ready' : 'idle');
    setProcessingError(null);
  }, []);
  const failProcessing = useCallback((message: string) => {
    setProcessingState('error');
    setProcessingError(message);
  }, []);

  useEffect(() => {
    const protectTake = (event: BeforeUnloadEvent) => {
      if (!originalRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectTake);
    return () => window.removeEventListener('beforeunload', protectTake);
  }, []);

  useEffect(
    () => () => {
      revokeArtifactUrl(originalRef.current, 'unmount');
      revokeArtifactUrl(processedRef.current, 'unmount');
    },
    [],
  );

  return useMemo(
    () => ({
      original,
      processed,
      sidecar,
      processingState,
      processingError,
      downloaded,
      originalRef,
      publishOriginal,
      discardArtifacts,
      markSidecarRecording,
      failSidecar,
      clearRecordingError,
      reportRecordingError,
      markDownloaded,
      beginProcessing,
      cancelProcessing,
      completeProcessing,
      failProcessing,
      restoreOriginal,
    }),
    [
      original,
      processed,
      sidecar,
      processingState,
      processingError,
      downloaded,
      publishOriginal,
      discardArtifacts,
      markSidecarRecording,
      failSidecar,
      clearRecordingError,
      reportRecordingError,
      markDownloaded,
      beginProcessing,
      cancelProcessing,
      completeProcessing,
      failProcessing,
      restoreOriginal,
    ],
  );
};
