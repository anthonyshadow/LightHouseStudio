import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyGuidedProjectData,
  type LocalProjectRepository,
  type ProjectRecordV1,
  type ProjectSummary,
} from '../guided-flow/types';
import { createGuidedDesignFromDraft } from './characterModel';
import { createCharacterBuilderLegacyMigration } from './useCharacterBuilderPersistence';

const now = '2026-07-21T12:00:00.000Z';

const createLegacyRepository = (record: ProjectRecordV1): LocalProjectRepository => {
  const summary: ProjectSummary = {
    id: record.id,
    title: record.title,
    revision: record.revision,
    checkpoint: record.checkpoint,
    characterName: record.data.characterName,
    hasOriginalVideo: false,
    hasProcessedVideo: false,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  const storage = { health: 'ready', durable: true, notice: null } as const;
  return {
    initialize: vi.fn(() => Promise.resolve(storage)),
    retryDurableStorage: vi.fn(() => Promise.resolve(storage)),
    getStorageState: () => storage,
    list: vi.fn(() => Promise.resolve([summary])),
    load: vi.fn((projectId: string) => Promise.resolve(projectId === record.id ? record : null)),
    readArtifact: vi.fn(() => Promise.resolve(null)),
    commit: vi.fn(() => Promise.reject(new Error('Unexpected commit.'))),
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
      ...createEmptyGuidedProjectData(),
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
    const migration = createCharacterBuilderLegacyMigration(createLegacyRepository(record));

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
