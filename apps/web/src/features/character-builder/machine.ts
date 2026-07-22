import type {
  CharacterReferenceOptions,
  OptimizeCharacterReferencePromptResponse,
  ReferenceImageAsset,
} from '@studio/contracts';
import type { CharacterTransformDraft, GuidedDesignV1 } from '@studio/domain';

export type CharacterBuilderPhase =
  | 'restoring'
  | 'editing'
  | 'optimizing'
  | 'generating'
  | 'preview-ready'
  | 'requesting-regeneration'
  | 'regenerating'
  | 'generation-failed'
  | 'saving'
  | 'save-failed'
  | 'confirming-reset'
  | 'closing'
  | 'saved';

export interface CharacterPreviewState {
  asset: ReferenceImageAsset;
  sourceKey: string;
  stale: boolean;
}

export interface CharacterBuilderOperation {
  id: string;
  requestId?: string;
  sourceRevision: number;
  sourceKey: string;
}

export interface CharacterBuilderState {
  phase: CharacterBuilderPhase;
  draft: CharacterTransformDraft;
  design: GuidedDesignV1;
  options: CharacterReferenceOptions;
  revision: number;
  durableRevision: number;
  preview: CharacterPreviewState | null;
  optimization: OptimizeCharacterReferencePromptResponse | null;
  optimizationKey: string | null;
  operation: CharacterBuilderOperation | null;
  error: string | null;
}

export type CharacterBuilderAction =
  | {
      type: 'restored';
      draft: CharacterTransformDraft;
      design: GuidedDesignV1;
      options: CharacterReferenceOptions;
      revision: number;
      preview: CharacterPreviewState | null;
    }
  | {
      type: 'edited';
      draft: CharacterTransformDraft;
      design: GuidedDesignV1;
      sourceKey: string;
    }
  | { type: 'options-changed'; options: CharacterReferenceOptions; sourceKey: string }
  | { type: 'autosaved'; revision: number }
  | {
      type: 'operation-started';
      phase: 'optimizing' | 'generating' | 'regenerating' | 'saving';
      operation: CharacterBuilderOperation;
    }
  | {
      type: 'optimization-succeeded';
      operationId: string;
      optimization: OptimizeCharacterReferencePromptResponse;
      optimizationKey: string;
    }
  | {
      type: 'generation-started';
      operationId: string;
      sourceKey: string;
      phase: 'generating' | 'regenerating';
    }
  | {
      type: 'preview-succeeded';
      operationId: string;
      asset: ReferenceImageAsset;
      sourceKey: string;
    }
  | {
      type: 'operation-failed';
      operationId: string;
      sourceKey: string;
      kind: 'generation' | 'save';
      message: string;
    }
  | { type: 'validation-failed'; kind: 'generation' | 'save'; message: string }
  | { type: 'request-regeneration' }
  | { type: 'cancel-regeneration' }
  | { type: 'request-reset' }
  | { type: 'cancel-reset' }
  | {
      type: 'reset';
      draft: CharacterTransformDraft;
      design: GuidedDesignV1;
      options: CharacterReferenceOptions;
    }
  | { type: 'closing' }
  | { type: 'closed' }
  | { type: 'saved' };

export const createCharacterBuilderState = (
  draft: CharacterTransformDraft,
  design: GuidedDesignV1,
  options: CharacterReferenceOptions,
): CharacterBuilderState => ({
  phase: 'restoring',
  draft,
  design,
  options,
  revision: 0,
  durableRevision: 0,
  preview: null,
  optimization: null,
  optimizationKey: null,
  operation: null,
  error: null,
});

const matchesOperation = (state: CharacterBuilderState, operationId: string, sourceKey: string) =>
  state.operation?.id === operationId &&
  state.operation.sourceRevision === state.revision &&
  state.operation.sourceKey === sourceKey;

export const characterBuilderReducer = (
  state: CharacterBuilderState,
  action: CharacterBuilderAction,
): CharacterBuilderState => {
  switch (action.type) {
    case 'restored':
      return {
        ...state,
        phase: action.preview && !action.preview.stale ? 'preview-ready' : 'editing',
        draft: action.draft,
        design: action.design,
        options: action.options,
        revision: action.revision,
        durableRevision: action.revision,
        preview: action.preview,
        operation: null,
        error: null,
      };
    case 'edited': {
      if (state.phase === 'saving' || state.phase === 'closing') return state;
      const revision = state.revision + 1;
      const preview = state.preview
        ? {
            ...state.preview,
            stale: state.preview.stale || state.preview.sourceKey !== action.sourceKey,
          }
        : null;
      return {
        ...state,
        phase: 'editing',
        draft: action.draft,
        design: action.design,
        revision,
        preview,
        operation: null,
        error: null,
      };
    }
    case 'options-changed': {
      if (state.phase === 'saving' || state.phase === 'closing') return state;
      const revision = state.revision + 1;
      const preview = state.preview
        ? {
            ...state.preview,
            stale: state.preview.stale || state.preview.sourceKey !== action.sourceKey,
          }
        : null;
      return {
        ...state,
        phase: 'editing',
        options: action.options,
        revision,
        preview,
        operation: null,
        error: null,
      };
    }
    case 'autosaved':
      return action.revision < state.durableRevision
        ? state
        : { ...state, durableRevision: action.revision };
    case 'operation-started':
      if (state.operation || ['saving', 'closing', 'saved'].includes(state.phase)) {
        return state;
      }
      return { ...state, phase: action.phase, operation: action.operation, error: null };
    case 'optimization-succeeded':
      if (!matchesOperation(state, action.operationId, action.optimizationKey)) return state;
      return {
        ...state,
        optimization: action.optimization,
        optimizationKey: action.optimizationKey,
        error: null,
      };
    case 'generation-started':
      return matchesOperation(state, action.operationId, action.sourceKey)
        ? { ...state, phase: action.phase }
        : state;
    case 'preview-succeeded':
      if (!matchesOperation(state, action.operationId, action.sourceKey)) return state;
      return {
        ...state,
        phase: 'preview-ready',
        revision: state.revision + 1,
        preview: { asset: action.asset, sourceKey: action.sourceKey, stale: false },
        operation: null,
        error: null,
      };
    case 'operation-failed':
      if (!matchesOperation(state, action.operationId, action.sourceKey)) return state;
      return {
        ...state,
        phase: action.kind === 'save' ? 'save-failed' : 'generation-failed',
        operation: null,
        error: action.message,
      };
    case 'validation-failed':
      return {
        ...state,
        phase: action.kind === 'save' ? 'save-failed' : 'generation-failed',
        operation: null,
        error: action.message,
      };
    case 'request-regeneration':
      return state.preview && !state.operation
        ? { ...state, phase: 'requesting-regeneration', error: null }
        : state;
    case 'cancel-regeneration':
      return {
        ...state,
        phase: state.preview && !state.preview.stale ? 'preview-ready' : 'editing',
        error: null,
      };
    case 'request-reset':
      return ['saving', 'closing', 'saved'].includes(state.phase)
        ? state
        : { ...state, phase: 'confirming-reset', operation: null };
    case 'cancel-reset':
      return {
        ...state,
        phase: state.preview && !state.preview.stale ? 'preview-ready' : 'editing',
      };
    case 'reset':
      return {
        ...createCharacterBuilderState(action.draft, action.design, action.options),
        phase: 'editing',
      };
    case 'closing':
      return state.phase === 'saving' || state.phase === 'closing'
        ? state
        : { ...state, phase: 'closing', operation: null };
    case 'closed':
      return {
        ...state,
        phase: state.preview && !state.preview.stale ? 'preview-ready' : 'editing',
        operation: null,
      };
    case 'saved':
      return { ...state, phase: 'saved', operation: null, error: null };
  }
};

export const characterBuilderBusy = (state: CharacterBuilderState): boolean =>
  ['optimizing', 'generating', 'regenerating', 'saving', 'closing'].includes(state.phase);

export const characterBuilderHasDurableChanges = (state: CharacterBuilderState): boolean =>
  state.revision <= state.durableRevision;
