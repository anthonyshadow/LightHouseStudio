import type { Dispatch, SetStateAction } from 'react';
import type { RecordingArtifact } from '../recording/types';
import type { ValidatedExistingVideo } from './videoValidation';
import type { ExistingVideoWorkflowState } from './existingVideoWorkflowTypes';

type StateUpdateAction = {
  [Key in keyof ExistingVideoWorkflowState]: Readonly<{
    type: 'update';
    key: Key;
    value: SetStateAction<ExistingVideoWorkflowState[Key]>;
  }>;
}[keyof ExistingVideoWorkflowState];

export type ExistingVideoWorkflowStateAction =
  | StateUpdateAction
  | Readonly<{ type: 'clear-operation' }>
  | Readonly<{ type: 'reset' }>
  | Readonly<{
      type: 'source-ready';
      selection: ValidatedExistingVideo;
      editBase: RecordingArtifact;
    }>
  | Readonly<{
      type: 'start-over';
      editBase: RecordingArtifact;
      metadata: ValidatedExistingVideo['metadata'];
      message: string | null;
    }>;

export const initialExistingVideoWorkflowState: ExistingVideoWorkflowState = {
  selection: null,
  step: null,
  phase: 'empty',
  message: null,
  status: null,
  completedStepCount: 0,
  submissionOperation: null,
  pendingVisual: null,
  retryJob: null,
  comparison: 'result',
  editBase: null,
  editBaseMetadata: null,
  editBaseProvenance: 'source',
  resultMetadata: null,
  resultHasServerApprovedVisual: false,
  voiceSelection: null,
  pendingVoiceSelection: null,
  elapsedSeconds: 0,
};

export const existingVideoWorkflowReducer = (
  state: ExistingVideoWorkflowState,
  action: ExistingVideoWorkflowStateAction,
): ExistingVideoWorkflowState => {
  switch (action.type) {
    case 'clear-operation':
      return {
        ...state,
        elapsedSeconds: 0,
        status: null,
        submissionOperation: null,
        pendingVisual: null,
        retryJob: null,
      };
    case 'reset':
      return initialExistingVideoWorkflowState;
    case 'source-ready':
      return {
        ...initialExistingVideoWorkflowState,
        selection: action.selection,
        editBase: action.editBase,
        editBaseMetadata: action.selection.metadata,
        phase: 'ready',
        message: action.selection.audioUnavailableReason,
        comparison: 'original',
        voiceSelection: state.pendingVoiceSelection,
      };
    case 'start-over':
      return {
        ...state,
        step: null,
        phase: 'ready',
        message: action.message,
        completedStepCount: 0,
        comparison: 'original',
        editBase: action.editBase,
        editBaseMetadata: action.metadata,
        editBaseProvenance: 'source',
        resultMetadata: null,
        resultHasServerApprovedVisual: false,
        voiceSelection: null,
      };
    case 'update': {
      const current = state[action.key];
      const next =
        typeof action.value === 'function'
          ? (action.value as (value: typeof current) => typeof current)(current)
          : action.value;
      return Object.is(current, next) ? state : { ...state, [action.key]: next };
    }
  }
};

const stateSetter =
  <Key extends keyof ExistingVideoWorkflowState>(
    dispatch: Dispatch<ExistingVideoWorkflowStateAction>,
    key: Key,
  ): Dispatch<SetStateAction<ExistingVideoWorkflowState[Key]>> =>
  (value) =>
    dispatch({ type: 'update', key, value } as StateUpdateAction);

export const createWorkflowStateSetters = (
  dispatch: Dispatch<ExistingVideoWorkflowStateAction>,
) => ({
  setStep: stateSetter(dispatch, 'step'),
  setPhase: stateSetter(dispatch, 'phase'),
  setMessage: stateSetter(dispatch, 'message'),
  setStatus: stateSetter(dispatch, 'status'),
  setCompletedStepCount: stateSetter(dispatch, 'completedStepCount'),
  setSubmissionOperation: stateSetter(dispatch, 'submissionOperation'),
  setPendingVisual: stateSetter(dispatch, 'pendingVisual'),
  setRetryJob: stateSetter(dispatch, 'retryJob'),
  setComparison: stateSetter(dispatch, 'comparison'),
  setEditBase: stateSetter(dispatch, 'editBase'),
  setEditBaseMetadata: stateSetter(dispatch, 'editBaseMetadata'),
  setEditBaseProvenance: stateSetter(dispatch, 'editBaseProvenance'),
  setResultMetadata: stateSetter(dispatch, 'resultMetadata'),
  setResultHasServerApprovedVisual: stateSetter(dispatch, 'resultHasServerApprovedVisual'),
  setVoiceSelection: stateSetter(dispatch, 'voiceSelection'),
  setPendingVoiceSelection: stateSetter(dispatch, 'pendingVoiceSelection'),
  setElapsedSeconds: stateSetter(dispatch, 'elapsedSeconds'),
});
