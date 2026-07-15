import { describe, expect, it } from 'vitest';
import { createPromptBuilderDraft } from '../prompts';
import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  RECENT_PROMPT_LIMIT,
  SAVED_PROMPT_LIMIT,
  createEmptyCreativeAssetStore,
  createSavedCharacterPrompt,
  createSavedPrompt,
  deleteSavedPrompt,
  parseCreativeAssetStore,
  recordSuccessfulPromptUse,
  sanitizeCreativeAssetStore,
  searchCreativeAssets,
  updateSavedPrompt,
  useSavedCharacterPrompt,
  useSavedPrompt,
} from './index';

const timestamp = (offset = 0): string =>
  new Date(Date.UTC(2026, 6, 14, 12, 0, offset)).toISOString();
const context = (id: string, offset = 0) => ({ now: timestamp(offset), createId: () => id });

describe('creative asset CRUD and use', () => {
  it('creates, normalizes, updates, uses, searches, and deletes saved prompts', () => {
    let store = createSavedPrompt(
      createEmptyCreativeAssetStore(),
      {
        title: '  Chrome   Explorer ',
        prompt: '  A chrome explorer  ',
        modelModeId: 'lucy-2.5',
        source: 'manual',
        tags: [' Sci-Fi ', 'sci-fi', 'Portrait'],
      },
      context('saved-1'),
    );
    expect(store.savedPrompts[0]).toMatchObject({
      title: 'Chrome Explorer',
      prompt: 'A chrome explorer',
      tags: ['Sci-Fi', 'Portrait'],
      useCount: 0,
    });

    store = updateSavedPrompt(store, 'saved-1', { title: 'Orbital Guide' }, timestamp(1));
    const used = useSavedPrompt(store, 'saved-1', timestamp(2));
    expect(used.prompt).toBe('A chrome explorer');
    expect(used.store.savedPrompts[0]?.useCount).toBe(1);
    expect(searchCreativeAssets(used.store, 'ORBITAL').savedPrompts).toHaveLength(1);

    store = recordSuccessfulPromptUse(
      used.store,
      { prompt: ' A   CHROME explorer ', modelModeId: 'lucy-2.5' },
      context('recent-1', 3),
    );
    expect(store.recentPrompts[0]?.savedPromptId).toBe('saved-1');
    expect(store.savedPrompts[0]?.useCount).toBe(2);

    store = deleteSavedPrompt(store, 'saved-1');
    expect(store.savedPrompts).toHaveLength(0);
    expect(store.recentPrompts[0]).toEqual(
      expect.objectContaining({ prompt: 'A   CHROME explorer' }),
    );
    expect(store.recentPrompts[0]).not.toHaveProperty('savedPromptId');
  });

  it('deduplicates recent prompts per mode and keeps the latest successful use', () => {
    let store = createEmptyCreativeAssetStore();
    store = recordSuccessfulPromptUse(
      store,
      { prompt: 'Velvet  jacket', modelModeId: 'lucy-vton-3' },
      context('first', 0),
    );
    store = recordSuccessfulPromptUse(
      store,
      { prompt: '  velvet jacket ', modelModeId: 'lucy-vton-3' },
      context('second', 1),
    );
    store = recordSuccessfulPromptUse(
      store,
      { prompt: 'velvet jacket', modelModeId: 'lucy-2.5' },
      context('character', 2),
    );
    expect(store.recentPrompts).toHaveLength(2);
    expect(
      store.recentPrompts.find((recent) => recent.modelModeId === 'lucy-vton-3'),
    ).toMatchObject({
      id: 'first',
      usedAt: timestamp(1),
    });
    expect(
      recordSuccessfulPromptUse(store, { prompt: '  ', modelModeId: 'lucy-2.5' }, context('empty')),
    ).toBe(store);
  });

  it('caps saved and recent collections at their contract limits', () => {
    let store = createEmptyCreativeAssetStore();
    for (let index = 0; index < SAVED_PROMPT_LIMIT + 1; index += 1) {
      store = createSavedPrompt(
        store,
        {
          title: `Prompt ${index}`,
          prompt: `character prompt ${index}`,
          modelModeId: 'lucy-2.5',
          source: 'manual',
        },
        context(`saved-${index}`, index),
      );
    }
    expect(store.savedPrompts).toHaveLength(SAVED_PROMPT_LIMIT);
    expect(store.savedPrompts.some((asset) => asset.id === 'saved-0')).toBe(false);

    for (let index = 0; index < RECENT_PROMPT_LIMIT + 2; index += 1) {
      store = recordSuccessfulPromptUse(
        store,
        { prompt: `unique recent ${index}`, modelModeId: 'lucy-2.5' },
        context(`recent-${index}`, index),
      );
    }
    expect(store.recentPrompts).toHaveLength(RECENT_PROMPT_LIMIT);
  });

  it('stores restorable structured character data but no portrait data', () => {
    const builderDraft = {
      ...createPromptBuilderDraft('character-transform'),
      intent: 'character-transform' as const,
      characterBase: 'deep-sea navigator',
    };
    const store = createSavedCharacterPrompt(
      createEmptyCreativeAssetStore(),
      {
        name: 'Navigator',
        prompt: 'Transform the subject into a deep-sea navigator.',
        source: 'generator',
        promptIntent: 'character-transform',
        builderDraft,
        referenceImageStatus: 'session-portrait-not-saved',
        notes: '  Keep face lighting  ',
      },
      context('character-1'),
    );
    const used = useSavedCharacterPrompt(store, 'character-1', timestamp(1));
    expect(used.builderDraft).toEqual(builderDraft);
    expect(used.store.savedCharacterPrompts[0]).toMatchObject({
      useCount: 1,
      referenceImageStatus: 'session-portrait-not-saved',
    });
    expect(JSON.stringify(store)).not.toMatch(/(?:imageData|objectUrl|portrait\.jpg)/u);
  });
});

describe('creative asset sanitation and recovery', () => {
  const validSavedPrompt = {
    id: 'safe-id',
    title: ' Safe asset ',
    prompt: '  A useful prompt  ',
    modelModeId: 'lucy-2.5',
    source: 'manual',
    tags: Array.from({ length: 14 }, (_, index) => (index === 1 ? 'TAG 0' : `tag ${index}`)),
    createdAt: timestamp(),
    updatedAt: timestamp(),
    lastUsedAt: null,
    useCount: 2.8,
    apiKey: 'must-not-survive',
    imageData: 'must-not-survive',
  };

  it('allowlists fields, normalizes records, tags and counts, and drops invalid assets', () => {
    const result = sanitizeCreativeAssetStore({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [validSavedPrompt, { ...validSavedPrompt, id: '', prompt: '' }],
      recentPrompts: [],
      savedCharacterPrompts: [],
      token: 'secret',
    });
    expect(result.recovered).toBe(true);
    expect(result.droppedRecords).toBe(1);
    expect(result.store.savedPrompts[0]).toMatchObject({
      title: 'Safe asset',
      prompt: 'A useful prompt',
      useCount: 2,
    });
    expect(result.store.savedPrompts[0]?.tags).toHaveLength(12);
    expect(JSON.stringify(result.store)).not.toMatch(/(?:apiKey|imageData|secret)/u);
  });

  it('requests a durable rewrite when an otherwise valid record contains unknown fields', () => {
    const result = sanitizeCreativeAssetStore({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [
        {
          ...validSavedPrompt,
          title: 'Safe asset',
          prompt: 'A useful prompt',
          tags: ['tag'],
          useCount: 2,
        },
      ],
      recentPrompts: [],
      savedCharacterPrompts: [],
    });

    expect(result.droppedRecords).toBe(0);
    expect(result.recovered).toBe(true);
    expect(JSON.stringify(result.store)).not.toMatch(/(?:apiKey|imageData)/u);
  });

  it('deduplicates untrusted recents by mode and canonical prompt', () => {
    const recent = {
      id: 'old',
      prompt: 'Ocean  guide',
      modelModeId: 'lucy-2.5',
      usedAt: timestamp(0),
    };
    const result = sanitizeCreativeAssetStore({
      schemaVersion: 1,
      savedPrompts: [],
      recentPrompts: [
        recent,
        { ...recent, id: 'new', prompt: ' ocean guide ', usedAt: timestamp(2) },
      ],
      savedCharacterPrompts: [],
    });
    expect(result.store.recentPrompts).toHaveLength(1);
    expect(result.store.recentPrompts[0]?.id).toBe('new');
  });

  it('recovers corrupt JSON and unknown versions to an empty store', () => {
    expect(parseCreativeAssetStore('{not json').recovered).toBe(true);
    expect(parseCreativeAssetStore('{not json').store).toEqual(createEmptyCreativeAssetStore());
    expect(sanitizeCreativeAssetStore({ schemaVersion: 99 }).recovered).toBe(true);
  });
});
