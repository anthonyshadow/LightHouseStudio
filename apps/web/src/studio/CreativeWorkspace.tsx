import { useTheme } from '@emotion/react';
import { type RefObject } from 'react';
import { AppIcon, Button, type AppIconName } from '../ui';
import { toolRailStyles } from './StudioApp.styles';

export type CreativeWorkspaceTool = 'edit-video' | 'character' | 'outfit' | 'voice';

export type CreativeWorkspaceState = {
  activeTool: CreativeWorkspaceTool | null;
  /**
   * Whether a loaded playback video still leaves the live tools usable. Surfaces that own their
   * own media lifecycle set this; standalone capture, where the playback video *is* the work in
   * progress, leaves it false so the live tools stay blocked.
   */
  liveToolsAvailableDuringPlayback?: boolean;
  activeCharacterLabel?: string | undefined;
  activeOutfitLabel?: string | undefined;
  activeVoiceLabel?: string | undefined;
  /** Why Voice cannot be chosen here — a Project refuses it, or the source has no usable audio. */
  voiceBlockedReason?: string | undefined;
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
  onOpenVoice: () => void;
};

export type CreativeWorkspaceRefs = {
  editVideoToggleRef: RefObject<HTMLButtonElement | null>;
  characterToggleRef: RefObject<HTMLButtonElement | null>;
  outfitToggleRef: RefObject<HTMLButtonElement | null>;
  voiceToggleRef: RefObject<HTMLButtonElement | null>;
};

export type CreativeWorkspaceProps = {
  state: CreativeWorkspaceState;
  actions: CreativeWorkspaceActions;
  refs: CreativeWorkspaceRefs;
};

/**
 * One rail entry. The four differ only in these values, so they are data rather than four copies of
 * the same markup — which is what let the accessible-name contract drift out of step before.
 */
type ToolRailEntry = {
  readonly id: CreativeWorkspaceTool;
  readonly icon: AppIconName;
  /** The control's name when nothing is chosen for it. */
  readonly name: string;
  /** What the operator picked, which replaces the name and is spoken alongside it. */
  readonly selected: string | undefined;
  /** How a selection reads to a screen reader: "Selected character: Ada. Open character options". */
  readonly selectedNoun: string;
  readonly hint: string;
  readonly blockedReason: string | undefined;
  readonly ref: RefObject<HTMLButtonElement | null>;
  readonly onOpen: () => void;
};

export const CreativeWorkspace = ({ state, actions, refs }: CreativeWorkspaceProps) => {
  const {
    activeTool,
    liveToolsAvailableDuringPlayback = false,
    activeCharacterLabel,
    activeOutfitLabel,
    activeVoiceLabel,
    voiceBlockedReason,
    recordingActive,
    hasPlaybackVideo,
    editVideoBlockedReason,
    liveToolBlockedReason,
  } = state;
  const theme = useTheme();
  const playbackBlocksLiveTools = hasPlaybackVideo && !liveToolsAvailableDuringPlayback;
  const liveVideoToolBlocked = playbackBlocksLiveTools || recordingActive;
  const editVideoBlocked = !hasPlaybackVideo || recordingActive;
  const editVideoReason = editVideoBlocked ? editVideoBlockedReason : undefined;
  const liveToolReason = liveVideoToolBlocked ? liveToolBlockedReason : undefined;

  const entries: readonly ToolRailEntry[] = [
    {
      id: 'edit-video',
      icon: 'editVideo',
      name: 'Edit Video',
      selected: undefined,
      selectedNoun: 'edit',
      hint: 'Open the video editor',
      blockedReason: editVideoReason,
      ref: refs.editVideoToggleRef,
      onOpen: actions.onOpenEditVideo,
    },
    {
      id: 'character',
      icon: 'character',
      name: 'Select Character',
      selected: activeCharacterLabel,
      selectedNoun: 'character',
      hint: 'Choose or build an AI character',
      blockedReason: liveToolReason,
      ref: refs.characterToggleRef,
      onOpen: actions.onOpenCharacter,
    },
    {
      id: 'outfit',
      icon: 'outfit',
      name: 'Select Outfit',
      selected: activeOutfitLabel,
      selectedNoun: 'outfit',
      hint: 'Choose or build a try-on outfit',
      blockedReason: liveToolReason,
      ref: refs.outfitToggleRef,
      onOpen: actions.onOpenOutfit,
    },
    {
      id: 'voice',
      icon: 'microphone',
      name: 'Select Voice',
      selected: activeVoiceLabel,
      selectedNoun: 'voice',
      hint: 'Choose a voice for this video',
      // A Project refuses any voice outright, and that outranks simply having no media yet.
      blockedReason: voiceBlockedReason ?? editVideoReason,
      ref: refs.voiceToggleRef,
      onOpen: actions.onOpenVoice,
    },
  ];

  const blocked = (entry: ToolRailEntry): boolean =>
    entry.id === 'edit-video'
      ? editVideoBlocked
      : entry.id === 'voice'
        ? editVideoBlocked || voiceBlockedReason !== undefined
        : liveVideoToolBlocked;

  return (
    <nav data-studio-tool-rail="" css={toolRailStyles(theme)} aria-label="Creative workspace tools">
      {entries.map((entry) => {
        const descriptionId = `${entry.id}-tool-description`;
        return (
          <Button
            key={entry.id}
            ref={entry.ref}
            variant={activeTool === entry.id ? 'primary' : 'secondary'}
            disabled={blocked(entry)}
            aria-label={
              entry.selected
                ? `Selected ${entry.selectedNoun}: ${entry.selected}. Open ${entry.selectedNoun} options`
                : entry.name
            }
            aria-describedby={descriptionId}
            aria-current={activeTool === entry.id ? 'page' : undefined}
            aria-haspopup="dialog"
            {...(entry.blockedReason ? { title: entry.blockedReason } : {})}
            onClick={entry.onOpen}
          >
            <AppIcon data-tool-icon name={entry.icon} />
            <span data-tool-label>
              <strong>{entry.selected ?? entry.name}</strong>
              <small id={descriptionId} data-tool-blocked={entry.blockedReason ? '' : undefined}>
                {entry.blockedReason ?? entry.hint}
              </small>
            </span>
          </Button>
        );
      })}
    </nav>
  );
};
