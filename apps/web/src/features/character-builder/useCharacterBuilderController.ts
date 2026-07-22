import {
  characterReferenceOptionsSchema,
  referenceImageAssetIdSchema,
  type CharacterReferenceOptions,
  type ReferenceImageAsset,
} from '@studio/contracts';
import {
  GUIDED_CHOICE_KEYS,
  createPromptBuilderDraft,
  generateStructuredPrompt,
  sanitizePromptBuilderDraft,
  type CharacterTransformDraft,
  type GuidedChoiceKey,
  type GuidedChoiceValue,
  type GuidedDesignV1,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ApiClientError, fetchReferenceImageMetadata } from '../../adapters/api-client/apiClient';
import type { LocalProjectRepository } from '../guided-flow/types';
import { createEmptyGuidedDesign } from './CharacterBuilderForm';
import {
  createReferencePreviewSourceKey,
  useReferencePreviewGeneration,
  type ReferencePreviewGenerationResult,
} from '../prompt-authoring/useReferencePreviewGeneration';
import {
  CharacterBuilderDraftError,
  createCharacterBuilderDraftRepository,
  type CharacterBuilderDraftRecord,
  type CharacterBuilderDraftRepository,
} from './draftRepository';
import {
  characterBuilderReducer,
  createCharacterBuilderState,
  type CharacterBuilderOperation,
  type CharacterBuilderState,
} from './machine';
import { DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS } from './ReferenceOptionsFields';

export type CharacterSaveStage = 'intent' | 'character-persisted' | 'studio-preloaded';

export interface PersistedCharacterSaveSnapshot {
  readonly name: string;
  readonly prompt: string;
  readonly draft: CharacterTransformDraft;
  readonly design: GuidedDesignV1;
  readonly referenceImageAssetId: string | null;
}

export interface PendingCharacterSave {
  readonly characterId: string;
  readonly snapshotHash: string;
  readonly stage: CharacterSaveStage;
  readonly snapshot: PersistedCharacterSaveSnapshot;
}

export interface PersistedCharacterBuilderPreview {
  readonly assetId: string;
  readonly sourceKey: string;
  readonly stale: boolean;
}

export interface CharacterBuilderDraftValueV1 {
  readonly draft: CharacterTransformDraft;
  readonly design: GuidedDesignV1;
  readonly options: CharacterReferenceOptions;
  readonly preview: PersistedCharacterBuilderPreview | null;
  readonly pendingSave: PendingCharacterSave | null;
}

export interface CharacterSaveSnapshot extends PersistedCharacterSaveSnapshot {
  readonly referenceImage: ReferenceImageAsset | null;
}

export interface CharacterSaveProgress {
  markCharacterPersisted(): Promise<void>;
  markStudioPreloaded(): Promise<void>;
}

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sanitizeChoice = (value: unknown): GuidedChoiceValue | null | undefined => {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.optionId !== 'string' || !value.optionId.trim()) {
    return undefined;
  }
  if (value.optionId === 'custom') {
    return typeof value.customValue === 'string' && value.customValue.trim()
      ? { optionId: 'custom', customValue: value.customValue.slice(0, 500) }
      : undefined;
  }
  return { optionId: value.optionId.slice(0, 256) };
};

const sanitizeDesign = (value: unknown): GuidedDesignV1 | null => {
  if (!isRecord(value) || value.catalogVersion !== 1 || !isRecord(value.choices)) return null;
  const choices = {} as Record<GuidedChoiceKey, GuidedChoiceValue | null>;
  for (const key of GUIDED_CHOICE_KEYS) {
    const choice = sanitizeChoice(value.choices[key]);
    if (choice === undefined) return null;
    choices[key] = choice;
  }
  return {
    catalogVersion: 1,
    starterId:
      value.starterId === null
        ? null
        : typeof value.starterId === 'string' && value.starterId.length <= 256
          ? value.starterId
          : null,
    choices,
  };
};

const sanitizeSnapshot = (value: unknown): PersistedCharacterSaveSnapshot | null => {
  if (!isRecord(value)) return null;
  const draft = sanitizePromptBuilderDraft(value.draft);
  const design = sanitizeDesign(value.design);
  const reference =
    value.referenceImageAssetId === null
      ? null
      : referenceImageAssetIdSchema.safeParse(value.referenceImageAssetId);
  if (
    draft?.intent !== 'character-transform' ||
    !design ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    typeof value.prompt !== 'string' ||
    !value.prompt.trim() ||
    (reference !== null && !reference.success)
  ) {
    return null;
  }
  return {
    name: value.name.slice(0, 80),
    prompt: value.prompt.slice(0, 10_000),
    draft,
    design,
    referenceImageAssetId: reference === null ? null : reference.data,
  };
};

const sanitizePendingSave = (value: unknown): PendingCharacterSave | null => {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.characterId !== 'string' ||
    !value.characterId.trim() ||
    typeof value.snapshotHash !== 'string' ||
    !value.snapshotHash.trim() ||
    !['intent', 'character-persisted', 'studio-preloaded'].includes(String(value.stage))
  ) {
    return null;
  }
  const snapshot = sanitizeSnapshot(value.snapshot);
  if (!snapshot) return null;
  return {
    characterId: value.characterId,
    snapshotHash: value.snapshotHash,
    stage: value.stage as CharacterSaveStage,
    snapshot,
  };
};

export const sanitizeCharacterBuilderDraftValue = (
  value: unknown,
): CharacterBuilderDraftValueV1 | null => {
  if (!isRecord(value)) return null;
  const draft = sanitizePromptBuilderDraft(value.draft);
  const design = sanitizeDesign(value.design);
  const options = characterReferenceOptionsSchema.safeParse(value.options);
  const rawPendingSave = value.pendingSave ?? null;
  const pendingSave = sanitizePendingSave(rawPendingSave);
  if (
    draft?.intent !== 'character-transform' ||
    !design ||
    !options.success ||
    (rawPendingSave !== null && pendingSave === null)
  ) {
    return null;
  }

  let preview: PersistedCharacterBuilderPreview | null = null;
  if (value.preview !== null && value.preview !== undefined) {
    if (!isRecord(value.preview)) return null;
    const assetId = referenceImageAssetIdSchema.safeParse(value.preview.assetId);
    if (
      !assetId.success ||
      typeof value.preview.sourceKey !== 'string' ||
      !value.preview.sourceKey.trim() ||
      typeof value.preview.stale !== 'boolean'
    ) {
      return null;
    }
    preview = {
      assetId: assetId.data,
      sourceKey: value.preview.sourceKey,
      stale: value.preview.stale,
    };
  }
  return { draft, design, options: options.data, preview, pendingSave };
};

const freshDraftValue = (): CharacterBuilderDraftValueV1 => ({
  draft: createPromptBuilderDraft('character-transform'),
  design: createEmptyGuidedDesign(),
  options: DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
  preview: null,
  pendingSave: null,
});

const persistedPreview = (state: CharacterBuilderState): PersistedCharacterBuilderPreview | null =>
  state.preview
    ? {
        assetId: state.preview.asset.assetId,
        sourceKey: state.preview.sourceKey,
        stale: state.preview.stale,
      }
    : null;

const deriveCharacterName = (design: GuidedDesignV1): string => {
  const base = design.starterId ?? 'new-character';
  return `${base
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')} 01`;
};

const snapshotFingerprint = async (snapshot: PersistedCharacterSaveSnapshot): Promise<string> => {
  const serialized = JSON.stringify(snapshot);
  try {
    const bytes = new TextEncoder().encode(serialized);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch {
    let hash = 2_166_136_261;
    for (const character of serialized) {
      hash ^= character.codePointAt(0) ?? 0;
      hash = Math.imul(hash, 16_777_619);
    }
    return `fallback-${(hash >>> 0).toString(16)}`;
  }
};

const operationError = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'moderation_blocked':
        return 'The provider could not accept this character direction. Adjust it and try again.';
      case 'generation_in_progress':
        return 'Another reference request is still finishing. Wait a moment, then retry.';
      case 'request_timeout':
        return 'The image request timed out. Your character and previous preview are unchanged.';
      case 'edit_unavailable':
      case 'provider_configuration':
        return 'Instructed image editing is not available. Leave feedback blank for a fresh preview.';
      default:
        return error.message;
    }
  }
  return error instanceof Error
    ? error.message
    : 'The operation could not finish. Your character draft is unchanged.';
};

const createLegacyMigration = (repository: LocalProjectRepository | undefined) =>
  repository
    ? {
        id: 'guided-character-design-v1',
        async loadNewestCharacterDesign() {
          await repository.initialize();
          const projects = await repository.list();
          for (const summary of projects) {
            if (summary.checkpoint !== 'character-design') continue;
            const record = await repository.load(summary.id);
            if (!record?.data.characterDraft || !record.data.guidedDesign) continue;
            const value = sanitizeCharacterBuilderDraftValue({
              draft: record.data.characterDraft,
              design: record.data.guidedDesign,
              options: DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
              preview: record.data.referenceImageAssetId
                ? {
                    assetId: record.data.referenceImageAssetId,
                    sourceKey: createReferencePreviewSourceKey(
                      record.data.characterPrompt,
                      DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
                    ),
                    stale: record.data.referenceImageStale,
                  }
                : null,
              pendingSave: null,
            });
            if (!value) continue;
            return {
              sourceId: record.id,
              sourceRevision: record.revision,
              sourceUpdatedAt: record.updatedAt,
              value,
            };
          }
          return null;
        },
      }
    : null;

export const useCharacterBuilderController = ({
  open,
  generationAvailable,
  editAvailable,
  saveBlockedReason,
  legacyRepository,
  onSaveCharacter,
  onDismiss,
}: UseCharacterBuilderControllerOptions) => {
  const initialValue = useMemo(() => freshDraftValue(), []);
  const [state, dispatch] = useReducer(
    characterBuilderReducer,
    createCharacterBuilderState(initialValue.draft, initialValue.design, initialValue.options),
  );
  const [autosaveMessage, setAutosaveMessage] = useState<string | null>(null);
  const [discardCloseOpen, setDiscardCloseOpen] = useState(false);
  const [discardCloseBusy, setDiscardCloseBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [pendingSave, setPendingSave] = useState<PendingCharacterSave | null>(null);
  const stateRef = useRef(state);
  const pendingSaveRef = useRef(pendingSave);
  const recordRef = useRef<CharacterBuilderDraftRecord<CharacterBuilderDraftValueV1> | null>(null);
  const writeQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const restoredRef = useRef(false);
  const saveLockRef = useRef(false);
  const closeLockRef = useRef(false);
  const discardLockRef = useRef(false);
  const resetLockRef = useRef(false);
  const generationLockRef = useRef(false);
  const completedHandoffRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    pendingSaveRef.current = pendingSave;
  }, [pendingSave]);

  const repository = useMemo<CharacterBuilderDraftRepository<CharacterBuilderDraftValueV1>>(
    () =>
      createCharacterBuilderDraftRepository({
        sanitizeDraft: sanitizeCharacterBuilderDraftValue,
        legacyMigration: createLegacyMigration(legacyRepository),
      }),
    [legacyRepository],
  );

  const currentValue = useCallback(
    (
      source = stateRef.current,
      pending = pendingSaveRef.current,
    ): CharacterBuilderDraftValueV1 => ({
      draft: source.draft,
      design: source.design,
      options: source.options,
      preview: persistedPreview(source),
      pendingSave: pending,
    }),
    [],
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
    [repository],
  );

  useEffect(() => {
    let active = true;
    void repository
      .load()
      .then(async (record) => {
        if (!active) return;
        recordRef.current = record;
        const value = record?.value ?? freshDraftValue();
        setPendingSave(value.pendingSave);
        let preview: CharacterBuilderState['preview'] = null;
        if (value.preview) {
          try {
            const asset = await fetchReferenceImageMetadata(value.preview.assetId);
            if (!active) return;
            preview = {
              asset,
              sourceKey: value.preview.sourceKey,
              stale:
                value.preview.stale ||
                value.preview.sourceKey !==
                  createReferencePreviewSourceKey(
                    generateStructuredPrompt(value.draft).prompt,
                    value.options,
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
        });
        const storage = repository.getStorageState();
        if (!storage.durable) setAutosaveMessage(storage.notice);
      })
      .catch((error: unknown) => {
        if (!active) return;
        restoredRef.current = true;
        setAutosaveMessage(operationError(error));
        const fresh = freshDraftValue();
        dispatch({
          type: 'restored',
          draft: fresh.draft,
          design: fresh.design,
          options: fresh.options,
          revision: 0,
          preview: null,
        });
      });
    return () => {
      active = false;
    };
  }, [repository]);

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
        setAutosaveMessage(operationError(error)),
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentValue, enqueueWrite, pendingSave, state]);

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
        message: operationError(error),
      });
    },
  });
  const cancelGeneration = generation.cancel;

  useEffect(() => {
    if (open) return;
    cancelGeneration();
    generationLockRef.current = false;
  }, [cancelGeneration, open]);

  const changeDraft = useCallback(
    (draft: CharacterTransformDraft, design: GuidedDesignV1) => {
      if (
        saveLockRef.current ||
        closeLockRef.current ||
        resetLockRef.current ||
        discardLockRef.current ||
        pendingSaveRef.current ||
        ['restoring', 'saving', 'closing', 'saved'].includes(stateRef.current.phase)
      ) {
        return;
      }
      generation.cancel();
      const sourceKey = createReferencePreviewSourceKey(
        generateStructuredPrompt(draft).prompt,
        stateRef.current.options,
      );
      dispatch({ type: 'edited', draft, design, sourceKey });
    },
    [generation],
  );

  const changeOptions = useCallback(
    (options: CharacterReferenceOptions) => {
      if (
        saveLockRef.current ||
        closeLockRef.current ||
        resetLockRef.current ||
        discardLockRef.current ||
        pendingSaveRef.current ||
        ['restoring', 'saving', 'closing', 'saved'].includes(stateRef.current.phase)
      ) {
        return;
      }
      generation.cancel();
      const sourceKey = createReferencePreviewSourceKey(
        generateStructuredPrompt(stateRef.current.draft).prompt,
        options,
      );
      dispatch({ type: 'options-changed', options, sourceKey });
    },
    [generation],
  );

  const generatePreview = useCallback(() => {
    if (
      generationLockRef.current ||
      saveLockRef.current ||
      closeLockRef.current ||
      resetLockRef.current ||
      discardLockRef.current ||
      pendingSaveRef.current ||
      ['restoring', 'saving', 'closing', 'saved'].includes(stateRef.current.phase)
    ) {
      return;
    }
    const current = stateRef.current;
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
    generationLockRef.current = true;
    void generation
      .generate({ rawPrompt: generated.prompt, options: parsedOptions.data })
      .finally(() => {
        generationLockRef.current = false;
      });
  }, [generation, generationAvailable]);

  const regenerate = useCallback(
    (changeInstructions: string) => {
      if (
        generationLockRef.current ||
        saveLockRef.current ||
        closeLockRef.current ||
        resetLockRef.current ||
        discardLockRef.current ||
        pendingSaveRef.current ||
        ['restoring', 'saving', 'closing', 'saved'].includes(stateRef.current.phase)
      ) {
        return;
      }
      const current = stateRef.current;
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
      generationLockRef.current = true;
      void generation
        .generate({
          rawPrompt: generated.prompt,
          options: current.options,
          ...(instructions
            ? { sourceAssetId: preview.asset.assetId, changeInstructions: instructions }
            : {}),
        })
        .finally(() => {
          generationLockRef.current = false;
        });
    },
    [editAvailable, generation],
  );

  const updatePendingStage = useCallback(
    async (pending: PendingCharacterSave, stage: CharacterSaveStage) => {
      const currentPending = pendingSaveRef.current ?? pending;
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
      const next = { ...currentPending, stage };
      await enqueueWrite(currentValue(stateRef.current, next), stateRef.current.revision, true);
      pendingSaveRef.current = next;
      setPendingSave(next);
    },
    [currentValue, enqueueWrite],
  );

  const save = useCallback(async () => {
    const current = stateRef.current;
    if (
      saveLockRef.current ||
      closeLockRef.current ||
      resetLockRef.current ||
      discardLockRef.current ||
      generationLockRef.current ||
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
    saveLockRef.current = true;

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
      await writeQueueRef.current;
      let pending = pendingSaveRef.current;
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
          snapshotHash: await snapshotFingerprint(snapshot),
          stage: 'intent',
          snapshot,
        };
        await enqueueWrite(currentValue(current, nextPending), current.revision, true);
        completedHandoffRef.current = null;
        pendingSaveRef.current = nextPending;
        setPendingSave(nextPending);
        pending = nextPending;
      }

      if ((await snapshotFingerprint(pending.snapshot)) !== pending.snapshotHash) {
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
      await writeQueueRef.current;
      if (!recordRef.current) throw new Error('The resumable character draft was not found.');
      await repository.completeDurably({ expectedRevision: recordRef.current.revision });
      recordRef.current = null;
      pendingSaveRef.current = null;
      completedHandoffRef.current = null;
      setPendingSave(null);
      dispatch({ type: 'saved' });
      const fresh = freshDraftValue();
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
        message: operationError(error),
      });
    } finally {
      saveLockRef.current = false;
    }
  }, [
    currentValue,
    enqueueWrite,
    onDismiss,
    onSaveCharacter,
    repository,
    saveBlockedReason,
    updatePendingStage,
  ]);

  const requestClose = useCallback(() => {
    if (
      saveLockRef.current ||
      closeLockRef.current ||
      resetLockRef.current ||
      discardLockRef.current ||
      stateRef.current.phase === 'saving' ||
      stateRef.current.phase === 'closing'
    ) {
      return;
    }
    closeLockRef.current = true;
    generation.cancel();
    dispatch({ type: 'closing' });
    const current = stateRef.current;
    void (async () => {
      try {
        if (!repository.getStorageState().durable) {
          await repository.retryDurableStorage();
        }
        await enqueueWrite(currentValue(current), current.revision);
        await writeQueueRef.current;
        const storage = repository.getStorageState();
        if (!storage.durable) {
          setAutosaveMessage(storage.notice);
          setDiscardCloseOpen(true);
          dispatch({ type: 'closed' });
          return;
        }
        dispatch({ type: 'closed' });
        onDismiss();
      } catch (error: unknown) {
        setAutosaveMessage(operationError(error));
        setDiscardCloseOpen(true);
        dispatch({ type: 'closed' });
      } finally {
        closeLockRef.current = false;
      }
    })();
  }, [currentValue, enqueueWrite, generation, onDismiss, repository]);

  const resetStoredDraft = useCallback(async () => {
    const expectedRevision = recordRef.current?.revision ?? null;
    try {
      await repository.resetDurably({ expectedRevision });
    } catch (error: unknown) {
      if (error instanceof CharacterBuilderDraftError && error.code === 'unsupported-schema') {
        await repository.repairDurably();
        return;
      }
      if (repository.getStorageState().health === 'session-only') {
        await repository.reset({ expectedRevision });
        return;
      }
      throw error;
    }
  }, [repository]);

  const confirmDiscardClose = useCallback(() => {
    if (discardLockRef.current || resetLockRef.current || saveLockRef.current) return;
    discardLockRef.current = true;
    setDiscardCloseBusy(true);
    generation.cancel();
    void (async () => {
      let discarded = false;
      try {
        await writeQueueRef.current;
        await resetStoredDraft();
        discarded = true;
      } catch (error: unknown) {
        setAutosaveMessage(operationError(error));
      }
      if (!discarded) {
        discardLockRef.current = false;
        setDiscardCloseBusy(false);
        return;
      }
      recordRef.current = null;
      pendingSaveRef.current = null;
      completedHandoffRef.current = null;
      setPendingSave(null);
      setDiscardCloseOpen(false);
      const fresh = freshDraftValue();
      dispatch({
        type: 'reset',
        draft: fresh.draft,
        design: fresh.design,
        options: fresh.options,
      });
      onDismiss();
      discardLockRef.current = false;
      setDiscardCloseBusy(false);
    })();
  }, [generation, onDismiss, resetStoredDraft]);

  const confirmReset = useCallback(() => {
    if (
      resetLockRef.current ||
      discardLockRef.current ||
      saveLockRef.current ||
      closeLockRef.current
    ) {
      return;
    }
    resetLockRef.current = true;
    setResetBusy(true);
    generation.cancel();
    void (async () => {
      try {
        await writeQueueRef.current;
        await resetStoredDraft();
        recordRef.current = null;
        pendingSaveRef.current = null;
        completedHandoffRef.current = null;
        setPendingSave(null);
        setAutosaveMessage(null);
        const fresh = freshDraftValue();
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
          message: operationError(error),
        });
      } finally {
        resetLockRef.current = false;
        setResetBusy(false);
      }
    })();
  }, [generation, resetStoredDraft]);

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
        !generationLockRef.current &&
        !saveLockRef.current &&
        !closeLockRef.current &&
        !resetLockRef.current &&
        !discardLockRef.current
      ) {
        dispatch({ type: 'request-regeneration' });
      }
    },
    onRegenerate: regenerate,
    onCancelRegeneration: () => dispatch({ type: 'cancel-regeneration' }),
    onRequestReset: () => {
      if (
        !saveLockRef.current &&
        !closeLockRef.current &&
        !resetLockRef.current &&
        !discardLockRef.current
      ) {
        generation.cancel();
        generationLockRef.current = false;
        dispatch({ type: 'request-reset' });
      }
    },
    onConfirmReset: confirmReset,
    onCancelReset: () => {
      if (!resetLockRef.current) dispatch({ type: 'cancel-reset' });
    },
    onClose: requestClose,
    onSave: () => void save(),
    onCancelDiscardClose: () => {
      if (discardLockRef.current) return;
      setDiscardCloseOpen(false);
      void repository
        .retryDurableStorage()
        .then((storage) => setAutosaveMessage(storage.durable ? null : storage.notice))
        .catch((error: unknown) => setAutosaveMessage(operationError(error)));
    },
    onConfirmDiscardClose: confirmDiscardClose,
  } as const;
};
