import { describe, expect, it } from 'vitest';
import { createPromptBuilderDraft } from '../prompts';
import {
  CREATIVE_ASSET_SCHEMA_VERSION,
  CREATIVE_LIBRARY_EXPORT_FILE_VERSION,
  CREATIVE_LIBRARY_EXPORT_MAX_BYTES,
  EARLIER_CREATIVE_ASSET_SCHEMA_VERSION,
  LEGACY_CREATIVE_ASSET_SCHEMA_VERSION,
  OLDER_CREATIVE_ASSET_SCHEMA_VERSION,
  PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION,
  WARDROBE_CREATIVE_ASSET_SCHEMA_VERSION,
  RECENT_PROMPT_LIMIT,
  SAVED_CHARACTER_VARIANT_LIMIT,
  SAVED_PROMPT_LIMIT,
  createCreativeLibraryExportFile,
  createEmptyCreativeAssetStore,
  createSavedCharacterPrompt,
  createSavedCharacterVariant,
  createSavedPrompt,
  deleteSavedCharacterPrompt,
  deleteSavedCharacterVariant,
  deleteSavedPrompt,
  enrichNewestMatchingRecentWithReferenceImage,
  parseCreativeAssetStore,
  parseCreativeLibraryExportFile,
  recordSuccessfulPromptUse,
  resolveCharacterVersion,
  sanitizeCreativeAssetStore,
  sanitizeGuidedDesignV1,
  searchCreativeAssets,
  selectCharacterVersion,
  updateSavedPrompt,
  updateSavedCharacterPrompt,
  useSavedCharacterPrompt,
  useSavedPrompt,
  type GuidedDesignV1,
} from './index';

const timestamp = (offset = 0): string =>
  new Date(Date.UTC(2026, 6, 14, 12, 0, offset)).toISOString();
const context = (id: string, offset = 0) => ({ now: timestamp(offset), createId: () => id });

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
    hairColor: { optionId: 'custom', customValue: 'deep auburn' },
    outfit: { optionId: 'woman-professional' },
    accessories: null,
    expression: null,
    mood: null,
    role: { optionId: 'presenter' },
    style: { optionId: 'cinematic' },
    background: { optionId: 'studio' },
  },
});

describe('sanitizeGuidedDesignV1', () => {
  it('normalizes canonical limits and migrates missing legacy identity fields', () => {
    const design = guidedDesign();
    const choices = { ...design.choices } as Record<string, unknown>;
    delete choices.ethnicity;
    delete choices.skinTone;

    expect(
      sanitizeGuidedDesignV1({
        ...design,
        starterId: '  documentary-presenter  ',
        choices: {
          ...choices,
          hairColor: { optionId: 'custom', customValue: '  deep   auburn  ' },
        },
      }),
    ).toMatchObject({
      starterId: 'documentary-presenter',
      choices: {
        ethnicity: null,
        skinTone: null,
        hairColor: { optionId: 'custom', customValue: 'deep auburn' },
      },
    });
  });

  it('rejects missing non-legacy choices and bounds identifiers to 128 characters', () => {
    const design = guidedDesign();
    const missingChoice = { ...design.choices } as Record<string, unknown>;
    delete missingChoice.hair;

    expect(sanitizeGuidedDesignV1({ ...design, choices: missingChoice })).toBeNull();
    expect(
      sanitizeGuidedDesignV1({ ...design, starterId: 'x'.repeat(129) })?.starterId,
    ).toHaveLength(128);
    expect(
      sanitizeGuidedDesignV1({
        ...design,
        choices: { ...design.choices, hair: { optionId: 'x'.repeat(129) } },
      })?.choices.hair?.optionId,
    ).toHaveLength(128);
  });
});

describe('creative asset CRUD and use', () => {
  it('validates prompt and saved-image outfits and keeps enhancement in recent identity', () => {
    let store = createSavedPrompt(
      createEmptyCreativeAssetStore(),
      {
        title: 'Copper overshirt',
        prompt: 'A tailored copper linen overshirt.',
        modelModeId: 'lucy-vton-latest',
        source: 'manual',
        vtonInputKind: 'prompt',
        enhancePrompt: true,
      },
      context('prompt-outfit'),
    );
    store = createSavedPrompt(
      store,
      {
        title: 'Archive coat',
        prompt: '',
        modelModeId: 'lucy-vton-latest',
        source: 'manual',
        vtonInputKind: 'saved-outfit',
        referenceImageAssetId: 'opaque-outfit-image',
        enhancePrompt: true,
      },
      context('image-outfit', 1),
    );

    expect(store.savedPrompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'prompt-outfit',
          vtonInputKind: 'prompt',
          enhancePrompt: true,
          referenceImageAssetId: null,
        }),
        expect.objectContaining({
          id: 'image-outfit',
          prompt: '',
          vtonInputKind: 'saved-outfit',
          enhancePrompt: false,
          referenceImageAssetId: 'opaque-outfit-image',
        }),
      ]),
    );
    expect(() =>
      createSavedPrompt(
        store,
        {
          title: 'Broken image outfit',
          prompt: '',
          modelModeId: 'lucy-vton-latest',
          source: 'manual',
          vtonInputKind: 'saved-outfit',
        },
        context('broken'),
      ),
    ).toThrow(/persisted reference image/u);

    store = recordSuccessfulPromptUse(
      store,
      {
        prompt: 'A tailored copper linen overshirt.',
        modelModeId: 'lucy-vton-latest',
        vtonInputKind: 'prompt',
        enhancePrompt: true,
      },
      context('recent-enhanced', 2),
    );
    store = recordSuccessfulPromptUse(
      store,
      {
        prompt: 'A tailored copper linen overshirt.',
        modelModeId: 'lucy-vton-latest',
        vtonInputKind: 'prompt',
        enhancePrompt: false,
      },
      context('recent-plain', 3),
    );
    expect(store.recentPrompts).toHaveLength(2);
  });

  it('creates, normalizes, updates, uses, searches, and deletes saved prompts', () => {
    let store = createSavedPrompt(
      createEmptyCreativeAssetStore(),
      {
        title: '  Chrome   Explorer ',
        prompt: '  A chrome explorer  ',
        modelModeId: 'lucy-latest',
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
      { prompt: ' A   CHROME explorer ', modelModeId: 'lucy-latest' },
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
      { prompt: 'Velvet  jacket', modelModeId: 'lucy-vton-latest' },
      context('first', 0),
    );
    store = recordSuccessfulPromptUse(
      store,
      { prompt: '  velvet jacket ', modelModeId: 'lucy-vton-latest' },
      context('second', 1),
    );
    store = recordSuccessfulPromptUse(
      store,
      { prompt: 'velvet jacket', modelModeId: 'lucy-latest' },
      context('character', 2),
    );
    expect(store.recentPrompts).toHaveLength(2);
    expect(
      store.recentPrompts.find((recent) => recent.modelModeId === 'lucy-vton-latest'),
    ).toMatchObject({
      id: 'first',
      usedAt: timestamp(1),
    });
    expect(
      recordSuccessfulPromptUse(
        store,
        { prompt: '  ', modelModeId: 'lucy-latest' },
        context('empty'),
      ),
    ).toBe(store);
  });

  it('versions recents by exact reference asset and only enriches a text-only version', () => {
    let store = createEmptyCreativeAssetStore();
    store = recordSuccessfulPromptUse(
      store,
      { prompt: 'Substitute the character with a lunar guide.', modelModeId: 'lucy-latest' },
      context('text-only', 0),
    );
    store = enrichNewestMatchingRecentWithReferenceImage(store, {
      prompt: ' substitute the character with a lunar guide. ',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: 'asset-a',
    });
    expect(store.recentPrompts).toEqual([
      expect.objectContaining({ id: 'text-only', referenceImageAssetId: 'asset-a' }),
    ]);

    store = recordSuccessfulPromptUse(
      store,
      {
        prompt: 'Substitute the character with a lunar guide.',
        modelModeId: 'lucy-latest',
        referenceImageAssetId: 'asset-b',
      },
      context('asset-b-version', 1),
    );
    expect(store.recentPrompts.map((recent) => recent.referenceImageAssetId)).toEqual([
      'asset-b',
      'asset-a',
    ]);

    const unchanged = enrichNewestMatchingRecentWithReferenceImage(store, {
      prompt: 'Substitute the character with a lunar guide.',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: 'asset-c',
    });
    expect(unchanged).toBe(store);
  });

  it('attributes saved-prompt usage only to an exact prompt and reference version', () => {
    let store = createSavedPrompt(
      createEmptyCreativeAssetStore(),
      {
        title: 'Lunar guide A',
        prompt: 'Substitute the character with a lunar guide.',
        modelModeId: 'lucy-latest',
        source: 'manual',
        referenceImageAssetId: 'asset-a',
      },
      context('saved-a'),
    );
    store = createSavedPrompt(
      store,
      {
        title: 'Lunar guide B',
        prompt: 'Substitute the character with a lunar guide.',
        modelModeId: 'lucy-latest',
        source: 'manual',
        referenceImageAssetId: 'asset-b',
      },
      context('saved-b', 1),
    );

    store = recordSuccessfulPromptUse(
      store,
      {
        prompt: 'Substitute the character with a lunar guide.',
        modelModeId: 'lucy-latest',
        savedPromptId: 'saved-a',
        referenceImageAssetId: 'asset-b',
      },
      context('recent-b', 2),
    );

    expect(store.recentPrompts[0]?.savedPromptId).toBe('saved-b');
    expect(store.savedPrompts.find((asset) => asset.id === 'saved-a')?.useCount).toBe(0);
    expect(store.savedPrompts.find((asset) => asset.id === 'saved-b')?.useCount).toBe(1);

    store = recordSuccessfulPromptUse(
      store,
      {
        prompt: 'Substitute the character with a lunar guide.',
        modelModeId: 'lucy-latest',
        savedPromptId: 'saved-b',
        referenceImageAssetId: null,
      },
      context('recent-text', 3),
    );
    expect(store.recentPrompts[0]?.savedPromptId).toBeUndefined();
    expect(store.savedPrompts.find((asset) => asset.id === 'saved-b')?.useCount).toBe(1);
  });

  it('detaches stale references and recent links when a saved prompt changes', () => {
    let store = createSavedPrompt(
      createEmptyCreativeAssetStore(),
      {
        title: 'Linked guide',
        prompt: 'Substitute the character with an orbital guide.',
        modelModeId: 'lucy-latest',
        source: 'manual',
        referenceImageAssetId: 'asset-a',
      },
      context('saved-guide'),
    );
    store = recordSuccessfulPromptUse(
      store,
      {
        prompt: 'Substitute the character with an orbital guide.',
        modelModeId: 'lucy-latest',
        savedPromptId: 'saved-guide',
        referenceImageAssetId: 'asset-a',
      },
      context('recent-guide', 1),
    );

    store = updateSavedPrompt(
      store,
      'saved-guide',
      { prompt: 'Substitute the character with a desert guide.' },
      timestamp(2),
    );

    expect(store.savedPrompts[0]?.referenceImageAssetId).toBeNull();
    expect(store.recentPrompts[0]?.savedPromptId).toBeUndefined();
  });

  it('unlinks a sanitized recent when its saved recipe points at another reference version', () => {
    let store = createSavedPrompt(
      createEmptyCreativeAssetStore(),
      {
        title: 'Reference A',
        prompt: 'Substitute the character with an orbital guide.',
        modelModeId: 'lucy-latest',
        source: 'manual',
        referenceImageAssetId: 'asset-a',
      },
      context('saved-a'),
    );
    store = recordSuccessfulPromptUse(
      store,
      {
        prompt: 'Substitute the character with an orbital guide.',
        modelModeId: 'lucy-latest',
        savedPromptId: 'saved-a',
        referenceImageAssetId: 'asset-a',
      },
      context('recent-a', 1),
    );
    const recent = store.recentPrompts[0];
    expect(recent).toBeDefined();

    const sanitized = sanitizeCreativeAssetStore({
      ...store,
      recentPrompts: [{ ...recent, referenceImageAssetId: 'asset-b' }],
    });
    expect(sanitized.store.recentPrompts[0]?.savedPromptId).toBeUndefined();
  });

  it('caps saved and recent collections at their contract limits', () => {
    let store = createEmptyCreativeAssetStore();
    for (let index = 0; index < SAVED_PROMPT_LIMIT + 1; index += 1) {
      store = createSavedPrompt(
        store,
        {
          title: `Prompt ${index}`,
          prompt: `character prompt ${index}`,
          modelModeId: 'lucy-latest',
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
        { prompt: `unique recent ${index}`, modelModeId: 'lucy-latest' },
        context(`recent-${index}`, index),
      );
    }
    expect(store.recentPrompts).toHaveLength(RECENT_PROMPT_LIMIT);
  });

  it('stores restorable structured character data and an immutable opaque reference identity', () => {
    const builderDraft = {
      ...createPromptBuilderDraft('character-transform'),
      intent: 'character-transform' as const,
      characterBase: 'deep-sea navigator',
      bodyShape: 'athletic build',
      hairColor: 'deep auburn',
    };
    const store = createSavedCharacterPrompt(
      createEmptyCreativeAssetStore(),
      {
        name: 'Navigator',
        prompt: 'Transform the subject into a deep-sea navigator.',
        source: 'generator',
        promptIntent: 'character-transform',
        builderDraft,
        guidedDesign: guidedDesign(),
        referenceImageStatus: 'persisted-reference',
        referenceImageAssetId: 'reference-asset-1',
        notes: '  Keep face lighting  ',
      },
      context('character-1'),
    );
    const used = useSavedCharacterPrompt(store, 'character-1', timestamp(1));
    expect(used.builderDraft).toEqual(builderDraft);
    expect(used.guidedDesign).toEqual(guidedDesign());
    expect(used.store.savedCharacterPrompts[0]).toMatchObject({
      useCount: 1,
      defaultVoice: null,
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'reference-asset-1',
    });
    expect(JSON.stringify(store)).not.toMatch(/(?:imageData|objectUrl|portrait\.jpg)/u);
  });

  it('attaches, replaces, and removes a character default voice', () => {
    let store = createSavedCharacterPrompt(
      createEmptyCreativeAssetStore(),
      {
        name: 'Narrator',
        prompt: 'Transform the subject into a narrator.',
        source: 'generator',
        promptIntent: 'character-transform',
        referenceImageStatus: 'prompt-only',
      },
      context('narrator'),
    );

    store = updateSavedCharacterPrompt(
      store,
      'narrator',
      { defaultVoice: { kind: 'elevenlabs', voiceId: 'voice-1', voiceName: ' Northstar ' } },
      timestamp(1),
    );
    expect(store.savedCharacterPrompts[0]?.defaultVoice).toEqual({
      kind: 'elevenlabs',
      voiceId: 'voice-1',
      voiceName: 'Northstar',
    });

    store = updateSavedCharacterPrompt(store, 'narrator', { defaultVoice: null }, timestamp(2));
    expect(store.savedCharacterPrompts[0]?.defaultVoice).toBeNull();
  });

  it('stores image-only characters, records them only after successful use, and unlinks recents on delete', () => {
    let store = createSavedCharacterPrompt(
      createEmptyCreativeAssetStore(),
      {
        name: 'Uploaded Character 01',
        prompt: '',
        source: 'generator',
        promptIntent: null,
        builderDraft: null,
        guidedDesign: null,
        referenceImageStatus: 'persisted-reference',
        referenceImageAssetId: 'uploaded-asset-1',
        uploadedReferenceImageAssetId: 'uploaded-asset-1',
        finalReferenceKind: 'uploaded',
      },
      context('character-image-only'),
    );

    expect(store.recentPrompts).toEqual([]);
    expect(store.savedCharacterPrompts[0]).toMatchObject({
      prompt: '',
      promptIntent: null,
      builderDraft: null,
      guidedDesign: null,
      referenceImageAssetId: 'uploaded-asset-1',
      uploadedReferenceImageAssetId: 'uploaded-asset-1',
      finalReferenceKind: 'uploaded',
    });

    store = recordSuccessfulPromptUse(
      store,
      {
        prompt: '',
        modelModeId: 'lucy-latest',
        savedCharacterPromptId: 'character-image-only',
        characterName: 'Uploaded Character 01',
        referenceImageAssetId: 'uploaded-asset-1',
      },
      context('recent-image-only', 1),
    );

    expect(store.recentPrompts).toEqual([
      expect.objectContaining({
        prompt: '',
        characterName: 'Uploaded Character 01',
        savedCharacterPromptId: 'character-image-only',
        referenceImageAssetId: 'uploaded-asset-1',
      }),
    ]);
    expect(store.savedCharacterPrompts[0]).toMatchObject({
      useCount: 1,
      lastUsedAt: timestamp(1),
    });

    store = deleteSavedCharacterPrompt(store, 'character-image-only');
    expect(store.savedCharacterPrompts).toEqual([]);
    expect(store.recentPrompts).toEqual([
      expect.objectContaining({
        prompt: '',
        characterName: 'Uploaded Character 01',
        referenceImageAssetId: 'uploaded-asset-1',
      }),
    ]);
    expect(store.recentPrompts[0]).not.toHaveProperty('savedCharacterPromptId');
  });

  it('normalizes wardrobe variants, resolves exact images, and persists selection only on exact use', () => {
    let store = createSavedCharacterPrompt(
      createEmptyCreativeAssetStore(),
      {
        name: 'Field host',
        prompt: 'Replace the subject with a field host.',
        source: 'generator',
        promptIntent: 'character-transform',
        referenceImageStatus: 'persisted-reference',
        referenceImageAssetId: 'host-original',
      },
      context('host'),
    );
    store = createSavedCharacterVariant(
      store,
      {
        parentCharacterId: 'host',
        title: '  Evening   look ',
        referenceImageAssetId: 'host-evening',
        creation: {
          method: 'add-outfit',
          sourceReferenceImageAssetId: 'host-original',
          garmentReferenceImageAssetId: 'garment-one',
        },
      },
      context('variant-one', 1),
    );
    store = createSavedCharacterVariant(
      store,
      {
        parentCharacterId: 'host',
        title: 'Evening look',
        referenceImageAssetId: 'host-features',
        creation: {
          method: 'change-features',
          sourceReferenceImageAssetId: 'host-evening',
          changeInstructions: '  Add   silver-rimmed glasses. ',
        },
      },
      context('variant-two', 2),
    );

    expect(store.savedCharacterVariants).toHaveLength(2);
    expect(store.savedCharacterVariants[0]).toMatchObject({ title: 'Evening look' });
    expect(
      store.savedCharacterVariants.find((item) => item.id === 'variant-two')?.creation,
    ).toMatchObject({
      method: 'change-features',
      changeInstructions: 'Add   silver-rimmed glasses.',
    });
    expect(
      resolveCharacterVersion(store, { characterId: 'host', variantId: 'variant-two' }),
    ).toMatchObject({
      displayLabel: 'Field host · Evening look',
      referenceImageAssetId: 'host-features',
    });

    store = recordSuccessfulPromptUse(
      store,
      {
        prompt: 'Replace the subject with a field host.',
        modelModeId: 'lucy-latest',
        savedCharacterPromptId: 'host',
        savedCharacterVariantId: 'variant-two',
        referenceImageAssetId: 'host-features',
      },
      context('recent-variant', 3),
    );
    expect(store.savedCharacterPrompts[0]).toMatchObject({
      selectedWardrobeVariantId: 'variant-two',
      useCount: 1,
    });
    expect(store.savedCharacterVariants.find((item) => item.id === 'variant-two')).toMatchObject({
      useCount: 1,
      lastUsedAt: timestamp(3),
    });
    expect(store.recentPrompts[0]).toMatchObject({
      savedCharacterPromptId: 'host',
      savedCharacterVariantId: 'variant-two',
      referenceImageAssetId: 'host-features',
    });

    store = deleteSavedCharacterVariant(store, 'variant-two');
    expect(store.savedCharacterVariants.map((variant) => variant.id)).toEqual(['variant-one']);
    expect(store.savedCharacterPrompts[0]?.selectedWardrobeVariantId).toBeNull();
    expect(store.recentPrompts[0]).not.toHaveProperty('savedCharacterPromptId');
    expect(store.recentPrompts[0]).not.toHaveProperty('savedCharacterVariantId');
    expect(store.recentPrompts[0]).toMatchObject({
      characterName: 'Field host',
      referenceImageAssetId: 'host-features',
    });

    const unchangedStore = selectCharacterVersion(store, 'host', null, timestamp(4));
    expect(unchangedStore).toBe(store);
    store = unchangedStore;
    expect(store.savedCharacterPrompts[0]?.selectedWardrobeVariantId).toBeNull();
    store = deleteSavedCharacterPrompt(store, 'host');
    expect(store.savedCharacterVariants).toEqual([]);
    expect(store.recentPrompts[0]).not.toHaveProperty('savedCharacterPromptId');
    expect(store.recentPrompts[0]).not.toHaveProperty('savedCharacterVariantId');
  });

  it('caps wardrobe metadata and clears a selected version when that record is evicted', () => {
    let store = createSavedCharacterPrompt(
      createEmptyCreativeAssetStore(),
      {
        name: 'Bounded host',
        prompt: 'Replace the subject with a host.',
        source: 'generator',
        promptIntent: 'character-transform',
        referenceImageStatus: 'persisted-reference',
        referenceImageAssetId: 'bounded-original',
      },
      context('bounded-host'),
    );

    for (let index = 0; index <= SAVED_CHARACTER_VARIANT_LIMIT; index += 1) {
      store = createSavedCharacterVariant(
        store,
        {
          parentCharacterId: 'bounded-host',
          title: `Variant ${index}`,
          referenceImageAssetId: `bounded-result-${index}`,
          creation: {
            method: 'add-outfit',
            sourceReferenceImageAssetId: 'bounded-original',
            garmentReferenceImageAssetId: `bounded-garment-${index}`,
          },
        },
        context(`bounded-variant-${index}`, index),
      );
      if (index === 0) {
        store = selectCharacterVersion(
          store,
          'bounded-host',
          'bounded-variant-0',
          timestamp(index),
        );
      }
    }

    expect(store.savedCharacterVariants).toHaveLength(SAVED_CHARACTER_VARIANT_LIMIT);
    expect(store.savedCharacterVariants).not.toContainEqual(
      expect.objectContaining({ id: 'bounded-variant-0' }),
    );
    expect(store.savedCharacterPrompts[0]?.selectedWardrobeVariantId).toBeNull();
  });

  it('rejects empty character prompts without a consistent uploaded final reference', () => {
    expect(() =>
      createSavedCharacterPrompt(
        createEmptyCreativeAssetStore(),
        {
          name: 'Invalid image-only character',
          prompt: '',
          source: 'generator',
          promptIntent: null,
          referenceImageStatus: 'persisted-reference',
          referenceImageAssetId: 'generated-asset',
          uploadedReferenceImageAssetId: 'uploaded-source',
          finalReferenceKind: 'generated',
        },
        context('invalid-image-only'),
      ),
    ).toThrow('An image-only character requires an uploaded reference image.');

    expect(() =>
      createSavedCharacterPrompt(
        createEmptyCreativeAssetStore(),
        {
          name: 'Invalid provenance',
          prompt: 'Transform the subject.',
          source: 'generator',
          promptIntent: 'character-transform',
          referenceImageStatus: 'persisted-reference',
          referenceImageAssetId: 'uploaded-final',
          uploadedReferenceImageAssetId: 'different-source',
          finalReferenceKind: 'uploaded',
        },
        context('invalid-provenance'),
      ),
    ).toThrow('The final and uploaded reference-image identities are inconsistent.');
  });

  it('drops guided provenance when a generated prompt is manually edited', () => {
    const builderDraft = {
      ...createPromptBuilderDraft('character-transform'),
      characterBase: 'documentary presenter',
    };
    let store = createSavedCharacterPrompt(
      createEmptyCreativeAssetStore(),
      {
        name: 'Presenter',
        prompt: 'Substitute the character with a documentary presenter.',
        source: 'generator',
        promptIntent: 'character-transform',
        builderDraft,
        guidedDesign: guidedDesign(),
        referenceImageStatus: 'persisted-reference',
        referenceImageAssetId: 'asset-guided',
      },
      context('character-guided'),
    );

    store = updateSavedCharacterPrompt(
      store,
      'character-guided',
      { prompt: 'Substitute the character with a manually edited host.' },
      timestamp(1),
    );

    expect(store.savedCharacterPrompts[0]).toMatchObject({
      source: 'manual',
      promptIntent: null,
      builderDraft: null,
      guidedDesign: null,
      referenceImageStatus: 'prompt-only',
      referenceImageAssetId: null,
    });
  });
});

describe('creative asset sanitation and recovery', () => {
  const validSavedPrompt = {
    id: 'safe-id',
    title: ' Safe asset ',
    prompt: '  A useful prompt  ',
    modelModeId: 'lucy-latest',
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

    const reordered = Object.fromEntries(Object.entries(result.store).reverse());
    expect(sanitizeCreativeAssetStore(reordered)).toEqual({
      store: result.store,
      recovered: false,
      droppedRecords: 0,
    });
  });

  it('deduplicates untrusted recents by mode and canonical prompt', () => {
    const recent = {
      id: 'old',
      prompt: 'Ocean  guide',
      modelModeId: 'lucy-latest',
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

  it('migrates v1 records by adding nullable references without data loss', () => {
    const result = sanitizeCreativeAssetStore({
      schemaVersion: 1,
      savedPrompts: [{ ...validSavedPrompt, referenceImageAssetId: 'untrusted-v1-asset' }],
      recentPrompts: [
        {
          id: 'legacy-recent',
          prompt: 'A useful prompt',
          modelModeId: 'lucy-latest',
          referenceImageAssetId: 'untrusted-v1-asset',
          usedAt: timestamp(),
        },
      ],
      savedCharacterPrompts: [
        {
          id: 'legacy-character',
          name: 'Legacy character',
          prompt: 'A useful character prompt',
          source: 'generator',
          promptIntent: 'character-transform',
          builderDraft: null,
          referenceImageStatus: 'persisted-reference',
          referenceImageAssetId: 'untrusted-v1-asset',
          notes: '',
          tags: [],
          createdAt: timestamp(),
          updatedAt: timestamp(),
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    });

    expect(result.recovered).toBe(true);
    expect(result.store).toMatchObject({ schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION });
    expect(result.store.savedPrompts[0]?.referenceImageAssetId).toBeNull();
    expect(result.store.recentPrompts[0]?.referenceImageAssetId).toBeNull();
    expect(result.store.savedCharacterPrompts[0]).toMatchObject({
      referenceImageStatus: 'prompt-only',
      referenceImageAssetId: null,
      guidedDesign: null,
    });
  });

  it('migrates v2 records, preserving references while defaulting new draft fields and provenance', () => {
    const result = sanitizeCreativeAssetStore({
      schemaVersion: LEGACY_CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [
        {
          id: 'v2-character',
          name: 'Legacy presenter',
          prompt: 'Substitute the character with a presenter.',
          source: 'generator',
          promptIntent: 'character-transform',
          builderDraft: {
            intent: 'character-transform',
            presetId: null,
            customDetails: '',
            adultAge: 'adult',
            gender: 'woman',
            characterBase: 'presenter',
            matchReference: false,
            appearance: '',
            hair: 'long waves with black hair',
            outfit: '',
            accessories: '',
            expression: '',
            mood: '',
            preserve: '',
          },
          referenceImageStatus: 'persisted-reference',
          referenceImageAssetId: 'reference-v2',
          notes: '',
          tags: [],
          createdAt: timestamp(),
          updatedAt: timestamp(),
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    });

    expect(result.recovered).toBe(true);
    expect(result.store.savedCharacterPrompts[0]).toMatchObject({
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'reference-v2',
      uploadedReferenceImageAssetId: null,
      finalReferenceKind: 'generated',
      guidedDesign: null,
      builderDraft: {
        ethnicity: '',
        skinTone: '',
        bodyShape: '',
        hair: 'long waves with black hair',
        hairColor: '',
      },
    });
  });

  it('migrates v3 image-backed characters as generated references', () => {
    const result = sanitizeCreativeAssetStore({
      schemaVersion: EARLIER_CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [
        {
          id: 'v3-character',
          name: 'V3 presenter',
          prompt: 'Substitute the character with a presenter.',
          source: 'generator',
          promptIntent: 'character-transform',
          builderDraft: createPromptBuilderDraft('character-transform'),
          guidedDesign: guidedDesign(),
          referenceImageStatus: 'persisted-reference',
          referenceImageAssetId: 'reference-v3',
          notes: '',
          tags: [],
          createdAt: timestamp(),
          updatedAt: timestamp(),
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    });

    expect(result.recovered).toBe(true);
    expect(result.store.savedCharacterPrompts[0]).toMatchObject({
      referenceImageAssetId: 'reference-v3',
      uploadedReferenceImageAssetId: null,
      finalReferenceKind: 'generated',
    });
  });

  it('migrates v4 VTO records to explicit prompt or saved-outfit configuration', () => {
    const base = {
      source: 'manual',
      tags: [],
      createdAt: timestamp(),
      updatedAt: timestamp(),
      lastUsedAt: null,
      useCount: 0,
    } as const;
    const result = sanitizeCreativeAssetStore({
      schemaVersion: OLDER_CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [
        {
          ...base,
          id: 'prompt-v4',
          title: 'Prompt outfit',
          prompt: 'A moss green field jacket.',
          modelModeId: 'lucy-vton-latest',
          referenceImageAssetId: null,
        },
        {
          ...base,
          id: 'combined-v4',
          title: 'Combined outfit',
          prompt: 'Preserve the brass buttons.',
          modelModeId: 'lucy-vton-latest',
          referenceImageAssetId: 'opaque-v4-outfit',
        },
      ],
      recentPrompts: [
        {
          id: 'image-recent-v4',
          prompt: '',
          modelModeId: 'lucy-vton-latest',
          referenceImageAssetId: 'opaque-v4-recent',
          usedAt: timestamp(),
        },
      ],
      savedCharacterPrompts: [],
    });

    expect(result.store.savedPrompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'prompt-v4', vtonInputKind: 'prompt', enhancePrompt: false }),
        expect.objectContaining({
          id: 'combined-v4',
          vtonInputKind: 'saved-outfit',
          enhancePrompt: false,
          prompt: 'Preserve the brass buttons.',
        }),
      ]),
    );
    expect(result.store.recentPrompts[0]).toMatchObject({
      id: 'image-recent-v4',
      prompt: '',
      vtonInputKind: 'saved-outfit',
      enhancePrompt: false,
    });
  });

  it('migrates v5 characters to an empty wardrobe with the original selected', () => {
    const result = sanitizeCreativeAssetStore({
      schemaVersion: PREVIOUS_CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [
        {
          id: 'v5-character',
          name: 'V5 presenter',
          prompt: 'Replace the subject with a presenter.',
          source: 'generator',
          promptIntent: 'character-transform',
          builderDraft: null,
          guidedDesign: null,
          referenceImageStatus: 'persisted-reference',
          referenceImageAssetId: 'reference-v5',
          uploadedReferenceImageAssetId: null,
          finalReferenceKind: 'generated',
          notes: '',
          tags: [],
          createdAt: timestamp(),
          updatedAt: timestamp(),
          lastUsedAt: null,
          useCount: 0,
        },
      ],
      savedCharacterVariants: [{ id: 'untrusted-v5-variant', parentCharacterId: 'v5-character' }],
    });

    expect(result.recovered).toBe(true);
    expect(result.store.savedCharacterVariants).toEqual([]);
    expect(result.store.savedCharacterPrompts[0]?.selectedWardrobeVariantId).toBeNull();
    expect(result.store.savedCharacterPrompts[0]?.defaultVoice).toBeNull();
  });

  it('migrates v6 wardrobe characters with no default voice', () => {
    const result = sanitizeCreativeAssetStore({
      schemaVersion: WARDROBE_CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [
        {
          id: 'v6-character',
          name: 'V6 presenter',
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
          createdAt: timestamp(),
          updatedAt: timestamp(),
          lastUsedAt: null,
          useCount: 0,
        },
      ],
      savedCharacterVariants: [],
    });

    expect(result.store).toMatchObject({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedCharacterPrompts: [expect.objectContaining({ defaultVoice: null })],
    });
  });

  it('drops cross-parent variants and repairs dangling persisted selections', () => {
    const character = {
      id: 'parent-a',
      name: 'Parent A',
      prompt: 'Replace with parent A.',
      source: 'generator',
      promptIntent: 'character-transform',
      builderDraft: null,
      guidedDesign: null,
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'original-a',
      uploadedReferenceImageAssetId: null,
      finalReferenceKind: 'generated',
      selectedWardrobeVariantId: 'variant-b',
      notes: '',
      tags: [],
      createdAt: timestamp(),
      updatedAt: timestamp(),
      lastUsedAt: null,
      useCount: 0,
    } as const;
    const result = sanitizeCreativeAssetStore({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character, { ...character, id: 'parent-b', name: 'Parent B' }],
      savedCharacterVariants: [
        {
          id: 'variant-b',
          parentCharacterId: 'parent-b',
          title: 'Look',
          referenceImageAssetId: 'variant-image',
          creation: {
            method: 'change-features',
            sourceReferenceImageAssetId: 'original-a',
            changeInstructions: 'Change hair color.',
          },
          createdAt: timestamp(),
          updatedAt: timestamp(),
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    });

    expect(
      result.store.savedCharacterPrompts.find((item) => item.id === 'parent-a')
        ?.selectedWardrobeVariantId,
    ).toBeNull();
    expect(
      result.store.savedCharacterPrompts.find((item) => item.id === 'parent-b')
        ?.selectedWardrobeVariantId,
    ).toBe('variant-b');
  });

  it('sanitizes valid image-only recents and removes broken character links without losing the recipe', () => {
    const result = sanitizeCreativeAssetStore({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [],
      savedCharacterPrompts: [],
      recentPrompts: [
        {
          id: 'image-only-recent',
          prompt: '',
          modelModeId: 'lucy-latest',
          savedCharacterPromptId: 'deleted-character',
          characterName: 'Uploaded Character 01',
          referenceImageAssetId: 'uploaded-asset-1',
          usedAt: timestamp(),
        },
      ],
    });

    expect(result.store.recentPrompts).toEqual([
      expect.objectContaining({
        id: 'image-only-recent',
        prompt: '',
        characterName: 'Uploaded Character 01',
        referenceImageAssetId: 'uploaded-asset-1',
      }),
    ]);
    expect(result.store.recentPrompts[0]).not.toHaveProperty('savedCharacterPromptId');
  });

  it('allowlists and normalizes guided catalog provenance', () => {
    const design = guidedDesign();
    const result = sanitizeCreativeAssetStore({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [
        {
          id: 'guided-character',
          name: 'Guided presenter',
          prompt: 'Substitute the character with a presenter.',
          source: 'generator',
          promptIntent: 'character-transform',
          builderDraft: createPromptBuilderDraft('character-transform'),
          guidedDesign: {
            ...design,
            token: 'must-not-survive',
            choices: {
              ...design.choices,
              hairColor: {
                optionId: 'custom',
                customValue: '  deep   auburn ',
                secret: 'must-not-survive',
              },
            },
          },
          referenceImageStatus: 'prompt-only',
          referenceImageAssetId: null,
          notes: '',
          tags: [],
          createdAt: timestamp(),
          updatedAt: timestamp(),
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    });

    expect(result.recovered).toBe(true);
    expect(result.store.savedCharacterPrompts[0]?.guidedDesign).toEqual(guidedDesign());
    expect(JSON.stringify(result.store)).not.toMatch(/(?:token|secret|must-not-survive)/u);
  });

  it('keeps distinct sanitized recent versions for distinct reference assets', () => {
    const recent = {
      id: 'asset-a-recent',
      prompt: 'Ocean guide',
      modelModeId: 'lucy-latest',
      usedAt: timestamp(0),
      referenceImageAssetId: 'asset-a',
    };
    const result = sanitizeCreativeAssetStore({
      schemaVersion: CREATIVE_ASSET_SCHEMA_VERSION,
      savedPrompts: [],
      recentPrompts: [
        recent,
        { ...recent, id: 'asset-b-recent', referenceImageAssetId: 'asset-b' },
      ],
      savedCharacterPrompts: [],
    });
    expect(result.store.recentPrompts).toHaveLength(2);
  });

  it('recovers corrupt JSON and unknown versions to an empty store', () => {
    expect(parseCreativeAssetStore('{not json').recovered).toBe(true);
    expect(parseCreativeAssetStore('{not json').store).toEqual(createEmptyCreativeAssetStore());
    expect(sanitizeCreativeAssetStore({ schemaVersion: 99 }).recovered).toBe(true);
  });
});

describe('creative library portability', () => {
  const populatedStore = () => {
    let store = createSavedCharacterPrompt(
      createEmptyCreativeAssetStore(),
      {
        name: 'Field host',
        prompt: 'Replace the subject with a field host.',
        source: 'generator',
        promptIntent: 'character-transform',
        referenceImageStatus: 'persisted-reference',
        referenceImageAssetId: 'host-original',
        uploadedReferenceImageAssetId: 'host-uploaded',
      },
      context('host'),
    );
    store = createSavedCharacterVariant(
      store,
      {
        parentCharacterId: 'host',
        title: 'Evening look',
        referenceImageAssetId: 'host-evening',
        creation: {
          method: 'add-outfit',
          sourceReferenceImageAssetId: 'host-original',
          garmentReferenceImageAssetId: 'garment-one',
        },
      },
      context('variant-one', 1),
    );
    store = createSavedPrompt(
      store,
      {
        title: 'Evening coat',
        prompt: 'A long evening coat',
        modelModeId: 'lucy-vton-latest',
        source: 'manual',
        referenceImageAssetId: 'coat-reference',
      },
      context('outfit', 2),
    );
    return recordSuccessfulPromptUse(
      store,
      {
        prompt: 'A long evening coat',
        modelModeId: 'lucy-vton-latest',
        savedPromptId: 'outfit',
        referenceImageAssetId: 'coat-reference',
        vtonInputKind: 'saved-outfit',
      },
      context('recent', 3),
    );
  };

  it('writes every record and the reference images they depend on, and reads them back unchanged', () => {
    const store = populatedStore();

    const exported = createCreativeLibraryExportFile(store, timestamp(4));

    expect(exported.fileVersion).toBe(CREATIVE_LIBRARY_EXPORT_FILE_VERSION);
    expect(exported.store).toEqual(store);
    expect(exported.store.savedCharacterPrompts).toHaveLength(1);
    expect(exported.store.savedCharacterVariants).toHaveLength(1);
    expect(exported.store.savedPrompts).toHaveLength(1);
    expect(exported.store.recentPrompts).toHaveLength(1);
    // The manifest names the images the records point at; no bytes and no URLs are included.
    expect(exported.referenceImageAssetIds).toEqual([
      'coat-reference',
      'garment-one',
      'host-evening',
      'host-original',
      'host-uploaded',
    ]);
    expect(JSON.stringify(exported)).not.toMatch(/(?:data:|blob:|https?:)/u);

    const reread = parseCreativeLibraryExportFile(JSON.stringify(exported));

    expect(reread.ok).toBe(true);
    expect(reread.ok && reread.file.store).toEqual(store);
  });

  it('refuses anything it cannot import exactly, naming which rule refused it', () => {
    const exported = createCreativeLibraryExportFile(populatedStore(), timestamp(4));
    const refusal = (value: unknown) => {
      const result = parseCreativeLibraryExportFile(JSON.stringify(value));
      return result.ok ? null : result.refusal;
    };

    expect(refusal({ ...exported, fileVersion: CREATIVE_LIBRARY_EXPORT_FILE_VERSION + 1 })).toBe(
      'unsupported-file-version',
    );
    expect(refusal({ ...exported, kind: 'something-else' })).toBe('not-a-library-file');
    expect(refusal({ ...exported, exportedAt: 'not a date' })).toBe('not-a-library-file');
    expect(refusal({ ...exported, referenceImageAssetIds: [7] })).toBe('not-a-library-file');
    expect(refusal({ ...exported, store: 'nope' })).toBe('not-a-library-file');
    expect(parseCreativeLibraryExportFile('{not json')).toEqual({
      ok: false,
      refusal: 'unreadable',
    });
    // An older library is refused rather than migrated: a backup must not be rewritten on the way in.
    expect(
      refusal({
        ...exported,
        store: { ...exported.store, schemaVersion: WARDROBE_CREATIVE_ASSET_SCHEMA_VERSION },
      }),
    ).toBe('unsupported-store-version');
    // The server's rule exactly: a snapshot that has to be repaired is not the one exported.
    expect(
      refusal({
        ...exported,
        store: {
          ...exported.store,
          savedPrompts: [...exported.store.savedPrompts, { id: 'broken' }],
        },
      }),
    ).toBe('lossy');
  });

  it('bounds the file at the size the cloud mirror would accept', () => {
    expect(CREATIVE_LIBRARY_EXPORT_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it('exports an empty library as an empty, importable file', () => {
    const exported = createCreativeLibraryExportFile(createEmptyCreativeAssetStore(), timestamp(0));

    expect(exported.referenceImageAssetIds).toEqual([]);
    const reread = parseCreativeLibraryExportFile(JSON.stringify(exported));
    expect(reread.ok && reread.file.store).toEqual(createEmptyCreativeAssetStore());
  });
});
