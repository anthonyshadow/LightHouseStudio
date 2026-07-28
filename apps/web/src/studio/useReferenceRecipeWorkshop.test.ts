// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it, vi } from 'vitest';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
} from '../features/creative-assets/types';
import type { StudioSessionController } from '../features/media-session/types';
import { useReferenceRecipeWorkshop } from './useReferenceRecipeWorkshop';

const draft = createPromptBuilderDraft('replace-object');
const character: SavedCharacterPrompt = {
  id: 'legacy-object-edit',
  name: 'Legacy object edit',
  prompt: 'Replace the paper cup with a ceramic mug.',
  source: 'generator',
  promptIntent: 'replace-object',
  builderDraft: draft,
  guidedDesign: null,
  referenceImageStatus: 'prompt-only',
  referenceImageAssetId: null,
  uploadedReferenceImageAssetId: null,
  finalReferenceKind: null,
  notes: '',
  tags: [],
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  lastUsedAt: null,
  useCount: 0,
};
const store: CreativeAssetStore = {
  schemaVersion: 4,
  savedPrompts: [],
  recentPrompts: [],
  savedCharacterPrompts: [character],
};

describe('useReferenceRecipeWorkshop', () => {
  it('retains an exact legacy source through open/use and preserves feature-owned save effects', () => {
    const createSavedCharacterPrompt = vi.fn();
    const repository = {
      getSnapshot: () => ({ store, health: 'ready', notice: null }),
      createSavedCharacterPrompt,
    } as unknown as CreativeAssetRepository;
    const session = {
      draft: { mode: 'lucy-2.5', prompt: '', referenceImage: null, enhance: false },
    } as unknown as StudioSessionController;
    const openWorkshopOverlay = vi.fn();
    const { result } = renderHook(() =>
      useReferenceRecipeWorkshop({
        repository,
        session,
        recordingActive: false,
        activeRecipe: null,
        selectLucyMode: vi.fn(() => true),
        openWorkshopOverlay,
      }),
    );

    act(() => {
      result.current.openSavedWorkshop(draft, character);
    });
    expect(openWorkshopOverlay).toHaveBeenCalledOnce();
    expect(result.current.draft).toEqual(draft);

    const pending = result.current.createPendingUse({
      prompt: character.prompt,
      draft,
      validation: { valid: true, blocking: [], warnings: [] },
      referenceImageAssetId: null,
    });
    expect(pending).toMatchObject({
      savedCharacterPromptId: character.id,
      destination: 'workshop',
      preserveCurrentReference: false,
    });

    act(() => {
      result.current.saveWorkshopPrompt({
        name: 'Ceramic mug',
        prompt: character.prompt,
        draft,
        validation: { valid: true, blocking: [], warnings: [] },
        referenceImageAssetId: null,
      });
    });
    expect(createSavedCharacterPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Ceramic mug',
        promptIntent: 'replace-object',
        referenceImageStatus: 'prompt-only',
        referenceImageAssetId: null,
      }),
    );
  });
});
