import type {
  RecordingArtifact as DomainRecordingArtifact,
  RecordingLifecycleStatus,
} from '@studio/domain';
import type { StudioMode } from '../../application/types';

export type RecordingLifecycle = RecordingLifecycleStatus;

export type RecordingArtifact = DomainRecordingArtifact<Blob>;

export type RecordingAudioSidecar = {
  state: 'unavailable' | 'recording' | 'ready' | 'error';
  blob: Blob | null;
  mimeType: string | null;
  error: string | null;
};

export type VoiceProcessingState = 'idle' | 'processing' | 'ready' | 'error';

export type RecordingSource = {
  stream: MediaStream;
  videoSource: 'local' | 'transformed';
  audioSource: 'provider' | 'microphone' | 'none';
};

export type RecordingController = {
  lifecycle: RecordingLifecycle;
  activeSource: RecordingSource | null;
  original: RecordingArtifact | null;
  processed: RecordingArtifact | null;
  presented: RecordingArtifact | null;
  sidecar: RecordingAudioSidecar;
  processingState: VoiceProcessingState;
  processingError: string | null;
  elapsedSeconds: number;
  downloaded: boolean;
  start(source: RecordingSource, mode: StudioMode): Promise<void>;
  stop(): Promise<RecordingArtifact | null>;
  discard(): void;
  markDownloaded(): void;
  beginProcessing(): void;
  cancelProcessing(): void;
  completeProcessing(blob: Blob, mimeType: string, label: string): RecordingArtifact;
  failProcessing(message: string): void;
  restoreOriginal(): void;
};

export type AutomaticRecordingStopReason =
  'source-ended' | 'recorder-error' | 'recorder-stopped' | 'finalization-timeout';

export type AutomaticRecordingStopEvent = {
  mode: StudioMode;
  reason: AutomaticRecordingStopReason;
};

export type UseRecordingOptions = {
  onAutomaticStop?(event: AutomaticRecordingStopEvent): void;
};
