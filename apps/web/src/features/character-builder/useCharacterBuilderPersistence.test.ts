import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  type GuidedProjectDataV1,
  type LocalProjectRepository,
  type ProjectRecordV1,
} from '../guided-flow/types';
import { createGuidedDesignFromDraft } from './characterModel';
import { createCharacterBuilderLegacyMigration } from './useCharacterBuilderPersistence';

const now = '2026-07-21T12:00:00.000Z';

const emptyGuidedData = (): GuidedProjectDataV1 => ({
  characterId: null,
  characterName: '',
  characterPrompt: '',
  characterDraft: null,
  guidedDesign: null,
  referenceMode: null,
  referenceImageAssetId: null,
  referenceImageStale: false,
  originalVideoArtifactId: null,
  originalVideoMetadata: null,
  originalAudioArtifactId: null,
  originalAudioMimeType: null,
  processedVideoArtifactId: null,
  processedVideoMetadata: null,
  finalVariant: null,
  selectedVoiceId: null,
  selectedVoiceName: null,
  downloadStartedAt: null,
  completedAt: null,
});

const createLegacyRepository = (record: ProjectRecordV1): LocalProjectRepository => {
  const storage = { health: 'ready', durable: true, notice: null } as const;
  return {
    initialize: vi.fn(() => Promise.resolve(storage)),
    getStorageState: () => storage,
    count: vi.fn(() => Promise.resolve(1)),
    list: vi.fn(() => Promise.reject(new Error('Unexpected list.'))),
    load: vi.fn(() => Promise.reject(new Error('Unexpected load.'))),
    loadNewestCharacterDesign: vi.fn(() => Promise.resolve(record)),
    readArtifact: vi.fn(() => Promise.resolve(null)),
    deleteProject: vi.fn(() => Promise.reject(new Error('Unexpected delete.'))),
    close: vi.fn(),
  };
};

const createLegacyRecord = (guidedDesign: ProjectRecordV1['data']['guidedDesign']) => {
  const draft = {
    ...createPromptBuilderDraft('character-transform'),
    presetId: 'documentary-presenter',
    gender: 'woman' as const,
    adultAge: 'adult' as const,
    characterBase: 'Documentary Presenter, science host',
    appearance: 'freckled',
  };
  const record: ProjectRecordV1 = {
    schemaVersion: 1,
    id: 'legacy-character',
    title: 'Legacy character',
    revision: 4,
    checkpoint: 'character-design',
    data: {
      ...emptyGuidedData(),
      characterName: 'Legacy character',
      characterPrompt: 'A science host',
      characterDraft: draft,
      guidedDesign,
    },
    createdAt: now,
    updatedAt: now,
  };
  return { draft, record };
};

describe('character builder legacy migration', () => {
  it('hydrates a missing guided design from the canonical legacy draft', async () => {
    const { draft, record } = createLegacyRecord(null);
    const repository = createLegacyRepository(record);
    const migration = createCharacterBuilderLegacyMigration(repository);

    const candidate = await migration?.loadNewestCharacterDesign();

    expect(candidate).toMatchObject({
      sourceId: record.id,
      sourceRevision: record.revision,
      value: {
        draft,
        design: {
          starterId: 'documentary-presenter',
          choices: {
            appearance: { optionId: 'custom', customValue: 'freckled' },
            role: { optionId: 'custom', customValue: 'science host' },
          },
        },
      },
    });
    expect(repository.loadNewestCharacterDesign).toHaveBeenCalledOnce();
    expect(repository.list).not.toHaveBeenCalled();
    expect(repository.load).not.toHaveBeenCalled();
  });

  it('preserves an existing guided design instead of rehydrating it', async () => {
    const base = createLegacyRecord(null);
    const existingDesign = {
      ...createGuidedDesignFromDraft(base.draft),
      choices: {
        ...createGuidedDesignFromDraft(base.draft).choices,
        role: { optionId: 'custom' as const, customValue: 'preserved role' },
      },
    };
    const { record } = createLegacyRecord(existingDesign);
    const migration = createCharacterBuilderLegacyMigration(createLegacyRepository(record));

    const candidate = await migration?.loadNewestCharacterDesign();

    expect(candidate?.value.design).toEqual(existingDesign);
  });
});
