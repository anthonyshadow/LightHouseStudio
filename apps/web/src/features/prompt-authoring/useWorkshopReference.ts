import type { CreateReferenceImageRequest, GeneratedReferenceImageAsset } from '@studio/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiClientError,
  createReferenceImage,
  fetchReferenceImageMetadata,
} from '../../adapters/api-client/apiClient';
import type { CreativeAssetRepository } from '../creative-assets/types';
import type { PromptBuilderDraft, PromptIntent } from './model';
import type { WorkshopReferenceGenerationInput } from './CharacterPromptWorkshop';
import type { ReferenceGenerationState, WorkshopReferenceImage } from './ReferenceImageGenerator';

const referenceGenerationError = (error: unknown): string => {
  if (!(error instanceof ApiClientError)) {
    return 'The local server could not create the reference. Check the connection and try again.';
  }
  switch (error.code) {
    case 'moderation_blocked':
      return 'OpenAI blocked the reference image or character description. Try another image or adjust the description.';
    case 'rate_limited':
    case 'provider_quota':
      return 'OpenAI is temporarily limiting image generation. Wait a moment, then retry.';
    case 'provider_configuration':
    case 'provider_authentication':
      return 'Reference generation is not configured correctly on this local server.';
    case 'request_timeout':
      return 'Generation timed out before a safe asset was stored. Retry with a new request.';
    case 'invalid_provider_image':
      return 'OpenAI returned an image that failed local validation. Retry the generation.';
    case 'storage_failure':
      return 'The image was created but could not be saved locally. Check the data directory and retry.';
    case 'generation_in_progress':
      return 'Another reference is already being created. Wait for it to finish, then retry.';
    default:
      return error.message || 'Reference generation failed before the current image could change.';
  }
};

const referenceRestoreError = (error: unknown): string =>
  error instanceof ApiClientError && error.code === 'not_found'
    ? 'This local reference asset is no longer available. Retry after restoring the data directory, or continue without it.'
    : 'The exact local reference could not be validated. Retry, or continue without the reference.';

export const toWorkshopReferenceImage = (
  asset: GeneratedReferenceImageAsset,
  generatedFromPrompt = asset.originalPrompt,
): WorkshopReferenceImage => ({ ...asset, generatedFromPrompt });

export const useWorkshopReference = ({
  repository,
  referenceImagesAvailable,
}: {
  readonly repository: CreativeAssetRepository;
  readonly referenceImagesAvailable: boolean;
}) => {
  const [draft, setDraft] = useState<PromptBuilderDraft | undefined>();
  const [drafts, setDrafts] = useState<Partial<Record<PromptIntent, PromptBuilderDraft>>>({});
  const [referenceImage, setReferenceImage] = useState<WorkshopReferenceImage | null>(null);
  const [generation, setGeneration] = useState<ReferenceGenerationState>({
    status: 'idle',
    error: null,
  });
  const revisionRef = useRef(0);
  const generationRequestRef = useRef<string | null>(null);
  const restoreRef = useRef<{ assetId: string; prompt: string } | null>(null);
  const restoreControllerRef = useRef<AbortController | null>(null);

  const rememberDraft = useCallback((next: PromptBuilderDraft) => {
    revisionRef.current += 1;
    setDraft(next);
    setDrafts((current) => ({ ...current, [next.intent]: next }));
  }, []);

  const restore = useCallback(
    (assetId: string, prompt: string) => {
      restoreControllerRef.current?.abort();
      const controller = new AbortController();
      restoreControllerRef.current = controller;
      const revision = revisionRef.current;
      restoreRef.current = { assetId, prompt };
      setGeneration({ status: 'restoring', error: null });
      void fetchReferenceImageMetadata(assetId, controller.signal)
        .then((asset) => {
          if (controller.signal.aborted || revisionRef.current !== revision) return;
          if (asset.source !== 'generated') {
            setReferenceImage(null);
            setGeneration({ status: 'idle', error: null });
            return;
          }
          setReferenceImage(toWorkshopReferenceImage(asset));
          setGeneration({ status: 'idle', error: null });
          repository.enrichNewestMatchingRecent(prompt, 'lucy-2.5', asset.assetId);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || revisionRef.current !== revision) return;
          setReferenceImage(null);
          setGeneration({
            status: 'error',
            error: referenceRestoreError(error),
            errorKind: 'restore',
          });
        });
    },
    [repository],
  );

  const synchronizeReference = useCallback(
    (next: WorkshopReferenceImage | null, prompt: string) => {
      revisionRef.current += 1;
      restoreControllerRef.current?.abort();
      restoreControllerRef.current = null;
      setReferenceImage(next);
      setGeneration({ status: 'idle', error: null });
      restoreRef.current = next ? { assetId: next.assetId, prompt } : null;
    },
    [],
  );

  const generate = useCallback(
    async (input: WorkshopReferenceGenerationInput, signal: AbortSignal): Promise<void> => {
      if (!referenceImagesAvailable || generationRequestRef.current) return;
      const requestId = crypto.randomUUID();
      const revision = revisionRef.current;
      const request: CreateReferenceImageRequest = { requestId, ...input };
      generationRequestRef.current = requestId;
      setGeneration({ status: 'generating', error: null });
      try {
        const asset = await createReferenceImage(request, signal);
        if (revisionRef.current !== revision) return;
        if (asset.source !== 'generated') {
          throw new Error('The generated reference response did not contain a generated asset.');
        }
        synchronizeReference(toWorkshopReferenceImage(asset, input.rawPrompt), input.rawPrompt);
        repository.enrichNewestMatchingRecent(input.rawPrompt, 'lucy-2.5', asset.assetId);
      } catch (error: unknown) {
        if (signal.aborted || revisionRef.current !== revision) return;
        setGeneration({
          status: 'error',
          error: referenceGenerationError(error),
          errorKind: 'generation',
        });
      } finally {
        if (generationRequestRef.current === requestId) {
          generationRequestRef.current = null;
          if (signal.aborted || revisionRef.current !== revision) {
            setGeneration({ status: 'idle', error: null });
          }
        }
      }
    },
    [referenceImagesAvailable, repository, synchronizeReference],
  );

  const detach = useCallback(() => synchronizeReference(null, ''), [synchronizeReference]);
  const retryRestore = useCallback(() => {
    const pending = restoreRef.current;
    if (pending) restore(pending.assetId, pending.prompt);
  }, [restore]);

  useEffect(
    () => () => {
      restoreControllerRef.current?.abort();
    },
    [],
  );

  return useMemo(
    () =>
      ({
        draft,
        drafts,
        referenceImage,
        generation,
        rememberDraft,
        generate,
        restore,
        detach,
        retryRestore,
        synchronizeReference,
      }) as const,
    [
      detach,
      draft,
      drafts,
      generate,
      generation,
      referenceImage,
      rememberDraft,
      restore,
      retryRestore,
      synchronizeReference,
    ],
  );
};
