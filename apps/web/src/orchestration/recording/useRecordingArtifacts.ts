import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { revokeArtifactUrl } from '../../features/recording/recordingHelpers';
import type {
  RecordingArtifact,
  RecordingAudioSidecar,
  RecordingProcessingOperation,
  RestorePersistedOriginalInput,
  VideoCharacterAttribution,
} from '../../features/recording/types';
import {
  createPersistedOriginalRecording,
  createProcessedRecordingArtifact,
  IDLE_AUDIO_SIDECAR,
} from './recordingArtifacts';
import {
  initialRecordingArtifactState,
  recordingArtifactReducer,
  type RecordingArtifactAction,
  type RecordingArtifactState,
} from './recordingArtifactState';

const artifactSlots = ['original', 'visual', 'processed'] as const;

const removedArtifacts = (
  current: RecordingArtifactState,
  next: RecordingArtifactState,
): RecordingArtifact[] => {
  const retainedUrls = new Set(
    artifactSlots
      .map((slot) => next[slot]?.objectUrl)
      .filter((url): url is string => url !== undefined),
  );
  return artifactSlots
    .map((slot) => current[slot])
    .filter(
      (artifact): artifact is RecordingArtifact =>
        artifact !== null && !retainedUrls.has(artifact.objectUrl),
    );
};

export const useRecordingArtifacts = () => {
  const [state, dispatch] = useReducer(recordingArtifactReducer, initialRecordingArtifactState);
  const stateRef = useRef(state);
  const originalRef = useRef<RecordingArtifact | null>(null);
  const visualRef = useRef<RecordingArtifact | null>(null);
  const processedRef = useRef<RecordingArtifact | null>(null);
  const pendingRevocationsRef = useRef<RecordingArtifact[]>([]);
  const repairedPlaybackArtifactIdRef = useRef<string | null>(null);

  const transition = useCallback((action: RecordingArtifactAction) => {
    const next = recordingArtifactReducer(stateRef.current, action);
    pendingRevocationsRef.current.push(...removedArtifacts(stateRef.current, next));
    stateRef.current = next;
    originalRef.current = next.original;
    visualRef.current = next.visual;
    processedRef.current = next.processed;
    dispatch(action);
  }, []);

  useEffect(() => {
    const retainedUrls = new Set(
      artifactSlots
        .map((slot) => state[slot]?.objectUrl)
        .filter((url): url is string => url !== undefined),
    );
    const pending = pendingRevocationsRef.current;
    pendingRevocationsRef.current = [];
    const revoked = new Set<string>();
    for (const artifact of pending) {
      if (retainedUrls.has(artifact.objectUrl) || revoked.has(artifact.objectUrl)) continue;
      revoked.add(artifact.objectUrl);
      revokeArtifactUrl(artifact, 'replacement');
    }
  }, [state]);

  const publishOriginal = useCallback(
    (artifact: RecordingArtifact, sidecar: RecordingAudioSidecar) => {
      repairedPlaybackArtifactIdRef.current = null;
      transition({ type: 'publish-original', artifact, sidecar });
    },
    [transition],
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

  const completeSourceValidation = useCallback(
    (input: RestorePersistedOriginalInput): RecordingArtifact => {
      const current = stateRef.current;
      if (
        current.processingState !== 'processing' ||
        current.processingOperation?.kind !== 'source-validation'
      ) {
        throw new Error('No owned source validation is ready to complete.');
      }
      return restorePersistedOriginal(input);
    },
    [restorePersistedOriginal],
  );

  const discardArtifacts = useCallback(() => {
    repairedPlaybackArtifactIdRef.current = null;
    transition({ type: 'discard' });
  }, [transition]);

  const completeVisualProcessing = useCallback(
    (
      blob: Blob,
      mimeType: string,
      label: string,
      explicitSource?: RecordingArtifact,
      characterAttribution?: VideoCharacterAttribution | null,
    ): RecordingArtifact => {
      const source = explicitSource ?? stateRef.current.original;
      if (!source) throw new Error('Original recording is unavailable.');
      const artifact = createProcessedRecordingArtifact(
        source,
        blob,
        mimeType,
        label,
        characterAttribution,
      );
      repairedPlaybackArtifactIdRef.current = null;
      transition({ type: 'complete-visual', artifact });
      return artifact;
    },
    [transition],
  );

  const completeProcessing = useCallback(
    (
      blob: Blob,
      mimeType: string,
      label: string,
      explicitSource?: RecordingArtifact,
      replaceExistingResult = false,
    ): RecordingArtifact => {
      const source = explicitSource ?? stateRef.current.visual ?? stateRef.current.original;
      if (!source) throw new Error('Original recording is unavailable.');
      const artifact = createProcessedRecordingArtifact(source, blob, mimeType, label);
      repairedPlaybackArtifactIdRef.current = null;
      transition({
        type: 'complete-processing',
        artifact,
        replaceVisual: replaceExistingResult,
      });
      return artifact;
    },
    [transition],
  );

  const restoreOriginal = useCallback(() => transition({ type: 'restore-original' }), [transition]);

  const clearVisualProcessing = useCallback(
    () => transition({ type: 'clear-visual' }),
    [transition],
  );

  const markSidecarRecording = useCallback(
    (started: boolean, error: string | null) => {
      transition({
        type: 'set-sidecar',
        sidecar: started
          ? { ...IDLE_AUDIO_SIDECAR, state: 'recording' }
          : error
            ? { ...IDLE_AUDIO_SIDECAR, state: 'error', error }
            : IDLE_AUDIO_SIDECAR,
      });
    },
    [transition],
  );

  const failSidecar = useCallback(
    (message: string) =>
      transition({
        type: 'set-sidecar',
        sidecar: { ...IDLE_AUDIO_SIDECAR, state: 'error', error: message },
      }),
    [transition],
  );

  const clearRecordingError = useCallback(
    () => transition({ type: 'set-recording-error', message: null }),
    [transition],
  );
  const reportRecordingError = useCallback(
    (message: string) => transition({ type: 'set-recording-error', message }),
    [transition],
  );
  const beginProcessing = useCallback(
    (operation?: RecordingProcessingOperation) =>
      transition({
        type: 'begin-processing',
        operation: operation ?? {
          kind: 'voice-composition',
          title: 'Processing video…',
          detail: 'Playback is paused until a complete replacement is ready.',
        },
      }),
    [transition],
  );
  const cancelProcessing = useCallback(
    () => transition({ type: 'cancel-processing' }),
    [transition],
  );
  const failProcessing = useCallback(
    (message: string) => transition({ type: 'fail-processing', message }),
    [transition],
  );

  const repairPresentedObjectUrl = useCallback((): boolean => {
    const current = stateRef.current;
    const slot = current.processed ? 'processed' : current.visual ? 'visual' : 'original';
    const artifact = current[slot];
    if (!artifact || repairedPlaybackArtifactIdRef.current === artifact.id) return false;

    let objectUrl: string;
    try {
      objectUrl = URL.createObjectURL(artifact.media);
    } catch {
      return false;
    }
    if (!objectUrl) return false;

    repairedPlaybackArtifactIdRef.current = artifact.id;
    transition({ type: 'repair-object-url', slot, artifact: { ...artifact, objectUrl } });
    return true;
  }, [transition]);

  useEffect(() => {
    const protectTake = (event: BeforeUnloadEvent) => {
      if (!stateRef.current.original) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectTake);
    return () => window.removeEventListener('beforeunload', protectTake);
  }, []);

  useEffect(
    () => () => {
      const artifacts = [
        ...pendingRevocationsRef.current,
        ...artifactSlots.map((slot) => stateRef.current[slot]),
      ];
      const revoked = new Set<string>();
      for (const artifact of artifacts) {
        if (!artifact || revoked.has(artifact.objectUrl)) continue;
        revoked.add(artifact.objectUrl);
        revokeArtifactUrl(artifact, 'unmount');
      }
      pendingRevocationsRef.current = [];
    },
    [],
  );

  return useMemo(
    () => ({
      ...state,
      originalRef,
      publishOriginal,
      restorePersistedOriginal,
      completeSourceValidation,
      discardArtifacts,
      markSidecarRecording,
      failSidecar,
      clearRecordingError,
      reportRecordingError,
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
      state,
      publishOriginal,
      restorePersistedOriginal,
      completeSourceValidation,
      discardArtifacts,
      markSidecarRecording,
      failSidecar,
      clearRecordingError,
      reportRecordingError,
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
