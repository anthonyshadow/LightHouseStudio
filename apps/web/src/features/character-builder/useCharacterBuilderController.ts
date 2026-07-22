import { type CharacterReferenceOptions } from '@studio/contracts';
import {
  generateStructuredPrompt,
  type CharacterTransformDraft,
  type GuidedDesignV1,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { LocalProjectRepository } from '../guided-flow/types';
import { createReferencePreviewSourceKey } from '../prompt-authoring/useReferencePreviewGeneration';
import {
  characterBuilderOperationError,
  createCharacterBuilderOperationLocks,
  createFreshCharacterBuilderDraftValue,
  type CharacterSaveProgress,
  type CharacterSaveSnapshot,
} from './characterBuilderControllerSupport';
import {
  characterBuilderReducer,
  createCharacterBuilderState,
  type CharacterBuilderState,
} from './machine';
import { useCharacterBuilderPersistence } from './useCharacterBuilderPersistence';
import { useCharacterReferenceGeneration } from './useCharacterReferenceGeneration';
import { useCharacterSaveJournal } from './useCharacterSaveJournal';
import type { CharacterSaveStage } from './characterBuilderPersistence';

export {
  sanitizeCharacterBuilderDraftValue,
  type CharacterBuilderDraftValueV1,
  type CharacterSaveStage,
  type PendingCharacterSave,
  type PersistedCharacterBuilderPreview,
  type PersistedCharacterSaveSnapshot,
} from './characterBuilderPersistence';
export type {
  CharacterSaveProgress,
  CharacterSaveSnapshot,
} from './characterBuilderControllerSupport';

export interface UseCharacterBuilderControllerOptions {
  readonly open: boolean;
  readonly generationAvailable: boolean;
  readonly editAvailable: boolean;
  readonly saveBlockedReason?: string | undefined;
  readonly legacyRepository?: LocalProjectRepository | undefined;
  readonly onSaveCharacter: (
    snapshot: CharacterSaveSnapshot,
    characterId: string,
    stage: CharacterSaveStage,
    progress: CharacterSaveProgress,
  ) => Promise<void>;
  readonly onDismiss: () => void;
}

const editIsBlocked = (
  state: CharacterBuilderState,
  locks: ReturnType<typeof createCharacterBuilderOperationLocks>,
  saveRecoveryPending: boolean,
) =>
  locks.save ||
  locks.close ||
  locks.reset ||
  locks.discard ||
  saveRecoveryPending ||
  ['restoring', 'saving', 'closing', 'saved'].includes(state.phase);

export const useCharacterBuilderController = ({
  open,
  generationAvailable,
  editAvailable,
  saveBlockedReason,
  legacyRepository,
  onSaveCharacter,
  onDismiss,
}: UseCharacterBuilderControllerOptions) => {
  const initialValue = useMemo(() => createFreshCharacterBuilderDraftValue(), []);
  const [state, dispatch] = useReducer(
    characterBuilderReducer,
    createCharacterBuilderState(initialValue.draft, initialValue.design, initialValue.options),
  );
  const [discardCloseOpen, setDiscardCloseOpen] = useState(false);
  const [discardCloseBusy, setDiscardCloseBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const stateRef = useRef(state);
  const locksRef = useRef(createCharacterBuilderOperationLocks());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const persistence = useCharacterBuilderPersistence({
    state,
    stateRef,
    dispatch,
    legacyRepository,
  });
  const {
    autosaveMessage,
    pendingSave,
    getPendingSave,
    waitForWrites,
    persistForClose,
    resetStoredDraft,
    retryDurableStorage,
    setAutosaveMessage,
    reportPersistenceError,
  } = persistence;
  const hasPendingSave = useCallback(() => getPendingSave() !== null, [getPendingSave]);
  const {
    cancel: cancelGeneration,
    generatePreview,
    regenerate,
  } = useCharacterReferenceGeneration({
    open,
    generationAvailable,
    editAvailable,
    stateRef,
    locksRef,
    dispatch,
    hasPendingSave,
  });
  const { save: saveCharacter, clear: clearSaveJournal } = useCharacterSaveJournal({
    stateRef,
    locksRef,
    dispatch,
    persistence,
    saveBlockedReason,
    onSaveCharacter,
    onDismiss,
  });

  const changeDraft = useCallback(
    (draft: CharacterTransformDraft, design: GuidedDesignV1) => {
      const current = stateRef.current;
      if (editIsBlocked(current, locksRef.current, hasPendingSave())) return;
      cancelGeneration();
      const sourceKey = createReferencePreviewSourceKey(
        generateStructuredPrompt(draft).prompt,
        current.options,
      );
      dispatch({ type: 'edited', draft, design, sourceKey });
    },
    [cancelGeneration, hasPendingSave],
  );

  const changeOptions = useCallback(
    (options: CharacterReferenceOptions) => {
      const current = stateRef.current;
      if (editIsBlocked(current, locksRef.current, hasPendingSave())) return;
      cancelGeneration();
      const sourceKey = createReferencePreviewSourceKey(
        generateStructuredPrompt(current.draft).prompt,
        options,
      );
      dispatch({ type: 'options-changed', options, sourceKey });
    },
    [cancelGeneration, hasPendingSave],
  );

  const requestClose = useCallback(() => {
    if (
      locksRef.current.save ||
      locksRef.current.close ||
      locksRef.current.reset ||
      locksRef.current.discard ||
      stateRef.current.phase === 'saving' ||
      stateRef.current.phase === 'closing'
    ) {
      return;
    }
    locksRef.current.close = true;
    cancelGeneration();
    dispatch({ type: 'closing' });
    const current = stateRef.current;
    void persistForClose(current)
      .then((storage) => {
        if (!storage.durable) {
          setAutosaveMessage(storage.notice);
          setDiscardCloseOpen(true);
          dispatch({ type: 'closed' });
          return;
        }
        dispatch({ type: 'closed' });
        onDismiss();
      })
      .catch((error: unknown) => {
        reportPersistenceError(error);
        setDiscardCloseOpen(true);
        dispatch({ type: 'closed' });
      })
      .finally(() => {
        locksRef.current.close = false;
      });
  }, [cancelGeneration, onDismiss, persistForClose, reportPersistenceError, setAutosaveMessage]);

  const confirmDiscardClose = useCallback(() => {
    if (locksRef.current.discard || locksRef.current.reset || locksRef.current.save) return;
    locksRef.current.discard = true;
    setDiscardCloseBusy(true);
    cancelGeneration();
    void (async () => {
      let discarded = false;
      try {
        await waitForWrites();
        await resetStoredDraft();
        discarded = true;
      } catch (error: unknown) {
        reportPersistenceError(error);
      }
      if (!discarded) {
        locksRef.current.discard = false;
        setDiscardCloseBusy(false);
        return;
      }
      clearSaveJournal();
      setDiscardCloseOpen(false);
      const fresh = createFreshCharacterBuilderDraftValue();
      dispatch({
        type: 'reset',
        draft: fresh.draft,
        design: fresh.design,
        options: fresh.options,
      });
      onDismiss();
      locksRef.current.discard = false;
      setDiscardCloseBusy(false);
    })();
  }, [
    cancelGeneration,
    clearSaveJournal,
    onDismiss,
    reportPersistenceError,
    resetStoredDraft,
    waitForWrites,
  ]);

  const confirmReset = useCallback(() => {
    if (
      locksRef.current.reset ||
      locksRef.current.discard ||
      locksRef.current.save ||
      locksRef.current.close
    ) {
      return;
    }
    locksRef.current.reset = true;
    setResetBusy(true);
    cancelGeneration();
    void (async () => {
      try {
        await waitForWrites();
        await resetStoredDraft();
        clearSaveJournal();
        setAutosaveMessage(null);
        const fresh = createFreshCharacterBuilderDraftValue();
        dispatch({
          type: 'reset',
          draft: fresh.draft,
          design: fresh.design,
          options: fresh.options,
        });
      } catch (error: unknown) {
        dispatch({
          type: 'validation-failed',
          kind: 'save',
          message: characterBuilderOperationError(error),
        });
      } finally {
        locksRef.current.reset = false;
        setResetBusy(false);
      }
    })();
  }, [cancelGeneration, clearSaveJournal, resetStoredDraft, setAutosaveMessage, waitForWrites]);

  const generated = generateStructuredPrompt(state.draft);
  const canSave = Boolean(
    generated.validation.valid && generated.prompt && state.phase !== 'restoring',
  );

  return {
    state,
    generationAvailable,
    editAvailable,
    saveBlockedReason,
    autosaveMessage,
    discardCloseOpen,
    discardCloseBusy,
    resetBusy,
    saveRecoveryPending: pendingSave !== null,
    canSave,
    onChange: changeDraft,
    onOptionsChange: changeOptions,
    onGenerate: generatePreview,
    onRequestRegeneration: () => {
      if (
        !locksRef.current.generation &&
        !locksRef.current.save &&
        !locksRef.current.close &&
        !locksRef.current.reset &&
        !locksRef.current.discard
      ) {
        dispatch({ type: 'request-regeneration' });
      }
    },
    onRegenerate: regenerate,
    onCancelRegeneration: () => dispatch({ type: 'cancel-regeneration' }),
    onRequestReset: () => {
      if (
        !locksRef.current.save &&
        !locksRef.current.close &&
        !locksRef.current.reset &&
        !locksRef.current.discard
      ) {
        cancelGeneration();
        locksRef.current.generation = false;
        dispatch({ type: 'request-reset' });
      }
    },
    onConfirmReset: confirmReset,
    onCancelReset: () => {
      if (!locksRef.current.reset) dispatch({ type: 'cancel-reset' });
    },
    onClose: requestClose,
    onSave: () => void saveCharacter(),
    onCancelDiscardClose: () => {
      if (locksRef.current.discard) return;
      setDiscardCloseOpen(false);
      void retryDurableStorage()
        .then((storage) => setAutosaveMessage(storage.durable ? null : storage.notice))
        .catch((error: unknown) => reportPersistenceError(error));
    },
    onConfirmDiscardClose: confirmDiscardClose,
  } as const;
};
