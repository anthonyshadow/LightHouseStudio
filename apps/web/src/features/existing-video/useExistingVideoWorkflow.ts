import {
  type VideoJobStatusResponse,
  type VideoTransformModelId,
  type VideoTransformRecipe,
} from '@studio/contracts';
import {
  canSubmitPilotBatchJob,
  validateUploadedVideoFacts,
  validateVideoTransformPlan,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadVideoJobResult,
  fetchVideoJob,
  releaseVideoJob,
  submitVideoJob,
} from '../../adapters/api-client/videoJobsApi';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import {
  replaceRecordingAudio,
  stripRecordingAudio,
} from '../../adapters/media-processing/replaceAudioTrack';
import type { RecordingController } from '../recording/types';
import { validateExistingVideo, type ValidatedExistingVideo } from './videoValidation';

export type ExistingVideoStep = Readonly<{
  id: string;
  modelId: VideoTransformModelId;
  savedRecipeId: string | null;
  prompt: string;
  enhancePrompt: boolean;
  referenceImage: File | null;
}>;

export type ExistingVideoWorkflowPhase =
  | 'empty'
  | 'validating'
  | 'ready'
  | 'uploading'
  | 'processing'
  | 'retrieving'
  | 'finalizing'
  | 'complete'
  | 'error';

export type ExistingVideoWorkflow = ReturnType<typeof useExistingVideoWorkflow>;

type UseExistingVideoWorkflowOptions = {
  readonly recording: RecordingController;
  readonly publishUploadedVideo: (
    input: Parameters<RecordingController['restorePersistedOriginal']>[0],
  ) => unknown;
  readonly onSubmissionAccepted?: (step: ExistingVideoStep) => void;
};

const waitForPoll = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, 1_500);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('Video processing status check was canceled.', 'AbortError'));
      },
      { once: true },
    );
  });

const stepLabel = (modelId: VideoTransformModelId): string =>
  modelId === 'lucy-2.5' ? 'Lucy' : 'VTO';

class RetryExistingVideoJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryExistingVideoJobError';
  }
}

const acceptedJobInterruptionMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) {
    return `${error.message} Decart already accepted this submission; resuming it does not create another submission.`;
  }
  return fallback;
};

export const useExistingVideoWorkflow = ({
  recording,
  publishUploadedVideo,
  onSubmissionAccepted,
}: UseExistingVideoWorkflowOptions) => {
  const [selection, setSelection] = useState<ValidatedExistingVideo | null>(null);
  const [step, setStep] = useState<ExistingVideoStep | null>(null);
  const [phase, setPhase] = useState<ExistingVideoWorkflowPhase>('empty');
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoJobStatusResponse | null>(null);
  const [completedStepCount, setCompletedStepCount] = useState(0);
  const [submittedModels, setSubmittedModels] = useState<readonly VideoTransformModelId[]>([]);
  const [acceptedSubmission, setAcceptedSubmission] = useState(false);
  const [pendingVisual, setPendingVisual] = useState<{
    blob: Blob;
    mimeType: string;
    stepIndex: number;
  } | null>(null);
  const [retryJob, setRetryJob] = useState<{ jobId: string; stepIndex: number } | null>(null);
  const [comparison, setComparison] = useState<'original' | 'result'>('result');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const steps = useMemo<readonly ExistingVideoStep[]>(() => (step ? [step] : []), [step]);

  const clearOperation = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    generationRef.current += 1;
    startedAtRef.current = null;
    setElapsedSeconds(0);
    setStatus(null);
    setAcceptedSubmission(false);
    setPendingVisual(null);
    setRetryJob(null);
  }, []);

  const reset = useCallback(
    (discardTake = false) => {
      clearOperation();
      if (discardTake) recording.discard();
      setSelection(null);
      setStep(null);
      setPhase('empty');
      setMessage(null);
      setCompletedStepCount(0);
      setComparison('result');
    },
    [clearOperation, recording],
  );

  const selectFile = useCallback(
    async (file: File) => {
      if (acceptedSubmission) return;
      clearOperation();
      const generation = generationRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      setPhase('validating');
      setMessage(null);
      try {
        const validated = await validateExistingVideo(
          file,
          step?.modelId === 'lucy-vton-3',
          controller.signal,
        );
        if (controller.signal.aborted || generation !== generationRef.current) return;
        publishUploadedVideo({
          blob: validated.file,
          artifactMetadata: {
            id: `upload-${crypto.randomUUID()}`,
            mimeType: validated.mimeType,
            filename: validated.file.name,
            sourceModeId: 'local',
            startedAt: validated.metadata.selectedAt,
            durationMs: validated.metadata.durationMs,
          },
          takeMetadata: validated.metadata,
          audioSidecar: validated.audioSidecar,
        });
        setSelection(validated);
        setCompletedStepCount(0);
        setComparison('original');
        setPhase('ready');
        setMessage(validated.audioUnavailableReason);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPhase('error');
        setMessage(error instanceof Error ? error.message : 'The selected video is not supported.');
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [acceptedSubmission, clearOperation, publishUploadedVideo, step],
  );

  const addStep = useCallback(
    (modelId: VideoTransformModelId) => {
      if (acceptedSubmission) return;
      if (
        selection &&
        modelId === 'lucy-vton-3' &&
        validateUploadedVideoFacts(selection.metadata, [{ modelId }]).some(
          (issue) => issue.code === 'payload-too-large',
        )
      ) {
        setMessage('Videos used with Virtual Try-On must be 200 MB or smaller.');
        return;
      }
      setStep((current) =>
        current?.modelId === modelId
          ? current
          : {
              id: crypto.randomUUID(),
              modelId,
              savedRecipeId: null,
              prompt: '',
              enhancePrompt: false,
              referenceImage: null,
            },
      );
      setMessage(null);
    },
    [acceptedSubmission, selection],
  );

  const updateStep = useCallback(
    (id: string, patch: Partial<Omit<ExistingVideoStep, 'id' | 'modelId'>>) => {
      if (acceptedSubmission && (phase !== 'error' || retryJob === null)) return;
      setStep((current) => (current?.id === id ? { ...current, ...patch } : current));
    },
    [acceptedSubmission, phase, retryJob],
  );

  const removeStep = useCallback(
    (id: string) => {
      if (acceptedSubmission) return;
      setStep((current) => (current?.id === id ? null : current));
    },
    [acceptedSubmission],
  );

  const finalizeVisual = useCallback(
    async (
      resultBlob: Blob,
      mimeType: string,
      stepIndex: number,
      controller: AbortController,
      generation: number,
    ): Promise<void> => {
      if (!selection) throw new Error('The immutable source video is unavailable.');
      setPhase('finalizing');
      const validatedResult = await validateExistingVideo(
        new File([resultBlob], 'result.mp4', { type: mimeType || resultBlob.type || 'video/mp4' }),
        false,
        controller.signal,
      );
      if (
        Math.abs(validatedResult.metadata.durationMs - selection.metadata.durationMs) > 500 ||
        !(
          (validatedResult.metadata.width === 1_280 && validatedResult.metadata.height === 720) ||
          (validatedResult.metadata.width === 720 && validatedResult.metadata.height === 1_280)
        ) ||
        validatedResult.metadata.width > validatedResult.metadata.height !==
          selection.metadata.width > selection.metadata.height
      ) {
        throw new Error(
          'The visual result could not be synchronized safely with the immutable source.',
        );
      }
      let composed;
      try {
        if (selection.metadata.hasAudio) {
          if (!recording.sidecar.blob) {
            setPendingVisual({ blob: resultBlob, mimeType, stepIndex });
            throw new Error(
              'The visual result is retained for a local retry, but source audio was unavailable.',
            );
          }
          composed = await replaceRecordingAudio(
            resultBlob,
            recording.sidecar.blob,
            controller.signal,
          );
        } else {
          composed = await stripRecordingAudio(resultBlob, controller.signal);
        }
      } catch (error) {
        setPendingVisual({ blob: resultBlob, mimeType, stepIndex });
        throw error;
      }
      controller.signal.throwIfAborted();
      if (generation !== generationRef.current) return;
      const step = steps[stepIndex];
      if (!step) throw new Error('The completed visual recipe is unavailable.');
      recording.completeVisualProcessing(
        composed.blob,
        composed.mimeType,
        `${stepLabel(step.modelId).toLowerCase()}-${stepIndex + 1}`,
      );
      setComparison('result');
      setPendingVisual(null);
      setRetryJob(null);
      setCompletedStepCount(stepIndex + 1);
      setAcceptedSubmission(false);
      setPhase('complete');
      setMessage('Visual processing is complete. The result is ready to compare and download.');
    },
    [recording, selection, steps],
  );

  const pollAndFinalize = useCallback(
    async (jobId: string, stepIndex: number, controller: AbortController, generation: number) => {
      let current = status?.jobId === jobId ? status : null;
      while (!current || !['ready', 'failed', 'expired'].includes(current.status)) {
        controller.signal.throwIfAborted();
        try {
          current = await fetchVideoJob(jobId, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          setRetryJob({ jobId, stepIndex });
          throw new RetryExistingVideoJobError(
            acceptedJobInterruptionMessage(
              error,
              'The status check was interrupted. Retry status without creating another Decart submission.',
            ),
          );
        }
        if (generation !== generationRef.current) return;
        setStatus(current);
        setPhase(current.status === 'retrieving' ? 'retrieving' : 'processing');
        if (!['ready', 'failed', 'expired'].includes(current.status)) {
          await waitForPoll(controller.signal);
        }
      }
      if (current.status !== 'ready') {
        setRetryJob(null);
        await releaseVideoJob(jobId).catch(() => undefined);
        throw new Error(
          current.error?.message ??
            'The visual provider could not complete this request. The previous video is safe.',
        );
      }
      setPhase('retrieving');
      let blob: Blob;
      try {
        blob = await downloadVideoJobResult(jobId, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        setRetryJob({ jobId, stepIndex });
        throw new RetryExistingVideoJobError(
          acceptedJobInterruptionMessage(
            error,
            'The result download was interrupted. Retry it without creating another Decart submission.',
          ),
        );
      }
      await releaseVideoJob(jobId).catch(() => undefined);
      setRetryJob(null);
      setStatus(null);
      await finalizeVisual(
        blob,
        blob.type || current.result?.mimeType || 'video/mp4',
        stepIndex,
        controller,
        generation,
      );
    },
    [finalizeVisual, status],
  );

  const submitStep = useCallback(
    async (stepIndex: number) => {
      const source = recording.visual?.media ?? recording.original?.media;
      const step = steps[stepIndex];
      if (!selection || !source || !step || acceptedSubmission) return;
      const planIssues = validateVideoTransformPlan(
        steps.map((candidate) => ({
          ...candidate,
          hasReferenceImage: candidate.referenceImage !== null,
        })),
      );
      if (planIssues[0]) {
        setPhase('error');
        setMessage(planIssues[0]);
        return;
      }
      if (!canSubmitPilotBatchJob(submittedModels, step.modelId)) {
        setPhase('error');
        setMessage(
          'This moderated participant has reached the four-submission batch limit or the two-submission model limit.',
        );
        return;
      }
      clearOperation();
      const generation = generationRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      const jobId = crypto.randomUUID();
      startedAtRef.current = performance.now();
      setPhase('uploading');
      setMessage(null);
      recording.beginProcessing();
      const recipe: VideoTransformRecipe = {
        modelId: step.modelId,
        prompt: step.prompt.trim(),
        enhancePrompt: step.enhancePrompt,
        hasReferenceImage: step.referenceImage !== null,
      };
      try {
        const submitted = await submitVideoJob(
          jobId,
          recipe,
          source,
          step.referenceImage,
          controller.signal,
        );
        if (generation !== generationRef.current) return;
        setAcceptedSubmission(true);
        setSubmittedModels((current) => [...current, step.modelId]);
        try {
          onSubmissionAccepted?.(step);
        } catch {
          // Local recipe recency is auxiliary; it must never affect an accepted paid job.
        }
        setStatus(submitted);
        await pollAndFinalize(jobId, stepIndex, controller, generation);
      } catch (error) {
        if (controller.signal.aborted && !acceptedSubmission) {
          recording.cancelProcessing();
          setPhase('ready');
          return;
        }
        if (!(error instanceof RetryExistingVideoJobError)) {
          setAcceptedSubmission(false);
        }
        const safeMessage =
          error instanceof Error
            ? error.message
            : 'Visual processing failed. The previous valid video is still available.';
        recording.failProcessing(safeMessage);
        setPhase('error');
        setMessage(safeMessage);
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [
      acceptedSubmission,
      clearOperation,
      pollAndFinalize,
      onSubmissionAccepted,
      recording,
      selection,
      steps,
      submittedModels,
    ],
  );

  const retryFinalization = useCallback(async () => {
    if (!pendingVisual) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = generationRef.current;
    setMessage(null);
    recording.beginProcessing();
    try {
      await finalizeVisual(
        pendingVisual.blob,
        pendingVisual.mimeType,
        pendingVisual.stepIndex,
        controller,
        generation,
      );
    } catch (error) {
      const safeMessage =
        error instanceof Error ? error.message : 'Local visual finalization failed.';
      recording.failProcessing(safeMessage);
      setPhase('error');
      setMessage(safeMessage);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [finalizeVisual, pendingVisual, recording]);

  const retryExistingJob = useCallback(async () => {
    if (!retryJob) return;
    clearOperation();
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    startedAtRef.current = performance.now();
    setAcceptedSubmission(true);
    setPhase('processing');
    setMessage(null);
    recording.beginProcessing();
    try {
      await pollAndFinalize(retryJob.jobId, retryJob.stepIndex, controller, generation);
    } catch (error) {
      if (!(error instanceof RetryExistingVideoJobError)) {
        setAcceptedSubmission(false);
      }
      const safeMessage =
        error instanceof Error ? error.message : 'The existing video job could not be resumed.';
      recording.failProcessing(safeMessage);
      setPhase('error');
      setMessage(safeMessage);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [clearOperation, pollAndFinalize, recording, retryJob]);

  const cancelBeforeAcceptance = useCallback(() => {
    if (acceptedSubmission) return;
    controllerRef.current?.abort();
  }, [acceptedSubmission]);

  const startOver = useCallback(() => {
    if (!selection || phase !== 'complete') return;
    clearOperation();
    recording.clearVisualProcessing();
    setStep(null);
    setPhase('ready');
    setMessage(selection.audioUnavailableReason);
    setCompletedStepCount(0);
    setComparison('original');
  }, [clearOperation, phase, recording, selection]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (
      !['uploading', 'processing', 'retrieving', 'finalizing'].includes(phase) ||
      startedAtRef.current === null
    ) {
      return;
    }
    const updateElapsed = () => {
      const startedAt = startedAtRef.current;
      if (startedAt !== null) {
        setElapsedSeconds(Math.max(0, (performance.now() - startedAt) / 1_000));
      }
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [phase]);

  return useMemo(
    () => ({
      selection,
      steps,
      phase,
      message,
      status,
      completedStepCount,
      submittedModels,
      acceptedSubmission,
      pendingVisual,
      retryJob,
      result: recording.visual,
      comparison,
      elapsedSeconds,
      active: ['validating', 'uploading', 'processing', 'retrieving', 'finalizing'].includes(phase),
      providerActive: acceptedSubmission && phase !== 'complete',
      selectFile,
      addStep,
      updateStep,
      removeStep,
      submitStep,
      retryFinalization,
      retryExistingJob,
      cancelBeforeAcceptance,
      downloadResult: recording.markDownloaded,
      reset,
      startOver,
      showOriginal: () => setComparison('original'),
      showResult: () => setComparison('result'),
    }),
    [
      acceptedSubmission,
      addStep,
      cancelBeforeAcceptance,
      completedStepCount,
      comparison,
      elapsedSeconds,
      message,
      pendingVisual,
      retryExistingJob,
      retryJob,
      phase,
      recording.markDownloaded,
      recording.visual,
      removeStep,
      reset,
      startOver,
      retryFinalization,
      selectFile,
      selection,
      status,
      steps,
      submitStep,
      submittedModels,
      updateStep,
    ],
  );
};
