import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { createProcessedRecordingArtifact } from '../../orchestration/recording/recordingArtifacts';
import { revokeArtifactUrl } from '../recording/recordingHelpers';
import type { RecordingController } from '../recording/types';
import type { VoiceProcessingController, VoiceProcessingOutcome } from '../voice-effects/types';
import type { ValidatedExistingVideo } from './videoValidation';
import type {
  ExistingVideoVoiceSelection,
  ExistingVideoWorkflowPhase,
  FinalizedVisual,
} from './existingVideoWorkflowTypes';

interface ExistingVideoVoicePipelineOptions {
  readonly recording: RecordingController;
  readonly processing: VoiceProcessingController;
  readonly generationRef: RefObject<number>;
  readonly setPhase: Dispatch<SetStateAction<ExistingVideoWorkflowPhase>>;
  readonly setMessage: Dispatch<SetStateAction<string | null>>;
  readonly setComparison: Dispatch<SetStateAction<'original' | 'result'>>;
  readonly setResultMetadata: Dispatch<SetStateAction<ValidatedExistingVideo['metadata'] | null>>;
  readonly setResultHasServerApprovedVisual: Dispatch<SetStateAction<boolean>>;
}

export const useExistingVideoVoicePipeline = ({
  recording,
  processing,
  generationRef,
  setPhase,
  setMessage,
  setComparison,
  setResultMetadata,
  setResultHasServerApprovedVisual,
}: ExistingVideoVoicePipelineOptions) => {
  const applySelectedVoice = useCallback(
    async (
      videoArtifact: NonNullable<RecordingController['original']>,
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
    setMessage('Visual processing is complete. The result is ready to compare and save.');
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
          finalized.characterAttribution,
        );
        completeVisualPlan();
        return;
      }
      const stagedVisual = createProcessedRecordingArtifact(
        finalized.source,
        finalized.blob,
        finalized.mimeType,
        finalized.label,
        finalized.characterAttribution,
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
          finalized.characterAttribution,
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
      generationRef,
      recording,
      setComparison,
      setMessage,
      setPhase,
      setResultHasServerApprovedVisual,
      setResultMetadata,
    ],
  );

  return { applySelectedVoice, completeVisualArtifact };
};
