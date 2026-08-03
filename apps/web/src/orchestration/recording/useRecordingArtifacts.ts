import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { revokeArtifactUrl } from '../../features/recording/recordingHelpers';
import type {
  RecordingArtifact,
  RecordingAudioSidecar,
  RecordingProcessingOperation,
  RestorePersistedOriginalInput,
  VoiceProcessingState,
} from '../../features/recording/types';
import {
  createPersistedOriginalRecording,
  createProcessedRecordingArtifact,
  IDLE_AUDIO_SIDECAR,
} from './recordingArtifacts';

export const useRecordingArtifacts = () => {
  const [original, setOriginal] = useState<RecordingArtifact | null>(null);
  const [visual, setVisual] = useState<RecordingArtifact | null>(null);
  const [processed, setProcessed] = useState<RecordingArtifact | null>(null);
  const [sidecar, setSidecar] = useState<RecordingAudioSidecar>(IDLE_AUDIO_SIDECAR);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [processingState, setProcessingState] = useState<VoiceProcessingState>('idle');
  const [processingOperation, setProcessingOperation] =
    useState<RecordingProcessingOperation | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const originalRef = useRef<RecordingArtifact | null>(null);
  const visualRef = useRef<RecordingArtifact | null>(null);
  const processedRef = useRef<RecordingArtifact | null>(null);
  const repairedPlaybackArtifactIdRef = useRef<string | null>(null);

  const publishOriginal = useCallback(
    (artifact: RecordingArtifact, nextSidecar: RecordingAudioSidecar) => {
      revokeArtifactUrl(originalRef.current, 'replacement');
      revokeArtifactUrl(visualRef.current, 'replacement');
      revokeArtifactUrl(processedRef.current, 'replacement');
      originalRef.current = artifact;
      visualRef.current = null;
      processedRef.current = null;
      repairedPlaybackArtifactIdRef.current = null;
      setOriginal(artifact);
      setVisual(null);
      setProcessed(null);
      setSidecar(nextSidecar);
      setRecordingError(null);
      setProcessingState('idle');
      setProcessingOperation(null);
      setProcessingError(null);
      setDownloaded(false);
    },
    [],
  );

  const restorePersistedOriginal = useCallback(
    (input: RestorePersistedOriginalInput): RecordingArtifact => {
      const restored = createPersistedOriginalRecording(input);
      try {
        publishOriginal(restored.artifact, restored.sidecar);
      } catch (error) {
        URL.revokeObjectURL(restored.artifact.objectUrl);
        throw error;
      }
      return restored.artifact;
    },
    [publishOriginal],
  );

  const discardArtifacts = useCallback(() => {
    revokeArtifactUrl(originalRef.current, 'discard');
    revokeArtifactUrl(visualRef.current, 'discard');
    revokeArtifactUrl(processedRef.current, 'discard');
    originalRef.current = null;
    visualRef.current = null;
    processedRef.current = null;
    repairedPlaybackArtifactIdRef.current = null;
    setOriginal(null);
    setVisual(null);
    setProcessed(null);
    setSidecar(IDLE_AUDIO_SIDECAR);
    setRecordingError(null);
    setProcessingState('idle');
    setProcessingOperation(null);
    setProcessingError(null);
    setDownloaded(false);
  }, []);

  const completeVisualProcessing = useCallback(
    (
      blob: Blob,
      mimeType: string,
      label: string,
      explicitSource?: RecordingArtifact,
    ): RecordingArtifact => {
      const source = explicitSource ?? originalRef.current;
      if (!source) throw new Error('Original recording is unavailable.');
      const artifact = createProcessedRecordingArtifact(source, blob, mimeType, label);
      revokeArtifactUrl(visualRef.current, 'replacement');
      revokeArtifactUrl(processedRef.current, 'replacement');
      visualRef.current = artifact;
      processedRef.current = null;
      repairedPlaybackArtifactIdRef.current = null;
      setVisual(artifact);
      setProcessed(null);
      setProcessingState('ready');
      setProcessingOperation(null);
      setProcessingError(null);
      setDownloaded(false);
      return artifact;
    },
    [],
  );

  const completeProcessing = useCallback(
    (
      blob: Blob,
      mimeType: string,
      label: string,
      explicitSource?: RecordingArtifact,
      replaceExistingResult = false,
    ): RecordingArtifact => {
      const source = explicitSource ?? visualRef.current ?? originalRef.current;
      if (!source) throw new Error('Original recording is unavailable.');
      const artifact = createProcessedRecordingArtifact(source, blob, mimeType, label);
      if (replaceExistingResult) {
        revokeArtifactUrl(visualRef.current, 'replacement');
        visualRef.current = null;
        setVisual(null);
      }
      revokeArtifactUrl(processedRef.current, 'replacement');
      processedRef.current = artifact;
      repairedPlaybackArtifactIdRef.current = null;
      setProcessed(artifact);
      setProcessingState('ready');
      setProcessingOperation(null);
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
    setProcessingOperation(null);
    setProcessingError(null);
    setDownloaded(false);
  }, []);

  const clearVisualProcessing = useCallback(() => {
    revokeArtifactUrl(visualRef.current, 'replacement');
    revokeArtifactUrl(processedRef.current, 'replacement');
    visualRef.current = null;
    processedRef.current = null;
    setVisual(null);
    setProcessed(null);
    setProcessingState('idle');
    setProcessingOperation(null);
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

  const clearRecordingError = useCallback(() => setRecordingError(null), []);
  const reportRecordingError = useCallback((message: string) => setRecordingError(message), []);
  const markDownloaded = useCallback(() => setDownloaded(true), []);
  const beginProcessing = useCallback((operation?: RecordingProcessingOperation) => {
    setProcessingState('processing');
    setProcessingOperation(
      operation ?? {
        kind: 'voice-composition',
        title: 'Processing video…',
        detail: 'Playback is paused until a complete replacement is ready.',
      },
    );
    setProcessingError(null);
  }, []);
  const cancelProcessing = useCallback(() => {
    setProcessingState(processedRef.current ? 'ready' : 'idle');
    setProcessingOperation(null);
    setProcessingError(null);
  }, []);
  const failProcessing = useCallback((message: string) => {
    setProcessingState('error');
    setProcessingOperation(null);
    setProcessingError(message);
  }, []);

  const repairPresentedObjectUrl = useCallback((): boolean => {
    const current = processedRef.current ?? visualRef.current ?? originalRef.current;
    if (!current || repairedPlaybackArtifactIdRef.current === current.id) return false;

    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(current.media);
    } catch {
      return false;
    }
    if (!objectUrl) return false;

    const repaired = { ...current, objectUrl };
    repairedPlaybackArtifactIdRef.current = current.id;
    if (processedRef.current?.id === current.id) {
      processedRef.current = repaired;
      setProcessed(repaired);
    } else if (visualRef.current?.id === current.id) {
      visualRef.current = repaired;
      setVisual(repaired);
    } else {
      originalRef.current = repaired;
      setOriginal(repaired);
    }
    return true;
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
      revokeArtifactUrl(visualRef.current, 'unmount');
      revokeArtifactUrl(processedRef.current, 'unmount');
    },
    [],
  );

  return useMemo(
    () => ({
      original,
      visual,
      processed,
      sidecar,
      recordingError,
      processingState,
      processingOperation,
      processingError,
      downloaded,
      originalRef,
      publishOriginal,
      restorePersistedOriginal,
      discardArtifacts,
      markSidecarRecording,
      failSidecar,
      clearRecordingError,
      reportRecordingError,
      markDownloaded,
      beginProcessing,
      cancelProcessing,
      completeVisualProcessing,
      completeProcessing,
      failProcessing,
      repairPresentedObjectUrl,
      clearVisualProcessing,
      restoreOriginal,
    }),
    [
      original,
      visual,
      processed,
      sidecar,
      recordingError,
      processingState,
      processingOperation,
      processingError,
      downloaded,
      publishOriginal,
      restorePersistedOriginal,
      discardArtifacts,
      markSidecarRecording,
      failSidecar,
      clearRecordingError,
      reportRecordingError,
      markDownloaded,
      beginProcessing,
      cancelProcessing,
      completeVisualProcessing,
      completeProcessing,
      failProcessing,
      repairPresentedObjectUrl,
      clearVisualProcessing,
      restoreOriginal,
    ],
  );
};
