import {
  type CapabilitiesResponse,
  type VideoTransformModelId,
  type VideoTransformRecipe,
} from '@studio/contracts';
import {
  canonicalVideoTransformInputGeometry,
  getVideoEditProviderCompatibility,
  validateUploadedVideoFacts,
  validateVideoTransformPlan,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { submitVideoJob } from '../../adapters/api-client/videoJobsApi';
import { transcodeRecordingToMp4 } from '../../adapters/media-processing/transcodeRecording';
import type { RecordingArtifact, RecordingController } from '../recording/types';
import type { LocalVoiceEffectId, VoiceProcessingController } from '../voice-effects/types';
import { validateExistingVideo } from './videoValidation';
import {
  capabilityForExistingVideoStep,
  capabilityForModel,
  defaultVideoProcessingCapabilities,
  operationForModel,
  RetryExistingVideoJobError,
  stepLabel,
  submissionAcceptanceIsUnknown,
} from './existingVideoWorkflowPolicy';
import {
  createWorkflowStateSetters,
  existingVideoWorkflowReducer,
  initialExistingVideoWorkflowState,
} from './existingVideoWorkflowState';
import { useExistingVideoSourceCoordinator } from './useExistingVideoSourceCoordinator';
import { useExistingVideoVoicePipeline } from './useExistingVideoVoicePipeline';
import { useExistingVideoJobLifecycle, useRetainedVideoJob } from './useExistingVideoJobLifecycle';
import { useExistingVideoFinalization } from './useExistingVideoFinalization';
import type {
  ExistingVideoBaseProvenance,
  ExistingVideoStep,
  ExistingVideoSubmissionOperation,
} from './existingVideoWorkflowTypes';

export type {
  ExistingVideoStep,
  ExistingVideoSubmissionOperation,
  ExistingVideoVoiceSelection,
  ExistingVideoWorkflowPhase,
} from './existingVideoWorkflowTypes';
export {
  capabilityForExistingVideoStep,
  savedCharacterStepInput,
} from './existingVideoWorkflowPolicy';

export type ExistingVideoWorkflow = ReturnType<typeof useExistingVideoWorkflow>;

type UseExistingVideoWorkflowOptions = {
  readonly recording: RecordingController;
  readonly processing: VoiceProcessingController;
  readonly publishUploadedVideo: (
    input: Parameters<RecordingController['restorePersistedOriginal']>[0],
  ) => RecordingArtifact;
  readonly onSubmissionAccepted?: (step: ExistingVideoStep) => void;
  readonly videoProcessingCapabilities?: CapabilitiesResponse['videoProcessing'];
  readonly standaloneVisualSubmissionBlockedReason?: string;
};

export const useExistingVideoWorkflow = ({
  recording,
  processing,
  publishUploadedVideo,
  onSubmissionAccepted,
  videoProcessingCapabilities = defaultVideoProcessingCapabilities,
  standaloneVisualSubmissionBlockedReason,
}: UseExistingVideoWorkflowOptions) => {
  const queryClient = useQueryClient();
  const [workflowState, dispatchWorkflowState] = useReducer(
    existingVideoWorkflowReducer,
    initialExistingVideoWorkflowState,
  );
  const workflowStateSetters = useMemo(() => createWorkflowStateSetters(dispatchWorkflowState), []);
  const {
    selection,
    step,
    phase,
    message,
    status,
    completedStepCount,
    submissionOperation,
    pendingVisual,
    retryJob,
    comparison,
    editBase,
    editBaseMetadata,
    editBaseProvenance,
    resultMetadata,
    resultHasServerApprovedVisual,
    voiceSelection,
    elapsedSeconds,
  } = workflowState;
  const {
    setStep,
    setPhase,
    setMessage,
    setStatus,
    setCompletedStepCount,
    setSubmissionOperation,
    setPendingVisual,
    setRetryJob,
    setComparison,
    setEditBase,
    setEditBaseMetadata,
    setEditBaseProvenance,
    setResultMetadata,
    setResultHasServerApprovedVisual,
    setVoiceSelection,
    setElapsedSeconds,
  } = workflowStateSetters;
  const controllerRef = useRef<AbortController | null>(null);
  const submissionOperationRef = useRef<ExistingVideoSubmissionOperation | null>(null);
  const generationRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const { retainedJobIdRef, releaseRetainedJobAndWait, releaseRetainedJob } =
    useRetainedVideoJob(queryClient);
  const steps = useMemo<readonly ExistingVideoStep[]>(() => (step ? [step] : []), [step]);
  const acceptedSubmission =
    submissionOperation?.state === 'accepted' ||
    submissionOperation?.state === 'acceptance-unknown';
  const submissionLocked = submissionOperation !== null;

  const updateSubmissionOperation = useCallback(
    (operation: ExistingVideoSubmissionOperation | null) => {
      submissionOperationRef.current = operation;
      setSubmissionOperation(operation);
    },
    [setSubmissionOperation],
  );
  const editBaseProviderCompatibility = useMemo(() => {
    const metadata = editBaseMetadata ?? selection?.metadata;
    return metadata
      ? getVideoEditProviderCompatibility({ width: metadata.width, height: metadata.height })
      : { compatible: true as const, aspect: '16:9' as const, reason: null };
  }, [editBaseMetadata, selection]);
  const providerInputNormalization = useMemo(() => {
    const metadata = editBaseMetadata ?? selection?.metadata;
    return metadata &&
      editBaseProvenance === 'server-approved-result' &&
      !editBaseProviderCompatibility.compatible
      ? canonicalVideoTransformInputGeometry(metadata)
      : null;
  }, [editBaseMetadata, editBaseProvenance, editBaseProviderCompatibility, selection]);
  const visualProviderCompatibility = useMemo(
    () =>
      providerInputNormalization
        ? {
            compatible: true as const,
            aspect: providerInputNormalization.aspect,
            reason: null,
          }
        : editBaseProviderCompatibility,
    [editBaseProviderCompatibility, providerInputNormalization],
  );

  const clearOperation = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    generationRef.current += 1;
    startedAtRef.current = null;
    submissionOperationRef.current = null;
    dispatchWorkflowState({ type: 'clear-operation' });
  }, []);

  const resetWorkflowState = useCallback(
    (discardTake = false) => {
      clearOperation();
      if (discardTake) recording.discard();
      dispatchWorkflowState({ type: 'reset' });
    },
    [clearOperation, recording],
  );

  const reset = useCallback(
    (discardTake = false) => {
      releaseRetainedJob();
      resetWorkflowState(discardTake);
    },
    [releaseRetainedJob, resetWorkflowState],
  );

  const cleanup = useCallback(async () => {
    const release = releaseRetainedJobAndWait();
    resetWorkflowState(false);
    await release;
  }, [releaseRetainedJobAndWait, resetWorkflowState]);

  const { selectFile, adoptRecordedArtifact, replaceSource } = useExistingVideoSourceCoordinator({
    recording,
    publishUploadedVideo,
    submissionLocked,
    controllerRef,
    generationRef,
    clearOperation,
    releaseRetainedJob,
    dispatch: dispatchWorkflowState,
    setPhase,
    setMessage,
  });

  const addStep = useCallback(
    (modelId: VideoTransformModelId): boolean => {
      if (submissionLocked) return false;
      if (!visualProviderCompatibility.compatible) {
        setMessage(visualProviderCompatibility.reason);
        return false;
      }
      const metadata = editBaseMetadata ?? selection?.metadata;
      if (
        metadata &&
        modelId === 'lucy-vton-latest' &&
        validateUploadedVideoFacts(metadata, ['virtual-try-on']).some(
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
              characterName: null,
              characterVariantName: null,
              prompt: '',
              enhancePrompt: false,
              referenceImage: null,
              inputKind: modelId === 'lucy-vton-latest' ? 'prompt' : 'character',
              ...(modelId === 'lucy-latest' &&
              videoProcessingCapabilities.characterSwap.defaultProvider
                ? { provider: videoProcessingCapabilities.characterSwap.defaultProvider }
                : {}),
              outputResolution:
                capabilityForModel(modelId, videoProcessingCapabilities).outputResolutions[0] ??
                '720p',
            },
      );
      setMessage(null);
      return true;
    },
    [
      editBaseMetadata,
      selection,
      setMessage,
      setStep,
      submissionLocked,
      videoProcessingCapabilities,
      visualProviderCompatibility,
    ],
  );

  const updateStep = useCallback(
    (id: string, patch: Partial<Omit<ExistingVideoStep, 'id' | 'modelId'>>) => {
      if (submissionLocked) return;
      setStep((current) => {
        if (current?.id !== id) return current;
        let next = { ...current, ...patch };
        const capability = capabilityForExistingVideoStep(next, videoProcessingCapabilities);
        if (!capability.outputResolutions.includes(next.outputResolution ?? '720p')) {
          next = {
            ...next,
            outputResolution: capability.outputResolutions[0] ?? '720p',
          };
        }
        return capability.promptInput === 'server-default'
          ? { ...next, prompt: '', enhancePrompt: false }
          : next;
      });
    },
    [setStep, submissionLocked, videoProcessingCapabilities],
  );

  useEffect(() => {
    setStep((current) => {
      if (
        !current ||
        capabilityForExistingVideoStep(current, videoProcessingCapabilities).promptInput !==
          'server-default' ||
        (!current.prompt && !current.enhancePrompt)
      ) {
        return current;
      }
      return { ...current, prompt: '', enhancePrompt: false };
    });
  }, [setStep, videoProcessingCapabilities]);

  const removeStep = useCallback(
    (id: string) => {
      if (submissionLocked) return;
      setStep((current) => (current?.id === id ? null : current));
    },
    [setStep, submissionLocked],
  );

  const finalizeVisual = useExistingVideoFinalization({
    recording,
    selection,
    editBase,
    editBaseMetadata,
    steps,
    generationRef,
    updateSubmissionOperation,
    setPhase,
    setComparison,
    setPendingVisual,
    setRetryJob,
    setCompletedStepCount,
  });

  const { pollAndFinalize } = useExistingVideoJobLifecycle({
    queryClient,
    recording,
    steps,
    videoProcessingCapabilities,
    generationRef,
    retainedJobIdRef,
    submissionOperationRef,
    updateSubmissionOperation,
    finalizeVisual,
    setPhase,
    setRetryJob,
    setStatus,
  });

  const { applySelectedVoice, completeVisualArtifact } = useExistingVideoVoicePipeline({
    recording,
    processing,
    generationRef,
    setPhase,
    setMessage,
    setComparison,
    setResultMetadata,
    setResultHasServerApprovedVisual,
  });

  const submitStep = useCallback(
    async (stepIndex: number) => {
      const baseArtifact = editBase ?? recording.original;
      const source = baseArtifact?.media;
      const step = steps[stepIndex];
      if (!selection || !source || !step || submissionOperationRef.current !== null) return;
      if (standaloneVisualSubmissionBlockedReason) {
        setPhase('error');
        setMessage(standaloneVisualSubmissionBlockedReason);
        return;
      }
      const operation = operationForModel(step.modelId);
      const capability = capabilityForExistingVideoStep(step, videoProcessingCapabilities);
      if (!capability.available) {
        setPhase('error');
        setMessage(`${stepLabel(step.modelId)} is unavailable in this server configuration.`);
        return;
      }
      if (capability.referencePolicy === 'required' && !step.referenceImage) {
        setPhase('error');
        setMessage('Character Swap requires a reference image in this configuration.');
        return;
      }
      if (!capability.promptEnhancement && step.enhancePrompt) {
        setPhase('error');
        setMessage('Prompt enhancement is unavailable for Character Swap in this configuration.');
        return;
      }
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
      releaseRetainedJob();
      clearOperation();
      const generation = generationRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      const jobId = crypto.randomUUID();
      updateSubmissionOperation({ jobId, stepIndex, state: 'submitting' });
      startedAtRef.current = performance.now();
      const selectedVoice = voiceSelection;
      setPhase('uploading');
      setMessage(null);
      recording.beginProcessing({
        kind: 'visual-upload',
        title: `Uploading ${stepLabel(step.modelId).toLowerCase()} edit…`,
        detail: 'Preparing the selected video and settings for visual processing.',
      });
      const recipe: VideoTransformRecipe = {
        operation,
        ...(operation === 'character-swap' && step.provider ? { provider: step.provider } : {}),
        inputKind: step.inputKind,
        prompt: capability.promptInput === 'server-default' ? '' : step.prompt.trim(),
        enhancePrompt: capability.promptInput === 'server-default' ? false : step.enhancePrompt,
        hasReferenceImage: step.referenceImage !== null,
        outputResolution: step.outputResolution ?? capability.outputResolutions[0] ?? '720p',
      };
      let submissionRequestStarted = false;
      let submissionAccepted = false;
      try {
        let submissionSource = source;
        const requiresH264Mp4 =
          capability.inputPreparation === 'h264-mp4' &&
          (source.type || baseArtifact.mimeType) !== 'video/mp4';
        if (requiresH264Mp4 || providerInputNormalization) {
          setPhase('transcoding');
          recording.beginProcessing({
            kind: 'transcoding',
            title: providerInputNormalization
              ? 'Preparing generated result…'
              : 'Preparing H.264 MP4 source…',
            detail: providerInputNormalization
              ? 'Fitting a temporary submission copy inside 16:9 or 9:16 while preserving the saved result.'
              : 'Converting a temporary submission copy while preserving the immutable source.',
          });
          const converted = await transcodeRecordingToMp4(source, {
            requireAudio: selection.metadata.hasAudio,
            signal: controller.signal,
            ...(providerInputNormalization
              ? {
                  targetDimensions: {
                    width: providerInputNormalization.width,
                    height: providerInputNormalization.height,
                  },
                }
              : {}),
          });
          const validatedPrepared = await validateExistingVideo(
            new File([converted.blob], 'visual-edit-source.mp4', {
              type: converted.mimeType,
            }),
            false,
            controller.signal,
          );
          if (
            validatedPrepared.metadata.container !== 'mp4' ||
            validatedPrepared.metadata.videoCodec !== 'avc' ||
            (providerInputNormalization !== null &&
              (validatedPrepared.metadata.width !== providerInputNormalization.width ||
                validatedPrepared.metadata.height !== providerInputNormalization.height))
          ) {
            throw new Error('The temporary visual-processing source could not be prepared safely.');
          }
          submissionSource = validatedPrepared.file;
          setPhase('uploading');
        }
        submissionRequestStarted = true;
        const submitted = await submitVideoJob(
          jobId,
          recipe,
          submissionSource,
          step.referenceImage,
          controller.signal,
        );
        if (generation !== generationRef.current) return;
        submissionAccepted = true;
        updateSubmissionOperation({ jobId, stepIndex, state: 'accepted' });
        try {
          onSubmissionAccepted?.(step);
        } catch {
          // Local recipe recency is auxiliary; it must never affect an accepted paid job.
        }
        const visualArtifact = await pollAndFinalize(
          jobId,
          stepIndex,
          controller,
          generation,
          submitted,
        );
        await completeVisualArtifact(visualArtifact, selectedVoice);
      } catch (error) {
        if (
          submissionRequestStarted &&
          !submissionAccepted &&
          submissionAcceptanceIsUnknown(error)
        ) {
          updateSubmissionOperation({ jobId, stepIndex, state: 'acceptance-unknown' });
          setRetryJob({ jobId, stepIndex });
          const safeMessage =
            'The submission response was interrupted, so acceptance is unknown. Check this same job before submitting anything new.';
          recording.failProcessing(safeMessage);
          setPhase('error');
          setMessage(safeMessage);
          return;
        }
        if (controller.signal.aborted && !submissionAccepted) {
          updateSubmissionOperation(null);
          recording.cancelProcessing();
          setPhase('ready');
          return;
        }
        if (!(error instanceof RetryExistingVideoJobError)) {
          updateSubmissionOperation(null);
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
      clearOperation,
      completeVisualArtifact,
      editBase,
      pollAndFinalize,
      onSubmissionAccepted,
      providerInputNormalization,
      recording,
      releaseRetainedJob,
      selection,
      setMessage,
      setPhase,
      setRetryJob,
      standaloneVisualSubmissionBlockedReason,
      steps,
      updateSubmissionOperation,
      videoProcessingCapabilities,
      voiceSelection,
    ],
  );

  const submitPlan = useCallback(async () => {
    const stepIndex = completedStepCount;
    if (steps[stepIndex]) {
      await submitStep(stepIndex);
      return;
    }
    const baseArtifact =
      completedStepCount > 0
        ? (recording.visual ?? recording.processed)
        : (editBase ?? recording.original);
    const baseMetadata =
      completedStepCount > 0 ? resultMetadata : (editBaseMetadata ?? selection?.metadata ?? null);
    if (!baseArtifact || !baseMetadata || !voiceSelection) return;
    clearOperation();
    startedAtRef.current = performance.now();
    setMessage(null);
    await applySelectedVoice(
      baseArtifact,
      voiceSelection,
      baseMetadata,
      completedStepCount > 0
        ? resultHasServerApprovedVisual
        : editBaseProvenance === 'server-approved-result',
    );
  }, [
    applySelectedVoice,
    clearOperation,
    completedStepCount,
    editBase,
    editBaseMetadata,
    editBaseProvenance,
    recording.original,
    recording.processed,
    recording.visual,
    resultHasServerApprovedVisual,
    resultMetadata,
    selection,
    setMessage,
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
        pendingVisual.expectedResult,
      );
      await completeVisualArtifact(artifact, voiceSelection);
    } catch (error) {
      const safeMessage =
        error instanceof Error ? error.message : 'Local visual finalization failed.';
      recording.failProcessing(safeMessage);
      setPhase('error');
      setMessage(safeMessage);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [
    completeVisualArtifact,
    finalizeVisual,
    pendingVisual,
    recording,
    setMessage,
    setPhase,
    voiceSelection,
  ]);

  const retryExistingJob = useCallback(async () => {
    if (!retryJob) return;
    controllerRef.current?.abort();
    controllerRef.current = null;
    generationRef.current += 1;
    startedAtRef.current = null;
    setElapsedSeconds(0);
    setStatus(null);
    setPendingVisual(null);
    const job = retryJob;
    const generation = generationRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    startedAtRef.current = performance.now();
    const existingOperation = submissionOperationRef.current;
    updateSubmissionOperation(
      existingOperation?.jobId === job.jobId
        ? existingOperation
        : { jobId: job.jobId, stepIndex: job.stepIndex, state: 'accepted' },
    );
    setPhase('processing');
    setMessage(null);
    recording.beginProcessing({
      kind: 'visual-generation',
      title: 'Resuming visual generation…',
      detail: 'Checking the accepted visual-processing job without creating a new submission.',
    });
    try {
      const artifact = await pollAndFinalize(job.jobId, job.stepIndex, controller, generation);
      await completeVisualArtifact(artifact, voiceSelection);
    } catch (error) {
      if (!(error instanceof RetryExistingVideoJobError)) {
        updateSubmissionOperation(null);
      }
      const safeMessage =
        error instanceof Error ? error.message : 'The existing video job could not be resumed.';
      recording.failProcessing(safeMessage);
      setPhase('error');
      setMessage(safeMessage);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, [
    completeVisualArtifact,
    pollAndFinalize,
    recording,
    retryJob,
    setElapsedSeconds,
    setMessage,
    setPendingVisual,
    setPhase,
    setStatus,
    updateSubmissionOperation,
    voiceSelection,
  ]);

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
  }, [acceptedSubmission, phase, processing, recording, selection, setMessage, setPhase]);

  const startOver = useCallback(() => {
    if (!selection || phase !== 'complete' || !recording.original) return;
    clearOperation();
    recording.clearVisualProcessing();
    dispatchWorkflowState({
      type: 'start-over',
      editBase: recording.original,
      metadata: selection.metadata,
      message: selection.audioUnavailableReason,
    });
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
          characterName: null,
          characterVariantName: null,
          prompt: '',
          enhancePrompt: false,
          referenceImage: null,
        };
      });
      setMessage(null);
    },
    [setMessage, setStep],
  );

  const editSelected = useCallback(() => {
    const base =
      comparison === 'original' ? recording.original : (recording.processed ?? recording.visual);
    const metadata = comparison === 'original' ? selection?.metadata : resultMetadata;
    if (!base || !metadata) return;
    const provenance: ExistingVideoBaseProvenance =
      comparison === 'result' && resultHasServerApprovedVisual
        ? 'server-approved-result'
        : 'source';
    const requiresFittedSubmission =
      provenance === 'server-approved-result' &&
      !getVideoEditProviderCompatibility(metadata).compatible;
    setEditBase(base);
    setEditBaseMetadata(metadata);
    setEditBaseProvenance(provenance);
    setStep(null);
    setVoiceSelection(null);
    setCompletedStepCount(0);
    setPhase('ready');
    setMessage(
      comparison === 'original'
        ? 'Editing the immutable original.'
        : requiresFittedSubmission
          ? 'Editing the latest result. Start edit will fit a temporary submission copy inside 16:9 or 9:16; the saved result stays unchanged.'
          : 'Editing the latest result.',
    );
  }, [
    comparison,
    recording.original,
    recording.processed,
    recording.visual,
    resultHasServerApprovedVisual,
    resultMetadata,
    selection,
    setCompletedStepCount,
    setEditBase,
    setEditBaseMetadata,
    setEditBaseProvenance,
    setMessage,
    setPhase,
    setStep,
    setVoiceSelection,
  ]);

  const currentMetadata =
    comparison === 'result' && (recording.processed ?? recording.visual)
      ? (resultMetadata ?? selection?.metadata ?? null)
      : (selection?.metadata ?? null);
  const workflowActive = [
    'validating',
    'uploading',
    'processing',
    'retrieving',
    'finalizing',
    'voice-processing',
    'transcoding',
  ].includes(phase);
  const trackingElapsedTime = workflowActive && phase !== 'validating';

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    if (!trackingElapsedTime || startedAtRef.current === null) return;
    const updateElapsed = () => {
      const startedAt = startedAtRef.current;
      if (startedAt !== null) {
        setElapsedSeconds(Math.max(0, (performance.now() - startedAt) / 1_000));
      }
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [phase, setElapsedSeconds, trackingElapsedTime]);

  return useMemo(
    () => ({
      selection,
      steps,
      phase,
      message,
      status,
      completedStepCount,
      acceptedSubmission,
      submissionOperation,
      pendingVisual,
      retryJob,
      original: recording.original,
      result: recording.processed ?? recording.visual,
      editBase,
      editBaseMetadata,
      currentMetadata,
      voiceSelection,
      voiceAvailable: recording.sidecar.state === 'ready' && recording.sidecar.blob !== null,
      visualProviderCompatibility,
      comparison,
      elapsedSeconds,
      operation: recording.processingOperation,
      active: workflowActive,
      providerActive: acceptedSubmission && phase !== 'complete',
      selectFile,
      adoptRecordedArtifact,
      replaceSource,
      addStep,
      updateStep,
      removeStep,
      submitStep,
      submitPlan,
      retryFinalization,
      retryExistingJob,
      cancelBeforeAcceptance,
      reset,
      cleanup,
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
      submissionOperation,
      addStep,
      cancelBeforeAcceptance,
      completedStepCount,
      comparison,
      currentMetadata,
      editBase,
      editBaseMetadata,
      editSelected,
      elapsedSeconds,
      message,
      pendingVisual,
      retryExistingJob,
      retryJob,
      phase,
      recording.original,
      recording.processingOperation,
      recording.sidecar.blob,
      recording.sidecar.state,
      recording.processed,
      recording.visual,
      removeStep,
      reset,
      cleanup,
      startOver,
      setVtonInputKind,
      retryFinalization,
      selectFile,
      adoptRecordedArtifact,
      replaceSource,
      selection,
      setComparison,
      setVoiceSelection,
      status,
      steps,
      submitStep,
      submitPlan,
      updateStep,
      voiceSelection,
      visualProviderCompatibility,
      workflowActive,
    ],
  );
};
