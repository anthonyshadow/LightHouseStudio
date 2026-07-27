// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { UploadedReferenceImageAsset } from '@studio/contracts';
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
const uploadReferenceImage = vi.hoisted(() => vi.fn());
const validateReferenceImage = vi.hoisted(() => vi.fn());
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
vi.mock('../../adapters/api-client/apiClient', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, uploadReferenceImage };
});
vi.mock('../media-session/imageValidation', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, validateReferenceImage };
});

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

const uploadedAsset: UploadedReferenceImageAsset = {
  assetId: '8f45ea24-c274-41a5-a988-aa0602115191',
  mimeType: 'image/png',
  byteSize: 5,
  source: 'uploaded',
  width: 800,
  height: 1200,
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  contentUrl: '/api/reference-images/8f45ea24-c274-41a5-a988-aa0602115191/content',
};

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
  uploadReferenceImage.mockReset();
  uploadReferenceImage.mockResolvedValue(uploadedAsset);
  validateReferenceImage.mockReset();
  validateReferenceImage.mockResolvedValue({
    blockingError: null,
    warnings: [],
    width: uploadedAsset.width,
    height: uploadedAsset.height,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useCharacterBuilderController save transactions', () => {
  it('uploads immediately and freezes an image-only save journal without prompt provenance', async () => {
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
          name: 'Portrait Coach',
          prompt: '',
          draft: null,
          design: null,
          referenceImage: uploadedAsset,
          referenceImageAssetId: uploadedAsset.assetId,
          uploadedReferenceImageAssetId: uploadedAsset.assetId,
          finalReferenceKind: 'uploaded',
        });
        await progress.markCharacterPersisted();
        await progress.markStudioPreloaded();
      },
    );
    const rendered = renderHook(() =>
      useCharacterBuilderController({
        open: true,
        generationAvailable: false,
        editAvailable: false,
        onSaveCharacter,
        onDismiss,
      }),
    );
    await waitFor(() => expect(rendered.result.current.state.phase).toBe('editing'));
    const file = new File(['image'], '  portrait.png  ', { type: 'image/png' });

    act(() => rendered.result.current.onUploadReference(file));
    await waitFor(() => expect(rendered.result.current.canSaveImageOnly).toBe(true));

    expect(uploadReferenceImage).toHaveBeenCalledWith(
      file,
      expect.any(String),
      expect.any(AbortSignal),
    );
    expect(rendered.result.current.state.uploadedReference).toMatchObject({
      asset: uploadedAsset,
      displayName: 'portrait.png',
    });
    expect(rendered.result.current.canSave).toBe(false);

    act(() => rendered.result.current.onSaveImageOnly('  Portrait   Coach  '));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
    expect(onSaveCharacter).toHaveBeenCalledOnce();
    expect(memory.readActive()).toBeNull();
  });

  it('keeps the current upload during replacement and ignores a late result after removal', async () => {
    const memory = createMemoryDraftRepository();
    draftRepositoryFactory.mockReturnValue(memory.repository);
    const rendered = renderHook(() =>
      useCharacterBuilderController({
        open: true,
        generationAvailable: true,
        editAvailable: true,
        onSaveCharacter: vi.fn(),
        onDismiss: vi.fn(),
      }),
    );
    await waitFor(() => expect(rendered.result.current.state.phase).toBe('editing'));

    act(() =>
      rendered.result.current.onUploadReference(
        new File(['first'], 'first.png', { type: 'image/png' }),
      ),
    );
    await waitFor(() =>
      expect(rendered.result.current.state.uploadedReference?.displayName).toBe('first.png'),
    );

    const replacement = deferred<UploadedReferenceImageAsset>();
    uploadReferenceImage.mockImplementationOnce(() => replacement.promise);
    act(() =>
      rendered.result.current.onUploadReference(
        new File(['second'], 'second.png', { type: 'image/png' }),
      ),
    );
    await waitFor(() => expect(rendered.result.current.state.uploadPending).toBe(true));
    expect(rendered.result.current.state.uploadedReference?.displayName).toBe('first.png');

    act(() => rendered.result.current.onRemoveUpload());
    expect(rendered.result.current.state.uploadedReference).toBeNull();

    await act(async () => {
      replacement.resolve({
        ...uploadedAsset,
        assetId: '37f302df-b78d-48a6-bd42-3df738da7066',
        contentUrl: '/api/reference-images/37f302df-b78d-48a6-bd42-3df738da7066/content',
      });
      await replacement.promise;
    });
    expect(rendered.result.current.state.uploadedReference).toBeNull();
  });

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
          name: 'Freckled Guide',
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

    act(() => rendered.result.current.onSave('Freckled Guide'));

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
      result.current.onSave('Documentary Lead');
      result.current.onSave('Documentary Lead');
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

    act(() => first.result.current.onSave('Documentary Lead'));
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

    expect(retry.result.current.suggestedCharacterName).toBe('Documentary Lead');
    expect(retry.result.current.characterNameLocked).toBe(true);
    act(() => retry.result.current.onSave('Documentary Lead'));
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

    act(() => rendered.result.current.onSave('Documentary Lead'));
    await waitFor(() => expect(rendered.result.current.state.phase).toBe('save-failed'));
    expect(memory.readActive()?.value.pendingSave?.stage).toBe('studio-preloaded');
    expect(onSaveCharacter).toHaveBeenCalledOnce();

    act(() => rendered.result.current.onSave('Documentary Lead'));
    await waitFor(() => expect(rendered.onDismiss).toHaveBeenCalledOnce());
    expect(onSaveCharacter).toHaveBeenCalledOnce();
    expect(memory.readActive()).toBeNull();
  });
});
