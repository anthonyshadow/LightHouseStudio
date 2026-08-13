import { useCallback, useRef, useState } from 'react';
import { savedPromptToRecipeSelection } from '../features/creative-assets/recipeSelection';
import type { RecentPrompt, SavedPrompt } from '../features/creative-assets/types';
import type { ActiveOverlay } from './useStudioOverlayController';

export type OutfitBuilderLaunch = Readonly<{
  outfit?: SavedPrompt;
  saveAsCopy: boolean;
  saveAndSelect: boolean;
  destination: 'selector' | 'shelf' | 'library';
}>;

interface UseStudioOutfitWorkflowOptions {
  readonly blockedReason: string | undefined;
  readonly openOverlay: (overlay: Exclude<ActiveOverlay, null>) => void;
  readonly closeOverlay: () => void;
  readonly onOpenLibrary: () => void;
  readonly applySavedOutfit: (selection: ReturnType<typeof savedPromptToRecipeSelection>) => void;
}

export const useStudioOutfitWorkflow = ({
  blockedReason,
  openOverlay,
  closeOverlay,
  onOpenLibrary,
  applySavedOutfit,
}: UseStudioOutfitWorkflowOptions) => {
  const [launch, setLaunch] = useState<OutfitBuilderLaunch>({
    saveAsCopy: false,
    saveAndSelect: true,
    destination: 'selector',
  });
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);

  const updateDirty = useCallback((nextDirty: boolean) => {
    dirtyRef.current = nextDirty;
    setDirty(nextDirty);
  }, []);

  const openNew = useCallback(
    (saveAndSelect: boolean, destination: OutfitBuilderLaunch['destination']) => {
      if (blockedReason) return;
      setLaunch({ saveAsCopy: false, saveAndSelect, destination });
      updateDirty(false);
      openOverlay('outfit-builder');
    },
    [blockedReason, openOverlay, updateDirty],
  );

  const openEditor = useCallback(
    (outfit: SavedPrompt, saveAsCopy: boolean, destination: OutfitBuilderLaunch['destination']) => {
      if (blockedReason) return;
      setLaunch({ outfit, saveAsCopy, saveAndSelect: false, destination });
      updateDirty(false);
      openOverlay('outfit-builder');
    },
    [blockedReason, openOverlay, updateDirty],
  );

  const openCopy = useCallback(
    (outfit: SavedPrompt | RecentPrompt, destination: OutfitBuilderLaunch['destination']) => {
      if ('title' in outfit) {
        openEditor(outfit, true, destination);
        return;
      }
      openEditor(
        {
          id: outfit.id,
          title: 'Outfit',
          prompt: outfit.prompt,
          modelModeId: 'lucy-vton-latest',
          source: 'manual',
          referenceImageAssetId: outfit.referenceImageAssetId,
          vtonInputKind: outfit.vtonInputKind,
          enhancePrompt: outfit.enhancePrompt,
          tags: [],
          createdAt: outfit.usedAt,
          updatedAt: outfit.usedAt,
          lastUsedAt: outfit.usedAt,
          useCount: 1,
        },
        true,
        destination,
      );
    },
    [openEditor],
  );

  const close = useCallback(() => {
    if (
      dirtyRef.current &&
      !window.confirm('Discard the unfinished outfit changes? The draft cannot be recovered.')
    ) {
      return;
    }
    updateDirty(false);
    if (launch.destination === 'library') {
      closeOverlay();
      onOpenLibrary();
      return;
    }
    openOverlay(launch.destination === 'shelf' ? 'recipe-shelf' : 'outfit-selector');
  }, [closeOverlay, launch.destination, onOpenLibrary, openOverlay, updateDirty]);

  const selectSaved = useCallback(
    (outfit: SavedPrompt) => {
      updateDirty(false);
      applySavedOutfit(savedPromptToRecipeSelection(outfit));
    },
    [applySavedOutfit, updateDirty],
  );

  const completeSave = useCallback(
    (savedOutfit: SavedPrompt) => {
      if (launch.saveAndSelect) {
        selectSaved(savedOutfit);
        return;
      }
      updateDirty(false);
      if (launch.destination === 'library') {
        closeOverlay();
        onOpenLibrary();
        return;
      }
      openOverlay(launch.destination === 'shelf' ? 'recipe-shelf' : 'outfit-selector');
    },
    [
      closeOverlay,
      launch.destination,
      launch.saveAndSelect,
      onOpenLibrary,
      openOverlay,
      selectSaved,
      updateDirty,
    ],
  );

  return {
    launch,
    dirty,
    updateDirty,
    openNew,
    openEditor,
    openCopy,
    close,
    selectSaved,
    completeSave,
  } as const;
};
