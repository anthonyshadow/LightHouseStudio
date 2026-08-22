import { lazy, Suspense, type RefObject } from 'react';
import type { CreativeAssetRepository } from '../features/creative-assets/types';
import { hasDraftContent } from '../features/media-session';
import type { useStudioSession } from '../orchestration/session';
import { OverlayPanel } from '../ui';
import type { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import type { useStudioOutfitWorkflow } from './useStudioOutfitWorkflow';
import type { ActiveOverlay } from './useStudioOverlayController';

const OutfitSelector = lazy(() =>
  import('../features/creative-assets/OutfitSelector').then((module) => ({
    default: module.OutfitSelector,
  })),
);

export const StudioOutfitOverlays = ({
  activeOverlay,
  repository,
  session,
  handoff,
  outfit,
  characterOpenBlockedReason,
  outfitToggleRef,
  onClose,
  onUnselectAi,
}: {
  readonly activeOverlay: ActiveOverlay;
  readonly repository: CreativeAssetRepository;
  readonly session: ReturnType<typeof useStudioSession>;
  readonly handoff: ReturnType<typeof useReferenceRecipeHandoff>;
  readonly outfit: ReturnType<typeof useStudioOutfitWorkflow>;
  readonly characterOpenBlockedReason: string | undefined;
  readonly outfitToggleRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly onUnselectAi: () => void;
}) => {
  const { activeRecipeLabel, recipeInsertionBlocked } = handoff.state;

  return (
    <OverlayPanel
      open={activeOverlay === 'outfit-selector'}
      onClose={onClose}
      title="Outfit"
      description="Create an outfit, or select a saved or recently used Virtual Try-On configuration."
      placement="right"
      bodyMode="scroll"
      returnFocusRef={outfitToggleRef}
    >
      {activeOverlay === 'outfit-selector' ? (
        <Suspense fallback={<p role="status">Loading studio tool…</p>}>
          <OutfitSelector
            repository={repository}
            activeOutfitLabel={
              session.draft.mode === 'lucy-vton-latest' && hasDraftContent(session.draft)
                ? (activeRecipeLabel ?? 'Configured VTO')
                : undefined
            }
            onClear={onUnselectAi}
            disabledReason={
              recipeInsertionBlocked
                ? 'Release the active media session before selecting another outfit.'
                : characterOpenBlockedReason
            }
            onCreate={() => outfit.openNew(true, 'selector')}
            onEdit={(savedOutfit) => outfit.openEditor(savedOutfit, false, 'selector')}
            onSaveCopy={(savedOutfit) => outfit.openEditor(savedOutfit, true, 'selector')}
            onSelect={handoff.actions.useRecipe}
          />
        </Suspense>
      ) : null}
    </OverlayPanel>
  );
};
