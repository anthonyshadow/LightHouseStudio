// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { OutfitSelector } from './OutfitSelector';
import { createCreativeAssetRepository } from './repository';

const createRepository = () => {
  let id = 0;
  return createCreativeAssetRepository({
    storage: null,
    idFactory: () => `outfit-${++id}`,
    now: () => new Date('2026-08-05T12:00:00.000Z'),
  });
};

afterEach(cleanup);

describe('OutfitSelector', () => {
  it('selects saved and recent outfits while excluding other model recipes', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    const saved = await repository.createSavedPrompt({
      title: 'Copper coat',
      prompt: 'Dress the subject in a structured copper coat.',
      modelModeId: 'lucy-vton-latest',
      source: 'manual',
    });
    await repository.createSavedPrompt({
      title: 'Character recipe',
      prompt: 'Transform the subject into a cartographer.',
      modelModeId: 'lucy-latest',
      source: 'manual',
    });
    await repository.recordSuccessfulPrompt({
      prompt: saved.prompt,
      modelModeId: 'lucy-vton-latest',
      savedPromptId: saved.id,
    });
    const onSelect = vi.fn();
    const onSaveCopy = vi.fn();

    render(
      <StudioDesignProvider>
        <OutfitSelector
          repository={repository}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onSaveCopy={onSaveCopy}
          onSelect={onSelect}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Copper coat' })).toBeInTheDocument();
    expect(screen.queryByText('Character recipe')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save a copy' }));
    expect(onSaveCopy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: saved.id }));
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        origin: 'saved-prompt',
        assetId: saved.id,
        modelModeId: 'lucy-vton-latest',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Recent' }));
    expect(screen.getByRole('heading', { name: 'Copper coat' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        origin: 'recent-prompt',
        assetId: saved.id,
        modelModeId: 'lucy-vton-latest',
      }),
    );
  });

  it('locks selection controls for an active operation but keeps library maintenance available', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    const saved = await repository.createSavedPrompt({
      title: 'Linen jacket',
      prompt: 'Dress the subject in a linen jacket.',
      modelModeId: 'lucy-vton-latest',
      source: 'manual',
    });
    const onEdit = vi.fn();
    const onClear = vi.fn();

    render(
      <StudioDesignProvider>
        <OutfitSelector
          repository={repository}
          disabledReason="Wait for the accepted job."
          activeOutfitLabel="Linen jacket"
          onClear={onClear}
          onCreate={vi.fn()}
          onEdit={onEdit}
          onSaveCopy={vi.fn()}
          onSelect={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Unselect outfit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create new outfit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledExactlyOnceWith(saved);
    expect(onClear).not.toHaveBeenCalled();
  });

  it('awaits saved-outfit removal and exposes a recoverable dialog error', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    const saved = await repository.createSavedPrompt({
      title: 'Linen jacket',
      prompt: 'Dress the subject in a linen jacket.',
      modelModeId: 'lucy-vton-latest',
      source: 'manual',
    });
    const remove = vi
      .spyOn(repository, 'deleteSavedPrompt')
      .mockRejectedValueOnce(new Error('sensitive persistence detail'))
      .mockResolvedValueOnce();
    render(
      <StudioDesignProvider>
        <OutfitSelector
          repository={repository}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onSaveCopy={vi.fn()}
          onSelect={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Linen jacket' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove saved outfit?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove outfit' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'The outfit could not be removed',
    );
    expect(dialog).not.toHaveTextContent('sensitive persistence detail');
    await user.click(within(dialog).getByRole('button', { name: 'Remove outfit' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Remove saved outfit?' }),
      ).not.toBeInTheDocument(),
    );
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith(saved.id);
  });

  it('runs available maintenance actions and restores focus when removal is cancelled', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    const saved = await repository.createSavedPrompt({
      title: 'Linen jacket',
      prompt: 'Dress the subject in a linen jacket.',
      modelModeId: 'lucy-vton-latest',
      source: 'manual',
    });
    const remove = vi.spyOn(repository, 'deleteSavedPrompt');
    const onClear = vi.fn();
    const onCreate = vi.fn();

    render(
      <StudioDesignProvider>
        <OutfitSelector
          repository={repository}
          activeOutfitLabel="Linen jacket"
          onClear={onClear}
          onCreate={onCreate}
          onEdit={vi.fn()}
          onSaveCopy={vi.fn()}
          onSelect={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Unselect outfit' }));
    await user.click(screen.getByRole('button', { name: 'Create new outfit' }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledOnce();

    const removeTrigger = screen.getByRole('button', { name: 'Remove Linen jacket' });
    await user.click(removeTrigger);
    const dialog = screen.getByRole('dialog', { name: 'Remove saved outfit?' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Keep outfit' })).toHaveFocus(),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Keep outfit' }));

    expect(remove).not.toHaveBeenCalled();
    await waitFor(() => expect(removeTrigger).toHaveFocus());
    expect(screen.getByRole('heading', { name: saved.title })).toBeVisible();
  });
});
