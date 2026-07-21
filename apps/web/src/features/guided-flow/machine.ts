import type {
  GuidedFinalVariant,
  GuidedProjectCheckpoint,
  GuidedProjectDataV1,
  GuidedReferenceMode,
  ProjectRecordV1,
} from './types';
import { createEmptyGuidedProjectData } from './types';

export type GuidedFlowStatus =
  | 'create.editing'
  | 'create.reference-choice'
  | 'create.reference-settings'
  | 'create.saving'
  | 'live.ready'
  | 'live.permission-primer'
  | 'live.camera-starting'
  | 'live.camera-ready'
  | 'live.connecting'
  | 'live.connected'
  | 'record.ready'
  | 'record.refreshing'
  | 'record.countdown'
  | 'record.starting'
  | 'record.recording'
  | 'record.finalizing'
  | 'record.review'
  | 'voice.choosing'
  | 'voice.processing'
  | 'voice.review'
  | 'download.preparing'
  | 'download.ready'
  | 'download.dispatching'
  | 'download.complete';

export type GuidedFlowOperationKind =
  | 'save-character-prompt-only'
  | 'save-character-with-reference'
  | 'reuse-character-reference'
  | 'start-camera-preview'
  | 'start-live-session'
  | 'refresh-live-session'
  | 'start-recording'
  | 'stop-recording'
  | 'accept-take'
  | 'process-voice'
  | 'keep-original'
  | 'accept-processed-voice'
  | 'prepare-delivery'
  | 'dispatch-download'
  | 'complete-project';

export interface GuidedFlowPendingOperation {
  readonly id: string;
  readonly kind: GuidedFlowOperationKind;
  readonly baseRevision: number;
  readonly rollbackStatus: GuidedFlowStatus;
}

export interface GuidedFlowState {
  readonly status: GuidedFlowStatus;
  readonly projectId: string | null;
  readonly projectRevision: number;
  readonly restoredFrom: GuidedProjectCheckpoint | null;
  readonly data: GuidedProjectDataV1;
  readonly pending: GuidedFlowPendingOperation | null;
  readonly error: string | null;
  readonly countdownEndsAt: number | null;
  readonly recordingDeadlineAt: number | null;
}

interface OperationRequest {
  readonly operationId: string;
}

interface OperationCompletion {
  readonly operationId: string;
  readonly baseRevision: number;
  readonly nextRevision?: number;
  readonly data?: Partial<GuidedProjectDataV1>;
}

interface OperationFailure {
  readonly operationId: string;
  readonly baseRevision: number;
  readonly message: string;
}

export type GuidedFlowEvent =
  | { readonly type: 'character-edited'; readonly data?: Partial<GuidedProjectDataV1> }
  | {
      readonly type: 'character-save-prepared';
      readonly data: Partial<GuidedProjectDataV1>;
      readonly projectRevision?: number;
    }
  | { readonly type: 'save-character-requested' }
  | { readonly type: 'reference-choice-cancelled' }
  | ({
      readonly type: 'reference-mode-selected';
      readonly mode: GuidedReferenceMode;
    } & OperationRequest)
  | ({ readonly type: 'reference-generation-confirmed' } & OperationRequest)
  | ({ readonly type: 'character-saved' } & OperationCompletion)
  | { readonly type: 'live-start-requested' }
  | { readonly type: 'live-permission-cancelled' }
  | ({ readonly type: 'live-permission-confirmed' } & OperationRequest)
  | ({ readonly type: 'camera-preview-started' } & OperationCompletion)
  | { readonly type: 'local-preview-reconciled' }
  | ({ readonly type: 'ai-start-requested' } & OperationRequest)
  | ({ readonly type: 'live-connected' } & OperationCompletion)
  | { readonly type: 'ai-preview-reconciled' }
  | { readonly type: 'ai-stopped' }
  | { readonly type: 'ai-disconnected' }
  | { readonly type: 'camera-stopped' }
  | { readonly type: 'continue-to-record' }
  | ({ readonly type: 'record-session-refresh-requested' } & OperationRequest)
  | {
      readonly type: 'record-session-refreshed';
      readonly operationId: string;
      readonly baseRevision: number;
      readonly endsAt: number;
    }
  | { readonly type: 'countdown-started'; readonly endsAt: number }
  | ({ readonly type: 'countdown-finished' } & OperationRequest)
  | ({ readonly type: 'recording-started'; readonly deadlineAt: number } & OperationCompletion)
  | ({ readonly type: 'recording-stop-requested' } & OperationRequest)
  | ({ readonly type: 'recording-finalized' } & OperationCompletion)
  | ({
      readonly type: 'recording-checkpoint-failed';
      readonly data: Partial<GuidedProjectDataV1>;
    } & OperationFailure)
  | ({ readonly type: 'take-accepted' } & OperationRequest)
  | ({ readonly type: 'take-checkpointed' } & OperationCompletion)
  | { readonly type: 're-record-requested' }
  | { readonly type: 'voice-selected'; readonly voiceId: string; readonly voiceName: string }
  | ({ readonly type: 'voice-apply-requested' } & OperationRequest)
  | ({ readonly type: 'voice-processed' } & OperationCompletion)
  | { readonly type: 'voice-processing-cancelled' }
  | { readonly type: 'choose-another-voice' }
  | ({ readonly type: 'keep-original-requested' } & OperationRequest)
  | ({ readonly type: 'processed-voice-accepted' } & OperationRequest)
  | ({ readonly type: 'voice-checkpointed' } & OperationCompletion)
  | ({ readonly type: 'delivery-prepare-requested' } & OperationRequest)
  | ({ readonly type: 'delivery-ready' } & OperationCompletion)
  | ({ readonly type: 'download-requested' } & OperationRequest)
  | ({ readonly type: 'download-dispatched' } & OperationCompletion)
  | ({ readonly type: 'completion-checkpointed' } & OperationCompletion)
  | ({ readonly type: 'operation-failed' } & OperationFailure)
  | { readonly type: 'error-cleared' };

export interface GuidedFlowEffect {
  readonly type: 'run-operation';
  readonly operationId: string;
  readonly operation: GuidedFlowOperationKind;
  readonly projectId: string | null;
  readonly baseRevision: number;
  readonly referenceMode?: GuidedReferenceMode;
  readonly voiceId?: string;
  readonly finalVariant?: GuidedFinalVariant;
}

export interface GuidedFlowTransition {
  readonly state: GuidedFlowState;
  readonly effects: readonly GuidedFlowEffect[];
}

export const createInitialGuidedFlowState = (projectId: string | null = null): GuidedFlowState => ({
  status: 'create.editing',
  projectId,
  projectRevision: 0,
  restoredFrom: null,
  data: createEmptyGuidedProjectData(),
  pending: null,
  error: null,
  countdownEndsAt: null,
  recordingDeadlineAt: null,
});

const statusForCheckpoint = (checkpoint: GuidedProjectCheckpoint): GuidedFlowStatus => {
  switch (checkpoint) {
    case 'character-design':
      return 'create.editing';
    case 'character-ready':
      return 'live.ready';
    case 'review-take':
      return 'record.review';
    case 'accepted-take':
    case 'selected-voice':
      return 'voice.choosing';
    case 'processed-voice':
      return 'voice.review';
    case 'delivery-ready':
      return 'download.ready';
    case 'complete':
      return 'download.complete';
  }
};

/** Transient states intentionally restore to the nearest safe checkpoint. */
export const restoreGuidedFlowState = (project: ProjectRecordV1): GuidedFlowState => ({
  status: statusForCheckpoint(project.checkpoint),
  projectId: project.id,
  projectRevision: project.revision,
  restoredFrom: project.checkpoint,
  data: project.data,
  pending: null,
  error: null,
  countdownEndsAt: null,
  recordingDeadlineAt: null,
});

const noChange = (state: GuidedFlowState): GuidedFlowTransition => ({ state, effects: [] });

const withState = (state: GuidedFlowState): GuidedFlowTransition => ({ state, effects: [] });

const beginOperation = (
  state: GuidedFlowState,
  operationId: string,
  operation: GuidedFlowOperationKind,
  status: GuidedFlowStatus,
  rollbackStatus: GuidedFlowStatus,
  details: Pick<GuidedFlowEffect, 'referenceMode' | 'voiceId' | 'finalVariant'> = {},
): GuidedFlowTransition => {
  if (state.pending) return noChange(state);
  const pending: GuidedFlowPendingOperation = {
    id: operationId,
    kind: operation,
    baseRevision: state.projectRevision,
    rollbackStatus,
  };
  const effect: GuidedFlowEffect = {
    type: 'run-operation',
    operationId,
    operation,
    projectId: state.projectId,
    baseRevision: state.projectRevision,
    ...details,
  };
  return {
    state: { ...state, status, pending, error: null },
    effects: [effect],
  };
};

const isCurrentCompletion = (
  state: GuidedFlowState,
  event: OperationCompletion,
  expected: readonly GuidedFlowOperationKind[],
): boolean =>
  state.pending !== null &&
  state.pending.id === event.operationId &&
  state.pending.baseRevision === event.baseRevision &&
  state.projectRevision === event.baseRevision &&
  expected.includes(state.pending.kind) &&
  (event.nextRevision === undefined || event.nextRevision === event.baseRevision + 1);

const isCurrentFailure = (state: GuidedFlowState, event: OperationFailure): boolean => {
  if (!state.pending) return false;
  const exactOperation =
    state.pending.id === event.operationId &&
    state.pending.baseRevision === event.baseRevision &&
    state.projectRevision === event.baseRevision;
  if (exactOperation) return true;

  // Download dispatch and its completion checkpoint are one guarded operation chain. Accept the
  // parent dispatch failure identity only when the reducer has advanced exactly one revision into
  // that derived completion operation. This keeps the existing integration from stranding state
  // while still rejecting unrelated or stale failures.
  return (
    state.pending.kind === 'complete-project' &&
    state.pending.id === `${event.operationId}:complete` &&
    state.pending.baseRevision === event.baseRevision + 1 &&
    state.projectRevision === state.pending.baseRevision
  );
};

const recordingStartRollbackStatus = (state: GuidedFlowState): GuidedFlowStatus =>
  state.data.originalVideoArtifactId ? 'record.review' : 'record.ready';

const recordingStopRollbackStatus = (state: GuidedFlowState): GuidedFlowStatus =>
  state.data.originalVideoArtifactId ? 'record.review' : 'live.ready';

const sessionRefreshRollbackStatus = (state: GuidedFlowState): GuidedFlowStatus =>
  state.data.originalVideoArtifactId ? 'record.review' : 'live.camera-ready';

const completeOperation = (
  state: GuidedFlowState,
  event: OperationCompletion,
  status: GuidedFlowStatus,
): GuidedFlowState => ({
  ...state,
  status,
  projectRevision: event.nextRevision ?? state.projectRevision,
  data: event.data ? { ...state.data, ...event.data } : state.data,
  pending: null,
  error: null,
});

export const guidedFlowReducer = (
  state: GuidedFlowState,
  event: GuidedFlowEvent,
): GuidedFlowTransition => {
  switch (event.type) {
    case 'character-edited':
      if (!state.status.startsWith('create.') || state.pending) return noChange(state);
      return withState({
        ...state,
        status: 'create.editing',
        data: event.data
          ? {
              ...state.data,
              ...event.data,
              ...(state.data.referenceImageAssetId ? { referenceImageStale: true } : {}),
            }
          : state.data,
        error: null,
      });
    case 'character-save-prepared':
      return state.status === 'create.editing' && !state.pending
        ? withState({
            ...state,
            projectRevision: event.projectRevision ?? state.projectRevision,
            data: { ...state.data, ...event.data },
            error: null,
          })
        : noChange(state);
    case 'save-character-requested':
      return state.status === 'create.editing' && !state.pending
        ? withState({ ...state, status: 'create.reference-choice', error: null })
        : noChange(state);
    case 'reference-choice-cancelled':
      return state.status === 'create.reference-choice'
        ? withState({ ...state, status: 'create.editing', error: null })
        : noChange(state);
    case 'reference-mode-selected': {
      if (
        state.status !== 'create.reference-choice' &&
        !(state.status === 'create.reference-settings' && event.mode === 'prompt-only')
      )
        return noChange(state);
      const selected = {
        ...state,
        data: { ...state.data, referenceMode: event.mode },
      };
      if (event.mode === 'generate')
        return withState({ ...selected, status: 'create.reference-settings' });
      return beginOperation(
        selected,
        event.operationId,
        event.mode === 'existing' ? 'reuse-character-reference' : 'save-character-prompt-only',
        'create.saving',
        'create.reference-choice',
        { referenceMode: event.mode },
      );
    }
    case 'reference-generation-confirmed':
      return state.status === 'create.reference-settings'
        ? beginOperation(
            state,
            event.operationId,
            'save-character-with-reference',
            'create.saving',
            'create.reference-settings',
            { referenceMode: 'generate' },
          )
        : noChange(state);
    case 'character-saved':
      return isCurrentCompletion(state, event, [
        'save-character-prompt-only',
        'save-character-with-reference',
        'reuse-character-reference',
      ])
        ? withState(completeOperation(state, event, 'live.ready'))
        : noChange(state);
    case 'live-start-requested':
      return state.status === 'live.ready'
        ? withState({ ...state, status: 'live.permission-primer', error: null })
        : noChange(state);
    case 'live-permission-cancelled':
      return state.status === 'live.permission-primer'
        ? withState({ ...state, status: 'live.ready', error: null })
        : noChange(state);
    case 'live-permission-confirmed':
      return state.status === 'live.permission-primer'
        ? beginOperation(
            state,
            event.operationId,
            'start-camera-preview',
            'live.camera-starting',
            'live.ready',
          )
        : noChange(state);
    case 'camera-preview-started':
      return isCurrentCompletion(state, event, ['start-camera-preview'])
        ? withState(completeOperation(state, event, 'live.camera-ready'))
        : noChange(state);
    case 'local-preview-reconciled':
      return state.status === 'live.ready' ||
        state.status === 'live.permission-primer' ||
        state.status === 'live.camera-starting'
        ? withState({ ...state, status: 'live.camera-ready', pending: null, error: null })
        : noChange(state);
    case 'ai-start-requested':
      return state.status === 'live.camera-ready'
        ? beginOperation(
            state,
            event.operationId,
            'start-live-session',
            'live.connecting',
            'live.camera-ready',
          )
        : noChange(state);
    case 'live-connected':
      return isCurrentCompletion(state, event, ['start-live-session'])
        ? withState(completeOperation(state, event, 'live.connected'))
        : noChange(state);
    case 'ai-preview-reconciled':
      return state.status === 'live.camera-ready' || state.status === 'live.connecting'
        ? withState({ ...state, status: 'live.connected', pending: null, error: null })
        : noChange(state);
    case 'continue-to-record':
      return state.status === 'live.connected'
        ? withState({ ...state, status: 'record.ready', error: null })
        : noChange(state);
    case 'ai-stopped':
      return state.status === 'live.connected' ||
        state.status === 'live.connecting' ||
        state.status === 'record.ready' ||
        state.status === 'record.refreshing' ||
        state.status === 'record.countdown' ||
        state.status === 'record.starting'
        ? withState({
            ...state,
            status: 'live.camera-ready',
            pending: null,
            error: null,
            countdownEndsAt: null,
            recordingDeadlineAt: null,
          })
        : noChange(state);
    case 'ai-disconnected':
      return state.status === 'live.connected' ||
        state.status === 'record.ready' ||
        state.status === 'record.refreshing' ||
        state.status === 'record.countdown' ||
        state.status === 'record.starting'
        ? withState({
            ...state,
            status: 'live.camera-ready',
            pending: null,
            countdownEndsAt: null,
            recordingDeadlineAt: null,
          })
        : noChange(state);
    case 'camera-stopped':
      return state.status.startsWith('live.') ||
        state.status === 'record.ready' ||
        state.status === 'record.refreshing' ||
        state.status === 'record.countdown' ||
        state.status === 'record.starting'
        ? withState({
            ...state,
            status: 'live.ready',
            pending: null,
            error: null,
            countdownEndsAt: null,
            recordingDeadlineAt: null,
          })
        : noChange(state);
    case 'record-session-refresh-requested':
      return state.status === 'record.ready'
        ? beginOperation(
            state,
            event.operationId,
            'refresh-live-session',
            'record.refreshing',
            sessionRefreshRollbackStatus(state),
          )
        : noChange(state);
    case 'record-session-refreshed':
      if (
        !Number.isFinite(event.endsAt) ||
        !isCurrentCompletion(state, event, ['refresh-live-session'])
      )
        return noChange(state);
      return withState({
        ...completeOperation(state, event, 'record.countdown'),
        countdownEndsAt: event.endsAt,
      });
    case 'countdown-started':
      return state.status === 'record.ready' && !state.pending && Number.isFinite(event.endsAt)
        ? withState({ ...state, status: 'record.countdown', countdownEndsAt: event.endsAt })
        : noChange(state);
    case 'countdown-finished':
      return state.status === 'record.countdown'
        ? beginOperation(
            { ...state, countdownEndsAt: null },
            event.operationId,
            'start-recording',
            'record.starting',
            recordingStartRollbackStatus(state),
          )
        : noChange(state);
    case 'recording-started':
      if (!isCurrentCompletion(state, event, ['start-recording'])) return noChange(state);
      return withState({
        ...completeOperation(state, event, 'record.recording'),
        recordingDeadlineAt: event.deadlineAt,
      });
    case 'recording-stop-requested':
      return state.status === 'record.recording'
        ? beginOperation(
            state,
            event.operationId,
            'stop-recording',
            'record.finalizing',
            recordingStopRollbackStatus(state),
          )
        : noChange(state);
    case 'recording-finalized':
      if (!isCurrentCompletion(state, event, ['stop-recording'])) return noChange(state);
      return withState({
        ...completeOperation(state, event, 'record.review'),
        recordingDeadlineAt: null,
      });
    case 'recording-checkpoint-failed':
      return isCurrentFailure(state, event) && state.pending?.kind === 'stop-recording'
        ? withState({
            ...state,
            status: 'record.review',
            data: { ...state.data, ...event.data },
            pending: null,
            error: event.message,
            recordingDeadlineAt: null,
          })
        : noChange(state);
    case 'take-accepted':
      return state.status === 'record.review'
        ? beginOperation(state, event.operationId, 'accept-take', 'record.review', 'record.review')
        : noChange(state);
    case 'take-checkpointed':
      return isCurrentCompletion(state, event, ['accept-take'])
        ? withState(completeOperation(state, event, 'voice.choosing'))
        : noChange(state);
    case 're-record-requested':
      return state.status === 'record.review'
        ? withState({ ...state, status: 'live.ready', error: null })
        : noChange(state);
    case 'voice-selected':
      return state.status === 'voice.choosing' && !state.pending
        ? withState({
            ...state,
            data: {
              ...state.data,
              selectedVoiceId: event.voiceId,
              selectedVoiceName: event.voiceName,
            },
            error: null,
          })
        : noChange(state);
    case 'voice-apply-requested':
      return state.status === 'voice.choosing' && Boolean(state.data.selectedVoiceId)
        ? beginOperation(
            state,
            event.operationId,
            'process-voice',
            'voice.processing',
            'voice.choosing',
            state.data.selectedVoiceId ? { voiceId: state.data.selectedVoiceId } : {},
          )
        : noChange(state);
    case 'voice-processed':
      return isCurrentCompletion(state, event, ['process-voice'])
        ? withState(completeOperation(state, event, 'voice.review'))
        : noChange(state);
    case 'voice-processing-cancelled':
      return state.status === 'voice.processing'
        ? withState({ ...state, status: 'voice.choosing', pending: null, error: null })
        : noChange(state);
    case 'choose-another-voice':
      return state.status === 'voice.review' && !state.pending
        ? withState({ ...state, status: 'voice.choosing', error: null })
        : noChange(state);
    case 'keep-original-requested':
      return state.status === 'voice.choosing' || state.status === 'voice.review'
        ? beginOperation(state, event.operationId, 'keep-original', state.status, state.status, {
            finalVariant: 'original',
          })
        : noChange(state);
    case 'processed-voice-accepted':
      return state.status === 'voice.review'
        ? beginOperation(
            state,
            event.operationId,
            'accept-processed-voice',
            'voice.review',
            'voice.review',
            { finalVariant: 'processed' },
          )
        : noChange(state);
    case 'voice-checkpointed':
      return isCurrentCompletion(state, event, ['keep-original', 'accept-processed-voice'])
        ? withState(completeOperation(state, event, 'download.preparing'))
        : noChange(state);
    case 'delivery-prepare-requested':
      return state.status === 'download.preparing'
        ? beginOperation(
            state,
            event.operationId,
            'prepare-delivery',
            'download.preparing',
            'download.preparing',
          )
        : noChange(state);
    case 'delivery-ready':
      return isCurrentCompletion(state, event, ['prepare-delivery'])
        ? withState(completeOperation(state, event, 'download.ready'))
        : noChange(state);
    case 'download-requested':
      return state.status === 'download.ready'
        ? beginOperation(
            state,
            event.operationId,
            'dispatch-download',
            'download.dispatching',
            'download.ready',
          )
        : noChange(state);
    case 'download-dispatched':
      if (!isCurrentCompletion(state, event, ['dispatch-download'])) return noChange(state);
      return beginOperation(
        completeOperation(state, event, 'download.dispatching'),
        `${event.operationId}:complete`,
        'complete-project',
        'download.dispatching',
        'download.ready',
      );
    case 'completion-checkpointed':
      return isCurrentCompletion(state, event, ['complete-project'])
        ? withState(completeOperation(state, event, 'download.complete'))
        : noChange(state);
    case 'operation-failed':
      if (!state.pending || !isCurrentFailure(state, event)) return noChange(state);
      return withState({
        ...state,
        status: state.pending.rollbackStatus,
        pending: null,
        error: event.message,
        countdownEndsAt: null,
      });
    case 'error-cleared':
      return state.error ? withState({ ...state, error: null }) : noChange(state);
  }
};
