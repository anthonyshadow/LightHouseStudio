import { preferredCharacterVersionSelection, resolveCharacterVersion } from '@studio/domain';
import { useCallback, useEffect, useReducer, useState } from 'react';
import {
  createRecipeEditorDraft,
  type RecipeEditorDraft,
  type RecipeFormValue,
} from './RecipeForms';
import { CreativeAssetError } from './repository';
import type { EditAction, ShelfCategory } from './RecipeCards';
import type { RecipeShelfProps } from './RecipeShelf.types';
import { savedPromptToRecipeSelection } from './recipeSelection';
import type { RecentPrompt, SavedCharacterPrompt, SavedPrompt } from './types';
import { useCreativeAssetRepository } from './useCreativeAssetRepository';

export interface EditingState {
  kind: 'saved' | 'character';
  id: string;
  action: EditAction;
}

type EditableRecipeKind = EditingState['kind'];

type ShelfActionState =
  | { kind: 'idle' }
  | {
      kind: 'create';
      key: number;
      seed: Partial<RecipeFormValue>;
      referenceImageAssetId: string | null;
      draft: RecipeEditorDraft;
      dirty: boolean;
    }
  | {
      kind: 'edit';
      targetKind: EditableRecipeKind;
      id: string;
      draft: RecipeEditorDraft;
      dirty: boolean;
    }
  | {
      kind: 'rename';
      targetKind: EditableRecipeKind;
      id: string;
      draft: string;
      dirty: boolean;
    }
  | { kind: 'delete'; targetKind: EditableRecipeKind; id: string };

type ShelfAction =
  | { type: 'leave' }
  | {
      type: 'create';
      seed: Partial<RecipeFormValue>;
      referenceImageAssetId: string | null;
    }
  | {
      type: 'edit';
      targetKind: EditableRecipeKind;
      id: string;
      initialValue: Partial<RecipeFormValue>;
    }
  | {
      type: 'rename';
      targetKind: EditableRecipeKind;
      id: string;
      initialValue: string;
    }
  | { type: 'delete'; targetKind: EditableRecipeKind; id: string }
  | { type: 'update-editor-draft'; draft: RecipeEditorDraft }
  | { type: 'update-rename-draft'; draft: string }
  | { type: 'set-dirty'; dirty: boolean };

const shelfActionReducer = (state: ShelfActionState, action: ShelfAction): ShelfActionState => {
  switch (action.type) {
    case 'leave':
      return { kind: 'idle' };
    case 'create':
      return {
        kind: 'create',
        key: state.kind === 'create' ? state.key + 1 : 1,
        seed: action.seed,
        referenceImageAssetId: action.referenceImageAssetId,
        draft: createRecipeEditorDraft(action.seed),
        dirty: false,
      };
    case 'edit':
      return {
        kind: 'edit',
        targetKind: action.targetKind,
        id: action.id,
        draft: createRecipeEditorDraft(action.initialValue),
        dirty: false,
      };
    case 'rename':
      return {
        kind: 'rename',
        targetKind: action.targetKind,
        id: action.id,
        draft: action.initialValue,
        dirty: false,
      };
    case 'delete':
      return { kind: 'delete', targetKind: action.targetKind, id: action.id };
    case 'update-editor-draft':
      return state.kind === 'create' || state.kind === 'edit'
        ? { ...state, draft: action.draft }
        : state;
    case 'update-rename-draft':
      return state.kind === 'rename' ? { ...state, draft: action.draft } : state;
    case 'set-dirty':
      return state.kind === 'create' || state.kind === 'edit' || state.kind === 'rename'
        ? state.dirty === action.dirty
          ? state
          : { ...state, dirty: action.dirty }
        : state;
  }
};

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
  | 'repository'
  | 'activeMode'
  | 'activeRecipe'
  | 'entryIntent'
  | 'onEntryIntentConsumed'
  | 'onUsePrompt'
  | 'onCreateCharacter'
  | 'onEditCharacter'
  | 'onOpenWardrobe'
  | 'onCreateOutfit'
  | 'onEditOutfit'
  | 'onSaveOutfitCopy'
  | 'onOpenCharacterWorkshop'
  | 'onDirtyChange'
>;

export const useRecipeShelfController = ({
  repository,
  activeMode,
  activeRecipe,
  entryIntent,
  onEntryIntentConsumed,
  onUsePrompt,
  onCreateCharacter,
  onEditCharacter,
  onOpenWardrobe,
  onCreateOutfit,
  onEditOutfit,
  onSaveOutfitCopy,
  onOpenCharacterWorkshop,
  onDirtyChange,
}: ControllerOptions) => {
  const state = useCreativeAssetRepository(repository);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ShelfCategory>('saved');
  const [tagFilter, setTagFilter] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<SelectedRecipeState | null>(null);
  const [shelfAction, dispatchShelfAction] = useReducer(shelfActionReducer, { kind: 'idle' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [synchronizedEntryIntentId, setSynchronizedEntryIntentId] = useState<number | null>(null);
  const formDirty = 'dirty' in shelfAction ? shelfAction.dirty : false;
  const editing: EditingState | null =
    shelfAction.kind === 'edit' || shelfAction.kind === 'rename' || shelfAction.kind === 'delete'
      ? {
          kind: shelfAction.targetKind,
          id: shelfAction.id,
          action: shelfAction.kind,
        }
      : null;
  const createSeed = shelfAction.kind === 'create' ? shelfAction.seed : null;
  const createKey = shelfAction.kind === 'create' ? shelfAction.key : 0;
  const editorDraft =
    shelfAction.kind === 'create' || shelfAction.kind === 'edit' ? shelfAction.draft : null;
  const renameDraft = shelfAction.kind === 'rename' ? shelfAction.draft : null;
  const setEditorDraft = useCallback(
    (draft: RecipeEditorDraft) => dispatchShelfAction({ type: 'update-editor-draft', draft }),
    [],
  );
  const setRenameDraft = useCallback(
    (draft: string) => dispatchShelfAction({ type: 'update-rename-draft', draft }),
    [],
  );
  const setFormDirty = useCallback(
    (dirty: boolean) => dispatchShelfAction({ type: 'set-dirty', dirty }),
    [],
  );
  const activeRecipeKey = activeRecipe ? `${activeRecipe.origin}:${activeRecipe.assetId}` : null;
  const [synchronizedActiveRecipeKey, setSynchronizedActiveRecipeKey] = useState(activeRecipeKey);
  const controlledSelection: SelectedRecipeState | null | undefined = activeRecipe
    ? {
        kind: activeRecipe.origin === 'character-prompt' ? 'character' : 'saved',
        id: activeRecipe.assetId,
      }
    : activeRecipe === null
      ? null
      : undefined;
  const effectiveSelectedRecipe =
    controlledSelection === undefined ? selectedRecipe : controlledSelection;
  const searchResults = repository.search(query, activeMode);
  const visibleCategory =
    activeMode === 'lucy-vton-latest' && category === 'characters' ? 'saved' : category;
  const availableTags = Array.from(
    new Set(
      [
        ...state.store.savedPrompts
          .filter((item) => item.modelModeId === activeMode)
          .flatMap((item) => item.tags),
        ...(activeMode === 'lucy-latest'
          ? state.store.savedCharacterPrompts.flatMap((item) => item.tags)
          : []),
      ].map((tag) => tag.trim()),
    ),
  )
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  const availableTagKey = availableTags.join('\u0000');
  const [synchronizedAvailableTagKey, setSynchronizedAvailableTagKey] = useState(availableTagKey);
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
  if (synchronizedAvailableTagKey !== availableTagKey) {
    setSynchronizedAvailableTagKey(availableTagKey);
    if (tagFilter && !availableTags.includes(tagFilter)) setTagFilter('');
  }

  if (synchronizedActiveRecipeKey !== activeRecipeKey) {
    setSynchronizedActiveRecipeKey(activeRecipeKey);
    if (activeRecipe) {
      setCategory(activeRecipe.origin === 'character-prompt' ? 'characters' : 'saved');
      setQuery('');
      setTagFilter('');
    }
  }

  if (!selectedRecipeRemainsVisible && selectedRecipe) setSelectedRecipe(null);

  const canReplaceForm = () =>
    !formDirty ||
    window.confirm('Discard the unsaved recipe changes and continue with another shelf action?');

  const leaveForm = () => {
    dispatchShelfAction({ type: 'leave' });
  };

  if (entryIntent && synchronizedEntryIntentId !== entryIntent.id) {
    setSynchronizedEntryIntentId(entryIntent.id);
    leaveForm();
    setCategory(
      activeMode === 'lucy-vton-latest' && entryIntent.category === 'characters'
        ? 'saved'
        : entryIntent.category,
    );
    setQuery('');
    setTagFilter('');
    setSelectedRecipe(null);
    setActionError(null);
  }

  useEffect(() => {
    if (entryIntent && synchronizedEntryIntentId === entryIntent.id) {
      onEntryIntentConsumed?.(entryIntent.id);
    }
  }, [entryIntent, onEntryIntentConsumed, synchronizedEntryIntentId]);

  const runAfterFormCheck = (action: () => void) => {
    if (!canReplaceForm()) return;
    leaveForm();
    action();
  };

  const perform = async (action: () => void | Promise<unknown>) => {
    try {
      await action();
      dispatchShelfAction({ type: 'leave' });
      setActionError(null);
      focusShelfHeading();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const openCreate = (
    seed?: Partial<RecipeFormValue>,
    referenceImageAssetId: string | null = null,
  ) => {
    if (!canReplaceForm()) return;
    const nextSeed = seed ?? {};
    dispatchShelfAction({ type: 'create', seed: nextSeed, referenceImageAssetId });
    setActionError(null);
  };

  const closeCreate = () => {
    dispatchShelfAction({ type: 'leave' });
    focusShelfHeading();
  };

  const startEditing = (next: EditingState, initialValue: Partial<RecipeFormValue>) => {
    if (!canReplaceForm()) return;
    if (next.action === 'edit') {
      dispatchShelfAction({
        type: 'edit',
        targetKind: next.kind,
        id: next.id,
        initialValue,
      });
    } else if (next.action === 'rename') {
      dispatchShelfAction({
        type: 'rename',
        targetKind: next.kind,
        id: next.id,
        initialValue: initialValue.title ?? '',
      });
    } else {
      dispatchShelfAction({ type: 'delete', targetKind: next.kind, id: next.id });
    }
    setActionError(null);
  };

  const closeEditor = () => {
    dispatchShelfAction({ type: 'leave' });
    focusShelfHeading();
  };

  const createRecipe = (value: RecipeFormValue) =>
    perform(async () => {
      await repository.createSavedPrompt({
        title: value.title,
        prompt: value.prompt,
        modelModeId: activeMode,
        source: 'manual',
        referenceImageAssetId:
          shelfAction.kind === 'create' ? shelfAction.referenceImageAssetId : null,
        tags: value.tags,
      });
    });

  const selectSaved = (item: SavedPrompt) =>
    runAfterFormCheck(() => onUsePrompt(savedPromptToRecipeSelection(item)));

  const selectRecent = (item: RecentPrompt) =>
    runAfterFormCheck(() =>
      onUsePrompt({
        origin: 'recent-prompt',
        prompt: item.prompt,
        modelModeId: item.modelModeId,
        ...(item.savedPromptId ? { assetId: item.savedPromptId } : {}),
        ...(item.savedCharacterPromptId
          ? { savedCharacterPromptId: item.savedCharacterPromptId }
          : {}),
        ...(item.savedCharacterVariantId
          ? { savedCharacterVariantId: item.savedCharacterVariantId }
          : {}),
        ...(item.characterName ? { characterName: item.characterName } : {}),
        referenceImageAssetId: item.referenceImageAssetId,
        vtonInputKind: item.vtonInputKind,
        enhancePrompt: item.enhancePrompt,
      }),
    );

  const selectCharacter = (item: SavedCharacterPrompt) => {
    const resolved = resolveCharacterVersion(state.store, preferredCharacterVersionSelection(item));
    runAfterFormCheck(() =>
      onUsePrompt({
        origin: 'character-prompt',
        prompt: item.prompt,
        modelModeId: 'lucy-latest',
        assetId: item.id,
        characterName: item.name,
        referenceImageAssetId: resolved?.referenceImageAssetId ?? item.referenceImageAssetId,
        ...(resolved?.variant ? { savedCharacterVariantId: resolved.variant.id } : {}),
        ...(item.builderDraft ? { builderDraft: item.builderDraft } : {}),
      }),
    );
  };

  const openCharacterWorkshop = (item: SavedCharacterPrompt) => {
    const draft = item.builderDraft;
    if (!draft || !onOpenCharacterWorkshop) return;
    runAfterFormCheck(() => onOpenCharacterWorkshop(draft, item));
  };

  const createCharacter = () => {
    if (!onCreateCharacter) return;
    runAfterFormCheck(onCreateCharacter);
  };

  const editCharacter = (item: SavedCharacterPrompt) => {
    if (!onEditCharacter) return;
    runAfterFormCheck(() => onEditCharacter(item));
  };
  const openWardrobe = (item: SavedCharacterPrompt) => {
    if (!onOpenWardrobe) return;
    runAfterFormCheck(() => onOpenWardrobe(item));
  };
  const createOutfit = () => runAfterFormCheck(() => onCreateOutfit?.());
  const editSaved = (item: SavedPrompt) => {
    if (item.modelModeId === 'lucy-vton-latest' && onEditOutfit) {
      runAfterFormCheck(() => onEditOutfit(item));
      return;
    }
    startEditing(
      { kind: 'saved', id: item.id, action: 'edit' },
      { title: item.title, prompt: item.prompt, tags: item.tags },
    );
  };
  const saveRecentCopy = (item: RecentPrompt) => {
    if (item.modelModeId === 'lucy-vton-latest' && onSaveOutfitCopy) {
      runAfterFormCheck(() => onSaveOutfitCopy(item));
      return;
    }
    openCreate({ prompt: item.prompt }, item.referenceImageAssetId);
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
    effectiveSelectedRecipe?.kind === kind && effectiveSelectedRecipe.id === id;

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
    selectedRecipe: effectiveSelectedRecipe,
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
    canCreateCharacter: Boolean(onCreateCharacter),
    createCharacter,
    selectSaved,
    selectRecent,
    selectCharacter,
    canOpenCharacterWorkshop: Boolean(onOpenCharacterWorkshop),
    openCharacterWorkshop,
    canEditCharacter: Boolean(onEditCharacter),
    editCharacter,
    canOpenWardrobe: Boolean(onOpenWardrobe),
    openWardrobe,
    canCreateOutfit: Boolean(onCreateOutfit),
    createOutfit,
    editSaved,
    saveRecentCopy,
    perform,
  };
};

export type RecipeShelfController = ReturnType<typeof useRecipeShelfController>;
