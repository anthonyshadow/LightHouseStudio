import { generateStructuredPrompt } from '@studio/domain';
import { useCallback, useEffect, useRef } from 'react';
import { uploadReferenceImage, type ApiClientError } from '../../adapters/api-client/apiClient';
import { validateReferenceImage } from '../media-session/imageValidation';
import { createReferencePreviewSourceKey } from '../prompt-authoring/useReferencePreviewGeneration';
import {
  characterBuilderOperationError,
  type CharacterBuilderOperationLocksRef,
  type CharacterBuilderStateRef,
} from './characterBuilderControllerSupport';
import type { CharacterBuilderAction } from './machine';
import type { Dispatch } from 'react';

const MAX_UPLOAD_PIXELS = 40_000_000;

const displayNameForFile = (file: File): string => {
  const cleaned = Array.from(file.name)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= 32 && codePoint !== 127;
    })
    .join('')
    .replace(/[\\/]/gu, '-')
    .trim();
  return (cleaned || 'Uploaded reference').slice(0, 180);
};

const fileSelectionKey = (file: File): string =>
  JSON.stringify([file.name, file.type, file.size, file.lastModified]);

const uploadErrorMessage = (error: unknown): string => {
  const candidate = error as ApiClientError;
  if (candidate?.code === 'invalid_image_upload') return candidate.message;
  return characterBuilderOperationError(error);
};

export const useCharacterReferenceUpload = ({
  open,
  stateRef,
  locksRef,
  dispatch,
  cancelGeneration,
  hasPendingSave,
}: {
  readonly open: boolean;
  readonly stateRef: CharacterBuilderStateRef;
  readonly locksRef: CharacterBuilderOperationLocksRef;
  readonly dispatch: Dispatch<CharacterBuilderAction>;
  readonly cancelGeneration: () => void;
  readonly hasPendingSave: () => boolean;
}) => {
  const activeRef = useRef<{ epoch: number; controller: AbortController } | null>(null);
  const failedRequestRef = useRef<{ selectionKey: string; requestId: string } | null>(null);
  const epochRef = useRef(0);

  const cancel = useCallback(() => {
    epochRef.current += 1;
    activeRef.current?.controller.abort();
    activeRef.current = null;
    locksRef.current.upload = false;
  }, [locksRef]);

  useEffect(() => {
    if (!open) cancel();
  }, [cancel, open]);
  useEffect(() => cancel, [cancel]);

  const select = useCallback(
    async (file: File) => {
      const current = stateRef.current;
      if (
        locksRef.current.upload ||
        locksRef.current.save ||
        locksRef.current.close ||
        locksRef.current.reset ||
        locksRef.current.discard ||
        hasPendingSave() ||
        ['restoring', 'saving', 'closing', 'saved'].includes(current.phase)
      ) {
        return;
      }

      cancelGeneration();
      locksRef.current.upload = true;
      dispatch({ type: 'upload-started' });
      const epoch = ++epochRef.current;
      const controller = new AbortController();
      activeRef.current = { epoch, controller };
      const selectionKey = fileSelectionKey(file);
      const requestId =
        failedRequestRef.current?.selectionKey === selectionKey
          ? failedRequestRef.current.requestId
          : crypto.randomUUID();

      try {
        const validation = await validateReferenceImage(file, 'lucy-2.5');
        if (validation.blockingError) throw new Error(validation.blockingError);
        if (
          !validation.width ||
          !validation.height ||
          validation.width * validation.height > MAX_UPLOAD_PIXELS
        ) {
          throw new Error('The image exceeds the 40-megapixel decoded-image limit.');
        }
        if (controller.signal.aborted || activeRef.current?.epoch !== epoch) return;

        const asset = await uploadReferenceImage(file, requestId, controller.signal);
        if (controller.signal.aborted || activeRef.current?.epoch !== epoch) return;
        if (asset.source !== 'uploaded') {
          throw new Error('The local server returned an invalid uploaded-image asset.');
        }
        failedRequestRef.current = null;
        const latest = stateRef.current;
        const sourceKey = createReferencePreviewSourceKey(
          generateStructuredPrompt(latest.draft).prompt,
          latest.options,
          asset.assetId,
        );
        dispatch({
          type: 'upload-succeeded',
          uploadedReference: { asset, displayName: displayNameForFile(file) },
          sourceKey,
        });
      } catch (error: unknown) {
        if (controller.signal.aborted || activeRef.current?.epoch !== epoch) return;
        failedRequestRef.current = { selectionKey, requestId };
        dispatch({ type: 'upload-failed', message: uploadErrorMessage(error) });
      } finally {
        if (activeRef.current?.epoch === epoch) activeRef.current = null;
        locksRef.current.upload = false;
      }
    },
    [cancelGeneration, dispatch, hasPendingSave, locksRef, stateRef],
  );

  const remove = useCallback(() => {
    const current = stateRef.current;
    if (
      locksRef.current.save ||
      locksRef.current.close ||
      locksRef.current.reset ||
      locksRef.current.discard ||
      hasPendingSave()
    ) {
      return;
    }
    cancel();
    cancelGeneration();
    failedRequestRef.current = null;
    dispatch({
      type: 'upload-removed',
      sourceKey: createReferencePreviewSourceKey(
        generateStructuredPrompt(current.draft).prompt,
        current.options,
      ),
    });
  }, [cancel, cancelGeneration, dispatch, hasPendingSave, locksRef, stateRef]);

  return { select, remove, cancel } as const;
};
