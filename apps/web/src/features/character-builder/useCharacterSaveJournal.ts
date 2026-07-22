import { type ReferenceImageAsset } from '@studio/contracts';
import { generateStructuredPrompt } from '@studio/domain';
import { useCallback, useRef, type Dispatch } from 'react';
import { fetchReferenceImageMetadata } from '../../adapters/api-client/apiClient';
import { createReferencePreviewSourceKey } from '../prompt-authoring/useReferencePreviewGeneration';
import {
  characterBuilderOperationError,
  createFreshCharacterBuilderDraftValue,
  deriveCharacterName,
  type CharacterBuilderOperationLocksRef,
  type CharacterSaveProgress,
  type CharacterSaveSnapshot,
  type CharacterBuilderStateRef,
} from './characterBuilderControllerSupport';
import type { CharacterBuilderAction } from './machine';
import {
  characterSaveSnapshotFingerprint,
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
}

export interface CharacterSaveJournalController {
  readonly save: () => Promise<void>;
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

  const save = useCallback(async () => {
    const current = stateRef.current;
    if (
      locksRef.current.save ||
      locksRef.current.close ||
      locksRef.current.reset ||
      locksRef.current.discard ||
      locksRef.current.generation ||
      current.operation ||
      ['restoring', 'saving', 'closing', 'saved'].includes(current.phase) ||
      saveBlockedReason
    ) {
      return;
    }
    const generated = generateStructuredPrompt(current.draft);
    if (!generated.validation.valid || !generated.prompt) {
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
    const operationSourceKey = createReferencePreviewSourceKey(generated.prompt, current.options);
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
      if (!pending) {
        const attachPreview =
          current.preview && !current.preview.stale ? current.preview.asset : null;
        const snapshot: PersistedCharacterSaveSnapshot = {
          name: deriveCharacterName(current.design),
          prompt: generated.prompt,
          draft: current.draft,
          design: current.design,
          referenceImageAssetId: attachPreview?.assetId ?? null,
        };
        const nextPending: PendingCharacterSave = {
          characterId: crypto.randomUUID(),
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
  }, [
    clear,
    dispatch,
    locksRef,
    onDismiss,
    onSaveCharacter,
    persistence,
    saveBlockedReason,
    stateRef,
    updatePendingStage,
  ]);

  return { save, clear };
};
