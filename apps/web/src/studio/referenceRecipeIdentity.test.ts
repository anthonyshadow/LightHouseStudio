import { describe, expect, it } from 'vitest';
import type { CreativeAssetStore, SavedPrompt } from '../features/creative-assets/types';
import {
  activeRecipeReducer,
  INITIAL_ACTIVE_RECIPE_STATE,
  resolveActiveRecipe,
} from './referenceRecipeIdentity';

const prompt: SavedPrompt = {
  id: 'saved-prompt',
  title: 'Presenter',
  prompt: 'A calm documentary presenter.',
  modelModeId: 'lucy-latest',
  source: 'manual',
  referenceImageAssetId: null,
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

describe('active recipe reducer and resolution', () => {
  it('commits one exact identity and derives its current label from the repository', () => {
    const state = activeRecipeReducer(INITIAL_ACTIVE_RECIPE_STATE, {
      type: 'commit',
      recipe: { origin: 'saved-prompt', assetId: prompt.id },
      fingerprint: {
        mode: 'lucy-latest',
        prompt: prompt.prompt,
        referenceImageAssetId: null,
        assetPrompt: prompt.prompt,
        assetReferenceImageAssetId: null,
      },
    });

    expect(
      resolveActiveRecipe(state, store, {
        mode: 'lucy-latest',
        prompt: ` ${prompt.prompt} `,
        referenceImage: null,
      }),
    ).toMatchObject({
      recipe: { origin: 'saved-prompt', assetId: prompt.id },
      asset: prompt,
      label: prompt.title,
      character: null,
    });
  });

  it('resolves stale draft or repository state to no active recipe without mutating reducer state', () => {
    const state = activeRecipeReducer(INITIAL_ACTIVE_RECIPE_STATE, {
      type: 'commit',
      recipe: { origin: 'saved-prompt', assetId: prompt.id },
      fingerprint: {
        mode: 'lucy-latest',
        prompt: prompt.prompt,
        referenceImageAssetId: null,
        assetPrompt: prompt.prompt,
        assetReferenceImageAssetId: null,
      },
    });

    expect(
      resolveActiveRecipe(state, store, {
        mode: 'lucy-latest',
        prompt: 'A changed working draft.',
        referenceImage: null,
      }).recipe,
    ).toBeNull();
    expect(state.recipe).toEqual({ origin: 'saved-prompt', assetId: prompt.id });
    expect(activeRecipeReducer(state, { type: 'clear' })).toBe(INITIAL_ACTIVE_RECIPE_STATE);
  });
});
