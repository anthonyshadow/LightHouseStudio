// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createPromptBuilderDraft, type CharacterTransformDraft } from '@studio/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyGuidedDesign } from './CharacterBuilderForm';
import type {
  CharacterBuilderDraftRecord,
  CharacterBuilderDraftRepository,
  CharacterBuilderDraftStorageState,
  CompleteCharacterBuilderDraftInput,
  ResetCharacterBuilderDraftInput,
  SaveCharacterBuilderDraftInput,
} from './draftRepository';
import type {
  CharacterBuilderDraftValueV1,
  CharacterSaveSnapshot,
  CharacterSaveStage,
  UseCharacterBuilderControllerOptions,
} from './useCharacterBuilderController';

const draftRepositoryFactory = vi.hoisted(() => vi.fn());
const MockCharacterBuilderDraftError = vi.hoisted(
  () =>
    class CharacterBuilderDraftError extends Error {
      readonly code: string;

      constructor(code: string, message: string) {
        super(message);
        this.code = code;
      }
    },
);

vi.mock('./draftRepository', () => ({
  CharacterBuilderDraftError: MockCharacterBuilderDraftError,
  createCharacterBuilderDraftRepository: draftRepositoryFactory,
}));

import { useCharacterBuilderController } from './useCharacterBuilderController';

type Deferred<T> = {
  readonly promise: Promise<T>;
  resolve(value: T): void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve;
  });
  return { promise, resolve };
};

const clone = <T,>(value: T): T => structuredClone(value);

type SaveHandler = UseCharacterBuilderControllerOptions['onSaveCharacter'];
type SaveProgress = Parameters<SaveHandler>[3];

const createMemoryDraftRepository = () => {
  let active: CharacterBuilderDraftRecord<CharacterBuilderDraftValueV1> | null = null;
  let revision = 0;
  let completeFailuresRemaining = 0;
  const now = '2026-07-21T12:00:00.000Z';

  const assertRevision = (expectedRevision: number | null) => {
    expect(expectedRevision).toBe(active?.revision ?? null);
  };

  const save = vi.fn(
    (
      input: SaveCharacterBuilderDraftInput<CharacterBuilderDraftValueV1>,
    ): Promise<CharacterBuilderDraftRecord<CharacterBuilderDraftValueV1>> => {
      assertRevision(input.expectedRevision);
      revision += 1;
      active = {
        schemaVersion: 1,
        id: 'active',
        revision,
        value: clone(input.value),
        origin: { kind: 'native' },
        createdAt: active?.createdAt ?? now,
        updatedAt: now,
      };
      return Promise.resolve(clone(active));
    },
  );

  const reset = vi.fn((input: ResetCharacterBuilderDraftInput): Promise<void> => {
    assertRevision(input.expectedRevision);
    active = null;
    revision += 1;
    return Promise.resolve();
  });

  const complete = vi.fn(
    (
      input: CompleteCharacterBuilderDraftInput,
    ): Promise<CharacterBuilderDraftRecord<CharacterBuilderDraftValueV1>> => {
      assertRevision(input.expectedRevision);
      if (!active) throw new Error('No active character draft.');
      if (completeFailuresRemaining > 0) {
        completeFailuresRemaining -= 1;
        throw new Error('Planned draft finalization failure.');
      }
      const completed = clone(active);
      active = null;
      revision += 1;
      return Promise.resolve(completed);
    },
  );

  const storageState = {
    health: 'ready',
    durable: true,
    notice: null,
  } satisfies CharacterBuilderDraftStorageState;

  const repository: CharacterBuilderDraftRepository<CharacterBuilderDraftValueV1> = {
    load: vi.fn(() => Promise.resolve(active ? clone(active) : null)),
    save,
    saveDurably: save,
    reset,
    resetDurably: reset,
    complete,
    completeDurably: complete,
    repairDurably: vi.fn(() => {
      active = null;
      revision += 1;
      return Promise.resolve();
    }),
    getStorageState: () => storageState,
    retryDurableStorage: vi.fn(() => Promise.resolve(storageState)),
    close: vi.fn(),
  };

  return {
    repository,
    readActive: () => (active ? clone(active) : null),
    failNextComplete: () => {
      completeFailuresRemaining += 1;
    },
  };
};

const readyCharacter = (): {
  draft: CharacterTransformDraft;
  design: ReturnType<typeof createEmptyGuidedDesign>;
} => ({
  draft: {
    ...createPromptBuilderDraft('character-transform'),
    presetId: 'documentary-presenter',
    adultAge: 'adult',
    characterBase: 'Documentary presenter',
  },
  design: {
    ...createEmptyGuidedDesign(),
    starterId: 'documentary-presenter',
  },
});

const renderReadyController = async (onSaveCharacter: SaveHandler, onDismiss = vi.fn()) => {
  const rendered = renderHook(() =>
    useCharacterBuilderController({
      open: true,
      generationAvailable: true,
      editAvailable: true,
      onSaveCharacter,
      onDismiss,
    }),
  );

  await waitFor(() => expect(rendered.result.current.state.phase).toBe('editing'));
  const character = readyCharacter();
  act(() => rendered.result.current.onChange(character.draft, character.design));
  await waitFor(() => expect(rendered.result.current.canSave).toBe(true));
  return { ...rendered, onDismiss };
};

beforeEach(() => {
  draftRepositoryFactory.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useCharacterBuilderController save transactions', () => {
  it('saves a manually detailed character without choosing a demo character', async () => {
    const memory = createMemoryDraftRepository();
    draftRepositoryFactory.mockReturnValue(memory.repository);
    const onDismiss = vi.fn();
    const onSaveCharacter = vi.fn<SaveHandler>(
      async (
        snapshot: CharacterSaveSnapshot,
        _characterId: string,
        _stage: CharacterSaveStage,
        progress: SaveProgress,
      ) => {
        expect(snapshot).toMatchObject({
          name: 'New Character 01',
          draft: { presetId: null, appearance: 'freckled' },
          design: { starterId: null },
        });
        await progress.markCharacterPersisted();
        await progress.markStudioPreloaded();
      },
    );
    const rendered = renderHook(() =>
      useCharacterBuilderController({
        open: true,
        generationAvailable: true,
        editAvailable: true,
        onSaveCharacter,
        onDismiss,
      }),
    );

    await waitFor(() => expect(rendered.result.current.state.phase).toBe('editing'));
    const emptyDesign = createEmptyGuidedDesign();
    act(() =>
      rendered.result.current.onChange(
        {
          ...createPromptBuilderDraft('character-transform'),
          appearance: 'freckled',
        },
        {
          ...emptyDesign,
          choices: {
            ...emptyDesign.choices,
            appearance: { optionId: 'custom', customValue: 'freckled' },
          },
        },
      ),
    );

    await waitFor(() => expect(rendered.result.current.canSave).toBe(true));
    expect(rendered.result.current.state.design.starterId).toBeNull();

    act(() => rendered.result.current.onSave());

    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
    expect(onSaveCharacter).toHaveBeenCalledOnce();
    expect(memory.readActive()).toBeNull();
  });

  it('rejects a same-turn double save before React publishes the saving phase', async () => {
    const memory = createMemoryDraftRepository();
    draftRepositoryFactory.mockReturnValue(memory.repository);
    const saveGate = deferred<void>();
    const onSaveCharacter = vi.fn<SaveHandler>(
      async (
        _snapshot: CharacterSaveSnapshot,
        _characterId: string,
        _stage: CharacterSaveStage,
        progress: SaveProgress,
      ) => {
        await saveGate.promise;
        await progress.markCharacterPersisted();
        await progress.markStudioPreloaded();
      },
    );
    const { result, onDismiss } = await renderReadyController(onSaveCharacter);

    act(() => {
      result.current.onSave();
      result.current.onSave();
    });

    await waitFor(() => expect(onSaveCharacter).toHaveBeenCalledOnce());
    expect(result.current.state.phase).toBe('saving');
    saveGate.resolve();

    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
    expect(onSaveCharacter).toHaveBeenCalledOnce();
    expect(memory.readActive()).toBeNull();
    expect(result.current.state.phase).toBe('editing');
    expect(result.current.canSave).toBe(false);
  });

  it('resumes a partial save after reload with the same character ID and confirmed stage', async () => {
    const memory = createMemoryDraftRepository();
    draftRepositoryFactory.mockReturnValue(memory.repository);
    let attempt = 0;
    const saveAttempts: { characterId: string; stage: CharacterSaveStage }[] = [];
    const onSaveCharacter = vi.fn<SaveHandler>(
      async (
        _snapshot: CharacterSaveSnapshot,
        characterId: string,
        stage: CharacterSaveStage,
        progress: SaveProgress,
      ) => {
        attempt += 1;
        saveAttempts.push({ characterId, stage });
        if (attempt === 1) {
          expect(stage).toBe('intent');
          await progress.markCharacterPersisted();
          throw new Error('Studio preload failed.');
        }
        expect(stage).toBe('character-persisted');
        await progress.markStudioPreloaded();
      },
    );
    const first = await renderReadyController(onSaveCharacter);

    act(() => first.result.current.onSave());
    await waitFor(() => expect(first.result.current.state.phase).toBe('save-failed'));

    const failedJournal = memory.readActive()?.value.pendingSave;
    expect(failedJournal).toMatchObject({ stage: 'character-persisted' });
    expect(first.onDismiss).not.toHaveBeenCalled();
    first.unmount();

    const retryDismiss = vi.fn();
    const retry = renderHook(() =>
      useCharacterBuilderController({
        open: true,
        generationAvailable: true,
        editAvailable: true,
        onSaveCharacter,
        onDismiss: retryDismiss,
      }),
    );
    await waitFor(() => expect(retry.result.current.state.phase).toBe('editing'));
    expect(retry.result.current.saveRecoveryPending).toBe(true);

    act(() => retry.result.current.onSave());
    await waitFor(() => expect(retryDismiss).toHaveBeenCalledOnce());

    expect(onSaveCharacter).toHaveBeenCalledTimes(2);
    expect(saveAttempts.map(({ characterId }) => characterId)).toEqual([
      failedJournal?.characterId,
      failedJournal?.characterId,
    ]);
    expect(saveAttempts.map(({ stage }) => stage)).toEqual(['intent', 'character-persisted']);
    expect(memory.readActive()).toBeNull();
    expect(retry.result.current.state.phase).toBe('editing');
    expect(retry.result.current.canSave).toBe(false);
    expect(retry.result.current.saveRecoveryPending).toBe(false);
  });

  it('retries only draft finalization after the Studio handoff completed in this mount', async () => {
    const memory = createMemoryDraftRepository();
    memory.failNextComplete();
    draftRepositoryFactory.mockReturnValue(memory.repository);
    const onSaveCharacter = vi.fn<SaveHandler>(
      async (
        _snapshot: CharacterSaveSnapshot,
        _characterId: string,
        _stage: CharacterSaveStage,
        progress: SaveProgress,
      ) => {
        await progress.markCharacterPersisted();
        await progress.markStudioPreloaded();
      },
    );
    const rendered = await renderReadyController(onSaveCharacter);

    act(() => rendered.result.current.onSave());
    await waitFor(() => expect(rendered.result.current.state.phase).toBe('save-failed'));
    expect(memory.readActive()?.value.pendingSave?.stage).toBe('studio-preloaded');
    expect(onSaveCharacter).toHaveBeenCalledOnce();

    act(() => rendered.result.current.onSave());
    await waitFor(() => expect(rendered.onDismiss).toHaveBeenCalledOnce());
    expect(onSaveCharacter).toHaveBeenCalledOnce();
    expect(memory.readActive()).toBeNull();
  });
});
