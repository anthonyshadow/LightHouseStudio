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
  modelModeId: 'lucy-2.5',
  source: 'manual',
  referenceImageAssetId: '8f45ea24-c274-41a5-a988-aa0602115191',
  tags: [],
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  lastUsedAt: null,
  useCount: 0,
};
const store: CreativeAssetStore = {
  schemaVersion: 4,
  savedPrompts: [prompt],
  recentPrompts: [],
  savedCharacterPrompts: [],
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
        shelfDirty: true,
        canReplaceLucyRecipe: false,
        referenceUsePending: true,
      }),
    ).toBe('Finish the current take.');
  });

  it('publishes exact active identity only after a hydrated recipe commit', () => {
    const dispatchActiveRecipe = vi.fn();
    const repository = {
      getSnapshot: () => ({ store, health: 'ready', notice: null }),
      enrichNewestMatchingRecent: vi.fn(),
      recordSuccessfulPrompt: vi.fn(),
    } as unknown as CreativeAssetRepository;
    const session = {
      draft: { mode: 'lucy-2.5', prompt: '', referenceImage: null, enhance: false },
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
        shelfDirty: false,
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

    act(() => {
      result.current.commitHydratedRecipe({
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
        mode: 'lucy-2.5',
        prompt: prompt.prompt,
        referenceImageAssetId: asset.assetId,
        assetPrompt: prompt.prompt,
        assetReferenceImageAssetId: asset.assetId,
      },
    });
  });
});
