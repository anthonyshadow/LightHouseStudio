import { characterReferenceOptionsSchema } from '@studio/contracts';
import { generateStructuredPrompt } from '@studio/domain';
import { useCallback, useEffect, type Dispatch } from 'react';
import {
  useReferencePreviewGeneration,
  type ReferencePreviewGenerationResult,
} from '../prompt-authoring/useReferencePreviewGeneration';
import {
  characterBuilderOperationError,
  type CharacterBuilderOperationLocksRef,
  type CharacterBuilderStateRef,
} from './characterBuilderControllerSupport';
import type {
  CharacterBuilderAction,
  CharacterBuilderOperation,
  CharacterBuilderState,
} from './machine';

export interface UseCharacterReferenceGenerationOptions {
  readonly open: boolean;
  readonly generationAvailable: boolean;
  readonly editAvailable: boolean;
  readonly stateRef: CharacterBuilderStateRef;
  readonly locksRef: CharacterBuilderOperationLocksRef;
  readonly dispatch: Dispatch<CharacterBuilderAction>;
  readonly hasPendingSave: () => boolean;
}

export interface CharacterReferenceGenerationController {
  readonly cancel: () => void;
  readonly generatePreview: () => void;
  readonly regenerate: (changeInstructions: string) => void;
}

const generationIsBlocked = (
  state: CharacterBuilderState,
  locksRef: CharacterBuilderOperationLocksRef,
  saveRecoveryPending: boolean,
) =>
  locksRef.current.generation ||
  locksRef.current.save ||
  locksRef.current.close ||
  locksRef.current.reset ||
  locksRef.current.discard ||
  saveRecoveryPending ||
  ['restoring', 'saving', 'closing', 'saved'].includes(state.phase);

export const useCharacterReferenceGeneration = ({
  open,
  generationAvailable,
  editAvailable,
  stateRef,
  locksRef,
  dispatch,
  hasPendingSave,
}: UseCharacterReferenceGenerationOptions): CharacterReferenceGenerationController => {
  const generation = useReferencePreviewGeneration({
    onPhase: (phase, operationId, sourceKey) => {
      const current = stateRef.current;
      if (current.operation?.id === operationId) {
        dispatch({
          type: 'generation-started',
          operationId,
          sourceKey,
          phase: phase === 'regenerating' ? 'regenerating' : 'generating',
        });
        return;
      }
      const operation: CharacterBuilderOperation = {
        id: operationId,
        sourceRevision: current.revision,
        sourceKey,
      };
      dispatch({
        type: 'operation-started',
        phase: phase === 'optimizing' ? 'optimizing' : phase,
        operation,
      });
    },
    onSuccess: (result: ReferencePreviewGenerationResult) => {
      dispatch({
        type: 'optimization-succeeded',
        operationId: result.operationId,
        optimization: result.optimization,
        optimizationKey: result.sourceKey,
      });
      dispatch({
        type: 'preview-succeeded',
        operationId: result.operationId,
        asset: result.asset,
        sourceKey: result.sourceKey,
      });
    },
    onError: (error, operationId, sourceKey) => {
      dispatch({
        type: 'operation-failed',
        operationId,
        sourceKey,
        kind: 'generation',
        message: characterBuilderOperationError(error),
      });
    },
  });
  const cancel = generation.cancel;

  useEffect(() => {
    if (open) return;
    cancel();
    locksRef.current.generation = false;
  }, [cancel, locksRef, open]);

  const generatePreview = useCallback(() => {
    const current = stateRef.current;
    if (generationIsBlocked(current, locksRef, hasPendingSave())) return;

    const generated = generateStructuredPrompt(current.draft);
    const parsedOptions = characterReferenceOptionsSchema.safeParse(current.options);
    if (!generationAvailable) {
      dispatch({
        type: 'validation-failed',
        kind: 'generation',
        message: 'Reference image generation is not configured. You can still save prompt-only.',
      });
      return;
    }
    if (!generated.validation.valid || !generated.prompt) {
      dispatch({
        type: 'validation-failed',
        kind: 'generation',
        message:
          generated.validation.blockingIssues[0]?.message ??
          'Choose at least one character detail before generating a preview.',
      });
      return;
    }
    if (!parsedOptions.success) {
      dispatch({
        type: 'validation-failed',
        kind: 'generation',
        message: parsedOptions.error.issues[0]?.message ?? 'Review the preview settings.',
      });
      return;
    }
    locksRef.current.generation = true;
    void generation
      .generate({ rawPrompt: generated.prompt, options: parsedOptions.data })
      .finally(() => {
        locksRef.current.generation = false;
      });
  }, [dispatch, generation, generationAvailable, hasPendingSave, locksRef, stateRef]);

  const regenerate = useCallback(
    (changeInstructions: string) => {
      const current = stateRef.current;
      if (generationIsBlocked(current, locksRef, hasPendingSave())) return;

      const preview = current.preview;
      if (!preview) return;
      const instructions = changeInstructions.trim();
      if (instructions && !editAvailable) {
        dispatch({
          type: 'validation-failed',
          kind: 'generation',
          message: 'Written image changes are unavailable. Leave feedback blank for a fresh image.',
        });
        return;
      }
      const generated = generateStructuredPrompt(current.draft);
      locksRef.current.generation = true;
      void generation
        .generate({
          rawPrompt: generated.prompt,
          options: current.options,
          ...(instructions
            ? { sourceAssetId: preview.asset.assetId, changeInstructions: instructions }
            : {}),
        })
        .finally(() => {
          locksRef.current.generation = false;
        });
    },
    [dispatch, editAvailable, generation, hasPendingSave, locksRef, stateRef],
  );

  return { cancel, generatePreview, regenerate };
};
