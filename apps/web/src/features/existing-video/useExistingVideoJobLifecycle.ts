import type { QueryClient } from '@tanstack/react-query';
import type {
  CapabilitiesResponse,
  InspectedVideo,
  VideoJobStatusResponse,
} from '@studio/contracts';
import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { downloadVideoJobResult, releaseVideoJob } from '../../adapters/api-client/videoJobsApi';
import type { RecordingController } from '../recording/types';
import {
  isTerminalVideoJobStatus,
  pollVideoJobStatus,
  removeVideoJobStatus,
} from './videoJobStatusQuery';
import {
  acceptedJobInterruptionMessage,
  capabilityForExistingVideoStep,
  RetryExistingVideoJobError,
  stepLabel,
  terminalJobMessage,
} from './existingVideoWorkflowPolicy';
import type {
  ExistingVideoStep,
  ExistingVideoSubmissionOperation,
  ExistingVideoWorkflowPhase,
  FinalizedVisual,
  RetryJob,
} from './existingVideoWorkflowTypes';

export const useRetainedVideoJob = (queryClient: QueryClient) => {
  const retainedJobIdRef = useRef<string | null>(null);

  const releaseRetainedJobAndWait = useCallback(async () => {
    const jobId = retainedJobIdRef.current;
    if (!jobId) return;
    retainedJobIdRef.current = null;
    await releaseVideoJob(jobId).catch(() => undefined);
    removeVideoJobStatus(queryClient, jobId);
  }, [queryClient]);

  const releaseRetainedJob = useCallback(() => {
    void releaseRetainedJobAndWait();
  }, [releaseRetainedJobAndWait]);

  return { retainedJobIdRef, releaseRetainedJobAndWait, releaseRetainedJob };
};

interface ExistingVideoJobLifecycleOptions {
  readonly queryClient: QueryClient;
  readonly recording: RecordingController;
  readonly steps: readonly ExistingVideoStep[];
  readonly videoProcessingCapabilities: CapabilitiesResponse['videoProcessing'];
  readonly generationRef: RefObject<number>;
  readonly retainedJobIdRef: RefObject<string | null>;
  readonly submissionOperationRef: RefObject<ExistingVideoSubmissionOperation | null>;
  readonly updateSubmissionOperation: (operation: ExistingVideoSubmissionOperation | null) => void;
  readonly finalizeVisual: (
    resultBlob: Blob,
    mimeType: string,
    stepIndex: number,
    controller: AbortController,
    generation: number,
    expectedResult: InspectedVideo,
  ) => Promise<FinalizedVisual | null>;
  readonly setPhase: Dispatch<SetStateAction<ExistingVideoWorkflowPhase>>;
  readonly setRetryJob: Dispatch<SetStateAction<RetryJob | null>>;
  readonly setStatus: Dispatch<SetStateAction<VideoJobStatusResponse | null>>;
}

export const useExistingVideoJobLifecycle = ({
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
}: ExistingVideoJobLifecycleOptions) => {
  const jobInterruption = useCallback(
    (error: unknown, jobId: string, stepIndex: number, fallback: string): Error => {
      const terminalMessage =
        error instanceof ApiClientError ? terminalJobMessage(error.code) : null;
      if (terminalMessage) {
        removeVideoJobStatus(queryClient, jobId);
        setRetryJob(null);
        updateSubmissionOperation(null);
        return new Error(terminalMessage);
      }
      setRetryJob({ jobId, stepIndex });
      return new RetryExistingVideoJobError(acceptedJobInterruptionMessage(error, fallback));
    },
    [queryClient, setRetryJob, updateSubmissionOperation],
  );

  const pollAndFinalize = useCallback(
    async (
      jobId: string,
      stepIndex: number,
      controller: AbortController,
      generation: number,
      initialStatus: VideoJobStatusResponse | null = null,
    ): Promise<FinalizedVisual | null> => {
      let current: VideoJobStatusResponse;
      try {
        current = await pollVideoJobStatus({
          queryClient,
          jobId,
          initialStatus,
          signal: controller.signal,
          onStatus: (nextStatus) => {
            if (generation !== generationRef.current) return;
            setStatus(nextStatus);
            const operation = submissionOperationRef.current;
            if (operation?.jobId === jobId && operation.state === 'acceptance-unknown') {
              updateSubmissionOperation({ ...operation, state: 'accepted' });
            }
            if (isTerminalVideoJobStatus(nextStatus)) return;
            setPhase(nextStatus.status === 'retrieving' ? 'retrieving' : 'processing');
            const currentStep = steps[stepIndex];
            recording.beginProcessing({
              kind: nextStatus.status === 'retrieving' ? 'visual-retrieval' : 'visual-generation',
              title:
                nextStatus.status === 'retrieving'
                  ? 'Retrieving visual result…'
                  : `Generating ${currentStep ? stepLabel(currentStep.modelId).toLowerCase() : 'visual edit'}…`,
              detail: 'Visual processing is running for the single accepted job.',
            });
          },
        });
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
      if (current.status !== 'ready') {
        setRetryJob(null);
        const currentStep = steps[stepIndex];
        const terminalFailureRelease = currentStep
          ? capabilityForExistingVideoStep(currentStep, videoProcessingCapabilities)
              .terminalFailureRelease
          : 'automatic';
        if (terminalFailureRelease === 'explicit-user') {
          retainedJobIdRef.current = jobId;
        } else {
          await releaseVideoJob(jobId).catch(() => undefined);
          removeVideoJobStatus(queryClient, jobId);
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
      removeVideoJobStatus(queryClient, jobId);
      return finalizeVisual(
        blob,
        blob.type || current.result.mimeType || 'video/mp4',
        stepIndex,
        controller,
        generation,
        current.result,
      );
    },
    [
      finalizeVisual,
      generationRef,
      jobInterruption,
      queryClient,
      recording,
      retainedJobIdRef,
      setPhase,
      setRetryJob,
      setStatus,
      steps,
      submissionOperationRef,
      updateSubmissionOperation,
      videoProcessingCapabilities,
    ],
  );

  return { pollAndFinalize };
};
