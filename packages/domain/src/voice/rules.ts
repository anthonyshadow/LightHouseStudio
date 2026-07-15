import type { SafeError } from '../errors/safe-error';
import type { VoiceEffectSelection, VoiceProcessingState } from './types';

export const createVoiceProcessingState = <TArtifact>(
  original: TArtifact,
): VoiceProcessingState<TArtifact> => ({
  status: 'idle',
  original,
  processed: null,
  selection: { kind: 'none' },
});

export const restoreOriginalVoice = <TArtifact>(
  state: VoiceProcessingState<TArtifact>,
): VoiceProcessingState<TArtifact> => ({
  status: 'idle',
  original: state.original,
  processed: null,
  selection: { kind: 'none' },
});

export const beginVoiceProcessing = <TArtifact>(
  state: VoiceProcessingState<TArtifact>,
  selection: VoiceEffectSelection,
  operationId: string,
): VoiceProcessingState<TArtifact> => {
  if (selection.kind === 'none') return restoreOriginalVoice(state);
  return {
    status: 'processing',
    original: state.original,
    processed: state.processed,
    selection,
    operationId,
  };
};

export const completeVoiceProcessing = <TArtifact>(
  state: VoiceProcessingState<TArtifact>,
  operationId: string,
  processed: TArtifact,
): VoiceProcessingState<TArtifact> => {
  if (state.status !== 'processing' || state.operationId !== operationId) return state;
  return {
    status: 'ready',
    original: state.original,
    processed,
    selection: state.selection,
  };
};

export const failVoiceProcessing = <TArtifact>(
  state: VoiceProcessingState<TArtifact>,
  operationId: string,
  error: SafeError,
): VoiceProcessingState<TArtifact> => {
  if (state.status !== 'processing' || state.operationId !== operationId) return state;
  return {
    status: 'error',
    original: state.original,
    processed: state.processed,
    selection: state.selection,
    error,
  };
};

export const selectPlayableArtifact = <TArtifact>(
  state: VoiceProcessingState<TArtifact>,
): TArtifact => state.processed ?? state.original;

export const isPlaybackLocked = <TArtifact>(state: VoiceProcessingState<TArtifact>): boolean =>
  state.status === 'processing';
