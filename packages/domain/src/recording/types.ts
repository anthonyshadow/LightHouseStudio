import type { SafeError } from '../errors/safe-error';
import type { SessionModeId } from '../session';
import type { VideoTransformOperationId } from '../video-processing/types';

export type RecordingLifecycleStatus =
  'idle' | 'ready' | 'recording' | 'stopping' | 'recorded' | 'error';

export type RecordingDurationStatus = 'active' | 'warning' | 'limit-reached';

export type RecordingDurationTiming = Readonly<{
  status: RecordingDurationStatus;
  maximumSeconds: number;
  warningThresholdSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  warning: boolean;
}>;

export interface RecordingArtifact<TMedia = unknown> {
  readonly id: string;
  /** App-owned, human-readable identity. Optional for restored legacy artifacts. */
  readonly name?: string;
  /** Creation time for this exact artifact revision. Optional for legacy artifacts. */
  readonly createdAt?: string;
  /** Describes how this artifact entered the current temporary take pipeline. */
  readonly kind?: 'uploaded' | 'recorded' | 'edited' | 'visual' | 'voice';
  /**
   * Which visual operation produced this artifact, when `kind` is `'visual'`.
   *
   * `kind` alone says only that a visual tool made these bytes, and Character Swap and Virtual
   * Try-On are different tools with different results. Anything that has to name the work — a save
   * recording its origin, a label describing it — reads this rather than assuming the one it
   * happens to see more often.
   */
  readonly visualOperation?: VideoTransformOperationId;
  /** The artifact used as input for this revision, when it was generated. */
  readonly parentArtifactId?: string | null;
  /** Parent saved-character identity used for this exact artifact, when applicable. */
  readonly characterName?: string | null;
  /** Exact saved-character variant used; display-only and never the gallery filter key. */
  readonly characterVariantName?: string | null;
  /** Browser adapters may specialize this generic as Blob; the domain never inspects it. */
  readonly media: TMedia;
  readonly objectUrl: string;
  readonly mimeType: string;
  readonly filename: string;
  readonly sourceModeId: SessionModeId;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly sizeBytes: number;
}

export type RecordingLifecycle<TMedia = unknown> =
  | { readonly status: 'idle' }
  | { readonly status: 'ready' }
  | { readonly status: 'recording'; readonly startedAt: string }
  | { readonly status: 'stopping'; readonly startedAt: string }
  | { readonly status: 'recorded'; readonly artifact: RecordingArtifact<TMedia> }
  | { readonly status: 'error'; readonly error: SafeError };

export interface RecordingSourceDescriptor {
  readonly modeId: SessionModeId;
  readonly videoSource: 'local-camera' | 'model-output';
  readonly audioSource: 'local-microphone' | 'model-output' | 'none';
  readonly hasLiveVideo: true;
  readonly hasLiveAudio: boolean;
}

export interface RecordingSourceAvailability {
  readonly modeId: SessionModeId;
  readonly localVideoLive: boolean;
  readonly localAudioLive: boolean;
  readonly modelVideoLive: boolean;
  readonly modelAudioLive: boolean;
}

export type AudioSidecar<TAudio = unknown> =
  | { readonly status: 'unavailable' }
  | { readonly status: 'capturing'; readonly attemptId: string }
  | {
      readonly status: 'ready';
      readonly attemptId: string;
      readonly audio: TAudio;
      readonly sizeBytes: number;
    }
  | { readonly status: 'error'; readonly attemptId: string; readonly error: SafeError };

export type RecordingReleaseReason =
  | 'discard'
  | 'replacement'
  | 'unmount'
  | 'session-reset'
  | 'model-reset'
  | 'model-disconnect'
  | 'prompt-reset'
  | 'stream-change';
