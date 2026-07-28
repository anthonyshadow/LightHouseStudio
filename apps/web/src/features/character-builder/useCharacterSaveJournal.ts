import { type ReferenceImageAsset } from '@studio/contracts';
import {
  ASSET_NAME_MAX_LENGTH,
  containsMeaningfulText,
  generateStructuredPrompt,
  normalizeWhitespace,
} from '@studio/domain';
import { useCallback, useRef, type Dispatch } from 'react';
import { fetchReferenceImageMetadata } from '../../adapters/api-client/apiClient';
import { createReferencePreviewSourceKey } from './characterReferenceIdentity';
import {
  characterBuilderOperationError,
  createFreshCharacterBuilderDraftValue,
  type CharacterBuilderOperationLocksRef,
  type CharacterSaveProgress,
  type CharacterSaveSnapshot,
  type CharacterBuilderStateRef,
} from './characterBuilderControllerSupport';
import type { CharacterBuilderAction } from './machine';
import {
  characterSaveSnapshotFingerprint,
  type CharacterBuilderTarget,
  type CharacterSaveStage,
  type PendingCharacterSave,
  type PersistedCharacterSaveSnapshot,
} from './characterBuilderPersistence';
import type { CharacterBuilderPersistenceController } from './useCharacterBuilderPersistence';

export type SaveCharacterHandler = (
  snapshot: CharacterSaveSnapshot,
  characterId: string,
  stage: CharacterSaveStage,
  progress: CharacterSaveProgress,
) => Promise<void>;

export interface UseCharacterSaveJournalOptions {
  readonly stateRef: CharacterBuilderStateRef;
  readonly locksRef: CharacterBuilderOperationLocksRef;
  readonly dispatch: Dispatch<CharacterBuilderAction>;
  readonly persistence: CharacterBuilderPersistenceController;
  readonly saveBlockedReason?: string | undefined;
  readonly onSaveCharacter: SaveCharacterHandler;
  readonly onDismiss: () => void;
  readonly target?: CharacterBuilderTarget | undefined;
}

export interface CharacterSaveJournalController {
  readonly save: (mode: 'default' | 'image-only', name: string) => Promise<void>;
  readonly clear: () => void;
}

export const useCharacterSaveJournal = ({
  stateRef,
  locksRef,
  dispatch,
  persistence,
  saveBlockedReason,
  onSaveCharacter,
  onDismiss,
  target = { kind: 'create' },
}: UseCharacterSaveJournalOptions): CharacterSaveJournalController => {
  const completedHandoffRef = useRef<string | null>(null);

  const updatePendingStage = useCallback(
    async (pending: PendingCharacterSave, stage: CharacterSaveStage) => {
      const currentPending = persistence.getPendingSave() ?? pending;
      if (
        currentPending.characterId !== pending.characterId ||
        currentPending.snapshotHash !== pending.snapshotHash
      ) {
        throw new Error('The active character save journal changed before its stage update.');
      }
      const stageRank: Record<CharacterSaveStage, number> = {
        intent: 0,
        'character-persisted': 1,
        'studio-preloaded': 2,
      };
      if (stageRank[stage] <= stageRank[currentPending.stage]) return;
      await persistence.persistPendingSave({ ...currentPending, stage }, stateRef.current);
    },
    [persistence, stateRef],
  );

  const clear = useCallback(() => {
    persistence.clearPendingSave();
    completedHandoffRef.current = null;
  }, [persistence]);

  const save = useCallback(
    async (mode: 'default' | 'image-only', requestedName: string) => {
      const current = stateRef.current;
      if (
        locksRef.current.save ||
        locksRef.current.close ||
        locksRef.current.reset ||
        locksRef.current.discard ||
        locksRef.current.generation ||
        locksRef.current.upload ||
        current.operation ||
        ['restoring', 'saving', 'closing', 'saved'].includes(current.phase) ||
        saveBlockedReason
      ) {
        return;
      }
      const name = normalizeWhitespace(requestedName, ASSET_NAME_MAX_LENGTH);
      if (!containsMeaningfulText(name)) {
        dispatch({
          type: 'validation-failed',
          kind: 'save',
          message: 'Enter a useful character name before saving.',
        });
        return;
      }
      const generated = generateStructuredPrompt(current.draft);
      const imageOnly = mode === 'image-only';
      if (imageOnly && !current.uploadedReference) {
        dispatch({
          type: 'validation-failed',
          kind: 'save',
          message: 'Upload a reference image before saving an image-only character.',
        });
        return;
      }
      if (!imageOnly && (!generated.validation.valid || !generated.prompt)) {
        dispatch({
          type: 'validation-failed',
          kind: 'save',
          message:
            generated.validation.blockingIssues[0]?.message ??
            'Choose at least one character detail before saving.',
        });
        return;
      }
      locksRef.current.save = true;

      const operationId = crypto.randomUUID();
      const operationSourceKey = createReferencePreviewSourceKey(
        generated.prompt,
        current.options,
        current.uploadedReference?.asset.assetId,
      );
      dispatch({
        type: 'operation-started',
        phase: 'saving',
        operation: {
          id: operationId,
          sourceRevision: current.revision,
          sourceKey: operationSourceKey,
        },
      });

      try {
        await persistence.waitForWrites();
        let pending = persistence.getPendingSave();
        if (pending && pending.snapshot.name !== name) {
          throw new Error(
            `This resumable save is already named “${pending.snapshot.name}”. Resume with that name or reset the draft.`,
          );
        }
        if (!pending) {
          const attachPreview =
            !imageOnly && current.preview && !current.preview.stale ? current.preview.asset : null;
          const uploadedReference = current.uploadedReference?.asset ?? null;
          const finalReference = attachPreview ?? uploadedReference;
          const finalReferenceKind = finalReference?.source ?? null;
          const preserveLegacyPrompt =
            target.kind === 'edit' &&
            !current.revision &&
            !current.preview?.stale &&
            Boolean(target.originalPrompt);
          const snapshot: PersistedCharacterSaveSnapshot = {
            saveKind: target.kind,
            name,
            prompt: imageOnly
              ? ''
              : preserveLegacyPrompt
                ? target.originalPrompt
                : generated.prompt,
            draft: imageOnly ? null : current.draft,
            design: imageOnly ? null : current.design,
            referenceImageAssetId: finalReference?.assetId ?? null,
            uploadedReferenceImageAssetId: uploadedReference?.assetId ?? null,
            finalReferenceKind,
          };
          const nextPending: PendingCharacterSave = {
            characterId: target.kind === 'edit' ? target.characterId : crypto.randomUUID(),
            snapshotHash: await characterSaveSnapshotFingerprint(snapshot),
            stage: 'intent',
            snapshot,
          };
          await persistence.persistPendingSave(nextPending, current);
          completedHandoffRef.current = null;
          pending = nextPending;
        }

        if ((await characterSaveSnapshotFingerprint(pending.snapshot)) !== pending.snapshotHash) {
          throw new Error(
            'The resumable character save journal no longer matches its frozen snapshot. Reset the draft and try again.',
          );
        }

        let referenceImage: ReferenceImageAsset | null = null;
        if (pending.snapshot.referenceImageAssetId) {
          referenceImage =
            current.preview?.asset.assetId === pending.snapshot.referenceImageAssetId
              ? current.preview.asset
              : current.uploadedReference?.asset.assetId === pending.snapshot.referenceImageAssetId
                ? current.uploadedReference.asset
                : await fetchReferenceImageMetadata(pending.snapshot.referenceImageAssetId);
        }
        const snapshot: CharacterSaveSnapshot = { ...pending.snapshot, referenceImage };
        const handoffKey = `${pending.characterId}:${pending.snapshotHash}`;
        if (pending.stage !== 'studio-preloaded' || completedHandoffRef.current !== handoffKey) {
          await onSaveCharacter(snapshot, pending.characterId, pending.stage, {
            markCharacterPersisted: () => updatePendingStage(pending, 'character-persisted'),
            markStudioPreloaded: () => updatePendingStage(pending, 'studio-preloaded'),
          });
          completedHandoffRef.current = handoffKey;
        }
        await persistence.waitForWrites();
        await persistence.completeDraftDurably();
        clear();
        dispatch({ type: 'saved' });
        const fresh = createFreshCharacterBuilderDraftValue();
        dispatch({
          type: 'reset',
          draft: fresh.draft,
          design: fresh.design,
          options: fresh.options,
        });
        onDismiss();
      } catch (error: unknown) {
        dispatch({
          type: 'operation-failed',
          operationId,
          sourceKey: operationSourceKey,
          kind: 'save',
          message: characterBuilderOperationError(error),
        });
      } finally {
        locksRef.current.save = false;
      }
    },
    [
      clear,
      dispatch,
      locksRef,
      onDismiss,
      onSaveCharacter,
      persistence,
      saveBlockedReason,
      stateRef,
      target,
      updatePendingStage,
    ],
  );

  return { save, clear };
};
