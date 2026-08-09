// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
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

    render(
      <StudioDesignProvider>
        <OutfitSelector
          repository={repository}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onSaveCopy={vi.fn()}
          onSelect={onSelect}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Copper coat' })).toBeInTheDocument();
    expect(screen.queryByText('Character recipe')).not.toBeInTheDocument();
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
});
