// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { createCreativeAssetRepository } from '../creative-assets/repository';
import { SavedCharacterLibrary, SavedOutfitLibrary } from './SavedCreativeLibrary';

describe('saved creative libraries', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows character empty state, use handoff, reference image, and confirmed deletion', async () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const character = await repository.createSavedCharacterPrompt({
      name: 'Field host',
      prompt: 'A documentary field host',
      promptIntent: null,
      referenceImageAssetId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
    });
    const onUse = vi.fn();
    const onCreateFrom = vi.fn();
    const onOpenWardrobe = vi.fn();
    const remove = vi.spyOn(repository, 'deleteSavedCharacterPrompt');
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete Field host' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete saved character?' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Keep character' })).toHaveFocus(),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete character' }));
    expect(onUse).toHaveBeenCalledWith(character);
    expect(onOpenWardrobe).toHaveBeenCalledWith(character);
    expect(onCreateFrom).toHaveBeenCalledWith(character);
    await waitFor(() => expect(remove).toHaveBeenCalledWith(character.id));
  });

  it('shows outfit empty state, use handoff, and declines deletion', async () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const outfit = await repository.createSavedPrompt({
      title: 'Evening coat',
      prompt: '',
      modelModeId: 'lucy-vton-latest',
      referenceImageAssetId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
    });
    const onUse = vi.fn();
    const onCreate = vi.fn();
    const remove = vi.spyOn(repository, 'deleteSavedPrompt');
    const view = render(
      <StudioDesignProvider>
        <SavedOutfitLibrary items={[]} repository={repository} onUse={onUse} onCreate={onCreate} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('heading', { name: 'No saved outfits yet' })).toBeVisible();
    // The create action lives inside the empty state — one button, with a visual and an example.
    const emptyCreate = screen.getByRole('button', { name: 'Create new saved outfit' });
    expect(emptyCreate.closest('[data-empty-state-preview]')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Create new saved outfit' })).toHaveLength(1);
    expect(screen.getByText(/For example: a jacket you styled once/u)).toBeVisible();
    fireEvent.click(emptyCreate);
    expect(onCreate).toHaveBeenCalledOnce();
    onCreate.mockClear();

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
    const deleteTrigger = screen.getByRole('button', { name: 'Delete Evening coat' });
    fireEvent.click(deleteTrigger);
    const dialog = screen.getByRole('dialog', { name: 'Delete saved outfit?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep outfit' }));
    expect(onUse).toHaveBeenCalledWith(outfit);
    expect(onCreate).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
    await waitFor(() => expect(deleteTrigger).toHaveFocus());
  });

  it('keeps a failed character deletion open with a sanitized accessible retry error', async () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const character = await repository.createSavedCharacterPrompt({
      name: 'Field host',
      prompt: 'A documentary field host',
      promptIntent: null,
      referenceImageAssetId: null,
    });
    vi.spyOn(repository, 'deleteSavedCharacterPrompt').mockRejectedValueOnce(
      new Error('sensitive persistence detail'),
    );
    render(
      <StudioDesignProvider>
        <SavedCharacterLibrary
          items={[character]}
          repository={repository}
          onUse={vi.fn()}
          onCreateFrom={vi.fn()}
          onOpenWardrobe={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const deleteTrigger = screen.getByRole('button', { name: 'Delete Field host' });
    fireEvent.click(deleteTrigger);
    const dialog = screen.getByRole('dialog', { name: 'Delete saved character?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete character' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The character could not be deleted',
    );
    expect(dialog).not.toHaveTextContent('sensitive persistence detail');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep character' }));
    await waitFor(() => expect(deleteTrigger).toHaveFocus());

    fireEvent.click(deleteTrigger);
    expect(
      within(screen.getByRole('dialog', { name: 'Delete saved character?' })).queryByRole('alert'),
    ).not.toBeInTheDocument();
  });

  it('keeps an outfit deletion modal while busy, then supports a sanitized retry', async () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const outfit = await repository.createSavedPrompt({
      title: 'Evening coat',
      prompt: 'A structured evening coat',
      modelModeId: 'lucy-vton-latest',
    });
    let rejectDeletion: ((reason?: unknown) => void) | undefined;
    const remove = vi
      .spyOn(repository, 'deleteSavedPrompt')
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectDeletion = reject;
          }),
      )
      .mockResolvedValueOnce();
    render(
      <StudioDesignProvider>
        <SavedOutfitLibrary
          items={[outfit]}
          repository={repository}
          onUse={vi.fn()}
          onCreate={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const deleteTrigger = screen.getByRole('button', { name: 'Delete Evening coat' });
    fireEvent.click(deleteTrigger);
    const dialog = screen.getByRole('dialog', { name: 'Delete saved outfit?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete outfit' }));

    expect(await within(dialog).findByRole('button', { name: 'Deleting outfit…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Keep outfit' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Delete saved outfit?' })).toBeVisible();

    act(() => {
      rejectDeletion?.(new Error('sensitive persistence detail'));
    });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The outfit could not be deleted',
    );
    expect(dialog).not.toHaveTextContent('sensitive persistence detail');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete outfit' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete saved outfit?' }),
      ).not.toBeInTheDocument(),
    );
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenLastCalledWith(outfit.id);
    await waitFor(() => expect(deleteTrigger).toHaveFocus());
  });
});
