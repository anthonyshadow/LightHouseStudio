// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { UploadedReferenceImageAsset } from '@studio/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedPrompt,
} from '../features/creative-assets/types';
import type {
  SessionReferenceImage,
  StudioSessionController,
} from '../features/media-session/types';
import {
  characterBuilderSaveBlockedReason,
  createPendingReferenceRecipeUse,
  useReferenceRecipeAttribution,
} from './useReferenceRecipeAttribution';

const prompt: SavedPrompt = {
  id: 'saved-prompt',
  title: 'Presenter',
  prompt: 'A calm documentary presenter.',
  modelModeId: 'lucy-latest',
  source: 'manual',
  referenceImageAssetId: '8f45ea24-c274-41a5-a988-aa0602115191',
  vtonInputKind: null,
  enhancePrompt: false,
  tags: [],
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  lastUsedAt: null,
  useCount: 0,
};
const store: CreativeAssetStore = {
  schemaVersion: 7,
  savedPrompts: [prompt],
  recentPrompts: [],
  savedCharacterPrompts: [],
  savedCharacterVariants: [],
};
const asset: UploadedReferenceImageAsset = {
  assetId: prompt.referenceImageAssetId!,
  mimeType: 'image/png',
  byteSize: 5,
  source: 'uploaded',
  width: 800,
  height: 1200,
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  contentUrl: `/api/reference-images/${prompt.referenceImageAssetId}/content`,
};
const referenceImage: SessionReferenceImage = {
  kind: 'persisted',
  assetId: asset.assetId,
  file: new File(['image'], 'reference.png', { type: 'image/png' }),
  contentUrl: asset.contentUrl,
};

describe('reference recipe attribution', () => {
  it('links only an exact Recent selection and keeps Builder block precedence explicit', () => {
    expect(
      createPendingReferenceRecipeUse(
        {
          origin: 'recent-prompt',
          assetId: prompt.id,
          prompt: ` ${prompt.prompt} `,
          modelModeId: prompt.modelModeId,
          referenceImageAssetId: prompt.referenceImageAssetId,
        },
        store,
      ).savedPromptId,
    ).toBe(prompt.id);
    expect(
      characterBuilderSaveBlockedReason({
        openBlockedReason: 'Finish the current take.',
        canReplaceLucyRecipe: false,
        referenceUsePending: true,
      }),
    ).toBe('Finish the current take.');
  });

  it('publishes exact active identity only after a hydrated recipe commit', async () => {
    const dispatchActiveRecipe = vi.fn();
    const repository = {
      getSnapshot: () => ({ store, health: 'ready', notice: null }),
      enrichNewestMatchingRecent: vi.fn(),
      recordSuccessfulPrompt: vi.fn(),
    } as unknown as CreativeAssetRepository;
    const session = {
      draft: { mode: 'lucy-latest', prompt: '', referenceImage: null, enhance: false },
      canReplaceRecipeDraft: vi.fn(() => true),
    } as unknown as StudioSessionController;
    const { result } = renderHook(() =>
      useReferenceRecipeAttribution({
        repository,
        session,
        activeRecipe: null,
        activeFingerprint: null,
        activeCharacterName: undefined,
        dispatchActiveRecipe,
        characterBuilderOpenBlockedReason: undefined,
        referenceUsePending: false,
      }),
    );
    const pending = createPendingReferenceRecipeUse(
      {
        origin: 'saved-prompt',
        assetId: prompt.id,
        prompt: prompt.prompt,
        modelModeId: prompt.modelModeId,
        referenceImageAssetId: prompt.referenceImageAssetId,
      },
      store,
    );

    await act(async () => {
      await result.current.commitHydratedRecipe({
        pending,
        referenceImage,
        storedReferenceMetadata: asset,
        appliedPrompt: prompt.prompt,
        enhance: false,
        referenceMatchesPendingPrompt: true,
      });
    });

    expect(dispatchActiveRecipe).toHaveBeenCalledWith({
      type: 'commit',
      recipe: { origin: 'saved-prompt', assetId: prompt.id },
      fingerprint: {
        mode: 'lucy-latest',
        prompt: prompt.prompt,
        referenceImageAssetId: asset.assetId,
        assetPrompt: prompt.prompt,
        assetReferenceImageAssetId: asset.assetId,
        vtonInputKind: null,
        enhancePrompt: false,
        assetVtonInputKind: null,
        assetEnhancePrompt: false,
      },
    });
  });

  it('commits and persists an exact wardrobe version only after its image is hydrated', async () => {
    const character = {
      id: 'character-one',
      name: 'Field host',
      prompt: 'Replace the subject with a field host.',
      source: 'generator' as const,
      promptIntent: 'character-transform' as const,
      builderDraft: null,
      guidedDesign: null,
      referenceImageStatus: 'persisted-reference' as const,
      referenceImageAssetId: 'original-image',
      uploadedReferenceImageAssetId: null,
      finalReferenceKind: 'generated' as const,
      selectedWardrobeVariantId: null,
      defaultVoice: null,
      notes: '',
      tags: [],
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const variant = {
      id: 'variant-one',
      parentCharacterId: character.id,
      title: 'Green coat',
      referenceImageAssetId: 'variant-image',
      creation: {
        method: 'add-outfit' as const,
        sourceReferenceImageAssetId: 'original-image',
        garmentReferenceImageAssetId: 'garment-image',
      },
      createdAt: '2026-07-21T12:01:00.000Z',
      updatedAt: '2026-07-21T12:01:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const wardrobeStore: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character],
      savedCharacterVariants: [variant],
    };
    const wardrobeAsset: UploadedReferenceImageAsset = {
      ...asset,
      assetId: variant.referenceImageAssetId,
      contentUrl: `/api/reference-images/${variant.referenceImageAssetId}/content`,
    };
    const wardrobeReference: SessionReferenceImage = {
      ...referenceImage,
      assetId: variant.referenceImageAssetId,
      contentUrl: wardrobeAsset.contentUrl,
    };
    const dispatchActiveRecipe = vi.fn();
    const selectCharacterVersion = vi.fn().mockResolvedValue(undefined);
    const repository = {
      getSnapshot: () => ({ store: wardrobeStore, health: 'ready', notice: null }),
      enrichNewestMatchingRecent: vi.fn(),
      recordSuccessfulPrompt: vi.fn(),
      selectCharacterVersion,
    } as unknown as CreativeAssetRepository;
    const session = {
      draft: { mode: 'lucy-latest', prompt: '', referenceImage: null, enhance: false },
      canReplaceRecipeDraft: vi.fn(() => true),
    } as unknown as StudioSessionController;
    const { result } = renderHook(() =>
      useReferenceRecipeAttribution({
        repository,
        session,
        activeRecipe: null,
        activeFingerprint: null,
        activeCharacterName: undefined,
        dispatchActiveRecipe,
        characterBuilderOpenBlockedReason: undefined,
        referenceUsePending: false,
      }),
    );
    const pending = createPendingReferenceRecipeUse(
      {
        origin: 'character-prompt',
        assetId: character.id,
        savedCharacterVariantId: variant.id,
        prompt: character.prompt,
        modelModeId: 'lucy-latest',
        referenceImageAssetId: variant.referenceImageAssetId,
      },
      wardrobeStore,
    );

    expect(selectCharacterVersion).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.commitHydratedRecipe({
        pending,
        referenceImage: wardrobeReference,
        storedReferenceMetadata: wardrobeAsset,
        appliedPrompt: character.prompt,
        enhance: false,
        referenceMatchesPendingPrompt: true,
      });
    });

    expect(selectCharacterVersion).toHaveBeenCalledWith({
      characterId: character.id,
      variantId: variant.id,
    });
    expect(dispatchActiveRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'commit',
        recipe: { origin: 'character-prompt', assetId: character.id, variantId: variant.id },
      }),
    );
    expect(dispatchActiveRecipe.mock.lastCall?.[0]).toHaveProperty(
      'fingerprint.referenceImageAssetId',
      variant.referenceImageAssetId,
    );
    expect(dispatchActiveRecipe.mock.lastCall?.[0]).toHaveProperty(
      'fingerprint.assetReferenceImageAssetId',
      variant.referenceImageAssetId,
    );
  });
});
