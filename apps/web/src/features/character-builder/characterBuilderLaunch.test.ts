import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it, vi } from 'vitest';
import { createCreativeAssetRepository } from '../creative-assets/repository';
import { createFreshCharacterBuilderDraftValue } from './characterBuilderControllerSupport';
import {
  createCharacterEditDraftValue,
  createCharacterCopyDraftValue,
  prepareCharacterBuilderLaunch,
  type CharacterBuilderLaunchRepository,
} from './characterBuilderLaunch';
import type { CharacterBuilderDraftRecord } from './draftRepository';
import type { CharacterBuilderDraftValueV1 } from './characterBuilderPersistence';

const activeRecord = (
  value: CharacterBuilderDraftValueV1,
  revision = 4,
): CharacterBuilderDraftRecord<CharacterBuilderDraftValueV1> => ({
  schemaVersion: 1,
  id: 'active',
  revision,
  value,
  origin: { kind: 'native' },
  createdAt: '2026-07-27T12:00:00.000Z',
  updatedAt: '2026-07-27T12:00:00.000Z',
});

const launchRepository = (
  record: CharacterBuilderDraftRecord<CharacterBuilderDraftValueV1> | null,
) => ({
  repository: {
    load: vi.fn(() => Promise.resolve(record)),
    resetDurably: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
  } satisfies CharacterBuilderLaunchRepository,
});

describe('Character Builder launches', () => {
  it('hydrates a structured saved character for in-place editing', () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const draft = createPromptBuilderDraft('character-transform');
    if (draft.intent !== 'character-transform') throw new Error('Expected character draft.');
    const character = repository.createSavedCharacterPrompt({
      name: 'Field explorer',
      prompt: 'Transform the subject into an adult field explorer.',
      promptIntent: 'character-transform',
      builderDraft: {
        ...draft,
        characterBase: 'field explorer',
        customDetails: 'Keep the weathered canvas satchel.',
      },
      referenceImageStatus: 'prompt-only',
      notes: 'Keep these notes',
      tags: ['field'],
    });

    const value = createCharacterEditDraftValue(character);

    expect(value.target).toEqual({
      kind: 'edit',
      characterId: character.id,
      originalName: 'Field explorer',
      originalPrompt: character.prompt,
    });
    expect(value.draft).toMatchObject({
      intent: 'character-transform',
      characterBase: 'field explorer',
      customDetails: 'Keep the weathered canvas satchel.',
    });
    expect(value.pendingSave).toBeNull();
  });

  it('hydrates a saved character into a new independent create target', () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const character = repository.createSavedCharacterPrompt({
      name: 'Field explorer',
      prompt: 'Transform the subject into an adult field explorer.',
      promptIntent: 'character-transform',
      builderDraft: createPromptBuilderDraft('character-transform'),
      referenceImageStatus: 'prompt-only',
    });

    const value = createCharacterCopyDraftValue(character);

    expect(value.target).toEqual({ kind: 'create' });
    expect(value.draft).toEqual(createCharacterEditDraftValue(character).draft);
    expect(value.pendingSave).toBeNull();
  });

  it('carries saved upload and generated-preview provenance into edit mode', () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const draft = createPromptBuilderDraft('character-transform');
    const uploadedAssetId = '8f45ea24-c274-41a5-a988-aa0602115191';
    const generatedAssetId = 'deaa355e-1b08-4f78-a465-7291644b2812';
    const character = repository.createSavedCharacterPrompt({
      name: 'Presenter',
      prompt: 'Transform the subject into a presenter.',
      promptIntent: 'character-transform',
      builderDraft: draft,
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: generatedAssetId,
      uploadedReferenceImageAssetId: uploadedAssetId,
      finalReferenceKind: 'generated',
    });

    const value = createCharacterEditDraftValue(character);

    expect(value.uploadedReference).toEqual({
      assetId: uploadedAssetId,
      displayName: 'Presenter reference',
    });
    expect(value.preview).toMatchObject({ assetId: generatedAssetId, stale: false });
  });

  it('opens immediately when no unfinished draft exists', async () => {
    const { repository } = launchRepository(null);
    const confirmDiscard = vi.fn(() => false);

    await expect(
      prepareCharacterBuilderLaunch({
        target: {
          kind: 'edit',
          characterId: 'character-1',
          originalName: 'One',
          originalPrompt: '',
        },
        confirmDiscard,
        repository,
      }),
    ).resolves.toBe(true);

    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(repository.resetDurably).not.toHaveBeenCalled();
    expect(repository.close).toHaveBeenCalledOnce();
  });

  it('resumes the same character draft without prompting', async () => {
    const value = {
      ...createFreshCharacterBuilderDraftValue(),
      target: {
        kind: 'edit' as const,
        characterId: 'character-1',
        originalName: 'One',
        originalPrompt: 'Original',
      },
    };
    const { repository } = launchRepository(activeRecord(value));
    const confirmDiscard = vi.fn(() => false);

    await expect(
      prepareCharacterBuilderLaunch({
        target: value.target,
        confirmDiscard,
        repository,
      }),
    ).resolves.toBe(true);

    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(repository.resetDurably).not.toHaveBeenCalled();
  });

  it('requires discard before replacing an unfinished create draft with a saved character copy', async () => {
    const { repository } = launchRepository(
      activeRecord(createFreshCharacterBuilderDraftValue(), 6),
    );
    const confirmDiscard = vi.fn(() => true);

    await expect(
      prepareCharacterBuilderLaunch({
        target: { kind: 'create' },
        replaceCreateDraft: true,
        confirmDiscard,
        repository,
      }),
    ).resolves.toBe(true);

    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(repository.resetDurably).toHaveBeenCalledWith({ expectedRevision: 6 });
  });

  it('leaves an unfinished draft untouched when edit is cancelled', async () => {
    const { repository } = launchRepository(
      activeRecord(createFreshCharacterBuilderDraftValue(), 7),
    );
    const confirmDiscard = vi.fn(() => false);

    await expect(
      prepareCharacterBuilderLaunch({
        target: {
          kind: 'edit',
          characterId: 'character-2',
          originalName: 'Two',
          originalPrompt: 'Original',
        },
        confirmDiscard,
        repository,
      }),
    ).resolves.toBe(false);

    expect(confirmDiscard).toHaveBeenCalledWith(
      'An unfinished character draft exists. Continue and discard it? If you cancel, the draft will stay unchanged.',
    );
    expect(repository.resetDurably).not.toHaveBeenCalled();
    expect(repository.close).toHaveBeenCalledOnce();
  });

  it('durably discards an unfinished draft before continuing to edit', async () => {
    const { repository } = launchRepository(
      activeRecord(createFreshCharacterBuilderDraftValue(), 9),
    );

    await expect(
      prepareCharacterBuilderLaunch({
        target: {
          kind: 'edit',
          characterId: 'character-3',
          originalName: 'Three',
          originalPrompt: 'Original',
        },
        confirmDiscard: () => true,
        repository,
      }),
    ).resolves.toBe(true);

    expect(repository.resetDurably).toHaveBeenCalledWith({ expectedRevision: 9 });
    expect(repository.close).toHaveBeenCalledOnce();
  });
});
