import { useEffect, useState } from 'react';
import {
  createRecipeEditorDraft,
  type RecipeEditorDraft,
  type RecipeFormValue,
} from './RecipeForms';
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

export interface SelectedRecipeState {
  kind: 'saved' | 'recent' | 'character';
  id: string;
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
  const [tagFilter, setTagFilter] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<SelectedRecipeState | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [createSeed, setCreateSeed] = useState<Partial<RecipeFormValue> | null>(null);
  const [editorDraft, setEditorDraft] = useState<RecipeEditorDraft | null>(null);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const [createKey, setCreateKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const searchResults = repository.search(query, activeMode);
  const visibleCategory =
    activeMode === 'lucy-vton-3' && category === 'characters' ? 'saved' : category;
  const availableTags = Array.from(
    new Set(
      [
        ...state.store.savedPrompts
          .filter((item) => item.modelModeId === activeMode)
          .flatMap((item) => item.tags),
        ...(activeMode === 'lucy-2.5'
          ? state.store.savedCharacterPrompts.flatMap((item) => item.tags)
          : []),
      ].map((tag) => tag.trim()),
    ),
  )
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  const matchesTag = (tags: readonly string[]) =>
    !tagFilter ||
    tags.some((tag) => tag.localeCompare(tagFilter, undefined, { sensitivity: 'base' }) === 0);
  const results = {
    savedPrompts: searchResults.savedPrompts.filter((item) => matchesTag(item.tags)),
    recentPrompts: tagFilter ? [] : searchResults.recentPrompts,
    savedCharacterPrompts: searchResults.savedCharacterPrompts.filter((item) =>
      matchesTag(item.tags),
    ),
  };
  const selectedRecipeRemainsVisible =
    !selectedRecipe ||
    (visibleCategory === 'saved' &&
      selectedRecipe.kind === 'saved' &&
      results.savedPrompts.some((item) => item.id === selectedRecipe.id)) ||
    (visibleCategory === 'recent' &&
      selectedRecipe.kind === 'recent' &&
      results.recentPrompts.some((item) => item.id === selectedRecipe.id)) ||
    (visibleCategory === 'characters' &&
      selectedRecipe.kind === 'character' &&
      results.savedCharacterPrompts.some((item) => item.id === selectedRecipe.id));

  useEffect(() => onDirtyChange?.(formDirty), [formDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (tagFilter && !availableTags.includes(tagFilter)) setTagFilter('');
  }, [availableTags, tagFilter]);

  useEffect(() => {
    if (!selectedRecipeRemainsVisible) setSelectedRecipe(null);
  }, [selectedRecipeRemainsVisible]);

  const canReplaceForm = () =>
    !formDirty ||
    window.confirm('Discard the unsaved recipe changes and continue with another shelf action?');

  const leaveForm = () => {
    setFormDirty(false);
    setEditing(null);
    setCreateSeed(null);
    setEditorDraft(null);
    setRenameDraft(null);
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
      setEditorDraft(null);
      setRenameDraft(null);
      setActionError(null);
      focusShelfHeading();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const openCreate = (seed?: Partial<RecipeFormValue>) => {
    if (!canReplaceForm()) return;
    const nextSeed = seed ?? {};
    setCreateSeed(nextSeed);
    setEditorDraft(createRecipeEditorDraft(nextSeed));
    setRenameDraft(null);
    setCreateKey((value) => value + 1);
    setEditing(null);
    setFormDirty(false);
    setActionError(null);
  };

  const closeCreate = () => {
    setCreateSeed(null);
    setEditorDraft(null);
    setFormDirty(false);
    focusShelfHeading();
  };

  const startEditing = (next: EditingState, initialValue: Partial<RecipeFormValue>) => {
    if (!canReplaceForm()) return;
    setCreateSeed(null);
    setEditing(next);
    setEditorDraft(next.action === 'edit' ? createRecipeEditorDraft(initialValue) : null);
    setRenameDraft(next.action === 'rename' ? (initialValue.title ?? '') : null);
    setFormDirty(false);
    setActionError(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setEditorDraft(null);
    setRenameDraft(null);
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

  const chooseCategory = (next: ShelfCategory) =>
    runAfterFormCheck(() => {
      setCategory(next);
      setSelectedRecipe(null);
      if (next === 'recent') setTagFilter('');
    });

  const chooseTag = (next: string) =>
    runAfterFormCheck(() => {
      setTagFilter(next);
      setSelectedRecipe(null);
    });

  const selectRecipe = (next: SelectedRecipeState) => setSelectedRecipe(next);
  const isSelected = (kind: SelectedRecipeState['kind'], id: string) =>
    selectedRecipe?.kind === kind && selectedRecipe.id === id;

  const categoryCounts: Record<ShelfCategory, number> = {
    saved: searchResults.savedPrompts.length,
    recent: searchResults.recentPrompts.length,
    characters: searchResults.savedCharacterPrompts.length,
  };
  const filteredCounts: Record<ShelfCategory, number> = {
    saved: results.savedPrompts.length,
    recent: results.recentPrompts.length,
    characters: results.savedCharacterPrompts.length,
  };
  const visibleCount = filteredCounts[visibleCategory];

  return {
    repository,
    state,
    query,
    setQuery,
    tagFilter,
    availableTags,
    chooseTag,
    selectedRecipe,
    selectRecipe,
    isSelected,
    formDirty,
    visibleCategory,
    chooseCategory,
    categoryCounts,
    visibleCount,
    results,
    editing,
    createSeed,
    createKey,
    editorDraft,
    setEditorDraft,
    renameDraft,
    setRenameDraft,
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
