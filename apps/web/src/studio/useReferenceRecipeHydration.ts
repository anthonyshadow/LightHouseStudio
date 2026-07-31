import type { ReferenceImageAsset } from '@studio/contracts';
import { canonicalPrompt } from '@studio/domain';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  ApiClientError,
  fetchReferenceImageMetadata,
  hydrateReferenceImage,
} from '../adapters/api-client/apiClient';
import type { ModelMode } from '../application/types';
import type { SessionReferenceImage } from '../features/media-session/types';
import type { PromptBuilderDraft } from '../features/prompt-authoring/model';

export type PendingReferenceRecipeUse = {
  readonly mode: ModelMode;
  readonly prompt: string;
  readonly referenceImageAssetId: string | null;
  readonly preserveCurrentReference: boolean;
  readonly builderDraft?: PromptBuilderDraft;
  readonly savedPromptId?: string;
  readonly savedCharacterPromptId?: string;
  readonly characterName?: string;
  readonly destination: 'shelf' | 'workshop';
};

export type ReferenceRecipeHydrationResult = {
  readonly pending: PendingReferenceRecipeUse;
  readonly referenceImage: SessionReferenceImage | null;
  readonly storedReferenceMetadata: ReferenceImageAsset | null;
  readonly appliedPrompt: string;
  readonly enhance: boolean;
  readonly referenceMatchesPendingPrompt: boolean;
};

type HydrationState = {
  readonly pending: boolean;
  readonly failureMessage: string | null;
};

type HydrationAction =
  | { readonly type: 'start' }
  | { readonly type: 'fail'; readonly message: string }
  | { readonly type: 'complete' };

const INITIAL_HYDRATION_STATE: HydrationState = {
  pending: false,
  failureMessage: null,
};

const hydrationReducer = (state: HydrationState, action: HydrationAction): HydrationState => {
  if (action.type === 'start') return { pending: true, failureMessage: null };
  if (action.type === 'fail') return { pending: false, failureMessage: action.message };
  return state === INITIAL_HYDRATION_STATE ? state : INITIAL_HYDRATION_STATE;
};

export const referenceHydrationError = (error: unknown): string =>
  error instanceof ApiClientError && error.code === 'not_found'
    ? 'This local reference asset is no longer available. Retry after restoring the data directory, or continue without it.'
    : 'The exact local reference could not be validated. Retry, or continue without the reference.';

const RECIPE_COMMIT_BLOCKED_MESSAGE =
  'Release the active camera or AI session, then retry this complete recipe handoff.';

type UseReferenceRecipeHydrationOptions = {
  readonly canStart: (pending: PendingReferenceRecipeUse) => boolean;
  readonly currentReferenceImage: () => SessionReferenceImage | null;
  readonly onCommit: (result: ReferenceRecipeHydrationResult) => boolean;
};

type ActiveHydrationOperation = {
  readonly generation: number;
  readonly controller: AbortController;
};

/**
 * Owns the sole Shelf/Workshop reference hydration operation and its retryable pending input.
 * The caller remains the authoritative composition boundary for the atomic session commit.
 */
export const useReferenceRecipeHydration = ({
  canStart,
  currentReferenceImage,
  onCommit,
}: UseReferenceRecipeHydrationOptions) => {
  const [state, dispatch] = useReducer(hydrationReducer, INITIAL_HYDRATION_STATE);
  const pendingUseRef = useRef<PendingReferenceRecipeUse | null>(null);
  const activeOperationRef = useRef<ActiveHydrationOperation | null>(null);
  const operationGenerationRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
      activeOperationRef.current?.controller.abort();
      activeOperationRef.current = null;
    };
  }, []);

  const start = useCallback(
    async (pending: PendingReferenceRecipeUse, continueWithoutReference = false): Promise<void> => {
      if (activeOperationRef.current || !canStart(pending)) return;

      pendingUseRef.current = pending;
      const controller = new AbortController();
      const generation = ++operationGenerationRef.current;
      activeOperationRef.current = { generation, controller };
      dispatch({ type: 'start' });

      const isCurrent = () =>
        mountedRef.current &&
        !controller.signal.aborted &&
        activeOperationRef.current?.generation === generation &&
        operationGenerationRef.current === generation;

      try {
        let referenceImage: SessionReferenceImage | null = null;
        let storedReferenceMetadata: ReferenceImageAsset | null = null;
        if (pending.referenceImageAssetId && !continueWithoutReference) {
          storedReferenceMetadata = await fetchReferenceImageMetadata(
            pending.referenceImageAssetId,
            controller.signal,
          );
          if (!isCurrent()) return;
          referenceImage = await hydrateReferenceImage(
            pending.referenceImageAssetId,
            storedReferenceMetadata,
            controller.signal,
          );
          if (!isCurrent()) return;
        } else if (pending.preserveCurrentReference && !continueWithoutReference) {
          referenceImage = currentReferenceImage();
        }

        if (!isCurrent()) return;
        const generatedLucyReference =
          pending.mode === 'lucy-latest' && storedReferenceMetadata?.source === 'generated'
            ? storedReferenceMetadata
            : null;
        const appliedPrompt = generatedLucyReference
          ? generatedLucyReference.lucy25CharacterPrompt
          : pending.prompt;
        const referenceMatchesPendingPrompt =
          storedReferenceMetadata?.source !== 'generated' ||
          canonicalPrompt(storedReferenceMetadata.originalPrompt) ===
            canonicalPrompt(pending.prompt);
        const committed = onCommit({
          pending,
          referenceImage,
          storedReferenceMetadata,
          appliedPrompt,
          enhance: generatedLucyReference !== null,
          referenceMatchesPendingPrompt,
        });
        if (!isCurrent()) return;
        if (!committed) {
          dispatch({ type: 'fail', message: RECIPE_COMMIT_BLOCKED_MESSAGE });
          return;
        }

        pendingUseRef.current = null;
        dispatch({ type: 'complete' });
      } catch (error) {
        if (!isCurrent()) return;
        dispatch({ type: 'fail', message: referenceHydrationError(error) });
      } finally {
        if (activeOperationRef.current?.generation === generation) {
          activeOperationRef.current = null;
        }
      }
    },
    [canStart, currentReferenceImage, onCommit],
  );

  const useRecipe = useCallback(
    (pending: PendingReferenceRecipeUse) => {
      void start(pending);
    },
    [start],
  );

  const retry = useCallback(() => {
    const pending = pendingUseRef.current;
    if (pending) void start(pending);
  }, [start]);

  const continueWithoutReference = useCallback(() => {
    const pending = pendingUseRef.current;
    if (pending) void start(pending, true);
  }, [start]);

  return {
    pending: state.pending,
    failureMessage: state.failureMessage,
    useRecipe,
    retry,
    continueWithoutReference,
  } as const;
};
