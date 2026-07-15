import { useEffect, useState } from 'react';
import type { RecipeFormValue } from './RecipeForms';
import { CreativeAssetError } from './repository';
import type { EditAction, ShelfCategory } from './RecipeCards';
import type { RecipeShelfProps } from './RecipeShelf.types';
import type { RecentPrompt, SavedCharacterPrompt, SavedPrompt } from './types';
import { useCreativeAssetRepository } from './useCreativeAssetRepository';

export interface EditingState {
  kind: 'saved' | 'character';
  id: string;
  action: EditAction;
}

const errorMessage = (error: unknown) =>
  error instanceof CreativeAssetError
    ? error.message
    : 'The Recipe Shelf could not finish that change.';

const focusShelfHeading = () => {
  document.getElementById('recipe-shelf-title')?.focus();
};

type ControllerOptions = Pick<
  RecipeShelfProps,
  'repository' | 'activeMode' | 'onUsePrompt' | 'onOpenCharacterWorkshop' | 'onDirtyChange'
>;

export const useRecipeShelfController = ({
  repository,
  activeMode,
  onUsePrompt,
  onOpenCharacterWorkshop,
  onDirtyChange,
}: ControllerOptions) => {
  const state = useCreativeAssetRepository(repository);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ShelfCategory>('saved');
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [createSeed, setCreateSeed] = useState<Partial<RecipeFormValue> | null>(null);
  const [createKey, setCreateKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const results = repository.search(query, activeMode);
  const visibleCategory =
    activeMode === 'lucy-vton-3' && category === 'characters' ? 'saved' : category;

  useEffect(() => onDirtyChange?.(formDirty), [formDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const canReplaceForm = () =>
    !formDirty ||
    window.confirm('Discard the unsaved recipe changes and continue with another shelf action?');

  const leaveForm = () => {
    setFormDirty(false);
    setEditing(null);
    setCreateSeed(null);
  };

  const runAfterFormCheck = (action: () => void) => {
    if (!canReplaceForm()) return;
    leaveForm();
    action();
  };

  const perform = (action: () => void) => {
    try {
      action();
      setEditing(null);
      setFormDirty(false);
      setActionError(null);
      focusShelfHeading();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const openCreate = (seed?: Partial<RecipeFormValue>) => {
    if (!canReplaceForm()) return;
    setCreateSeed(seed ?? {});
    setCreateKey((value) => value + 1);
    setEditing(null);
    setFormDirty(false);
    setActionError(null);
  };

  const closeCreate = () => {
    setCreateSeed(null);
    setFormDirty(false);
    focusShelfHeading();
  };

  const startEditing = (next: EditingState) => {
    if (!canReplaceForm()) return;
    setCreateSeed(null);
    setEditing(next);
    setFormDirty(false);
    setActionError(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setFormDirty(false);
    focusShelfHeading();
  };

  const createRecipe = (value: RecipeFormValue) =>
    perform(() => {
      repository.createSavedPrompt({
        title: value.title,
        prompt: value.prompt,
        modelModeId: activeMode,
        source: 'manual',
        tags: value.tags,
      });
      setCreateSeed(null);
    });

  const selectSaved = (item: SavedPrompt) =>
    runAfterFormCheck(() =>
      onUsePrompt({
        origin: 'saved-prompt',
        prompt: item.prompt,
        modelModeId: item.modelModeId,
        assetId: item.id,
      }),
    );

  const selectRecent = (item: RecentPrompt) =>
    runAfterFormCheck(() =>
      onUsePrompt({
        origin: 'recent-prompt',
        prompt: item.prompt,
        modelModeId: item.modelModeId,
        ...(item.savedPromptId ? { assetId: item.savedPromptId } : {}),
      }),
    );

  const selectCharacter = (item: SavedCharacterPrompt) =>
    runAfterFormCheck(() =>
      onUsePrompt({
        origin: 'character-prompt',
        prompt: item.prompt,
        modelModeId: 'lucy-2.5',
        assetId: item.id,
        ...(item.builderDraft ? { builderDraft: item.builderDraft } : {}),
      }),
    );

  const openCharacterWorkshop = (item: SavedCharacterPrompt) => {
    const draft = item.builderDraft;
    if (!draft || !onOpenCharacterWorkshop) return;
    runAfterFormCheck(() => onOpenCharacterWorkshop(draft, item));
  };

  const chooseCategory = (next: ShelfCategory) => runAfterFormCheck(() => setCategory(next));

  const categoryCounts: Record<ShelfCategory, number> = {
    saved: results.savedPrompts.length,
    recent: results.recentPrompts.length,
    characters: results.savedCharacterPrompts.length,
  };

  return {
    repository,
    state,
    query,
    setQuery,
    formDirty,
    visibleCategory,
    chooseCategory,
    categoryCounts,
    results,
    editing,
    createSeed,
    createKey,
    actionError,
    setFormDirty,
    openCreate,
    closeCreate,
    startEditing,
    closeEditor,
    createRecipe,
    selectSaved,
    selectRecent,
    selectCharacter,
    canOpenCharacterWorkshop: Boolean(onOpenCharacterWorkshop),
    openCharacterWorkshop,
    perform,
  };
};

export type RecipeShelfController = ReturnType<typeof useRecipeShelfController>;
