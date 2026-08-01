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
import { transcodeRecordingToMp4 } from '../../adapters/media-processing/transcodeRecording';
import type { RecordingArtifact, RecordingController } from '../recording/types';
import type { LocalVoiceEffectId, VoiceProcessingController } from '../voice-effects/types';
import { validateExistingVideo, type ValidatedExistingVideo } from './videoValidation';

export type ExistingVideoStep = Readonly<{
  id: string;
  modelId: VideoTransformModelId;
  savedRecipeId: string | null;
  prompt: string;
  enhancePrompt: boolean;
  referenceImage: File | null;
  inputKind: 'character' | 'saved-outfit' | 'reference-image' | 'prompt';
}>;

export type ExistingVideoVoiceSelection =
  | Readonly<{
      kind: 'local';
      effect: LocalVoiceEffectId;
      voiceName: string;
    }>
  | Readonly<{
      kind: 'elevenlabs';
      voiceId: string;
      voiceName: string;
    }>;

export type ExistingVideoWorkflowPhase =
  | 'empty'
  | 'validating'
  | 'ready'
  | 'uploading'
  | 'processing'
  | 'retrieving'
  | 'finalizing'
  | 'voice-processing'
  | 'transcoding'
  | 'complete'
  | 'error';

export type ExistingVideoWorkflow = ReturnType<typeof useExistingVideoWorkflow>;

type UseExistingVideoWorkflowOptions = {
  readonly recording: RecordingController;
  readonly processing: VoiceProcessingController;
  readonly publishUploadedVideo: (
    input: Parameters<RecordingController['restorePersistedOriginal']>[0],
  ) => RecordingArtifact;
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
  modelId === 'lucy-latest' ? 'Lucy' : 'VTO';

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
  processing,
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
  const [editBase, setEditBase] = useState<RecordingArtifact | null>(null);
  const [voiceSelection, setVoiceSelection] = useState<ExistingVideoVoiceSelection | null>(null);
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
      setEditBase(null);
      setVoiceSelection(null);
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
        setSelection(validated);
        setEditBase(sourceArtifact);
        setStep(null);
        setVoiceSelection(null);
        setCompletedStepCount(0);
        setComparison('original');
        setPhase('ready');
        setMessage(validated.audioUnavailableReason);
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
    [acceptedSubmission, clearOperation, publishUploadedVideo, recording],
  );

  const adoptRecordedArtifact = useCallback(async () => {
    const draft = recording.original;
    if (!draft || recording.lifecycle !== 'recorded' || acceptedSubmission) return;
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
      const file = new File([draft.media], draft.filename, { type: draft.mimeType });
      const validated = await validateExistingVideo(file, false, controller.signal);
      if (controller.signal.aborted || generation !== generationRef.current) return;
      const sourceArtifact = publishUploadedVideo({
        blob: draft.media,
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
      setSelection(validated);
      setEditBase(sourceArtifact);
      setStep(null);
      setVoiceSelection(null);
      setCompletedStepCount(0);
      setComparison('original');
      setPhase('ready');
      recording.cancelProcessing();
      setMessage(validated.audioUnavailableReason);
    } catch (error) {
      if (controller.signal.aborted) return;
      const safeMessage =
        error instanceof Error ? error.message : 'The local recording could not be adopted.';
      recording.failProcessing(safeMessage);
      setPhase('error');
      setMessage(safeMessage);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [acceptedSubmission, clearOperation, publishUploadedVideo, recording]);

  const addStep = useCallback(
    (modelId: VideoTransformModelId): boolean => {
      if (acceptedSubmission) return false;
      if (
        selection &&
        modelId === 'lucy-vton-latest' &&
        validateUploadedVideoFacts(selection.metadata, [{ modelId }]).some(
          (issue) => issue.code === 'payload-too-large',
        )
      ) {
        setMessage('Videos used with Virtual Try-On must be 200 MB or smaller.');
        return false;
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
              inputKind: modelId === 'lucy-vton-latest' ? 'prompt' : 'character',
            },
      );
      setMessage(null);
      return true;
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
    ): Promise<RecordingArtifact | null> => {
      if (!selection) throw new Error('The immutable source video is unavailable.');
      setPhase('finalizing');
      recording.beginProcessing({
        kind: 'visual-retrieval',
        title: 'Validating visual result…',
        detail: 'Checking the retrieved video before it can replace the current result.',
      });
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
      const resultCanCommitDirectly =
        !selection.metadata.hasAudio &&
        !validatedResult.metadata.hasAudio &&
        validatedResult.metadata.container === 'mp4' &&
        validatedResult.metadata.videoCodec === 'avc';
      let normalized: { blob: Blob; mimeType: string };
      if (resultCanCommitDirectly) {
        normalized = { blob: resultBlob, mimeType: 'video/mp4' };
      } else {
        recording.beginProcessing({
          kind: 'audio-restoration',
          title: 'Restoring source audio…',
          detail: 'Combining the visual result with the immutable original audio.',
        });
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
        if (generation !== generationRef.current) return null;
        setPhase('transcoding');
        recording.beginProcessing({
          kind: 'transcoding',
          title: 'Transcoding visual result…',
          detail: 'Normalizing the generated video to H.264/AAC MP4.',
        });
        normalized = await transcodeRecordingToMp4(composed.blob, {
          requireAudio: selection.metadata.hasAudio,
          signal: controller.signal,
        });
      }
      controller.signal.throwIfAborted();
      if (generation !== generationRef.current) return null;
      const step = steps[stepIndex];
      if (!step) throw new Error('The completed visual recipe is unavailable.');
      const artifact = recording.completeVisualProcessing(
        normalized.blob,
        normalized.mimeType,
        `${stepLabel(step.modelId).toLowerCase()}-${stepIndex + 1}`,
        editBase ?? recording.original ?? undefined,
      );
      setComparison('result');
      setPendingVisual(null);
      setRetryJob(null);
      setCompletedStepCount(stepIndex + 1);
      setAcceptedSubmission(false);
      setPhase('complete');
      setMessage('Visual processing is complete. The result is ready to compare and download.');
      return artifact;
    },
    [editBase, recording, selection, steps],
  );

  const pollAndFinalize = useCallback(
    async (
      jobId: string,
      stepIndex: number,
      controller: AbortController,
      generation: number,
    ): Promise<RecordingArtifact | null> => {
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
        if (generation !== generationRef.current) return null;
        setStatus(current);
        setPhase(current.status === 'retrieving' ? 'retrieving' : 'processing');
        const currentStep = steps[stepIndex];
        recording.beginProcessing({
          kind: current.status === 'retrieving' ? 'visual-retrieval' : 'visual-generation',
          title:
            current.status === 'retrieving'
              ? 'Retrieving visual result…'
              : `Generating ${currentStep ? stepLabel(currentStep.modelId).toLowerCase() : 'visual edit'}…`,
          detail: 'Decart is processing the single accepted visual submission.',
        });
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
      recording.beginProcessing({
        kind: 'visual-retrieval',
        title: 'Retrieving visual result…',
        detail: 'Downloading and validating the accepted Decart result.',
      });
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
      return finalizeVisual(
        blob,
        blob.type || current.result?.mimeType || 'video/mp4',
        stepIndex,
        controller,
        generation,
      );
    },
    [finalizeVisual, recording, status, steps],
  );

  const applySelectedVoice = useCallback(
    async (videoArtifact: RecordingArtifact, selectedVoice: ExistingVideoVoiceSelection) => {
      setPhase('voice-processing');
      const outcome =
        selectedVoice.kind === 'local'
          ? await processing.applyLocalTo(videoArtifact, selectedVoice.effect, {
              replaceExistingResult: true,
            })
          : await processing.applyElevenLabsTo(
              videoArtifact,
              selectedVoice.voiceId,
              selectedVoice.voiceName,
              { replaceExistingResult: true },
            );
      if (outcome.status === 'ready') {
        setComparison('result');
        setPhase('complete');
        setMessage(`${selectedVoice.voiceName} is ready on the generated result.`);
        return outcome.artifact;
      }
      if (outcome.status === 'error') {
        setPhase('error');
        setMessage(outcome.message);
      }
      return null;
    },
    [processing],
  );

  const submitStep = useCallback(
    async (stepIndex: number) => {
      const baseArtifact = editBase ?? recording.original;
      const source = baseArtifact?.media;
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
      const selectedVoice = voiceSelection;
      setPhase('uploading');
      setMessage(null);
      recording.beginProcessing({
        kind: 'visual-upload',
        title: `Uploading ${stepLabel(step.modelId).toLowerCase()} edit…`,
        detail: 'Sending the selected video and recipe to Decart.',
      });
      const recipe: VideoTransformRecipe = {
        modelId: step.modelId,
        inputKind: step.inputKind,
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
        const visualArtifact = await pollAndFinalize(jobId, stepIndex, controller, generation);
        if (visualArtifact && selectedVoice) {
          await applySelectedVoice(visualArtifact, selectedVoice);
        }
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
      applySelectedVoice,
      clearOperation,
      editBase,
      pollAndFinalize,
      onSubmissionAccepted,
      recording,
      selection,
      steps,
      submittedModels,
      voiceSelection,
    ],
  );

  const submitPlan = useCallback(async () => {
    const stepIndex = completedStepCount;
    if (steps[stepIndex]) {
      await submitStep(stepIndex);
      return;
    }
    const baseArtifact = editBase ?? recording.original;
    if (!baseArtifact || !voiceSelection) return;
    clearOperation();
    startedAtRef.current = performance.now();
    setMessage(null);
    await applySelectedVoice(baseArtifact, voiceSelection);
  }, [
    applySelectedVoice,
    clearOperation,
    completedStepCount,
    editBase,
    recording.original,
    steps,
    submitStep,
    voiceSelection,
  ]);

  const retryFinalization = useCallback(async () => {
    if (!pendingVisual) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const generation = generationRef.current;
    setMessage(null);
    recording.beginProcessing({
      kind: 'audio-restoration',
      title: 'Restoring source audio…',
      detail: 'Retrying local composition without another provider submission.',
    });
    try {
      const artifact = await finalizeVisual(
        pendingVisual.blob,
        pendingVisual.mimeType,
        pendingVisual.stepIndex,
        controller,
        generation,
      );
      if (artifact && voiceSelection) await applySelectedVoice(artifact, voiceSelection);
    } catch (error) {
      const safeMessage =
        error instanceof Error ? error.message : 'Local visual finalization failed.';
      recording.failProcessing(safeMessage);
      setPhase('error');
      setMessage(safeMessage);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [applySelectedVoice, finalizeVisual, pendingVisual, recording, voiceSelection]);

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
    recording.beginProcessing({
      kind: 'visual-generation',
      title: 'Resuming visual generation…',
      detail: 'Checking the accepted Decart job without creating a new submission.',
    });
    try {
      const artifact = await pollAndFinalize(
        retryJob.jobId,
        retryJob.stepIndex,
        controller,
        generation,
      );
      if (artifact && voiceSelection) await applySelectedVoice(artifact, voiceSelection);
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
  }, [applySelectedVoice, clearOperation, pollAndFinalize, recording, retryJob, voiceSelection]);

  const cancelBeforeAcceptance = useCallback(() => {
    if (phase === 'voice-processing') {
      processing.cancel();
      setPhase(recording.visual || recording.processed ? 'complete' : 'ready');
      setMessage('Voice processing was canceled. The last healthy video is still available.');
      return;
    }
    if (acceptedSubmission) return;
    controllerRef.current?.abort();
    recording.cancelProcessing();
    setPhase(selection ? 'ready' : 'empty');
    setMessage(
      selection ? 'The pending operation was canceled. Your current video is safe.' : null,
    );
  }, [acceptedSubmission, phase, processing, recording, selection]);

  const startOver = useCallback(() => {
    if (!selection || phase !== 'complete') return;
    clearOperation();
    recording.clearVisualProcessing();
    setStep(null);
    setPhase('ready');
    setMessage(selection.audioUnavailableReason);
    setCompletedStepCount(0);
    setComparison('original');
    setEditBase(recording.original);
    setVoiceSelection(null);
  }, [clearOperation, phase, recording, selection]);

  const setVtonInputKind = useCallback(
    (
      id: string,
      inputKind: Extract<
        ExistingVideoStep['inputKind'],
        'saved-outfit' | 'reference-image' | 'prompt'
      >,
    ) => {
      setStep((current) => {
        if (!current || current.id !== id || current.modelId !== 'lucy-vton-latest') return current;
        return {
          ...current,
          inputKind,
          savedRecipeId: null,
          prompt: '',
          enhancePrompt: false,
          referenceImage: null,
        };
      });
      setMessage(null);
    },
    [],
  );

  const editSelected = useCallback(() => {
    const base =
      comparison === 'original' ? recording.original : (recording.processed ?? recording.visual);
    if (!base) return;
    setEditBase(base);
    setStep(null);
    setVoiceSelection(null);
    setCompletedStepCount(0);
    setPhase('ready');
    setMessage(
      `Editing ${comparison === 'original' ? 'the immutable original' : 'the latest result'}.`,
    );
  }, [comparison, recording.original, recording.processed, recording.visual]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (
      ![
        'uploading',
        'processing',
        'retrieving',
        'finalizing',
        'voice-processing',
        'transcoding',
      ].includes(phase) ||
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
      original: recording.original,
      result: recording.processed ?? recording.visual,
      downloaded: recording.downloaded,
      editBase,
      voiceSelection,
      voiceAvailable: recording.sidecar.state === 'ready' && recording.sidecar.blob !== null,
      comparison,
      elapsedSeconds,
      operation: recording.processingOperation,
      active: [
        'validating',
        'uploading',
        'processing',
        'retrieving',
        'finalizing',
        'voice-processing',
        'transcoding',
      ].includes(phase),
      providerActive: acceptedSubmission && phase !== 'complete',
      selectFile,
      adoptRecordedArtifact,
      addStep,
      updateStep,
      removeStep,
      submitStep,
      submitPlan,
      retryFinalization,
      retryExistingJob,
      cancelBeforeAcceptance,
      downloadResult: recording.markDownloaded,
      reset,
      startOver,
      setVtonInputKind,
      selectLocalVoice: (effect: LocalVoiceEffectId, voiceName: string) =>
        setVoiceSelection({ kind: 'local', effect, voiceName }),
      selectVoice: (voiceId: string, voiceName: string) =>
        setVoiceSelection({ kind: 'elevenlabs', voiceId, voiceName }),
      clearVoice: () => setVoiceSelection(null),
      editSelected,
      showOriginal: () => setComparison('original'),
      showResult: () => {
        if (recording.processed ?? recording.visual) setComparison('result');
      },
    }),
    [
      acceptedSubmission,
      addStep,
      cancelBeforeAcceptance,
      completedStepCount,
      comparison,
      editBase,
      editSelected,
      elapsedSeconds,
      message,
      pendingVisual,
      retryExistingJob,
      retryJob,
      phase,
      recording.markDownloaded,
      recording.downloaded,
      recording.original,
      recording.processingOperation,
      recording.sidecar.blob,
      recording.sidecar.state,
      recording.processed,
      recording.visual,
      removeStep,
      reset,
      startOver,
      setVtonInputKind,
      retryFinalization,
      selectFile,
      adoptRecordedArtifact,
      selection,
      status,
      steps,
      submitStep,
      submitPlan,
      submittedModels,
      updateStep,
      voiceSelection,
    ],
  );
};
