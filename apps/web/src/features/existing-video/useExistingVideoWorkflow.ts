import {
  type CapabilitiesResponse,
  type InspectedVideo,
  type VideoJobStatusResponse,
  type VideoOutputResolution,
  type VideoTransformModelId,
  type VideoTransformOperationId,
  type VideoTransformRecipe,
} from '@studio/contracts';
import {
  canonicalVideoTransformInputGeometry,
  getVideoEditProviderCompatibility,
  validateUploadedVideoFacts,
  validateVideoTransformPlan,
} from '@studio/domain';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
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
import { createProcessedRecordingArtifact } from '../../orchestration/recording/recordingArtifacts';
import { revokeArtifactUrl } from '../recording/recordingHelpers';
import type { RecordingArtifact, RecordingController } from '../recording/types';
import type {
  LocalVoiceEffectId,
  VoiceProcessingController,
  VoiceProcessingOutcome,
} from '../voice-effects/types';
import { validateExistingVideo, type ValidatedExistingVideo } from './videoValidation';

export type ExistingVideoStep = Readonly<{
  id: string;
  modelId: VideoTransformModelId;
  savedRecipeId: string | null;
  prompt: string;
  enhancePrompt: boolean;
  referenceImage: File | null;
  inputKind: 'character' | 'saved-outfit' | 'reference-image' | 'prompt';
  outputResolution?: VideoOutputResolution;
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

type FinalizedVisual = Readonly<{
  blob: Blob;
  mimeType: string;
  label: string;
  source: RecordingArtifact;
  metadata: ValidatedExistingVideo['metadata'];
  generation: number;
}>;

type ExistingVideoBaseProvenance = 'source' | 'server-approved-result';

export type ExistingVideoSubmissionOperation = Readonly<{
  jobId: string;
  stepIndex: number;
  state: 'submitting' | 'acceptance-unknown' | 'accepted';
}>;

type PendingVisual = Readonly<{
  blob: Blob;
  mimeType: string;
  stepIndex: number;
  expectedResult: InspectedVideo;
}>;

type RetryJob = Readonly<{ jobId: string; stepIndex: number }>;

interface ExistingVideoWorkflowState {
  selection: ValidatedExistingVideo | null;
  step: ExistingVideoStep | null;
  phase: ExistingVideoWorkflowPhase;
  message: string | null;
  status: VideoJobStatusResponse | null;
  completedStepCount: number;
  submissionOperation: ExistingVideoSubmissionOperation | null;
  pendingVisual: PendingVisual | null;
  retryJob: RetryJob | null;
  comparison: 'original' | 'result';
  editBase: RecordingArtifact | null;
  editBaseMetadata: ValidatedExistingVideo['metadata'] | null;
  editBaseProvenance: ExistingVideoBaseProvenance;
  resultMetadata: ValidatedExistingVideo['metadata'] | null;
  resultHasServerApprovedVisual: boolean;
  voiceSelection: ExistingVideoVoiceSelection | null;
  elapsedSeconds: number;
}

type ExistingVideoWorkflowStateAction = {
  [Key in keyof ExistingVideoWorkflowState]: Readonly<{
    key: Key;
    value: SetStateAction<ExistingVideoWorkflowState[Key]>;
  }>;
}[keyof ExistingVideoWorkflowState];

const initialExistingVideoWorkflowState: ExistingVideoWorkflowState = {
  selection: null,
  step: null,
  phase: 'empty',
  message: null,
  status: null,
  completedStepCount: 0,
  submissionOperation: null,
  pendingVisual: null,
  retryJob: null,
  comparison: 'result',
  editBase: null,
  editBaseMetadata: null,
  editBaseProvenance: 'source',
  resultMetadata: null,
  resultHasServerApprovedVisual: false,
  voiceSelection: null,
  elapsedSeconds: 0,
};

const existingVideoWorkflowReducer = (
  state: ExistingVideoWorkflowState,
  action: ExistingVideoWorkflowStateAction,
): ExistingVideoWorkflowState => {
  const current = state[action.key];
  const next =
    typeof action.value === 'function'
      ? (action.value as (value: typeof current) => typeof current)(current)
      : action.value;
  return Object.is(current, next) ? state : { ...state, [action.key]: next };
};

const stateSetter =
  <Key extends keyof ExistingVideoWorkflowState>(
    dispatch: Dispatch<ExistingVideoWorkflowStateAction>,
    key: Key,
  ): Dispatch<SetStateAction<ExistingVideoWorkflowState[Key]>> =>
  (value) =>
    dispatch({ key, value } as ExistingVideoWorkflowStateAction);

const createWorkflowStateSetters = (dispatch: Dispatch<ExistingVideoWorkflowStateAction>) => ({
  setSelection: stateSetter(dispatch, 'selection'),
  setStep: stateSetter(dispatch, 'step'),
  setPhase: stateSetter(dispatch, 'phase'),
  setMessage: stateSetter(dispatch, 'message'),
  setStatus: stateSetter(dispatch, 'status'),
  setCompletedStepCount: stateSetter(dispatch, 'completedStepCount'),
  setSubmissionOperation: stateSetter(dispatch, 'submissionOperation'),
  setPendingVisual: stateSetter(dispatch, 'pendingVisual'),
  setRetryJob: stateSetter(dispatch, 'retryJob'),
  setComparison: stateSetter(dispatch, 'comparison'),
  setEditBase: stateSetter(dispatch, 'editBase'),
  setEditBaseMetadata: stateSetter(dispatch, 'editBaseMetadata'),
  setEditBaseProvenance: stateSetter(dispatch, 'editBaseProvenance'),
  setResultMetadata: stateSetter(dispatch, 'resultMetadata'),
  setResultHasServerApprovedVisual: stateSetter(dispatch, 'resultHasServerApprovedVisual'),
  setVoiceSelection: stateSetter(dispatch, 'voiceSelection'),
  setElapsedSeconds: stateSetter(dispatch, 'elapsedSeconds'),
});

export const savedCharacterStepInput = (
  prompt: string,
  referenceImage: File | null,
): Pick<ExistingVideoStep, 'prompt' | 'referenceImage'> => ({
  prompt: referenceImage ? '' : prompt,
  referenceImage,
});

type UseExistingVideoWorkflowOptions = {
  readonly recording: RecordingController;
  readonly processing: VoiceProcessingController;
  readonly publishUploadedVideo: (
    input: Parameters<RecordingController['restorePersistedOriginal']>[0],
  ) => RecordingArtifact;
  readonly onSubmissionAccepted?: (step: ExistingVideoStep) => void;
  readonly videoProcessingCapabilities?: CapabilitiesResponse['videoProcessing'];
};

const waitForPoll = (signal: AbortSignal, milliseconds = 1_500): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Video processing status check was canceled.', 'AbortError'));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Video processing status check was canceled.', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });

const operationForModel = (modelId: VideoTransformModelId): VideoTransformOperationId =>
  modelId === 'lucy-latest' ? 'character-swap' : 'virtual-try-on';

const capabilityForModel = (
  modelId: VideoTransformModelId,
  capabilities: CapabilitiesResponse['videoProcessing'],
) => (modelId === 'lucy-latest' ? capabilities.characterSwap : capabilities.virtualTryOn);

const stepLabel = (modelId: VideoTransformModelId): string =>
  modelId === 'lucy-latest' ? 'Character Swap' : 'Virtual Try-On';

const defaultVideoProcessingCapabilities: CapabilitiesResponse['videoProcessing'] = {
  characterSwap: {
    available: true,
    inputPreparation: 'none',
    referencePolicy: 'optional',
    promptInput: 'editable',
    promptEnhancement: true,
    terminalFailureRelease: 'automatic',
    outputResolutions: ['720p'],
  },
  virtualTryOn: {
    available: true,
    inputPreparation: 'none',
    referencePolicy: 'optional',
    promptInput: 'editable',
    promptEnhancement: true,
    terminalFailureRelease: 'automatic',
    outputResolutions: ['720p'],
  },
};

class RetryExistingVideoJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryExistingVideoJobError';
  }
}

const explicitResubmissionNotice =
  'The previous video is safe. Starting again requires a new explicit provider submission and may incur additional provider usage.';

const terminalJobMessage = (code: string | undefined): string | null => {
  if (code === 'job_expired') {
    return `This temporary video job expired. ${explicitResubmissionNotice}`;
  }
  if (code === 'not_found') {
    return `This temporary video job is no longer available. ${explicitResubmissionNotice}`;
  }
  return null;
};

const acceptedJobInterruptionMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) {
    return `${error.message} Visual processing already accepted this job; resuming it does not create another submission.`;
  }
  return fallback;
};

export const useExistingVideoWorkflow = ({
  recording,
  processing,
  publishUploadedVideo,
  onSubmissionAccepted,
  videoProcessingCapabilities = defaultVideoProcessingCapabilities,
}: UseExistingVideoWorkflowOptions) => {
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
    setSelection,
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
  const retainedJobIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
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
    setElapsedSeconds(0);
    setStatus(null);
    updateSubmissionOperation(null);
    setPendingVisual(null);
    setRetryJob(null);
  }, [setElapsedSeconds, setPendingVisual, setRetryJob, setStatus, updateSubmissionOperation]);

  const releaseRetainedJobAndWait = useCallback(async () => {
    const jobId = retainedJobIdRef.current;
    if (!jobId) return;
    retainedJobIdRef.current = null;
    await releaseVideoJob(jobId).catch(() => undefined);
  }, []);

  const releaseRetainedJob = useCallback(() => {
    void releaseRetainedJobAndWait();
  }, [releaseRetainedJobAndWait]);

  const resetWorkflowState = useCallback(
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
      setEditBaseMetadata(null);
      setEditBaseProvenance('source');
      setResultMetadata(null);
      setResultHasServerApprovedVisual(false);
      setVoiceSelection(null);
    },
    [
      clearOperation,
      recording,
      setComparison,
      setCompletedStepCount,
      setEditBase,
      setEditBaseMetadata,
      setEditBaseProvenance,
      setMessage,
      setPhase,
      setResultHasServerApprovedVisual,
      setResultMetadata,
      setSelection,
      setStep,
      setVoiceSelection,
    ],
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
        setSelection(validated);
        setEditBase(sourceArtifact);
        setEditBaseMetadata(validated.metadata);
        setEditBaseProvenance('source');
        setResultMetadata(null);
        setResultHasServerApprovedVisual(false);
        setStep(null);
        setVoiceSelection(null);
        setCompletedStepCount(0);
        setComparison('original');
        setPhase('ready');
        setMessage(validated.audioUnavailableReason);
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
      publishUploadedVideo,
      recording,
      releaseRetainedJob,
      setComparison,
      setCompletedStepCount,
      setEditBase,
      setEditBaseMetadata,
      setEditBaseProvenance,
      setMessage,
      setPhase,
      setResultHasServerApprovedVisual,
      setResultMetadata,
      setSelection,
      setStep,
      setVoiceSelection,
      submissionLocked,
    ],
  );

  const adoptRecordedArtifact = useCallback(async () => {
    const draft = recording.original;
    if (!draft || recording.lifecycle !== 'recorded' || submissionLocked) return;
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
      setEditBaseMetadata(validated.metadata);
      setEditBaseProvenance('source');
      setResultMetadata(null);
      setResultHasServerApprovedVisual(false);
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
  }, [
    clearOperation,
    publishUploadedVideo,
    recording,
    releaseRetainedJob,
    setComparison,
    setCompletedStepCount,
    setEditBase,
    setEditBaseMetadata,
    setEditBaseProvenance,
    setMessage,
    setPhase,
    setResultHasServerApprovedVisual,
    setResultMetadata,
    setSelection,
    setStep,
    setVoiceSelection,
    submissionLocked,
  ]);

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
              prompt: '',
              enhancePrompt: false,
              referenceImage: null,
              inputKind: modelId === 'lucy-vton-latest' ? 'prompt' : 'character',
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

  const replaceSource = useCallback(
    (validated: ValidatedExistingVideo, artifact: RecordingArtifact) => {
      releaseRetainedJob();
      clearOperation();
      setSelection(validated);
      setStep(null);
      setPhase('ready');
      setMessage(validated.audioUnavailableReason);
      setCompletedStepCount(0);
      setComparison('original');
      setEditBase(artifact);
      setEditBaseMetadata(validated.metadata);
      setEditBaseProvenance('source');
      setResultMetadata(null);
      setResultHasServerApprovedVisual(false);
      setVoiceSelection(null);
    },
    [
      clearOperation,
      releaseRetainedJob,
      setComparison,
      setCompletedStepCount,
      setEditBase,
      setEditBaseMetadata,
      setEditBaseProvenance,
      setMessage,
      setPhase,
      setResultHasServerApprovedVisual,
      setResultMetadata,
      setSelection,
      setStep,
      setVoiceSelection,
    ],
  );

  const updateStep = useCallback(
    (id: string, patch: Partial<Omit<ExistingVideoStep, 'id' | 'modelId'>>) => {
      if (submissionLocked) return;
      setStep((current) => {
        if (current?.id !== id) return current;
        const next = { ...current, ...patch };
        return capabilityForModel(current.modelId, videoProcessingCapabilities).promptInput ===
          'server-default'
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
        capabilityForModel(current.modelId, videoProcessingCapabilities).promptInput !==
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

  const finalizeVisual = useCallback(
    async (
      resultBlob: Blob,
      mimeType: string,
      stepIndex: number,
      controller: AbortController,
      generation: number,
      expectedResult: InspectedVideo,
    ): Promise<FinalizedVisual | null> => {
      if (!selection) throw new Error('The immutable source video is unavailable.');
      const baseMetadata = editBaseMetadata ?? selection.metadata;
      setPhase('finalizing');
      recording.beginProcessing({
        kind: 'visual-retrieval',
        title: 'Validating visual result…',
        detail: 'Checking the retrieved video before it can replace the current result.',
      });
      let validatedResult: Awaited<ReturnType<typeof validateExistingVideo>>;
      try {
        validatedResult = await validateExistingVideo(
          new File([resultBlob], 'result.mp4', {
            type: mimeType || resultBlob.type || 'video/mp4',
          }),
          false,
          controller.signal,
          'server-approved-result',
        );
      } catch (error) {
        controller.signal.throwIfAborted();
        throw new Error(
          'The downloaded visual result did not meet the app-owned media requirements.',
          { cause: error },
        );
      }
      if (
        Math.abs(validatedResult.metadata.durationMs - baseMetadata.durationMs) > 500 ||
        validatedResult.metadata.width !== expectedResult.width ||
        validatedResult.metadata.height !== expectedResult.height ||
        Math.abs(validatedResult.metadata.durationMs - expectedResult.durationMs) > 1 ||
        validatedResult.metadata.width > validatedResult.metadata.height !==
          baseMetadata.width > baseMetadata.height
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
              setPendingVisual({ blob: resultBlob, mimeType, stepIndex, expectedResult });
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
          setPendingVisual({ blob: resultBlob, mimeType, stepIndex, expectedResult });
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
      setComparison('result');
      setPendingVisual(null);
      setRetryJob(null);
      setCompletedStepCount(stepIndex + 1);
      updateSubmissionOperation(null);
      const source = editBase ?? recording.original;
      if (!source) throw new Error('The immutable source video is unavailable.');
      return {
        blob: normalized.blob,
        mimeType: normalized.mimeType,
        label: `${operationForModel(step.modelId)}-${stepIndex + 1}`,
        source,
        metadata: {
          ...validatedResult.metadata,
          container: 'mp4',
          videoCodec: 'avc',
          audioCodec: selection.metadata.hasAudio ? 'aac' : null,
          sizeBytes: normalized.blob.size,
          hasAudio: selection.metadata.hasAudio,
        },
        generation,
      };
    },
    [
      editBase,
      editBaseMetadata,
      recording,
      selection,
      setComparison,
      setCompletedStepCount,
      setPendingVisual,
      setPhase,
      setRetryJob,
      steps,
      updateSubmissionOperation,
    ],
  );

  const jobInterruption = useCallback(
    (error: unknown, jobId: string, stepIndex: number, fallback: string): Error => {
      const terminalMessage =
        error instanceof ApiClientError ? terminalJobMessage(error.code) : null;
      if (terminalMessage) {
        setRetryJob(null);
        updateSubmissionOperation(null);
        return new Error(terminalMessage);
      }
      setRetryJob({ jobId, stepIndex });
      return new RetryExistingVideoJobError(acceptedJobInterruptionMessage(error, fallback));
    },
    [setRetryJob, updateSubmissionOperation],
  );

  const pollAndFinalize = useCallback(
    async (
      jobId: string,
      stepIndex: number,
      controller: AbortController,
      generation: number,
      initialStatus: VideoJobStatusResponse | null = null,
    ): Promise<FinalizedVisual | null> => {
      let current = initialStatus?.jobId === jobId ? initialStatus : null;
      while (!current || !['ready', 'failed', 'expired'].includes(current.status)) {
        controller.signal.throwIfAborted();
        if (current) {
          setStatus(current);
          setPhase(current.status === 'retrieving' ? 'retrieving' : 'processing');
          const currentStep = steps[stepIndex];
          recording.beginProcessing({
            kind: current.status === 'retrieving' ? 'visual-retrieval' : 'visual-generation',
            title:
              current.status === 'retrieving'
                ? 'Retrieving visual result…'
                : `Generating ${currentStep ? stepLabel(currentStep.modelId).toLowerCase() : 'visual edit'}…`,
            detail: 'Visual processing is running for the single accepted job.',
          });
          await waitForPoll(controller.signal, current.nextPollAfterMs ?? 1_500);
        }
        try {
          current = await fetchVideoJob(jobId, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) throw error;
          throw jobInterruption(
            error,
            jobId,
            stepIndex,
            'The status check was interrupted. Retry status without creating another visual-processing submission.',
          );
        }
        if (generation !== generationRef.current) return null;
        const operation = submissionOperationRef.current;
        if (operation?.jobId === jobId && operation.state === 'acceptance-unknown') {
          updateSubmissionOperation({ ...operation, state: 'accepted' });
        }
      }
      if (current.status !== 'ready') {
        setRetryJob(null);
        const currentStep = steps[stepIndex];
        const terminalFailureRelease = currentStep
          ? capabilityForModel(currentStep.modelId, videoProcessingCapabilities)
              .terminalFailureRelease
          : 'automatic';
        if (terminalFailureRelease === 'explicit-user') {
          retainedJobIdRef.current = jobId;
        } else {
          await releaseVideoJob(jobId).catch(() => undefined);
        }
        throw new Error(
          terminalJobMessage(current.error?.code) ??
            current.error?.message ??
            'The visual provider could not complete this request. The previous video is safe.',
        );
      }
      setPhase('retrieving');
      recording.beginProcessing({
        kind: 'visual-retrieval',
        title: 'Retrieving visual result…',
        detail: 'Downloading and validating the accepted visual result.',
      });
      let blob: Blob;
      try {
        blob = await downloadVideoJobResult(jobId, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw jobInterruption(
          error,
          jobId,
          stepIndex,
          'The result download was interrupted. Retry it without creating another visual-processing submission.',
        );
      }
      setRetryJob(null);
      setStatus(null);
      if (!current.result) {
        throw new Error('The accepted visual result metadata was unavailable.');
      }
      return finalizeVisual(
        blob,
        blob.type || current.result?.mimeType || 'video/mp4',
        stepIndex,
        controller,
        generation,
        current.result,
      );
    },
    [
      finalizeVisual,
      jobInterruption,
      recording,
      setPhase,
      setRetryJob,
      setStatus,
      steps,
      updateSubmissionOperation,
      videoProcessingCapabilities,
    ],
  );

  const applySelectedVoice = useCallback(
    async (
      videoArtifact: RecordingArtifact,
      selectedVoice: ExistingVideoVoiceSelection,
      metadata: ValidatedExistingVideo['metadata'],
      hasServerApprovedVisual: boolean,
    ): Promise<VoiceProcessingOutcome> => {
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
        setResultMetadata(metadata);
        setResultHasServerApprovedVisual(hasServerApprovedVisual);
        setComparison('result');
        setPhase('complete');
        setMessage(`${selectedVoice.voiceName} is ready on the generated result.`);
        return outcome;
      }
      if (outcome.status === 'error') {
        setPhase('error');
        setMessage(outcome.message);
      }
      return outcome;
    },
    [
      processing,
      setComparison,
      setMessage,
      setPhase,
      setResultHasServerApprovedVisual,
      setResultMetadata,
    ],
  );

  const completeVisualPlan = useCallback(() => {
    setPhase('complete');
    setMessage('Visual processing is complete. The result is ready to compare and download.');
  }, [setMessage, setPhase]);

  const completeVisualArtifact = useCallback(
    async (
      finalized: FinalizedVisual | null,
      selectedVoice: ExistingVideoVoiceSelection | null,
    ) => {
      if (!finalized) return;
      setResultMetadata(finalized.metadata);
      setResultHasServerApprovedVisual(true);
      if (!selectedVoice) {
        recording.completeVisualProcessing(
          finalized.blob,
          finalized.mimeType,
          finalized.label,
          finalized.source,
        );
        completeVisualPlan();
        return;
      }
      const stagedVisual = createProcessedRecordingArtifact(
        finalized.source,
        finalized.blob,
        finalized.mimeType,
        finalized.label,
      );
      try {
        const outcome = await applySelectedVoice(
          stagedVisual,
          selectedVoice,
          finalized.metadata,
          true,
        );
        if (outcome.status === 'ready' || finalized.generation !== generationRef.current) return;
        recording.completeVisualProcessing(
          finalized.blob,
          finalized.mimeType,
          finalized.label,
          finalized.source,
        );
        setComparison('result');
        if (outcome.status === 'canceled') {
          setPhase('complete');
          setMessage('Voice processing was canceled. The healthy visual result is ready.');
        }
      } finally {
        revokeArtifactUrl(stagedVisual, 'replacement');
      }
    },
    [
      applySelectedVoice,
      completeVisualPlan,
      recording,
      setComparison,
      setMessage,
      setPhase,
      setResultHasServerApprovedVisual,
      setResultMetadata,
    ],
  );

  const submitStep = useCallback(
    async (stepIndex: number) => {
      const baseArtifact = editBase ?? recording.original;
      const source = baseArtifact?.media;
      const step = steps[stepIndex];
      if (!selection || !source || !step || submissionOperationRef.current !== null) return;
      const operation = operationForModel(step.modelId);
      const capability = capabilityForModel(step.modelId, videoProcessingCapabilities);
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
        detail: 'Preparing the selected video and recipe for visual processing.',
      });
      const recipe: VideoTransformRecipe = {
        operation,
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
        setStatus(submitted);
        const visualArtifact = await pollAndFinalize(
          jobId,
          stepIndex,
          controller,
          generation,
          submitted,
        );
        await completeVisualArtifact(visualArtifact, selectedVoice);
      } catch (error) {
        if (submissionRequestStarted && !submissionAccepted) {
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
      setStatus,
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
    if (!selection || phase !== 'complete') return;
    clearOperation();
    recording.clearVisualProcessing();
    setStep(null);
    setPhase('ready');
    setMessage(selection.audioUnavailableReason);
    setCompletedStepCount(0);
    setComparison('original');
    setEditBase(recording.original);
    setEditBaseMetadata(selection.metadata);
    setEditBaseProvenance('source');
    setResultMetadata(null);
    setResultHasServerApprovedVisual(false);
    setVoiceSelection(null);
  }, [
    clearOperation,
    phase,
    recording,
    selection,
    setComparison,
    setCompletedStepCount,
    setEditBase,
    setEditBaseMetadata,
    setEditBaseProvenance,
    setMessage,
    setPhase,
    setResultHasServerApprovedVisual,
    setResultMetadata,
    setStep,
    setVoiceSelection,
  ]);

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
      downloaded: recording.downloaded,
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
      downloadResult: recording.markDownloaded,
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
