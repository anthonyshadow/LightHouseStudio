import { lazy, Suspense } from 'react';
import { OverlayPanel } from '../../ui';
import type { ShellServices } from './useShellServices';

const CharacterBuilderCoordinator = lazy(() =>
  import('../../features/character-builder/CharacterBuilderCoordinator').then((module) => ({
    default: module.CharacterBuilderCoordinator,
  })),
);
const OutfitBuilder = lazy(() =>
  import('../../features/creative-assets/OutfitBuilder').then((module) => ({
    default: module.OutfitBuilder,
  })),
);
const ConfirmationDialog = lazy(() =>
  import('../../ui/primitives/ConfirmationDialog').then((module) => ({
    default: module.ConfirmationDialog,
  })),
);

/**
 * Creating a Character or an Outfit, wherever the operator started.
 *
 * These sit in the shell because Quick Create opens them in place on a Project route, which owns no
 * capture graph — a Character with a Project destination is persisted and attached without a
 * session ever being involved. The *selectors* are the opposite case and stay in the runtime: they
 * exist to point a live session at something.
 *
 * What a live session forbids still reaches them through `creativeLocks`, which is empty when no
 * runtime is mounted — correct rather than merely permissive, since nothing can be recording
 * without the graph that records.
 */
export const ShellCreativeBuilders = ({ services }: { readonly services: ShellServices }) => {
  const {
    overlay,
    character,
    outfit,
    creative,
    provider,
    desktopStudioLayout,
    creativeLocks,
    mainRef,
    characterSelectorRef,
    editVideoToggleRef,
    outfitToggleRef,
  } = services;
  const { availability } = provider;

  return (
    <>
      {overlay.active === 'character-builder' ? (
        <Suspense fallback={<p role="status">Loading studio tool…</p>}>
          <CharacterBuilderCoordinator
            open
            ownerUserId={services.ownerUserId}
            target={character.launch.target}
            {...(character.launch.initialValue
              ? { initialValue: character.launch.initialValue }
              : {})}
            returnFocusRef={
              character.destination.kind === 'existing-video'
                ? editVideoToggleRef
                : desktopStudioLayout
                  ? characterSelectorRef
                  : mainRef
            }
            generationAvailable={Boolean(availability.referenceImages)}
            optimizationAvailable={Boolean(availability.referenceImageOptimizerAvailable)}
            editAvailable={Boolean(availability.referenceImageEditAvailable)}
            {...(availability.referenceImageProvider !== undefined
              ? { referenceImageProvider: availability.referenceImageProvider }
              : {})}
            {...(availability.referenceImageModel !== undefined
              ? { referenceImageModel: availability.referenceImageModel }
              : {})}
            {...(availability.referenceImageOptimizerModel !== undefined
              ? { referenceImageOptimizerModel: availability.referenceImageOptimizerModel }
              : {})}
            {...(character.saveBlockedReason
              ? { saveBlockedReason: character.saveBlockedReason }
              : {})}
            onSaveCharacter={character.saveCharacter}
            onDismiss={character.dismissBuilder}
          />
        </Suspense>
      ) : null}

      <OverlayPanel
        open={overlay.active === 'outfit-builder'}
        onClose={() => void outfit.close()}
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
        {overlay.active === 'outfit-builder' ? (
          <Suspense fallback={<p role="status">Loading studio tool…</p>}>
            <OutfitBuilder
              key={`${outfit.launch.outfit?.id ?? 'new'}:${outfit.launch.saveAsCopy ? 'copy' : 'edit'}`}
              repository={creative.repository}
              {...(outfit.launch.outfit ? { initialOutfit: outfit.launch.outfit } : {})}
              saveAsCopy={outfit.launch.saveAsCopy}
              saveAndSelect={outfit.launch.saveAndSelect}
              disabledReason={creativeLocks.characterOpen}
              onDirtyChange={outfit.updateDirty}
              onCancel={() => void outfit.close()}
              onSaved={outfit.completeSave}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>

      <Suspense fallback={null}>
        <ConfirmationDialog
          open={character.discardPrompt !== null}
          title="Unfinished character draft"
          description={
            character.discardPrompt ??
            'An unfinished character draft exists. Continue and discard it?'
          }
          confirmLabel="Continue"
          cancelLabel="Cancel"
          danger
          onCancel={() => character.resolveDiscard(false)}
          onConfirm={() => character.resolveDiscard(true)}
        />
      </Suspense>
    </>
  );
};
