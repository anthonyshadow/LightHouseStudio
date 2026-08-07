import { createPromptBuilderDraft } from '../prompt-authoring';
import { describe, expect, it, vi } from 'vitest';
import { createCreativeAssetRepository } from './repository';
import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  CREATIVE_ASSET_STORAGE_KEY,
  EARLIER_CREATIVE_ASSET_STORAGE_KEY,
  LEGACY_CREATIVE_ASSET_STORAGE_KEY,
  OLDER_CREATIVE_ASSET_STORAGE_KEY,
  ORIGINAL_CREATIVE_ASSET_STORAGE_KEY,
  PREVIOUS_CREATIVE_ASSET_STORAGE_KEY,
  WARDROBE_CREATIVE_ASSET_STORAGE_KEY,
  type GuidedDesignV1,
  type StorageLike,
} from './types';

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

const guidedDesign = (): GuidedDesignV1 => ({
  catalogVersion: 1,
  starterId: 'documentary-presenter',
  choices: {
    gender: { optionId: 'woman' },
    adultAge: { optionId: 'adult' },
    appearance: null,
    ethnicity: null,
    skinTone: null,
    bodyShape: { optionId: 'woman-athletic' },
    hair: { optionId: 'woman-long-waves' },
    hairColor: { optionId: 'auburn' },
    outfit: { optionId: 'woman-professional' },
    accessories: null,
    expression: null,
    mood: null,
    role: { optionId: 'presenter' },
    style: { optionId: 'cinematic' },
    background: { optionId: 'studio' },
  },
});

describe('createCreativeAssetRepository', () => {
  it('maps typed domain reasons without inspecting human-readable messages', () => {
    const repository = repositoryFixture();

    expect(() =>
      repository.createSavedPrompt({
        title: 'Valid title',
        prompt: '   ',
        modelModeId: 'lucy-latest',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid-prompt',
        message: 'A saved prompt cannot be empty.',
      }),
    );
    expect(() => repository.renameSavedPrompt('missing', 'Still valid')).toThrow(
      expect.objectContaining({
        code: 'not-found',
        message: 'Saved prompt was not found.',
      }),
    );
  });

  it('supports CRUD, mode-scoped search, recent deduplication, usage tracking, and unlink-on-delete', () => {
    const repository = repositoryFixture();
    const saved = repository.createSavedPrompt({
      title: '  Copper   jacket ',
      prompt: 'Change the jacket material to brushed copper.',
      modelModeId: 'lucy-latest',
      tags: ['Editorial', 'editorial', ...Array.from({ length: 20 }, (_, index) => `tag-${index}`)],
    });
    repository.createSavedPrompt({
      title: 'Linen overshirt',
      prompt: 'Dress the garment in natural linen.',
      modelModeId: 'lucy-vton-latest',
    });

    expect(saved.title).toBe('Copper jacket');
    expect(saved.tags).toHaveLength(12);
    expect(repository.search('copper', 'lucy-latest').savedPrompts).toHaveLength(1);
    expect(repository.search('linen', 'lucy-latest').savedPrompts).toHaveLength(0);

    repository.recordSuccessfulPrompt({
      prompt: '  Change the jacket material to brushed copper.  ',
      modelModeId: 'lucy-latest',
      savedPromptId: saved.id,
    });
    repository.recordSuccessfulPrompt({
      prompt: 'Change   the jacket material to brushed copper.',
      modelModeId: 'lucy-latest',
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
      bodyShape: 'balanced build',
      hairColor: 'black',
    };
    const character = repository.createSavedCharacterPrompt({
      name: 'Night host',
      prompt: 'Transform the subject into an adult night-shift radio host.',
      promptIntent: 'character-transform',
      builderDraft: draft,
      guidedDesign: guidedDesign(),
      referenceImageStatus: 'session-portrait-not-saved',
      notes: 'Use a portrait again next time.',
    });

    expect(character.source).toBe('generator');
    expect(character.builderDraft).toMatchObject({ characterBase: 'night-shift radio host' });
    expect(character.guidedDesign).toEqual(guidedDesign());
    const serialized = storage.records.get('test-recipes') ?? '';
    expect(serialized).toContain('session-portrait-not-saved');
    expect(serialized).not.toMatch(/imageData|objectUrl|blob:|deviceId|token/i);
  });

  it('persists exact image versions across recents, saved copies, characters, and refresh', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    repository.recordSuccessfulPrompt({
      prompt: 'Substitute the character with a glassblower.',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: 'asset-a',
    });
    repository.recordSuccessfulPrompt({
      prompt: 'Substitute the character with a glassblower.',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: 'asset-b',
    });
    const saved = repository.createSavedPrompt({
      title: 'Glassblower',
      prompt: 'Substitute the character with a glassblower.',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: 'asset-b',
    });
    const character = repository.createSavedCharacterPrompt({
      name: 'Glassblower',
      prompt: saved.prompt,
      promptIntent: 'character-transform',
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'asset-b',
    });

    expect(repository.getSnapshot().store.recentPrompts).toHaveLength(2);
    expect(saved.referenceImageAssetId).toBe('asset-b');
    expect(character).toMatchObject({
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'asset-b',
    });
    expect(repositoryFixture(storage).getSnapshot().store).toMatchObject({
      savedPrompts: [expect.objectContaining({ referenceImageAssetId: 'asset-b' })],
      savedCharacterPrompts: [expect.objectContaining({ referenceImageAssetId: 'asset-b' })],
    });
  });

  it('persists normalized wardrobe CRUD, exact Recent attribution, and parent cascade', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    const character = repository.createSavedCharacterPrompt({
      name: 'Wardrobe host',
      prompt: 'Replace the subject with a wardrobe host.',
      promptIntent: 'character-transform',
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'host-original',
    });
    const variant = repository.createSavedCharacterVariant({
      parentCharacterId: character.id,
      title: 'Green coat',
      referenceImageAssetId: 'host-green-coat',
      creation: {
        method: 'add-outfit',
        sourceReferenceImageAssetId: 'host-original',
        garmentReferenceImageAssetId: 'green-coat',
      },
    });
    repository.recordSuccessfulPrompt({
      prompt: character.prompt,
      modelModeId: 'lucy-latest',
      savedCharacterPromptId: character.id,
      savedCharacterVariantId: variant.id,
      referenceImageAssetId: variant.referenceImageAssetId,
    });

    expect(repositoryFixture(storage).getSnapshot().store).toMatchObject({
      savedCharacterPrompts: [
        expect.objectContaining({ selectedWardrobeVariantId: variant.id, useCount: 1 }),
      ],
      savedCharacterVariants: [
        expect.objectContaining({ id: variant.id, parentCharacterId: character.id, useCount: 1 }),
      ],
      recentPrompts: [
        expect.objectContaining({
          savedCharacterPromptId: character.id,
          savedCharacterVariantId: variant.id,
          referenceImageAssetId: variant.referenceImageAssetId,
        }),
      ],
    });

    repository.deleteSavedCharacterPrompt(character.id);
    expect(repository.getSnapshot().store.savedCharacterVariants).toEqual([]);
    expect(repository.getSnapshot().store.recentPrompts[0]).not.toHaveProperty(
      'savedCharacterVariantId',
    );
  });

  it('increments character use only for the exact saved reference version', () => {
    const repository = repositoryFixture();
    const character = repository.createSavedCharacterPrompt({
      name: 'Orbital guide',
      prompt: 'Substitute the character with an orbital guide.',
      promptIntent: 'character-transform',
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'asset-a',
    });

    repository.recordSuccessfulPrompt({
      prompt: character.prompt,
      modelModeId: 'lucy-latest',
      savedCharacterPromptId: character.id,
      referenceImageAssetId: 'asset-b',
    });
    expect(
      repository.getSnapshot().store.savedCharacterPrompts.find((item) => item.id === character.id)
        ?.useCount,
    ).toBe(0);

    repository.recordSuccessfulPrompt({
      prompt: character.prompt,
      modelModeId: 'lucy-latest',
      savedCharacterPromptId: character.id,
      referenceImageAssetId: 'asset-a',
    });
    expect(
      repository.getSnapshot().store.savedCharacterPrompts.find((item) => item.id === character.id)
        ?.useCount,
    ).toBe(1);
  });

  it('deletes one wardrobe variant and rejects a repeated deletion', () => {
    const repository = repositoryFixture();
    const character = repository.createSavedCharacterPrompt({
      name: 'Variant owner',
      prompt: 'Replace the subject with a variant owner.',
      promptIntent: 'character-transform',
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'owner-original',
    });
    const variant = repository.createSavedCharacterVariant({
      parentCharacterId: character.id,
      title: 'Copper form',
      referenceImageAssetId: 'owner-copper',
      creation: {
        method: 'change-features',
        sourceReferenceImageAssetId: 'owner-original',
        changeInstructions: 'Make the character copper.',
      },
    });
    repository.selectCharacterVersion({ characterId: character.id, variantId: variant.id });

    repository.deleteSavedCharacterVariant(variant.id);

    expect(repository.getSnapshot().store.savedCharacterVariants).toEqual([]);
    expect(
      repository.getSnapshot().store.savedCharacterPrompts[0]?.selectedWardrobeVariantId,
    ).toBeNull();
    expect(() => repository.deleteSavedCharacterVariant(variant.id)).toThrow(
      expect.objectContaining({ code: 'not-found' }),
    );
  });

  it('persists image-only characters and retains their standalone Recent recipe after deletion', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    const character = repository.createSavedCharacterPrompt({
      name: 'Uploaded Character 01',
      prompt: '',
      promptIntent: null,
      builderDraft: null,
      guidedDesign: null,
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'uploaded-asset',
      uploadedReferenceImageAssetId: 'uploaded-asset',
      finalReferenceKind: 'uploaded',
    });

    expect(repository.getSnapshot().store.recentPrompts).toEqual([]);
    expect(repositoryFixture(storage).getSnapshot().store.savedCharacterPrompts[0]).toMatchObject({
      id: character.id,
      prompt: '',
      referenceImageAssetId: 'uploaded-asset',
      uploadedReferenceImageAssetId: 'uploaded-asset',
      finalReferenceKind: 'uploaded',
    });

    repository.recordSuccessfulPrompt({
      prompt: '',
      modelModeId: 'lucy-latest',
      savedCharacterPromptId: character.id,
      characterName: character.name,
      referenceImageAssetId: 'uploaded-asset',
    });

    expect(repository.getSnapshot().store).toMatchObject({
      recentPrompts: [
        {
          prompt: '',
          savedCharacterPromptId: character.id,
          characterName: character.name,
          referenceImageAssetId: 'uploaded-asset',
        },
      ],
      savedCharacterPrompts: [
        expect.objectContaining({
          id: character.id,
          useCount: 1,
        }),
      ],
    });

    repository.deleteSavedCharacterPrompt(character.id);
    expect(repositoryFixture(storage).getSnapshot().store).toMatchObject({
      savedCharacterPrompts: [],
      recentPrompts: [
        {
          prompt: '',
          characterName: character.name,
          referenceImageAssetId: 'uploaded-asset',
        },
      ],
    });
    expect(repository.getSnapshot().store.recentPrompts[0]).not.toHaveProperty(
      'savedCharacterPromptId',
    );
  });

  it('enriches the newest matching text-only recent without replacing an image version', () => {
    const repository = repositoryFixture();
    repository.recordSuccessfulPrompt({
      prompt: 'Substitute the character with a cartographer.',
      modelModeId: 'lucy-latest',
    });
    repository.enrichNewestMatchingRecent(
      'Substitute the character with a cartographer.',
      'lucy-latest',
      'asset-a',
    );
    repository.enrichNewestMatchingRecent(
      'Substitute the character with a cartographer.',
      'lucy-latest',
      'asset-b',
    );
    expect(repository.getSnapshot().store.recentPrompts).toEqual([
      expect.objectContaining({ referenceImageAssetId: 'asset-a' }),
    ]);
  });

  it('migrates the original v1 key to v6 and hydrates null references after refresh', () => {
    const storage = new MemoryStorage();
    storage.records.set(
      ORIGINAL_CREATIVE_ASSET_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        savedPrompts: [
          {
            id: 'legacy-prompt',
            title: 'Legacy prompt',
            prompt: 'Keep the scene cinematic.',
            modelModeId: 'lucy-latest',
            source: 'manual',
            tags: [],
            createdAt: '2026-07-14T12:00:00.000Z',
            updatedAt: '2026-07-14T12:00:00.000Z',
            lastUsedAt: null,
            useCount: 0,
          },
        ],
        recentPrompts: [],
        savedCharacterPrompts: [],
      }),
    );

    const migrated = createCreativeAssetRepository({ storage });
    expect(migrated.getSnapshot()).toMatchObject({
      health: 'ready',
      store: {
        schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
        savedPrompts: [expect.objectContaining({ referenceImageAssetId: null })],
      },
    });
    expect(storage.records.has(CREATIVE_ASSET_STORAGE_KEY)).toBe(true);
    expect(createCreativeAssetRepository({ storage }).getSnapshot().store.savedPrompts).toEqual(
      migrated.getSnapshot().store.savedPrompts,
    );
  });

  it('prefers and migrates the v2 key while preserving reference identities', () => {
    const storage = new MemoryStorage();
    storage.records.set(
      LEGACY_CREATIVE_ASSET_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        savedPrompts: [],
        recentPrompts: [],
        savedCharacterPrompts: [
          {
            id: 'v2-character',
            name: 'V2 character',
            prompt: 'Substitute the character with an adult presenter.',
            source: 'generator',
            promptIntent: 'character-transform',
            builderDraft: {
              ...createPromptBuilderDraft('character-transform'),
              hair: 'short black hair',
            },
            referenceImageStatus: 'persisted-reference',
            referenceImageAssetId: 'v2-reference',
            notes: '',
            tags: [],
            createdAt: '2026-07-14T12:00:00.000Z',
            updatedAt: '2026-07-14T12:00:00.000Z',
            lastUsedAt: null,
            useCount: 0,
          },
        ],
      }),
    );

    const migrated = createCreativeAssetRepository({ storage });
    expect(migrated.getSnapshot()).toMatchObject({
      health: 'ready',
      store: {
        schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
        savedCharacterPrompts: [
          {
            referenceImageAssetId: 'v2-reference',
            guidedDesign: null,
            builderDraft: {
              skinTone: '',
              bodyShape: '',
              hair: 'short black hair',
              hairColor: '',
            },
          },
        ],
      },
    });
    expect(storage.records.has(CREATIVE_ASSET_STORAGE_KEY)).toBe(true);
  });

  it('prefers and migrates the v3 key with generated reference provenance', () => {
    const storage = new MemoryStorage();
    storage.records.set(
      EARLIER_CREATIVE_ASSET_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 3,
        savedPrompts: [],
        recentPrompts: [],
        savedCharacterPrompts: [
          {
            id: 'v3-character',
            name: 'V3 character',
            prompt: 'Substitute the character with an adult presenter.',
            source: 'generator',
            promptIntent: 'character-transform',
            builderDraft: createPromptBuilderDraft('character-transform'),
            guidedDesign: guidedDesign(),
            referenceImageStatus: 'persisted-reference',
            referenceImageAssetId: 'v3-reference',
            notes: '',
            tags: [],
            createdAt: '2026-07-14T12:00:00.000Z',
            updatedAt: '2026-07-14T12:00:00.000Z',
            lastUsedAt: null,
            useCount: 0,
          },
        ],
      }),
    );

    expect(createCreativeAssetRepository({ storage }).getSnapshot().store).toMatchObject({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedCharacterPrompts: [
        expect.objectContaining({
          referenceImageAssetId: 'v3-reference',
          uploadedReferenceImageAssetId: null,
          finalReferenceKind: 'generated',
        }),
      ],
    });
    expect(storage.records.has(CREATIVE_ASSET_STORAGE_KEY)).toBe(true);
  });

  it('prefers and migrates the v4 key with explicit VTO mode inference', () => {
    const storage = new MemoryStorage();
    storage.records.set(
      OLDER_CREATIVE_ASSET_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 4,
        savedPrompts: [
          {
            id: 'v4-image-outfit',
            title: 'V4 image outfit',
            prompt: '',
            modelModeId: 'lucy-vton-latest',
            source: 'manual',
            referenceImageAssetId: 'opaque-v4-outfit',
            tags: [],
            createdAt: '2026-07-14T12:00:00.000Z',
            updatedAt: '2026-07-14T12:00:00.000Z',
            lastUsedAt: null,
            useCount: 0,
          },
        ],
        recentPrompts: [],
        savedCharacterPrompts: [],
      }),
    );

    expect(createCreativeAssetRepository({ storage }).getSnapshot()).toMatchObject({
      health: 'ready',
      store: {
        schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
        savedPrompts: [
          expect.objectContaining({
            id: 'v4-image-outfit',
            vtonInputKind: 'saved-outfit',
            enhancePrompt: false,
          }),
        ],
      },
    });
  });

  it('migrates the v5 key to an empty wardrobe with original selection', () => {
    const storage = new MemoryStorage();
    storage.records.set(
      PREVIOUS_CREATIVE_ASSET_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 5,
        savedPrompts: [],
        recentPrompts: [],
        savedCharacterPrompts: [
          {
            id: 'v5-character',
            name: 'V5 character',
            prompt: 'Replace the subject with a presenter.',
            source: 'generator',
            promptIntent: 'character-transform',
            builderDraft: null,
            guidedDesign: null,
            referenceImageStatus: 'persisted-reference',
            referenceImageAssetId: 'v5-reference',
            uploadedReferenceImageAssetId: null,
            finalReferenceKind: 'generated',
            notes: '',
            tags: [],
            createdAt: '2026-07-14T12:00:00.000Z',
            updatedAt: '2026-07-14T12:00:00.000Z',
            lastUsedAt: null,
            useCount: 0,
          },
        ],
      }),
    );

    expect(createCreativeAssetRepository({ storage }).getSnapshot().store).toMatchObject({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedCharacterPrompts: [expect.objectContaining({ selectedWardrobeVariantId: null })],
      savedCharacterVariants: [],
    });
  });

  it('migrates the v6 key and initializes nullable character voice preferences', () => {
    const storage = new MemoryStorage();
    storage.records.set(
      WARDROBE_CREATIVE_ASSET_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 6,
        savedPrompts: [],
        recentPrompts: [],
        savedCharacterPrompts: [
          {
            id: 'v6-character',
            name: 'V6 character',
            prompt: 'Replace the subject with a presenter.',
            source: 'generator',
            promptIntent: 'character-transform',
            builderDraft: null,
            guidedDesign: null,
            referenceImageStatus: 'prompt-only',
            referenceImageAssetId: null,
            uploadedReferenceImageAssetId: null,
            finalReferenceKind: null,
            selectedWardrobeVariantId: null,
            notes: '',
            tags: [],
            createdAt: '2026-07-14T12:00:00.000Z',
            updatedAt: '2026-07-14T12:00:00.000Z',
            lastUsedAt: null,
            useCount: 0,
          },
        ],
        savedCharacterVariants: [],
      }),
    );

    expect(createCreativeAssetRepository({ storage }).getSnapshot().store).toMatchObject({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedCharacterPrompts: [expect.objectContaining({ defaultVoice: null })],
    });
    expect(storage.records.has(CREATIVE_ASSET_STORAGE_KEY)).toBe(true);
  });

  it('treats a clean user-scoped v6 envelope as a healthy migration', () => {
    const storage = new MemoryStorage();
    const ownerUserId = 'user-1';
    const legacyKey = `${WARDROBE_CREATIVE_ASSET_STORAGE_KEY}.${ownerUserId}`;
    const storageKey = `${CREATIVE_ASSET_STORAGE_KEY}.${ownerUserId}`;
    storage.records.set(
      legacyKey,
      JSON.stringify({
        ownerUserId,
        store: {
          schemaVersion: 6,
          savedPrompts: [],
          recentPrompts: [],
          savedCharacterPrompts: [],
          savedCharacterVariants: [],
        },
      }),
    );

    const repository = createCreativeAssetRepository({
      storage,
      storageKey,
      legacyStorageKeys: [legacyKey],
      ownerUserId,
    });

    expect(repository.getSnapshot()).toMatchObject({ health: 'ready', notice: null });
    expect(storage.records.has(storageKey)).toBe(true);
  });

  it('recovers rather than silently treating a corrupt legacy payload as a migration', () => {
    const storage = new MemoryStorage();
    storage.records.set(LEGACY_CREATIVE_ASSET_STORAGE_KEY, '{not-json');

    const repository = createCreativeAssetRepository({ storage });
    expect(repository.getSnapshot()).toMatchObject({
      health: 'recovered',
      store: { schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION, savedPrompts: [] },
    });
    expect(storage.records.has(CREATIVE_ASSET_STORAGE_KEY)).toBe(true);
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
      guidedDesign: guidedDesign(),
    });

    const edited = repository.updateSavedCharacterPrompt(character.id, {
      prompt: 'Transform the subject into an adult overnight news anchor.',
    });

    expect(edited).toMatchObject({
      source: 'manual',
      promptIntent: null,
      builderDraft: null,
      guidedDesign: null,
    });
    expect(repositoryFixture(storage).getSnapshot().store.savedCharacterPrompts[0]).toMatchObject({
      source: 'manual',
      promptIntent: null,
      builderDraft: null,
      guidedDesign: null,
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
            modelModeId: 'lucy-latest',
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
      modelModeId: 'lucy-latest',
    });

    expect(repository.getSnapshot().health).toBe('session-only');
    expect(repository.getSnapshot().notice).toMatch(/tab closes/i);
    expect(repository.getSnapshot().store.savedPrompts).toHaveLength(1);
  });

  it('notifies selector subscribers only when their selected slice changes', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    const listener = vi.fn();
    repository.subscribeSelector((snapshot) => snapshot.health, listener);

    repository.createSavedPrompt({
      title: 'Stable storage',
      prompt: 'A calm studio portrait with warm side lighting.',
      modelModeId: 'lucy-latest',
    });
    expect(listener).not.toHaveBeenCalled();

    storage.failWrites = true;
    repository.createSavedPrompt({
      title: 'Session only',
      prompt: 'A cool studio portrait with soft fill lighting.',
      modelModeId: 'lucy-latest',
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('durably saves a caller-identified character before publishing it', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    let publishedSerialized: string | null = null;
    repository.subscribe(() => {
      publishedSerialized = storage.getItem('test-recipes');
    });

    const saved = repository.persistSavedCharacterPrompt({
      id: 'character-save-1',
      name: 'Morgan',
      prompt: 'An adult documentary presenter in a neutral studio.',
      promptIntent: 'character-transform',
      builderDraft: createPromptBuilderDraft('character-transform'),
      referenceImageStatus: 'prompt-only',
    });

    expect(saved.id).toBe('character-save-1');
    expect(publishedSerialized).toContain('character-save-1');
    expect(repository.getSnapshot().store.savedCharacterPrompts).toEqual([saved]);
  });

  it('does not publish a character when strict durable storage fails and retries idempotently', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    const listener = vi.fn();
    repository.subscribe(listener);
    const input = {
      id: 'character-save-retry',
      name: 'Morgan',
      prompt: 'An adult documentary presenter in a neutral studio.',
      promptIntent: 'character-transform' as const,
      builderDraft: createPromptBuilderDraft('character-transform'),
      referenceImageStatus: 'prompt-only' as const,
    };

    storage.failWrites = true;
    expect(() => repository.persistSavedCharacterPrompt(input)).toThrowError(
      expect.objectContaining({ code: 'storage-write-failed', retryable: true }),
    );
    expect(repository.getSnapshot().store.savedCharacterPrompts).toEqual([]);
    expect(listener).not.toHaveBeenCalled();

    storage.failWrites = false;
    const saved = repository.persistSavedCharacterPrompt(input);
    const retried = repository.persistSavedCharacterPrompt(input);
    expect(retried).toEqual(saved);
    expect(repository.getSnapshot().store.savedCharacterPrompts).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    const reopened = repositoryFixture(storage);
    expect(reopened.persistSavedCharacterPrompt(input)).toEqual(saved);
    expect(reopened.getSnapshot().store.savedCharacterPrompts).toHaveLength(1);
  });

  it('reports unavailable durable storage as a typed retryable failure', () => {
    const repository = repositoryFixture(null);
    expect(() =>
      repository.persistSavedCharacterPrompt({
        id: 'character-save-unavailable',
        name: 'Morgan',
        prompt: 'An adult documentary presenter in a neutral studio.',
        promptIntent: 'character-transform',
      }),
    ).toThrowError(expect.objectContaining({ code: 'storage-unavailable', retryable: true }));
    expect(repository.getSnapshot().store.savedCharacterPrompts).toEqual([]);
  });

  it('rejects a caller ID reused for different character content without writing', () => {
    const storage = new MemoryStorage();
    const repository = repositoryFixture(storage);
    const original = repository.persistSavedCharacterPrompt({
      id: 'character-save-conflict',
      name: 'Morgan',
      prompt: 'An adult documentary presenter in a neutral studio.',
      promptIntent: 'character-transform',
    });
    const durableBeforeConflict = storage.getItem('test-recipes');

    expect(() =>
      repository.persistSavedCharacterPrompt({
        id: original.id,
        name: 'Taylor',
        prompt: 'An adult field reporter outdoors.',
        promptIntent: 'character-transform',
      }),
    ).toThrowError(expect.objectContaining({ code: 'id-conflict', retryable: false }));
    expect(storage.getItem('test-recipes')).toBe(durableBeforeConflict);
    expect(repository.getSnapshot().store.savedCharacterPrompts).toEqual([original]);
  });
});
