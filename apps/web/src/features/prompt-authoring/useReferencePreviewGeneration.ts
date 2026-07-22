import type {
  CharacterReferenceOptions,
  EditReferenceImageRequest,
  OptimizeCharacterReferencePromptResponse,
  ReferenceImageAsset,
} from '@studio/contracts';
import { useCallback, useEffect, useRef } from 'react';
import {
  createReferenceImage,
  editReferenceImage,
  optimizeCharacterReferencePrompt,
} from '../../adapters/api-client/apiClient';

export type ReferencePreviewPhase = 'optimizing' | 'generating' | 'regenerating';

export interface ReferencePreviewGenerationInput {
  rawPrompt: string;
  options: CharacterReferenceOptions;
  sourceAssetId?: string | undefined;
  changeInstructions?: string | undefined;
}

export interface ReferencePreviewGenerationResult {
  asset: ReferenceImageAsset;
  optimization: OptimizeCharacterReferencePromptResponse;
  sourceKey: string;
  operationId: string;
  requestId: string;
}

export interface ReferencePreviewGenerationCallbacks {
  onPhase: (phase: ReferencePreviewPhase, operationId: string, sourceKey: string) => void;
  onSuccess: (result: ReferencePreviewGenerationResult) => void;
  onError: (error: unknown, operationId: string, sourceKey: string) => void;
}

const normalizedInstructions = (value: string | undefined) => value?.trim() ?? '';

export const createReferencePreviewSourceKey = (
  rawPrompt: string,
  options: CharacterReferenceOptions,
): string => JSON.stringify({ rawPrompt: rawPrompt.replace(/\s+/gu, ' ').trim(), options });

/**
 * Shared single-flight optimizer/generator used by Studio-owned character builders.
 * It owns provider cancellation, optimization reuse, retry request IDs, and late-result rejection.
 */
export const useReferencePreviewGeneration = (callbacks: ReferencePreviewGenerationCallbacks) => {
  const callbacksRef = useRef(callbacks);
  const activeRef = useRef<{ operationId: string; controller: AbortController } | null>(null);
  const epochRef = useRef(0);
  const optimizationRef = useRef<{
    sourceKey: string;
    response: OptimizeCharacterReferencePromptResponse;
  } | null>(null);
  const failedRequestRef = useRef<{ fingerprint: string; requestId: string } | null>(null);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const cancel = useCallback(() => {
    epochRef.current += 1;
    activeRef.current?.controller.abort();
    activeRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const generate = useCallback(
    async (input: ReferencePreviewGenerationInput, ownerSignal?: AbortSignal): Promise<void> => {
      if (activeRef.current) return;
      if (ownerSignal?.aborted) return;
      const operationId = crypto.randomUUID();
      const sourceKey = createReferencePreviewSourceKey(input.rawPrompt, input.options);
      const controller = new AbortController();
      const abortFromOwner = () => controller.abort();
      ownerSignal?.addEventListener('abort', abortFromOwner, { once: true });
      const epoch = ++epochRef.current;
      activeRef.current = { operationId, controller };
      let requestFingerprint: string | null = null;
      let providerRequestId: string | null = null;

      const stillCurrent = () =>
        !controller.signal.aborted &&
        epochRef.current === epoch &&
        activeRef.current?.operationId === operationId;

      try {
        let optimization =
          optimizationRef.current?.sourceKey === sourceKey
            ? optimizationRef.current.response
            : null;
        if (!optimization) {
          callbacksRef.current.onPhase('optimizing', operationId, sourceKey);
          optimization = await optimizeCharacterReferencePrompt(
            { rawPrompt: input.rawPrompt, options: input.options },
            controller.signal,
          );
          if (!stillCurrent()) return;
          optimizationRef.current = { sourceKey, response: optimization };
        }

        const changeInstructions = normalizedInstructions(input.changeInstructions);
        const edit = Boolean(changeInstructions && input.sourceAssetId);
        callbacksRef.current.onPhase(edit ? 'regenerating' : 'generating', operationId, sourceKey);

        requestFingerprint = JSON.stringify({
          kind: edit ? 'edit' : 'generate',
          sourceAssetId: edit ? input.sourceAssetId : null,
          sourceKey,
          changeInstructions,
          optimizationInputHash: optimization.inputHash,
        });
        providerRequestId =
          failedRequestRef.current?.fingerprint === requestFingerprint
            ? failedRequestRef.current.requestId
            : crypto.randomUUID();
        const enabledOptimization: EditReferenceImageRequest['optimization'] = {
          enabled: true,
          result: optimization.result,
          model: optimization.model,
          version: optimization.version,
          inputHash: optimization.inputHash,
          manuallyEdited: false,
        };

        const asset =
          edit && input.sourceAssetId
            ? await editReferenceImage(
                input.sourceAssetId,
                {
                  requestId: providerRequestId,
                  rawPrompt: input.rawPrompt,
                  changeInstructions,
                  options: input.options,
                  optimization: enabledOptimization,
                },
                controller.signal,
              )
            : await createReferenceImage(
                {
                  requestId: providerRequestId,
                  rawPrompt: input.rawPrompt,
                  options: input.options,
                  optimization: enabledOptimization,
                },
                controller.signal,
              );
        if (!stillCurrent()) return;
        failedRequestRef.current = null;
        callbacksRef.current.onSuccess({
          asset,
          optimization,
          sourceKey,
          operationId,
          requestId: providerRequestId,
        });
      } catch (error: unknown) {
        if (!stillCurrent()) return;
        if (requestFingerprint && providerRequestId) {
          failedRequestRef.current = {
            fingerprint: requestFingerprint,
            requestId: providerRequestId,
          };
        }
        callbacksRef.current.onError(error, operationId, sourceKey);
      } finally {
        ownerSignal?.removeEventListener('abort', abortFromOwner);
        if (activeRef.current?.operationId === operationId) activeRef.current = null;
      }
    },
    [],
  );

  return { generate, cancel } as const;
};
