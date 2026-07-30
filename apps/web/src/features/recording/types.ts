import type {
  RecordingArtifact as DomainRecordingArtifact,
  RecordingLifecycleStatus,
} from '@studio/domain';
import type { StudioMode } from '../../application/types';
import type { CameraPermissionState } from '../../adapters/browser-media/browserMedia';
import type {
  CaptureDeviceOption,
  CapturePreferences,
  CaptureStreamSettings,
  LocalCaptureProfileId,
} from '../../application/types';

export type {
  CaptureDeviceOption,
  CapturePreferences,
  CaptureStreamSettings,
  LocalCaptureProfileId,
} from '../../application/types';

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

/**
 * Truthful, session-only details captured from the selected live tracks when a
 * take starts. Optional measurements are omitted when a browser cannot report
 * an actual value; this object is never persisted or updated after capture.
 */
export type RecordedTakeMetadata = Readonly<{
  kind?: 'recorded';
  mode: StudioMode;
  startedAt: string;
  videoSource: RecordingSource['videoSource'];
  audioSource: RecordingSource['audioSource'];
  width?: number;
  height?: number;
  frameRate?: number;
  videoSourceLabel?: string;
  audioSourceLabel?: string;
}>;

export type UploadedTakeMetadata = Readonly<{
  kind: 'uploaded';
  mode: 'local';
  selectedAt: string;
  displayName: string;
  container: 'mp4' | 'quicktime' | 'webm';
  videoCodec: 'avc' | 'vp8';
  audioCodec: string | null;
  durationMs: number;
  width: number;
  height: number;
  sizeBytes: number;
  hasAudio: boolean;
}>;

export type TakeMetadata = RecordedTakeMetadata | UploadedTakeMetadata;

/**
 * Serializable fields required to restore an original take from browser-local
 * storage. The Blob and its runtime-only object URL are deliberately excluded.
 */
export type PersistedRecordingArtifactMetadata = Readonly<{
  id: string;
  mimeType: string;
  filename: string;
  sourceModeId: StudioMode;
  startedAt: string;
  durationMs: number;
}>;

export type PersistedRecordingAudioSidecar = Readonly<{
  blob: Blob;
  mimeType: string;
}>;

export type RestorePersistedOriginalInput = Readonly<{
  blob: Blob;
  artifactMetadata: PersistedRecordingArtifactMetadata;
  takeMetadata?: TakeMetadata | null;
  audioSidecar?: PersistedRecordingAudioSidecar | null;
}>;

export type CaptureDeviceState = 'idle' | 'loading' | 'ready' | 'error';

export type CapturePreferencesController = {
  draft: CapturePreferences;
  applied: CapturePreferences;
  effectiveApplied: CapturePreferences;
  cameraDevices: CaptureDeviceOption[];
  microphoneDevices: CaptureDeviceOption[];
  supportedProfiles: LocalCaptureProfileId[];
  devicesState: CaptureDeviceState;
  cameraPermissionState: CameraPermissionState;
  deviceError: string | null;
  videoFallbackNotice: string | null;
  applyError: string | null;
  applying: boolean;
  hasPendingChanges: boolean;
  actualSettings: CaptureStreamSettings;
  refreshDevices: () => Promise<void>;
  updateVideoDeviceId: (deviceId: string | null) => void;
  updateAudioDeviceId: (deviceId: string | null) => void;
  updateProfile: (profile: LocalCaptureProfileId) => void;
  reportVideoDeviceUnavailable: (deviceId: string) => void;
  dismissVideoFallbackNotice: () => void;
  apply: () => Promise<boolean>;
  discardPending: () => void;
};

export type RecordingController = {
  lifecycle: RecordingLifecycle;
  activeSource: RecordingSource | null;
  metadata: TakeMetadata | null;
  original: RecordingArtifact | null;
  visual: RecordingArtifact | null;
  processed: RecordingArtifact | null;
  presented: RecordingArtifact | null;
  sidecar: RecordingAudioSidecar;
  recordingError: string | null;
  processingState: VoiceProcessingState;
  processingError: string | null;
  elapsedSeconds: number;
  downloaded: boolean;
  start: (source: RecordingSource, mode: StudioMode) => Promise<void>;
  stop: () => Promise<RecordingArtifact | null>;
  restorePersistedOriginal: (input: RestorePersistedOriginalInput) => RecordingArtifact;
  discard: () => void;
  markDownloaded: () => void;
  beginProcessing: () => void;
  cancelProcessing: () => void;
  completeVisualProcessing: (blob: Blob, mimeType: string, label: string) => RecordingArtifact;
  completeProcessing: (blob: Blob, mimeType: string, label: string) => RecordingArtifact;
  failProcessing: (message: string) => void;
  restoreOriginal: () => void;
};

export type AutomaticRecordingStopReason =
  | 'maximum-duration'
  | 'source-ended'
  | 'recorder-error'
  | 'recorder-stopped'
  | 'finalization-timeout';

export type AutomaticRecordingStopEvent = {
  mode: StudioMode;
  reason: AutomaticRecordingStopReason;
  artifactId?: string;
};

export type UseRecordingOptions = {
  onAutomaticStop?: (event: AutomaticRecordingStopEvent) => void;
};
