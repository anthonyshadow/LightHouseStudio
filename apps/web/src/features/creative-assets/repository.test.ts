import { createPromptBuilderDraft } from '../prompt-authoring';
import { describe, expect, it } from 'vitest';
import { createCreativeAssetRepository } from './repository';
import { CREATIVE_ASSET_SCHEMA_VERSION, type StorageLike } from './types';

class MemoryStorage implements StorageLike {
  readonly records = new Map<string, string>();
  failWrites = false;

  getItem(key: string) {
    return this.records.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('quota');
    this.records.set(key, value);
  }
}

const repositoryFixture = (storage: StorageLike | null = new MemoryStorage()) => {
  let id = 0;
  let minute = 0;
  return createCreativeAssetRepository({
    storage,
    storageKey: 'test-recipes',
    idFactory: () => `id-${++id}`,
    now: () => new Date(Date.UTC(2026, 6, 14, 12, minute++)),
  });
};

describe('createCreativeAssetRepository', () => {
  it('supports CRUD, mode-scoped search, recent deduplication, usage tracking, and unlink-on-delete', () => {
    const repository = repositoryFixture();
    const saved = repository.createSavedPrompt({
      title: '  Copper   jacket ',
      prompt: 'Change the jacket material to brushed copper.',
      modelModeId: 'lucy-2.5',
      tags: ['Editorial', 'editorial', ...Array.from({ length: 20 }, (_, index) => `tag-${index}`)],
    });
    repository.createSavedPrompt({
      title: 'Linen overshirt',
      prompt: 'Dress the garment in natural linen.',
      modelModeId: 'lucy-vton-3',
    });

    expect(saved.title).toBe('Copper jacket');
    expect(saved.tags).toHaveLength(12);
    expect(repository.search('copper', 'lucy-2.5').savedPrompts).toHaveLength(1);
    expect(repository.search('linen', 'lucy-2.5').savedPrompts).toHaveLength(0);

    repository.recordSuccessfulPrompt({
      prompt: '  Change the jacket material to brushed copper.  ',
      modelModeId: 'lucy-2.5',
      savedPromptId: saved.id,
    });
    repository.recordSuccessfulPrompt({
      prompt: 'Change   the jacket material to brushed copper.',
      modelModeId: 'lucy-2.5',
      savedPromptId: saved.id,
    });
    expect(repository.getSnapshot().store.recentPrompts).toHaveLength(1);
    expect(
      repository.getSnapshot().store.savedPrompts.find((item) => item.id === saved.id)?.useCount,
    ).toBe(2);

    const renamed = repository.renameSavedPrompt(saved.id, 'Copper keynote');
    expect(renamed.title).toBe('Copper keynote');
    repository.updateSavedPrompt(saved.id, { prompt: 'Change the jacket to copper satin.' });
    repository.deleteSavedPrompt(saved.id);
    expect(repository.getSnapshot().store.savedPrompts.some((item) => item.id === saved.id)).toBe(
      false,
    );
    expect(repository.getSnapshot().store.recentPrompts[0]?.savedPromptId).toBeUndefined();
  });

  it('persists only allowlisted text metadata and restores character workshop state', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    const draft = {
      ...createPromptBuilderDraft('character-transform'),
      characterBase: 'night-shift radio host',
      matchReference: true,
    };
    const character = repository.createSavedCharacterPrompt({
      name: 'Night host',
      prompt: 'Transform the subject into an adult night-shift radio host.',
      promptIntent: 'character-transform',
      builderDraft: draft,
      referenceImageStatus: 'session-portrait-not-saved',
      notes: 'Use a portrait again next time.',
    });

    expect(character.source).toBe('generator');
    expect(character.builderDraft).toMatchObject({ characterBase: 'night-shift radio host' });
    const serialized = storage.records.get('test-recipes') ?? '';
    expect(serialized).toContain('session-portrait-not-saved');
    expect(serialized).not.toMatch(/imageData|objectUrl|blob:|deviceId|token/i);
  });

  it('drops generated provenance when a character recipe prompt is manually edited', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    const draft = {
      ...createPromptBuilderDraft('character-transform'),
      characterBase: 'night-shift radio host',
    };
    const character = repository.createSavedCharacterPrompt({
      name: 'Night host',
      prompt: 'Transform the subject into an adult night-shift radio host.',
      promptIntent: 'character-transform',
      builderDraft: draft,
    });

    const edited = repository.updateSavedCharacterPrompt(character.id, {
      prompt: 'Transform the subject into an adult overnight news anchor.',
    });

    expect(edited).toMatchObject({
      source: 'manual',
      promptIntent: null,
      builderDraft: null,
    });
    expect(repositoryFixture(storage).getSnapshot().store.savedCharacterPrompts[0]).toMatchObject({
      source: 'manual',
      promptIntent: null,
      builderDraft: null,
    });
  });

  it('recovers corrupt or unknown persisted data without breaking the shelf', () => {
    const storage = new MemoryStorage();
    storage.records.set('test-recipes', '{not-json');
    const corrupt = repositoryFixture(storage);
    expect(corrupt.getSnapshot()).toMatchObject({
      health: 'recovered',
      store: { savedPrompts: [] },
    });

    storage.records.set(
      'test-recipes',
      JSON.stringify({
        schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION + 10,
        savedPrompts: [{ token: 'must-not-survive' }],
      }),
    );
    const unknown = repositoryFixture(storage);
    expect(unknown.getSnapshot().health).toBe('recovered');
    expect(JSON.stringify(unknown.getSnapshot().store)).not.toContain('must-not-survive');
  });

  it('rewrites valid legacy records to remove unknown sensitive fields', () => {
    const storage = new MemoryStorage();
    storage.records.set(
      'test-recipes',
      JSON.stringify({
        schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
        savedPrompts: [
          {
            id: 'legacy-safe',
            title: 'Legacy recipe',
            prompt: 'Add a paper moon above the subject.',
            modelModeId: 'lucy-2.5',
            source: 'manual',
            tags: [],
            createdAt: '2026-07-14T12:00:00.000Z',
            updatedAt: '2026-07-14T12:00:00.000Z',
            lastUsedAt: null,
            useCount: 0,
            apiKey: 'must-not-remain-on-disk',
            objectUrl: 'blob:must-not-remain-on-disk',
          },
        ],
        recentPrompts: [],
        savedCharacterPrompts: [],
      }),
    );

    const repository = repositoryFixture(storage);
    expect(repository.getSnapshot().health).toBe('recovered');
    expect(storage.records.get('test-recipes')).not.toMatch(
      /(?:apiKey|objectUrl|must-not-remain)/u,
    );
  });

  it('keeps mutations in memory and discloses session-only mode when writes fail', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    storage.failWrites = true;
    repository.createSavedPrompt({
      title: 'Tab-only recipe',
      prompt: 'Add a small paper moon above the left shoulder.',
      modelModeId: 'lucy-2.5',
    });

    expect(repository.getSnapshot().health).toBe('session-only');
    expect(repository.getSnapshot().notice).toMatch(/tab closes/i);
    expect(repository.getSnapshot().store.savedPrompts).toHaveLength(1);
  });
});
