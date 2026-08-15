import { lazy, Suspense, type RefObject } from 'react';
import type { CreativeAssetRepository } from '../features/creative-assets/types';
import { hasDraftContent } from '../features/media-session';
import type { useStudioSession } from '../orchestration/session';
import { OverlayPanel } from '../ui';
import type { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import type { useStudioOutfitWorkflow } from './useStudioOutfitWorkflow';
import type { ActiveOverlay } from './useStudioOverlayController';

const OutfitBuilder = lazy(() =>
  import('../features/creative-assets/OutfitBuilder').then((module) => ({
    default: module.OutfitBuilder,
  })),
);
const OutfitSelector = lazy(() =>
  import('../features/creative-assets/OutfitSelector').then((module) => ({
    default: module.OutfitSelector,
  })),
);

export const StudioOutfitOverlays = ({
  activeOverlay,
  desktopStudioLayout,
  repository,
  session,
  handoff,
  outfit,
  characterOpenBlockedReason,
  mainRef,
  outfitToggleRef,
  onClose,
  onUnselectAi,
}: {
  readonly activeOverlay: ActiveOverlay;
  readonly desktopStudioLayout: boolean;
  readonly repository: CreativeAssetRepository;
  readonly session: ReturnType<typeof useStudioSession>;
  readonly handoff: ReturnType<typeof useReferenceRecipeHandoff>;
  readonly outfit: ReturnType<typeof useStudioOutfitWorkflow>;
  readonly characterOpenBlockedReason: string | undefined;
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly outfitToggleRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly onUnselectAi: () => void;
}) => {
  const { activeRecipeLabel, recipeInsertionBlocked } = handoff.state;

  return (
    <>
      <OverlayPanel
        open={activeOverlay === 'outfit-selector'}
        onClose={onClose}
        title="Outfit"
        description="Create an outfit, or select a saved or recently used Virtual Try-On configuration."
        placement="right"
        bodyMode="scroll"
        returnFocusRef={desktopStudioLayout ? outfitToggleRef : mainRef}
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

      <OverlayPanel
        open={activeOverlay === 'outfit-builder'}
        onClose={outfit.close}
        title={outfit.launch.outfit ? 'Edit outfit' : 'Create a new outfit'}
        description="Choose Prompt or Reference image, then name and save the reusable outfit."
        placement="right"
        bodyMode="scroll"
        closeOnBackdrop={false}
        returnFocusRef={
          outfit.launch.destination === 'selector' && desktopStudioLayout
            ? outfitToggleRef
            : mainRef
        }
      >
        {activeOverlay === 'outfit-builder' ? (
          <Suspense fallback={<p role="status">Loading studio tool…</p>}>
            <OutfitBuilder
              key={`${outfit.launch.outfit?.id ?? 'new'}:${outfit.launch.saveAsCopy ? 'copy' : 'edit'}`}
              repository={repository}
              {...(outfit.launch.outfit ? { initialOutfit: outfit.launch.outfit } : {})}
              saveAsCopy={outfit.launch.saveAsCopy}
              saveAndSelect={outfit.launch.saveAndSelect}
              disabledReason={characterOpenBlockedReason}
              onDirtyChange={outfit.updateDirty}
              onCancel={outfit.close}
              onSaved={outfit.completeSave}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>
    </>
  );
};
