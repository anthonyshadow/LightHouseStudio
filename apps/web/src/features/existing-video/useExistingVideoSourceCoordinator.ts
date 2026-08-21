import { useCallback, type Dispatch, type RefObject } from 'react';
import type { RecordingArtifact, RecordingController } from '../recording/types';
import { validateExistingVideo, type ValidatedExistingVideo } from './videoValidation';
import type { ExistingVideoWorkflowStateAction } from './existingVideoWorkflowState';
import type { ExistingVideoWorkflowPhase } from './existingVideoWorkflowTypes';

interface ExistingVideoSourceCoordinatorOptions {
  readonly recording: RecordingController;
  readonly publishUploadedVideo: (
    input: Parameters<RecordingController['restorePersistedOriginal']>[0],
  ) => RecordingArtifact;
  readonly submissionLocked: boolean;
  readonly controllerRef: RefObject<AbortController | null>;
  readonly generationRef: RefObject<number>;
  readonly clearOperation: () => void;
  readonly releaseRetainedJob: () => void;
  readonly dispatch: Dispatch<ExistingVideoWorkflowStateAction>;
  readonly setPhase: Dispatch<ExistingVideoWorkflowPhase>;
  readonly setMessage: Dispatch<string | null>;
}

export const useExistingVideoSourceCoordinator = ({
  recording,
  publishUploadedVideo,
  submissionLocked,
  controllerRef,
  generationRef,
  clearOperation,
  releaseRetainedJob,
  dispatch,
  setPhase,
  setMessage,
}: ExistingVideoSourceCoordinatorOptions) => {
  const selectFile = useCallback(
    async (file: File) => {
      if (submissionLocked) return;
      releaseRetainedJob();
      clearOperation();
      const generation = generationRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      setPhase('validating');
      setMessage(null);
      recording.beginProcessing({
        kind: 'source-validation',
        title: 'Checking source video…',
        detail: 'Validating playback, duration, orientation, tracks, and codec locally.',
      });
      try {
        const validated = await validateExistingVideo(file, false, controller.signal);
        if (controller.signal.aborted) {
          if (generation === generationRef.current) recording.cancelProcessing();
          return;
        }
        if (generation !== generationRef.current) return;
        const artifactId = `video-${crypto.randomUUID()}`;
        const sourceArtifact = publishUploadedVideo({
          blob: validated.file,
          artifactMetadata: {
            id: artifactId,
            name: `Uploaded video · ${validated.metadata.selectedAt} · ${artifactId.slice(-8)}`,
            createdAt: validated.metadata.selectedAt,
            kind: 'uploaded',
            parentArtifactId: null,
            mimeType: validated.mimeType,
            filename: validated.file.name,
            sourceModeId: 'local',
            startedAt: validated.metadata.selectedAt,
            durationMs: validated.metadata.durationMs,
          },
          takeMetadata: validated.metadata,
          audioSidecar: validated.audioSidecar,
        });
        dispatch({ type: 'source-ready', selection: validated, editBase: sourceArtifact });
        return sourceArtifact;
      } catch (error) {
        if (controller.signal.aborted) {
          if (generation === generationRef.current) recording.cancelProcessing();
          return;
        }
        recording.cancelProcessing();
        setPhase('error');
        setMessage(error instanceof Error ? error.message : 'The selected video is not supported.');
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [
      clearOperation,
      controllerRef,
      dispatch,
      generationRef,
      publishUploadedVideo,
      recording,
      releaseRetainedJob,
      setMessage,
      setPhase,
      submissionLocked,
    ],
  );

  const adoptRecordedArtifact = useCallback(async () => {
    const draft = recording.original;
    if (!draft || recording.lifecycle !== 'recorded' || submissionLocked) return;
    // Declares owned bytes: adoption validates and re-publishes the complete media. A URL-backed
    // presentation must be acquired first; callers gate on that before adopting.
    const draftMedia = draft.media;
    if (!(draftMedia instanceof Blob)) return;
    releaseRetainedJob();
    clearOperation();
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase('validating');
    setMessage(null);
    recording.beginProcessing({
      kind: 'source-validation',
      title: 'Checking local recording…',
      detail: 'Validating the finalized on-device recording before using it as the source.',
    });
    try {
      const file = new File([draftMedia], draft.filename, { type: draft.mimeType });
      const validated = await validateExistingVideo(file, false, controller.signal);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const sourceArtifact = publishUploadedVideo({
        blob: draftMedia,
        artifactMetadata: {
          id: draft.id,
          ...(draft.name ? { name: draft.name } : {}),
          ...(draft.createdAt ? { createdAt: draft.createdAt } : {}),
          kind: 'recorded',
          parentArtifactId: null,
          mimeType: draft.mimeType,
          filename: draft.filename,
          sourceModeId: draft.sourceModeId,
          startedAt: draft.startedAt,
          durationMs: draft.durationMs,
        },
        takeMetadata: validated.metadata,
        audioSidecar:
          recording.sidecar.state === 'ready' && recording.sidecar.blob
            ? {
                blob: recording.sidecar.blob,
                mimeType: recording.sidecar.mimeType ?? recording.sidecar.blob.type,
              }
            : validated.audioSidecar,
      });
      dispatch({ type: 'source-ready', selection: validated, editBase: sourceArtifact });
      recording.cancelProcessing();
    } catch (error) {
      if (controller.signal.aborted) return;
      const safeMessage =
        error instanceof Error ? error.message : 'The local recording could not be used.';
      recording.failProcessing(safeMessage);
      setPhase('error');
      setMessage(safeMessage);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [
    clearOperation,
    controllerRef,
    dispatch,
    generationRef,
    publishUploadedVideo,
    recording,
    releaseRetainedJob,
    setMessage,
    setPhase,
    submissionLocked,
  ]);

  const replaceSource = useCallback(
    (validated: ValidatedExistingVideo, artifact: RecordingArtifact) => {
      releaseRetainedJob();
      clearOperation();
      dispatch({ type: 'source-ready', selection: validated, editBase: artifact });
    },
    [clearOperation, dispatch, releaseRetainedJob],
  );

  return { selectFile, adoptRecordedArtifact, replaceSource };
};
