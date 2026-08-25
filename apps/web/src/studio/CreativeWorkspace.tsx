import { useTheme } from '@emotion/react';
import { type RefObject } from 'react';
import { AppIcon, Button } from '../ui';
import { toolRailStyles } from './StudioApp.styles';

export type CreativeWorkspaceState = {
  activeTool: 'edit-video' | 'character' | 'outfit' | null;
  /**
   * Whether a loaded playback video still leaves the live tools usable. Surfaces that own their
   * own media lifecycle set this; standalone capture, where the playback video *is* the work in
   * progress, leaves it false so the live tools stay blocked.
   */
  liveToolsAvailableDuringPlayback?: boolean;
  activeCharacterLabel?: string | undefined;
  activeOutfitLabel?: string | undefined;
  recordingActive: boolean;
  hasPlaybackVideo: boolean;
  /**
   * What a disabled tool would need before it could act. Supplied by `useStudioActivityModel`, so a
   * greyed control says its condition instead of leaving the operator to guess it.
   */
  editVideoBlockedReason?: string | undefined;
  liveToolBlockedReason?: string | undefined;
};

export type CreativeWorkspaceActions = {
  onOpenEditVideo: () => void;
  onOpenCharacter: () => void;
  onOpenOutfit: () => void;
};

export type CreativeWorkspaceRefs = {
  editVideoToggleRef: RefObject<HTMLButtonElement | null>;
  characterToggleRef: RefObject<HTMLButtonElement | null>;
  outfitToggleRef: RefObject<HTMLButtonElement | null>;
};

export type CreativeWorkspaceProps = {
  state: CreativeWorkspaceState;
  actions: CreativeWorkspaceActions;
  refs: CreativeWorkspaceRefs;
};

export const CreativeWorkspace = ({ state, actions, refs }: CreativeWorkspaceProps) => {
  const {
    activeTool,
    liveToolsAvailableDuringPlayback = false,
    activeCharacterLabel,
    activeOutfitLabel,
    recordingActive,
    hasPlaybackVideo,
    editVideoBlockedReason,
    liveToolBlockedReason,
  } = state;
  const { onOpenEditVideo, onOpenCharacter, onOpenOutfit } = actions;
  const { editVideoToggleRef, characterToggleRef, outfitToggleRef } = refs;
  const theme = useTheme();
  const playbackBlocksLiveTools = hasPlaybackVideo && !liveToolsAvailableDuringPlayback;
  const liveVideoToolBlocked = playbackBlocksLiveTools || recordingActive;
  const editVideoBlocked = !hasPlaybackVideo || recordingActive;
  const editVideoReason = editVideoBlocked ? editVideoBlockedReason : undefined;
  const liveToolReason = liveVideoToolBlocked ? liveToolBlockedReason : undefined;

  return (
    <nav data-studio-tool-rail="" css={toolRailStyles(theme)} aria-label="Creative workspace tools">
      <Button
        ref={editVideoToggleRef}
        variant={activeTool === 'edit-video' ? 'primary' : 'secondary'}
        disabled={editVideoBlocked}
        aria-label="Edit Video"
        aria-describedby="edit-video-tool-description"
        aria-current={activeTool === 'edit-video' ? 'page' : undefined}
        aria-haspopup="dialog"
        {...(editVideoReason ? { title: editVideoReason } : {})}
        onClick={onOpenEditVideo}
      >
        <AppIcon data-tool-icon name="editVideo" />
        <span data-tool-label>
          <strong>
            <span data-tool-label-long>Edit Video</span>
            <span data-tool-label-short aria-hidden="true">
              Edit
            </span>
          </strong>
          <small
            id="edit-video-tool-description"
            data-tool-blocked={editVideoReason ? '' : undefined}
          >
            {editVideoReason ?? 'Open the video editor'}
          </small>
        </span>
      </Button>
      <Button
        ref={characterToggleRef}
        variant={activeTool === 'character' ? 'primary' : 'secondary'}
        disabled={liveVideoToolBlocked}
        aria-label={
          activeCharacterLabel
            ? `Selected character: ${activeCharacterLabel}. Open character options`
            : 'Select Character'
        }
        aria-describedby="character-tool-description"
        aria-current={activeTool === 'character' ? 'page' : undefined}
        aria-haspopup="dialog"
        {...(liveToolReason ? { title: liveToolReason } : {})}
        onClick={onOpenCharacter}
      >
        <AppIcon data-tool-icon name="character" />
        <span data-tool-label>
          <strong>
            {activeCharacterLabel ?? (
              <>
                <span data-tool-label-long>Select Character</span>
                <span data-tool-label-short aria-hidden="true">
                  Character
                </span>
              </>
            )}
          </strong>
          <small
            id="character-tool-description"
            data-tool-blocked={liveToolReason ? '' : undefined}
          >
            {liveToolReason ?? 'Choose or build an AI character'}
          </small>
        </span>
      </Button>
      <Button
        ref={outfitToggleRef}
        variant={activeTool === 'outfit' ? 'primary' : 'secondary'}
        disabled={liveVideoToolBlocked}
        aria-label={
          activeOutfitLabel
            ? `Selected outfit: ${activeOutfitLabel}. Open outfit options`
            : 'Select Outfit'
        }
        aria-describedby="outfit-tool-description"
        aria-current={activeTool === 'outfit' ? 'page' : undefined}
        aria-haspopup="dialog"
        {...(liveToolReason ? { title: liveToolReason } : {})}
        onClick={onOpenOutfit}
      >
        <AppIcon data-tool-icon name="outfit" />
        <span data-tool-label>
          <strong>
            {activeOutfitLabel ?? (
              <>
                <span data-tool-label-long>Select Outfit</span>
                <span data-tool-label-short aria-hidden="true">
                  Outfit
                </span>
              </>
            )}
          </strong>
          <small id="outfit-tool-description" data-tool-blocked={liveToolReason ? '' : undefined}>
            {liveToolReason ?? 'Choose or build a try-on outfit'}
          </small>
        </span>
      </Button>
      <span title="Prompts and generated references persist locally; manual uploads and takes stay temporary.">
        <AppIcon name="privacy" />
        Local-first workspace · generated references persist locally
      </span>
    </nav>
  );
};
