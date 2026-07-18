// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { createPromptBuilderDraft } from '../prompt-authoring';
import { RecipeShelf } from './RecipeShelf';
import { createCreativeAssetRepository } from './repository';

const createRepository = () => {
  let id = 0;
  return createCreativeAssetRepository({
    storage: null,
    idFactory: () => `asset-${++id}`,
    now: () => new Date('2026-07-14T12:00:00.000Z'),
  });
};

const renderShelf = (repository = createRepository()) => {
  const onUsePrompt = vi.fn();
  const onOpenCharacterWorkshop = vi.fn();
  render(
    <StudioDesignProvider>
      <RecipeShelf
        repository={repository}
        activeMode="lucy-2.5"
        onUsePrompt={onUsePrompt}
        onOpenCharacterWorkshop={onOpenCharacterWorkshop}
      />
    </StudioDesignProvider>,
  );
  return { repository, onUsePrompt, onOpenCharacterWorkshop };
};

afterEach(cleanup);

describe('RecipeShelf', () => {
  it('creates, searches, uses, renames, edits, and explicitly deletes a saved recipe offline', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { onUsePrompt } = renderShelf();

    expect(screen.getByText(/changes will last only until this tab closes/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New character recipe' }));
    const createForm = screen
      .getByRole('heading', { name: 'New Character recipe' })
      .closest('form');
    expect(createForm).not.toBeNull();
    await user.type(within(createForm!).getByLabelText(/^Name/), 'Copper host');
    await user.type(
      within(createForm!).getByLabelText(/^Prompt text/),
      'Change the jacket material to copper satin.',
    );
    await user.type(within(createForm!).getByLabelText('Tags'), 'host, copper');
    await user.click(within(createForm!).getByRole('button', { name: 'Save recipe' }));

    expect(screen.getByRole('heading', { name: 'Copper host' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recipe Shelf' })).toHaveFocus();
    await user.type(screen.getByLabelText('Search this mode'), 'copper');
    await user.click(screen.getByRole('button', { name: 'Use Copper host' }));
    expect(onUsePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'saved-prompt',
        prompt: 'Change the jacket material to copper satin.',
        modelModeId: 'lucy-2.5',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Rename Copper host' }));
    const rename = screen.getByLabelText(/^Recipe name/);
    await user.clear(rename);
    await user.type(rename, 'Copper presenter');
    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('heading', { name: 'Copper presenter' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit Copper presenter' }));
    const editForm = screen.getByRole('heading', { name: 'Edit Copper presenter' }).closest('form');
    expect(editForm).not.toBeNull();
    const prompt = within(editForm!).getByLabelText(/^Prompt text/);
    await user.clear(prompt);
    await user.type(prompt, 'Change the jacket material to matte copper.');
    await user.click(within(editForm!).getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('Change the jacket material to matte copper.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Copper presenter' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete “Copper presenter”?');
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(screen.queryByRole('heading', { name: 'Copper presenter' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recipe Shelf' })).toHaveFocus();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('protects a dirty inline form and can disable recipe insertion without blocking edits', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    repository.createSavedPrompt({
      title: 'Night host',
      prompt: 'Transform the adult subject into a night host.',
      modelModeId: 'lucy-2.5',
      source: 'manual',
      tags: [],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDirtyChange = vi.fn();
    render(
      <StudioDesignProvider>
        <RecipeShelf
          repository={repository}
          activeMode="lucy-2.5"
          promptUseDisabled
          onDirtyChange={onDirtyChange}
          onUsePrompt={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Use Night host' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Edit Night host' }));
    await user.type(screen.getByLabelText(/^Prompt text/), ' Keep the lighting soft.');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText('Search this mode')).toBeDisabled();
    expect(screen.getByText(/save or cancel.*before searching/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Recent/ }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Edit Night host' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Recipe Shelf' })).toHaveFocus();
  });

  it('reopens saved structured character state while keeping portrait bytes out of the asset', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    const draft = {
      ...createPromptBuilderDraft('character-transform'),
      characterBase: 'botanical explorer',
    };
    repository.createSavedCharacterPrompt({
      name: 'Field explorer',
      prompt: 'Transform the subject into an adult botanical explorer.',
      promptIntent: 'character-transform',
      builderDraft: draft,
      referenceImageStatus: 'portrait-required-not-saved',
    });
    const { onOpenCharacterWorkshop } = renderShelf(repository);

    await user.click(screen.getByRole('button', { name: /Characters/ }));
    expect(screen.getByText('Add a portrait when using')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Field explorer in workshop' }));
    expect(onOpenCharacterWorkshop).toHaveBeenCalledWith(
      expect.objectContaining({ characterBase: 'botanical explorer' }),
      expect.objectContaining({ name: 'Field explorer' }),
    );
  });

  it('derives tag filters from local recipes and exposes an accessible selected-card state', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    repository.createSavedPrompt({
      title: 'Editorial host',
      prompt: 'Give the adult presenter a refined editorial wardrobe.',
      modelModeId: 'lucy-2.5',
      tags: ['Editorial', 'Studio'],
    });
    repository.createSavedPrompt({
      title: 'Casual host',
      prompt: 'Give the adult presenter a relaxed casual wardrobe.',
      modelModeId: 'lucy-2.5',
      tags: ['Casual'],
    });

    renderShelf(repository);

    expect(document.querySelector('[data-scroll-region="recipe-shelf"]')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Filter by tag'), 'Editorial');
    expect(screen.getByRole('heading', { name: 'Editorial host' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Casual host' })).not.toBeInTheDocument();

    const selectRecipe = within(screen.getByRole('heading', { name: 'Editorial host' })).getByRole(
      'button',
    );
    expect(selectRecipe).toHaveAttribute('aria-pressed', 'false');
    await user.click(selectRecipe);
    expect(selectRecipe).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Selected')).toBeInTheDocument();
    expect(screen.getByText(/1 selected.*1 saved recipe/i)).toBeInTheDocument();
  });

  it('shows only the active model library without inventing unsupported collections', () => {
    const repository = createRepository();
    repository.createSavedPrompt({
      title: 'Character direction',
      prompt: 'Create a composed studio host.',
      modelModeId: 'lucy-2.5',
    });
    repository.createSavedPrompt({
      title: 'Garment direction',
      prompt: 'Apply the linen overshirt.',
      modelModeId: 'lucy-vton-3',
    });

    render(
      <StudioDesignProvider>
        <RecipeShelf repository={repository} activeMode="lucy-vton-3" onUsePrompt={vi.fn()} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Garment direction' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Character direction' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Characters/ })).not.toBeInTheDocument();
    expect(screen.getByText('Virtual Try-On recipes')).toBeInTheDocument();
    expect(screen.queryByText(/favorites|team library|public library|import recipe/i)).toBeNull();
  });
});
