import type { VoiceSummary } from '@studio/contracts';
import { useMemo } from 'react';
import type { SavedCharacterPrompt, SavedPrompt } from '../features/creative-assets/types';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import type { useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';
import type { useStudioCharacterWorkflow } from './useStudioCharacterWorkflow';
import type { useStudioNavigationActions } from './useStudioNavigationActions';
import type { useStudioOutfitWorkflow } from './useStudioOutfitWorkflow';

interface UseStudioLibraryHandoffOptions {
  readonly nav: ReturnType<typeof useStudioNavigationActions>;
  readonly character: ReturnType<typeof useStudioCharacterWorkflow>;
  readonly outfit: ReturnType<typeof useStudioOutfitWorkflow>;
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
  readonly applyRecipeSelection: ReturnType<
    typeof useReferenceRecipeHandoff
  >['actions']['useRecipe'];
  readonly openVideoUpload: () => void;
}

/**
 * What picking an asset out of a library does to the Studio.
 *
 * Every one of these ends on the Studio surface, because a library is a chooser, not a workspace —
 * a Character, Outfit or Voice only means anything next to a video. The ordering differences are
 * deliberate: applying first and navigating second keeps the Studio's first paint already carrying
 * the selection.
 */
export const useStudioLibraryHandoff = ({
  nav,
  character,
  outfit,
  existingVideo,
  applyRecipeSelection,
  openVideoUpload,
}: UseStudioLibraryHandoffOptions) =>
  useMemo(
    () =>
      ({
        createCharacter: () => {
          nav.openStudio();
          character.openNew();
        },
        copyCharacter: (savedCharacter: SavedCharacterPrompt) => {
          nav.openStudio();
          character.copy(savedCharacter);
        },
        openWardrobe: (savedCharacter: SavedCharacterPrompt) => {
          nav.openStudio();
          character.openWardrobe(savedCharacter);
        },
        useCharacter: (savedCharacter: SavedCharacterPrompt) => {
          applyRecipeSelection({
            origin: 'character-prompt',
            prompt: savedCharacter.prompt,
            modelModeId: 'lucy-latest',
            assetId: savedCharacter.id,
            characterName: savedCharacter.name,
            referenceImageAssetId: savedCharacter.referenceImageAssetId,
            ...(savedCharacter.builderDraft ? { builderDraft: savedCharacter.builderDraft } : {}),
          });
          nav.openStudio();
        },
        createOutfit: () => {
          nav.openStudio();
          outfit.openNew(false, 'library');
        },
        useOutfit: (savedOutfit: SavedPrompt) => {
          outfit.selectSaved(savedOutfit);
          nav.openStudio();
        },
        useVoice: (voice: VoiceSummary) => {
          // A Voice is meaningless without a video, so land on the surface that supplies one.
          // With a source already loaded it applies now; otherwise the workflow holds it until
          // one is ready.
          if (existingVideo.selection === null)
            existingVideo.preselectVoice(voice.voiceId, voice.name);
          else existingVideo.selectVoice(voice.voiceId, voice.name);
          nav.openStudio();
          openVideoUpload();
        },
      }) as const,
    [applyRecipeSelection, character, existingVideo, nav, openVideoUpload, outfit],
  );
