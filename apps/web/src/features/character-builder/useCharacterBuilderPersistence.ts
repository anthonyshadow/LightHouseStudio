import { generateStructuredPrompt } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import { fetchReferenceImageMetadata } from '../../adapters/api-client/apiClient';
import { useStrictModeSafeDisposable } from '../../orchestration/lifecycle/useStrictModeSafeDisposable';
import { createReferencePreviewSourceKey } from './characterReferenceIdentity';
import {
  characterBuilderOperationError,
  createFreshCharacterBuilderDraftValue,
  toPersistedCharacterBuilderPreview,
  toPersistedCharacterBuilderUpload,
  type CharacterBuilderStateRef,
} from './characterBuilderControllerSupport';
import type {
  CharacterBuilderDraftRecord,
  CharacterBuilderDraftRepository,
  CharacterBuilderDraftStorageState,
} from './draftRepository';
import {
  CHARACTER_BUILDER_DRAFT_DATABASE_NAME,
  CharacterBuilderDraftError,
  createCharacterBuilderDraftRepository,
} from './draftRepository';
import type { CharacterBuilderAction, CharacterBuilderState } from './machine';
import {
  sanitizeCharacterBuilderDraftValue,
  type CharacterBuilderDraftValueV1,
  type PendingCharacterSave,
} from './characterBuilderPersistence';

export interface UseCharacterBuilderPersistenceOptions {
  readonly state: CharacterBuilderState;
  readonly stateRef: CharacterBuilderStateRef;
  readonly dispatch: Dispatch<CharacterBuilderAction>;
  readonly initialValue?: CharacterBuilderDraftValueV1 | undefined;
  readonly ownerUserId?: string | undefined;
}

export interface CharacterBuilderPersistenceController {
  readonly autosaveMessage: string | null;
  readonly pendingSave: PendingCharacterSave | null;
  readonly getPendingSave: () => PendingCharacterSave | null;
  readonly persistPendingSave: (
    pending: PendingCharacterSave,
    source?: CharacterBuilderState,
  ) => Promise<void>;
  readonly waitForWrites: () => Promise<unknown>;
  readonly persistForClose: (
    source: CharacterBuilderState,
  ) => Promise<CharacterBuilderDraftStorageState>;
  readonly completeDraftDurably: () => Promise<void>;
  readonly resetStoredDraft: () => Promise<void>;
  readonly clearPendingSave: () => void;
  readonly retryDurableStorage: () => Promise<CharacterBuilderDraftStorageState>;
  readonly setAutosaveMessage: (message: string | null) => void;
  readonly reportPersistenceError: (error: unknown) => void;
}

export const useCharacterBuilderPersistence = ({
  state,
  stateRef,
  dispatch,
  initialValue,
  ownerUserId,
}: UseCharacterBuilderPersistenceOptions): CharacterBuilderPersistenceController => {
  const [autosaveMessage, setAutosaveMessage] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingCharacterSave | null>(null);
  const pendingSaveRef = useRef(pendingSave);
  const recordRef = useRef<CharacterBuilderDraftRecord<CharacterBuilderDraftValueV1> | null>(null);
  const targetRef = useRef(initialValue?.target ?? createFreshCharacterBuilderDraftValue().target);
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const restoredRef = useRef(false);

  useEffect(() => {
    pendingSaveRef.current = pendingSave;
  }, [pendingSave]);

  const repository = useMemo<CharacterBuilderDraftRepository<CharacterBuilderDraftValueV1>>(
    () =>
      createCharacterBuilderDraftRepository({
        sanitizeDraft: sanitizeCharacterBuilderDraftValue,
        ...(ownerUserId
          ? { databaseName: `${CHARACTER_BUILDER_DRAFT_DATABASE_NAME}.${ownerUserId}` }
          : {}),
      }),
    [ownerUserId],
  );
  useStrictModeSafeDisposable(repository);

  const currentValue = useCallback(
    (
      source = stateRef.current,
      pending = pendingSaveRef.current,
    ): CharacterBuilderDraftValueV1 => ({
      target: targetRef.current,
      draft: source.draft,
      design: source.design,
      options: source.options,
      preview: toPersistedCharacterBuilderPreview(source),
      uploadedReference: toPersistedCharacterBuilderUpload(source),
      pendingSave: pending,
    }),
    [stateRef],
  );

  const enqueueWrite = useCallback(
    (value: CharacterBuilderDraftValueV1, uiRevision: number, requireDurable = false) => {
      const write = async () => {
        const persist = requireDurable ? repository.saveDurably : repository.save;
        const record = await persist({
          expectedRevision: recordRef.current?.revision ?? null,
          value,
        });
        recordRef.current = record;
        const storage = repository.getStorageState();
        setAutosaveMessage(storage.durable ? null : storage.notice);
        dispatch({ type: 'autosaved', revision: uiRevision });
        return record;
      };
      const next = writeQueueRef.current.then(write, write);
      writeQueueRef.current = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    [dispatch, repository],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void repository
      .load()
      .then(async (record) => {
        if (!active) return;
        recordRef.current = record;
        const value = record?.value ?? initialValue ?? createFreshCharacterBuilderDraftValue();
        targetRef.current = value.target;
        setPendingSave(value.pendingSave);
        let uploadedReference: CharacterBuilderState['uploadedReference'] = null;
        if (value.uploadedReference) {
          try {
            const asset = await fetchReferenceImageMetadata(
              value.uploadedReference.assetId,
              controller.signal,
            );
            if (!active) return;
            if (asset.source !== 'uploaded') {
              throw new Error('The saved upload no longer points to an uploaded asset.');
            }
            uploadedReference = {
              asset,
              displayName: value.uploadedReference.displayName,
            };
          } catch {
            setAutosaveMessage(
              'The saved draft was restored, but its uploaded reference is no longer available.',
            );
          }
        }
        let preview: CharacterBuilderState['preview'] = null;
        if (value.preview) {
          try {
            const asset = await fetchReferenceImageMetadata(
              value.preview.assetId,
              controller.signal,
            );
            if (!active) return;
            if (asset.source !== 'generated') {
              throw new Error('The saved preview no longer points to a generated asset.');
            }
            preview = {
              asset,
              sourceKey: value.preview.sourceKey,
              stale:
                value.preview.stale ||
                value.preview.sourceKey !==
                  createReferencePreviewSourceKey(
                    generateStructuredPrompt(value.draft).prompt,
                    value.options,
                    uploadedReference?.asset.assetId,
                  ),
            };
          } catch {
            setAutosaveMessage(
              'The saved draft was restored, but its previous preview is no longer available.',
            );
          }
        }
        restoredRef.current = true;
        dispatch({
          type: 'restored',
          draft: value.draft,
          design: value.design,
          options: value.options,
          revision: 0,
          preview,
          uploadedReference,
        });
        const storage = repository.getStorageState();
        if (!storage.durable) setAutosaveMessage(storage.notice);
      })
      .catch((error: unknown) => {
        if (!active) return;
        restoredRef.current = true;
        setAutosaveMessage(characterBuilderOperationError(error));
        const fresh = createFreshCharacterBuilderDraftValue();
        dispatch({
          type: 'restored',
          draft: fresh.draft,
          design: fresh.design,
          options: fresh.options,
          revision: 0,
          preview: null,
          uploadedReference: null,
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [dispatch, initialValue, repository]);

  useEffect(() => {
    if (
      !restoredRef.current ||
      state.phase === 'restoring' ||
      state.phase === 'saving' ||
      state.phase === 'closing' ||
      state.phase === 'confirming-reset' ||
      state.phase === 'saved' ||
      state.revision <= state.durableRevision
    ) {
      return;
    }
    const revision = state.revision;
    const value = currentValue(state, pendingSave);
    const timer = window.setTimeout(() => {
      void enqueueWrite(value, revision).catch((error: unknown) =>
        setAutosaveMessage(characterBuilderOperationError(error)),
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentValue, enqueueWrite, pendingSave, state]);

  const getPendingSave = useCallback(() => pendingSaveRef.current, []);

  const persistPendingSave = useCallback(
    async (pending: PendingCharacterSave, source = stateRef.current) => {
      await enqueueWrite(currentValue(source, pending), source.revision, true);
      pendingSaveRef.current = pending;
      setPendingSave(pending);
    },
    [currentValue, enqueueWrite, stateRef],
  );

  const waitForWrites = useCallback(() => writeQueueRef.current, []);

  const persistForClose = useCallback(
    async (source: CharacterBuilderState) => {
      if (!repository.getStorageState().durable) {
        await repository.retryDurableStorage();
      }
      await enqueueWrite(currentValue(source), source.revision);
      await writeQueueRef.current;
      return repository.getStorageState();
    },
    [currentValue, enqueueWrite, repository],
  );

  const completeDraftDurably = useCallback(async () => {
    if (!recordRef.current) throw new Error('The resumable character draft was not found.');
    await repository.completeDurably({ expectedRevision: recordRef.current.revision });
    recordRef.current = null;
  }, [repository]);

  const resetStoredDraft = useCallback(async () => {
    const expectedRevision = recordRef.current?.revision ?? null;
    try {
      await repository.resetDurably({ expectedRevision });
      recordRef.current = null;
    } catch (error: unknown) {
      if (error instanceof CharacterBuilderDraftError && error.code === 'unsupported-schema') {
        await repository.repairDurably();
        recordRef.current = null;
        return;
      }
      if (repository.getStorageState().health === 'session-only') {
        await repository.reset({ expectedRevision });
        recordRef.current = null;
        return;
      }
      throw error;
    }
  }, [repository]);

  const clearPendingSave = useCallback(() => {
    pendingSaveRef.current = null;
    setPendingSave(null);
  }, []);

  const reportPersistenceError = useCallback((error: unknown) => {
    setAutosaveMessage(characterBuilderOperationError(error));
  }, []);

  const retryDurableStorage = useCallback(() => repository.retryDurableStorage(), [repository]);

  return {
    autosaveMessage,
    pendingSave,
    getPendingSave,
    persistPendingSave,
    waitForWrites,
    persistForClose,
    completeDraftDurably,
    resetStoredDraft,
    clearPendingSave,
    retryDurableStorage,
    setAutosaveMessage,
    reportPersistenceError,
  };
};
