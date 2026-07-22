// @vitest-environment jsdom

import type { SavedPrompt } from '../features/creative-assets/types';
import type { SessionReferenceImage } from '../features/media-session/types';
import { describe, expect, it } from 'vitest';
import { isExactActiveRecipe } from './useReferenceRecipeHandoff';

const savedPrompt: SavedPrompt = {
  id: 'saved-prompt-1',
  title: 'Presenter',
  prompt: 'A calm documentary presenter',
  modelModeId: 'lucy-2.5',
  source: 'manual',
  referenceImageAssetId: 'reference-1',
  tags: [],
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  lastUsedAt: null,
  useCount: 0,
};

const persistedReference: SessionReferenceImage = {
  kind: 'persisted',
  assetId: 'reference-1',
  file: new File(['image'], 'reference.png', { type: 'image/png' }),
  contentUrl: '/api/reference-images/reference-1/content',
};

const exactFingerprint = {
  mode: 'lucy-2.5',
  prompt: 'A calm documentary presenter',
  referenceImageAssetId: 'reference-1',
  assetPrompt: 'A calm documentary presenter',
  assetReferenceImageAssetId: 'reference-1',
} as const;

describe('reference recipe identity', () => {
  it('retains identity across non-semantic prompt whitespace', () => {
    expect(
      isExactActiveRecipe({
        fingerprint: exactFingerprint,
        asset: savedPrompt,
        draft: {
          mode: 'lucy-2.5',
          prompt: '  A calm documentary presenter  ',
          referenceImage: persistedReference,
        },
      }),
    ).toBe(true);
  });

  it('releases identity when the draft reference or stored asset changes', () => {
    const replacementReference: SessionReferenceImage = {
      ...persistedReference,
      assetId: 'reference-2',
    };
    expect(
      isExactActiveRecipe({
        fingerprint: exactFingerprint,
        asset: savedPrompt,
        draft: {
          mode: 'lucy-2.5',
          prompt: savedPrompt.prompt,
          referenceImage: replacementReference,
        },
      }),
    ).toBe(false);
    expect(
      isExactActiveRecipe({
        fingerprint: exactFingerprint,
        asset: { ...savedPrompt, prompt: 'An edited presenter' },
        draft: {
          mode: 'lucy-2.5',
          prompt: savedPrompt.prompt,
          referenceImage: persistedReference,
        },
      }),
    ).toBe(false);
  });

  it('does not treat a session-only reference as the persisted recipe asset', () => {
    const ephemeralReference: SessionReferenceImage = {
      kind: 'ephemeral',
      file: new File(['image'], 'portrait.png', { type: 'image/png' }),
      previewUrl: 'blob:portrait',
    };
    expect(
      isExactActiveRecipe({
        fingerprint: exactFingerprint,
        asset: savedPrompt,
        draft: {
          mode: 'lucy-2.5',
          prompt: savedPrompt.prompt,
          referenceImage: ephemeralReference,
        },
      }),
    ).toBe(false);
  });
});
