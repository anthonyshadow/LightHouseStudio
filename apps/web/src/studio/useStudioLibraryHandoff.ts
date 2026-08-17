import type { SavedVideoSummary, VoiceSummary } from '@studio/contracts';
import { useMemo } from 'react';
import type { useStudioHandoff } from '../app/shell/useStudioHandoff';
import type { SavedCharacterPrompt, SavedPrompt } from '../features/creative-assets/types';
import type { useStudioCharacterWorkflow } from './useStudioCharacterWorkflow';
import type { useStudioNavigationActions } from './useStudioNavigationActions';
import type { useStudioOutfitWorkflow } from './useStudioOutfitWorkflow';

interface UseStudioLibraryHandoffOptions {
  readonly nav: ReturnType<typeof useStudioNavigationActions>;
  readonly character: ReturnType<typeof useStudioCharacterWorkflow>;
  readonly outfit: ReturnType<typeof useStudioOutfitWorkflow>;
  /** The shell's channel: applies to a live session, or holds the choice for the one about to mount. */
  readonly applyRecipe: ReturnType<typeof useStudioHandoff>['applyRecipe'];
  readonly selectVoice: ReturnType<typeof useStudioHandoff>['selectVoice'];
  readonly useSavedVideo: ReturnType<typeof useStudioHandoff>['useSavedVideo'];
  readonly openVideoUpload: () => void;
}

/**
 * What picking an asset out of a library does to the Studio.
 *
 * Every one of these ends on the Studio surface, because a library is a chooser, not a workspace —
 * a Character, Outfit or Voice only means anything next to a video. Libraries are `/assets/*`
 * overlays, which own no capture graph, so the creative choices go through the shell's handoff
 * channel rather than at a session directly: it applies now if a runtime is mounted and holds the
 * choice for the one about to mount if not. The channel navigates, so these do not.
 */
export const useStudioLibraryHandoff = ({
  nav,
  character,
  outfit,
  applyRecipe,
  selectVoice,
  useSavedVideo,
  openVideoUpload,
}: UseStudioLibraryHandoffOptions) =>
  useMemo(
    () =>
      ({
        useVideo: (video: SavedVideoSummary, intent: 'play' | 'edit') =>
          useSavedVideo(video, intent),
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
          applyRecipe({
            origin: 'character-prompt',
            prompt: savedCharacter.prompt,
            modelModeId: 'lucy-latest',
            assetId: savedCharacter.id,
            characterName: savedCharacter.name,
            referenceImageAssetId: savedCharacter.referenceImageAssetId,
            ...(savedCharacter.builderDraft ? { builderDraft: savedCharacter.builderDraft } : {}),
          });
        },
        createOutfit: () => {
          nav.openStudio();
          outfit.openNew(false, 'library');
        },
        // `selectSaved` applies through the same channel: the outfit workflow's apply callback is
        // the shell's, so a saved outfit chosen from the library reaches Studio the same way.
        useOutfit: (savedOutfit: SavedPrompt) => outfit.selectSaved(savedOutfit),
        useVoice: (voice: VoiceSummary) => {
          // A Voice is meaningless without a video, so land on the surface that supplies one. With a
          // source already loaded it applies now; otherwise the workflow holds it until one is ready.
          selectVoice(voice.voiceId, voice.name);
          nav.openStudio();
          openVideoUpload();
        },
      }) as const,
    [applyRecipe, character, nav, openVideoUpload, outfit, selectVoice, useSavedVideo],
  );
