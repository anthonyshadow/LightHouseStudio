// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it, vi } from 'vitest';
import { createCreativeAssetRepository } from '../creative-assets/repository';
import type { StudioSessionController } from '../media-session';
import { createEmptyGuidedDesign } from './characterModel';
import { useCharacterStudioPreload } from './useCharacterStudioPreload';

describe('useCharacterStudioPreload', () => {
  it('updates an edited character in place without dropping shelf metadata', async () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const character = repository.createSavedCharacterPrompt({
      name: 'Original host',
      prompt: 'Original character prompt.',
      promptIntent: 'character-transform',
      referenceImageStatus: 'prompt-only',
      notes: 'Producer-approved',
      tags: ['host', 'approved'],
    });
    const replaceRecipeDraft = vi.fn(() => true);
    const session = {
      draft: {
        mode: 'lucy-2.5',
        prompt: '',
        referenceImage: null,
      },
      replaceRecipeDraft,
    } as unknown as StudioSessionController;
    const onStudioPreloaded = vi.fn();
    const { result } = renderHook(() =>
      useCharacterStudioPreload({
        repository,
        session,
        saveBlockedReason: undefined,
        onStudioPreloaded,
      }),
    );
    const markCharacterPersisted = vi.fn(() => Promise.resolve());
    const markStudioPreloaded = vi.fn(() => Promise.resolve());
    const draft = createPromptBuilderDraft('character-transform');

    await act(async () => {
      await result.current(
        {
          saveKind: 'edit',
          name: 'Updated host',
          prompt: 'Updated character prompt.',
          draft,
          design: createEmptyGuidedDesign(),
          referenceImageAssetId: null,
          uploadedReferenceImageAssetId: null,
          finalReferenceKind: null,
          referenceImage: null,
        },
        character.id,
        'intent',
        { markCharacterPersisted, markStudioPreloaded },
      );
    });

    const saved = repository.getSnapshot().store.savedCharacterPrompts;
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: character.id,
      name: 'Updated host',
      prompt: 'Updated character prompt.',
      notes: 'Producer-approved',
      tags: ['host', 'approved'],
    });
    expect(markCharacterPersisted).toHaveBeenCalledOnce();
    expect(markStudioPreloaded).toHaveBeenCalledOnce();
    expect(replaceRecipeDraft).toHaveBeenCalledWith({
      mode: 'lucy-2.5',
      prompt: 'Updated character prompt.',
      referenceImage: null,
      enhance: false,
    });
    expect(onStudioPreloaded).toHaveBeenCalledWith(
      expect.objectContaining({ characterId: character.id }),
    );
  });
});
