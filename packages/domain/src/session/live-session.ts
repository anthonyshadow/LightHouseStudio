import type { SafeError } from '../errors/safe-error';
import type { SessionModeId } from './modes';

export type SessionLifecycleStatus =
  | 'idle'
  | 'requesting-media'
  | 'ready'
  | 'requesting-token'
  | 'connecting'
  | 'connected'
  | 'generating'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface MediaTrackDescriptor {
  readonly id: string;
  readonly kind: 'audio' | 'video';
  readonly live: boolean;
}

export interface MediaStreamDescriptor {
  readonly id: string;
  readonly tracks: readonly MediaTrackDescriptor[];
}

export interface RecordableStreamMetadata {
  readonly videoSource: 'local-camera' | 'model-output';
  readonly audioSource: 'local-microphone' | 'model-output' | 'none';
  readonly hasLiveVideo: boolean;
  readonly hasLiveAudio: boolean;
}

export interface LiveSession {
  readonly activeModeId: SessionModeId;
  readonly status: SessionLifecycleStatus;
  readonly error: SafeError | null;
  readonly localInput: MediaStreamDescriptor | null;
  readonly modelOutput: MediaStreamDescriptor | null;
  readonly recordable: RecordableStreamMetadata | null;
  readonly isApplying: boolean;
  readonly elapsedMs: number;
}

export const canApplyRealtimeChanges = (
  session: Pick<LiveSession, 'activeModeId' | 'status' | 'isApplying'>,
): boolean =>
  session.activeModeId !== 'local' &&
  (session.status === 'connected' || session.status === 'generating') &&
  !session.isApplying;

export const canSwitchMode = (
  status: SessionLifecycleStatus,
  recording: boolean,
  hasLiveLocalMedia = false,
): boolean =>
  !recording &&
  !hasLiveLocalMedia &&
  (status === 'idle' || status === 'disconnected' || status === 'error');
