import type {
  RecordingArtifact,
  RecordingAudioSidecar,
  RecordingProcessingOperation,
  VoiceProcessingState,
} from '../../features/recording/types';
import { IDLE_AUDIO_SIDECAR } from './recordingArtifacts';

export interface RecordingArtifactState {
  readonly original: RecordingArtifact | null;
  readonly visual: RecordingArtifact | null;
  readonly processed: RecordingArtifact | null;
  readonly sidecar: RecordingAudioSidecar;
  readonly recordingError: string | null;
  readonly processingState: VoiceProcessingState;
  readonly processingOperation: RecordingProcessingOperation | null;
  readonly processingError: string | null;
  readonly downloaded: boolean;
}

export type RecordingArtifactAction =
  | Readonly<{
      type: 'publish-original';
      artifact: RecordingArtifact;
      sidecar: RecordingAudioSidecar;
    }>
  | Readonly<{ type: 'discard' }>
  | Readonly<{ type: 'complete-visual'; artifact: RecordingArtifact }>
  | Readonly<{
      type: 'complete-processing';
      artifact: RecordingArtifact;
      replaceVisual: boolean;
    }>
  | Readonly<{ type: 'restore-original' }>
  | Readonly<{ type: 'clear-visual' }>
  | Readonly<{ type: 'set-sidecar'; sidecar: RecordingAudioSidecar }>
  | Readonly<{ type: 'set-recording-error'; message: string | null }>
  | Readonly<{ type: 'mark-downloaded' }>
  | Readonly<{ type: 'begin-processing'; operation: RecordingProcessingOperation }>
  | Readonly<{ type: 'cancel-processing' }>
  | Readonly<{ type: 'fail-processing'; message: string }>
  | Readonly<{
      type: 'repair-object-url';
      slot: 'original' | 'visual' | 'processed';
      artifact: RecordingArtifact;
    }>;

export const initialRecordingArtifactState: RecordingArtifactState = {
  original: null,
  visual: null,
  processed: null,
  sidecar: IDLE_AUDIO_SIDECAR,
  recordingError: null,
  processingState: 'idle',
  processingOperation: null,
  processingError: null,
  downloaded: false,
};

const idleProcessing = {
  processingState: 'idle' as const,
  processingOperation: null,
  processingError: null,
  downloaded: false,
};

export const recordingArtifactReducer = (
  state: RecordingArtifactState,
  action: RecordingArtifactAction,
): RecordingArtifactState => {
  switch (action.type) {
    case 'publish-original':
      return {
        ...initialRecordingArtifactState,
        original: action.artifact,
        sidecar: action.sidecar,
      };
    case 'discard':
      return { ...initialRecordingArtifactState };
    case 'complete-visual':
      return {
        ...state,
        visual: action.artifact,
        processed: null,
        processingState: 'ready',
        processingOperation: null,
        processingError: null,
        downloaded: false,
      };
    case 'complete-processing':
      return {
        ...state,
        ...(action.replaceVisual ? { visual: null } : {}),
        processed: action.artifact,
        processingState: 'ready',
        processingOperation: null,
        processingError: null,
        downloaded: false,
      };
    case 'restore-original':
      return { ...state, processed: null, ...idleProcessing };
    case 'clear-visual':
      return { ...state, visual: null, processed: null, ...idleProcessing };
    case 'set-sidecar':
      return { ...state, sidecar: action.sidecar };
    case 'set-recording-error':
      return { ...state, recordingError: action.message };
    case 'mark-downloaded':
      return state.downloaded ? state : { ...state, downloaded: true };
    case 'begin-processing':
      return {
        ...state,
        processingState: 'processing',
        processingOperation: action.operation,
        processingError: null,
      };
    case 'cancel-processing':
      return {
        ...state,
        processingState: state.processed ? 'ready' : 'idle',
        processingOperation: null,
        processingError: null,
      };
    case 'fail-processing':
      return {
        ...state,
        processingState: 'error',
        processingOperation: null,
        processingError: action.message,
      };
    case 'repair-object-url':
      return { ...state, [action.slot]: action.artifact };
  }
};
