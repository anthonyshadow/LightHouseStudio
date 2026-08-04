// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { createPromptBuilderDraft } from '../prompt-authoring';
import { RecipeShelf } from './RecipeShelf';
import { createCreativeAssetRepository } from './repository';
import type { SavedCharacterPrompt } from './types';
import type { PromptBuilderDraft } from '../prompt-authoring';

const createRepository = () => {
  let id = 0;
  return createCreativeAssetRepository({
    storage: null,
    idFactory: () => `asset-${++id}`,
    now: () => new Date('2026-07-14T12:00:00.000Z'),
  });
};

const renderShelf = (
  repository = createRepository(),
  { builderActions = true }: { builderActions?: boolean } = {},
) => {
  const onUsePrompt = vi.fn();
  const onOpenCharacterWorkshop =
    vi.fn<(draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => void>();
  const onCreateCharacter = vi.fn<() => void>();
  const onEditCharacter = vi.fn<(asset: SavedCharacterPrompt) => void>();
  render(
    <StudioDesignProvider>
      <RecipeShelf
        repository={repository}
        activeMode="lucy-latest"
        onUsePrompt={onUsePrompt}
        {...(builderActions ? { onCreateCharacter, onEditCharacter } : {})}
        onOpenCharacterWorkshop={onOpenCharacterWorkshop}
      />
    </StudioDesignProvider>,
  );
  return {
    repository,
    onUsePrompt,
    onCreateCharacter,
    onEditCharacter,
    onOpenCharacterWorkshop,
  };
};

afterEach(cleanup);

describe('RecipeShelf', () => {
  it('creates, searches, uses, renames, edits, and explicitly deletes a saved recipe offline', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { onUsePrompt } = renderShelf(undefined, { builderActions: false });

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
        modelModeId: 'lucy-latest',
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
      modelModeId: 'lucy-latest',
      source: 'manual',
      tags: [],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onDirtyChange = vi.fn();
    render(
      <StudioDesignProvider>
        <RecipeShelf
          repository={repository}
          activeMode="lucy-latest"
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

  it('routes create and edit character actions through Character Builder', async () => {
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
    const { onCreateCharacter, onEditCharacter, onOpenCharacterWorkshop } = renderShelf(repository);

    await user.click(screen.getByRole('button', { name: /Characters/ }));
    expect(screen.getByText('Add a portrait when using')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Field explorer in workshop' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Field explorer' }));
    expect(onEditCharacter).toHaveBeenCalledOnce();
    const editedCharacter = onEditCharacter.mock.calls[0]?.[0];
    expect(editedCharacter?.name).toBe('Field explorer');
    expect(editedCharacter?.builderDraft).toMatchObject({
      characterBase: 'botanical explorer',
    });
    expect(onOpenCharacterWorkshop).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'New character recipe' }));
    expect(onCreateCharacter).toHaveBeenCalledOnce();
  });

  it('explains that deleting a character record detaches but does not erase reference bytes', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    repository.createSavedCharacterPrompt({
      name: 'Retained portrait',
      prompt: 'Transform the subject into an adult studio host.',
      promptIntent: 'character-transform',
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'retained-reference',
    });
    renderShelf(repository);

    await user.click(screen.getByRole('button', { name: /Characters/ }));
    await user.click(screen.getByRole('button', { name: 'Delete Retained portrait' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('deletes the saved character record');
    expect(dialog).toHaveTextContent('Immutable local image bytes remain');
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete character record' }));
    expect(screen.queryByRole('heading', { name: 'Retained portrait' })).not.toBeInTheDocument();
  });

  it('keeps legacy object-edit records in Prompt Workshop', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    const draft = {
      ...createPromptBuilderDraft('add-object'),
      objectDescription: 'paper lantern',
      placement: 'above the doorway',
    };
    repository.createSavedCharacterPrompt({
      name: 'Doorway lantern',
      prompt: 'Add a paper lantern above the doorway.',
      promptIntent: 'add-object',
      builderDraft: draft,
      referenceImageStatus: 'prompt-only',
    });
    const { onEditCharacter, onOpenCharacterWorkshop } = renderShelf(repository);

    await user.click(screen.getByRole('button', { name: /Characters/ }));
    await user.click(screen.getByRole('button', { name: 'Open Doorway lantern in workshop' }));
    expect(onOpenCharacterWorkshop).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'add-object' }),
      expect.objectContaining({ name: 'Doorway lantern' }),
    );
    expect(onEditCharacter).not.toHaveBeenCalled();
  });

  it('shows persisted reference thumbnails and carries exact assets through Use and Save a copy', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    repository.recordSuccessfulPrompt({
      prompt: 'Substitute the character with an orbital cartographer.',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: 'recent-reference-1',
    });
    repository.createSavedCharacterPrompt({
      name: 'Orbital cartographer',
      prompt: 'Substitute the character with an orbital cartographer.',
      promptIntent: 'character-transform',
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: 'character-reference-1',
    });
    const { onUsePrompt } = renderShelf(repository);

    await user.click(screen.getByRole('button', { name: /Recent/ }));
    const recentPreview = screen.getByRole('button', { name: 'Open larger reference preview' });
    expect(within(recentPreview).getByRole('img')).toHaveAttribute(
      'src',
      expect.stringContaining('/api/reference-images/recent-reference-1/content'),
    );
    await user.click(screen.getByRole('button', { name: /Use recent prompt/ }));
    expect(onUsePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageAssetId: 'recent-reference-1' }),
    );

    await user.click(screen.getByRole('button', { name: /Save a copy of recent prompt/ }));
    const createForm = screen
      .getByRole('heading', { name: 'New Character recipe' })
      .closest('form');
    await user.type(within(createForm!).getByLabelText(/^Name/), 'Saved orbital cartographer');
    await user.click(within(createForm!).getByRole('button', { name: 'Save recipe' }));
    expect(repository.getSnapshot().store.savedPrompts[0]).toMatchObject({
      title: 'Saved orbital cartographer',
      referenceImageAssetId: 'recent-reference-1',
    });

    await user.click(screen.getByRole('button', { name: /Characters/ }));
    expect(screen.getByText('Reference image attached')).toBeInTheDocument();
    expect(screen.getByAltText('Reference image for Orbital cartographer')).toHaveAttribute(
      'src',
      expect.stringContaining('/api/reference-images/character-reference-1/content'),
    );
    await user.click(screen.getByRole('button', { name: 'Use Orbital cartographer' }));
    expect(onUsePrompt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        origin: 'character-prompt',
        characterName: 'Orbital cartographer',
        referenceImageAssetId: 'character-reference-1',
      }),
    );
  });

  it('derives tag filters from local recipes and exposes an accessible selected-card state', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    repository.createSavedPrompt({
      title: 'Editorial host',
      prompt: 'Give the adult presenter a refined editorial wardrobe.',
      modelModeId: 'lucy-latest',
      tags: ['Editorial', 'Studio'],
    });
    repository.createSavedPrompt({
      title: 'Casual host',
      prompt: 'Give the adult presenter a relaxed casual wardrobe.',
      modelModeId: 'lucy-latest',
      tags: ['Casual'],
    });

    renderShelf(repository);

    expect(document.querySelector('[data-scroll-region="recipe-shelf"]')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Filter by tag' }));
    await user.click(
      within(screen.getByRole('listbox', { name: 'Filter by tag' })).getByRole('option', {
        name: 'Editorial',
      }),
    );
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

  it('reveals and highlights a Studio-controlled active character', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    repository.createSavedPrompt({
      title: 'Editorial host',
      prompt: 'Give the presenter an editorial wardrobe.',
      modelModeId: 'lucy-latest',
      tags: ['Editorial'],
    });
    const character = repository.createSavedCharacterPrompt({
      name: 'Active cartographer',
      prompt: 'Substitute the character with an orbital cartographer.',
      promptIntent: 'character-transform',
      referenceImageStatus: 'prompt-only',
    });
    const onUsePrompt = vi.fn();
    const view = render(
      <StudioDesignProvider>
        <RecipeShelf
          repository={repository}
          activeMode="lucy-latest"
          activeRecipe={null}
          onUsePrompt={onUsePrompt}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('combobox', { name: 'Filter by tag' }));
    await user.click(
      within(screen.getByRole('listbox', { name: 'Filter by tag' })).getByRole('option', {
        name: 'Editorial',
      }),
    );
    await user.type(screen.getByLabelText('Search this mode'), 'editorial');
    view.rerender(
      <StudioDesignProvider>
        <RecipeShelf
          repository={repository}
          activeMode="lucy-latest"
          activeRecipe={{ origin: 'character-prompt', assetId: character.id }}
          onUsePrompt={onUsePrompt}
        />
      </StudioDesignProvider>,
    );

    const characterHeading = await screen.findByRole('heading', { name: 'Active cartographer' });
    expect(screen.getByLabelText('Search this mode')).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Filter by tag' })).toHaveTextContent('All tags');
    expect(within(characterHeading).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows only the active model library without inventing unsupported collections', () => {
    const repository = createRepository();
    repository.createSavedPrompt({
      title: 'Character direction',
      prompt: 'Create a composed studio host.',
      modelModeId: 'lucy-latest',
    });
    repository.createSavedPrompt({
      title: 'Garment direction',
      prompt: 'Apply the linen overshirt.',
      modelModeId: 'lucy-vton-latest',
    });

    render(
      <StudioDesignProvider>
        <RecipeShelf repository={repository} activeMode="lucy-vton-latest" onUsePrompt={vi.fn()} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Garment direction' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Character direction' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Characters/ })).not.toBeInTheDocument();
    expect(screen.getByText('Virtual Try-On recipes')).toBeInTheDocument();
    expect(screen.queryByText(/favorites|team library|public library|import recipe/i)).toBeNull();
  });

  it('consumes one-shot category intent without persisting it as selection state', async () => {
    const user = userEvent.setup();
    const repository = createRepository();
    repository.createSavedPrompt({
      title: 'Editorial host',
      prompt: 'Give the presenter an editorial wardrobe.',
      modelModeId: 'lucy-latest',
    });
    repository.createSavedCharacterPrompt({
      name: 'Field correspondent',
      prompt: 'Transform the subject into an adult field correspondent.',
      promptIntent: 'character-transform',
      referenceImageStatus: 'prompt-only',
    });
    const onEntryIntentConsumed = vi.fn();
    const props = {
      repository,
      activeMode: 'lucy-latest' as const,
      onUsePrompt: vi.fn(),
      onEntryIntentConsumed,
    };
    const view = render(
      <StudioDesignProvider>
        <RecipeShelf {...props} entryIntent={{ id: 1, category: 'characters' }} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: /^Characters/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(onEntryIntentConsumed).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: /^Saved/u }));
    expect(screen.getByRole('button', { name: /^Saved/u })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Edit Editorial host' }));
    await user.type(screen.getByLabelText(/^Prompt text/u), ' Keep the lighting soft.');
    view.rerender(
      <StudioDesignProvider>
        <RecipeShelf {...props} entryIntent={{ id: 2, category: 'characters' }} />
      </StudioDesignProvider>,
    );

    expect(screen.queryByRole('heading', { name: 'Edit Editorial host' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Characters/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(onEntryIntentConsumed).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: /^Saved/u }));
    view.rerender(
      <StudioDesignProvider>
        <RecipeShelf {...props} entryIntent={{ id: 3, category: 'characters' }} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: /^Characters/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(onEntryIntentConsumed).toHaveBeenLastCalledWith(3);
  });
});
