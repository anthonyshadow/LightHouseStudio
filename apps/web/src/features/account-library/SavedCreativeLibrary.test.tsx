// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { createCreativeAssetRepository } from '../creative-assets/repository';
import { SavedCharacterLibrary, SavedOutfitLibrary } from './SavedCreativeLibrary';

describe('saved creative libraries', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows character empty state, use handoff, reference image, and confirmed deletion', () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const character = repository.createSavedCharacterPrompt({
      name: 'Field host',
      prompt: 'A documentary field host',
      promptIntent: null,
      referenceImageAssetId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
    });
    const onUse = vi.fn();
    const onCreateFrom = vi.fn();
    const onOpenWardrobe = vi.fn();
    const remove = vi.spyOn(repository, 'deleteSavedCharacterPrompt');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render(
      <StudioDesignProvider>
        <SavedCharacterLibrary
          items={[]}
          repository={repository}
          onUse={onUse}
          onCreateFrom={onCreateFrom}
          onOpenWardrobe={onOpenWardrobe}
        />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('heading', { name: 'No saved characters yet' })).toBeVisible();

    view.rerender(
      <StudioDesignProvider>
        <SavedCharacterLibrary
          items={[character]}
          repository={repository}
          onUse={onUse}
          onCreateFrom={onCreateFrom}
          onOpenWardrobe={onOpenWardrobe}
        />
      </StudioDesignProvider>,
    );
    expect(document.querySelector('img')).toHaveAttribute(
      'src',
      `/api/reference-images/${character.referenceImageAssetId}/content`,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use in Studio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wardrobe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create new from this character' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onUse).toHaveBeenCalledWith(character);
    expect(onOpenWardrobe).toHaveBeenCalledWith(character);
    expect(onCreateFrom).toHaveBeenCalledWith(character);
    expect(confirm).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(character.id);
  });

  it('shows outfit empty state, use handoff, and declines deletion', () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const outfit = repository.createSavedPrompt({
      title: 'Evening coat',
      prompt: '',
      modelModeId: 'lucy-vton-latest',
      referenceImageAssetId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
    });
    const onUse = vi.fn();
    const onCreate = vi.fn();
    const remove = vi.spyOn(repository, 'deleteSavedPrompt');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const view = render(
      <StudioDesignProvider>
        <SavedOutfitLibrary items={[]} repository={repository} onUse={onUse} onCreate={onCreate} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('heading', { name: 'No saved outfits yet' })).toBeVisible();

    view.rerender(
      <StudioDesignProvider>
        <SavedOutfitLibrary
          items={[outfit]}
          repository={repository}
          onUse={onUse}
          onCreate={onCreate}
        />
      </StudioDesignProvider>,
    );
    expect(screen.getByText('Reference-image outfit')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Create new saved outfit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use in Studio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onUse).toHaveBeenCalledWith(outfit);
    expect(onCreate).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });
});
