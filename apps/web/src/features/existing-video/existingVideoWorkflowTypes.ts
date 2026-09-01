import type {
  InspectedVideo,
  VideoCharacterSwapProviderId,
  VideoJobStatusResponse,
  VideoOutputResolution,
  VideoTransformModelId,
  VideoTransformOperationId,
} from '@studio/contracts';
import type { RecordingArtifact, VideoCharacterAttribution } from '../recording/types';
import type { LocalVoiceEffectId } from '../voice-effects/types';
import type { ValidatedExistingVideo } from './videoValidation';

export type ExistingVideoStep = Readonly<{
  id: string;
  modelId: VideoTransformModelId;
  savedRecipeId: string | null;
  prompt: string;
  enhancePrompt: boolean;
  referenceImage: File | null;
  inputKind: 'character' | 'saved-outfit' | 'reference-image' | 'prompt';
  provider?: VideoCharacterSwapProviderId;
  outputResolution?: VideoOutputResolution;
  characterName?: string | null;
  characterVariantName?: string | null;
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

export type ExistingVideoSubmissionOperation = Readonly<{
  jobId: string;
  stepIndex: number;
  state: 'submitting' | 'acceptance-unknown' | 'accepted';
}>;

export type FinalizedVisual = Readonly<{
  blob: Blob;
  mimeType: string;
  label: string;
  /** The tool that produced these bytes, kept beside the label so a save can name it exactly. */
  operation: VideoTransformOperationId;
  source: RecordingArtifact;
  metadata: ValidatedExistingVideo['metadata'];
  generation: number;
  characterAttribution: VideoCharacterAttribution | null;
}>;

export type ExistingVideoBaseProvenance = 'source' | 'server-approved-result';

export type PendingVisual = Readonly<{
  blob: Blob;
  mimeType: string;
  stepIndex: number;
  expectedResult: InspectedVideo;
}>;

export type RetryJob = Readonly<{ jobId: string; stepIndex: number }>;

export interface ExistingVideoWorkflowState {
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
  /**
   * A Voice chosen before any source exists — for example from the Assets Voices library. It
   * survives `source-ready`, which resets the rest of the workflow, and is promoted to
   * `voiceSelection` at that point.
   */
  pendingVoiceSelection: ExistingVideoVoiceSelection | null;
  elapsedSeconds: number;
}
