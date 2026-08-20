import { useTheme } from '@emotion/react';
import { type ReactNode, type RefObject } from 'react';
import { Button } from '../ui';
import { toolRailStyles } from './StudioApp.styles';

type ToolIconName = 'editVideo' | 'character' | 'outfit' | 'privacy';

const ToolIcon = ({ name }: { name: ToolIconName }) => {
  const paths: Record<ToolIconName, ReactNode> = {
    editVideo: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M8 5v14M16 5v14M3 10h5M16 10h5M3 15h5M16 15h5" />
      </>
    ),
    character: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0M19 3v4M17 5h4" />
      </>
    ),
    outfit: (
      <>
        <path d="m8 4 4 2 4-2 4 4-3 3v9H7v-9L4 8z" />
        <path d="M10 5a2 2 0 0 0 4 0" />
      </>
    ),
    privacy: (
      <>
        <path d="M12 3 5 6v5c0 4.5 2.7 8.1 7 10 4.3-1.9 7-5.5 7-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  };

  return (
    <svg
      data-tool-icon={name === 'privacy' ? undefined : ''}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
};

export type CreativeWorkspaceState = {
  activeTool: 'edit-video' | 'character' | 'outfit' | null;
  showDesktopAiTools: boolean;
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
    showDesktopAiTools,
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
        <ToolIcon name="editVideo" />
        <span data-tool-label>
          <strong>Edit Video</strong>
          <small
            id="edit-video-tool-description"
            data-tool-blocked={editVideoReason ? '' : undefined}
          >
            {editVideoReason ?? 'Open the video editor'}
          </small>
        </span>
      </Button>
      {showDesktopAiTools ? (
        <>
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
            <ToolIcon name="character" />
            <span data-tool-label>
              <strong>{activeCharacterLabel ?? 'Select Character'}</strong>
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
            <ToolIcon name="outfit" />
            <span data-tool-label>
              <strong>{activeOutfitLabel ?? 'Select Outfit'}</strong>
              <small
                id="outfit-tool-description"
                data-tool-blocked={liveToolReason ? '' : undefined}
              >
                {liveToolReason ?? 'Choose or build a try-on outfit'}
              </small>
            </span>
          </Button>
        </>
      ) : null}
      <span title="Prompts and generated references persist locally; manual uploads and takes stay temporary.">
        <ToolIcon name="privacy" />
        Local-first workspace · generated references persist locally
      </span>
    </nav>
  );
};
