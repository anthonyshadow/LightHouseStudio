import type { InspectedVideo } from '@studio/contracts';
import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import {
  replaceRecordingAudio,
  stripRecordingAudio,
} from '../../adapters/media-processing/replaceAudioTrack';
import { transcodeRecordingToMp4 } from '../../adapters/media-processing/transcodeRecording';
import type { RecordingArtifact, RecordingController } from '../recording/types';
import { validateExistingVideo, type ValidatedExistingVideo } from './videoValidation';
import { operationForModel } from './existingVideoWorkflowPolicy';
import type {
  ExistingVideoStep,
  ExistingVideoSubmissionOperation,
  ExistingVideoWorkflowPhase,
  FinalizedVisual,
  PendingVisual,
  RetryJob,
} from './existingVideoWorkflowTypes';

interface ExistingVideoFinalizationOptions {
  readonly recording: RecordingController;
  readonly selection: ValidatedExistingVideo | null;
  readonly editBase: RecordingArtifact | null;
  readonly editBaseMetadata: ValidatedExistingVideo['metadata'] | null;
  readonly steps: readonly ExistingVideoStep[];
  readonly generationRef: RefObject<number>;
  readonly updateSubmissionOperation: (operation: ExistingVideoSubmissionOperation | null) => void;
  readonly setPhase: Dispatch<SetStateAction<ExistingVideoWorkflowPhase>>;
  readonly setComparison: Dispatch<SetStateAction<'original' | 'result'>>;
  readonly setPendingVisual: Dispatch<SetStateAction<PendingVisual | null>>;
  readonly setRetryJob: Dispatch<SetStateAction<RetryJob | null>>;
  readonly setCompletedStepCount: Dispatch<SetStateAction<number>>;
}

export const useExistingVideoFinalization = ({
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
}: ExistingVideoFinalizationOptions) =>
  useCallback(
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
        characterAttribution:
          step.modelId === 'lucy-latest' && step.characterName
            ? {
                characterName: step.characterName,
                characterVariantName: step.characterVariantName ?? null,
              }
            : null,
      };
    },
    [
      editBase,
      editBaseMetadata,
      generationRef,
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
