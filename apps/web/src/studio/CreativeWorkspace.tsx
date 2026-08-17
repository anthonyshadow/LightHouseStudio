import { useTheme } from '@emotion/react';
import { lazy, Suspense, type ReactNode, type RefObject } from 'react';
import type { StudioMode } from '../features/media-session';
import type {
  PromptWorkshopAction,
  SavePromptWorkshopAction,
} from '../features/prompt-authoring/CharacterPromptWorkshop';
import type { PromptBuilderDraft, PromptIntent } from '../features/prompt-authoring/model';
import { Button, OverlayPanel, StatusNotice } from '../ui';
import { creativeOverlayContentStyles, toolRailStyles } from './StudioApp.styles';

const CharacterPromptWorkshop = lazy(() =>
  import('../features/prompt-authoring/CharacterPromptWorkshop').then((module) => ({
    default: module.CharacterPromptWorkshop,
  })),
);
const deferredWorkspaceFallback = <p role="status">Loading studio tool…</p>;

type ToolIconName = 'editVideo' | 'character' | 'outfit' | 'workshop' | 'privacy';

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
    workshop: (
      <>
        <path d="m14 5 5 5M12.5 6.5l4-4 5 5-4 4" />
        <path d="M13 10 5 18l-3 1 1-3 8-8M14 14l-2 2 4 4 4-4-2-2" />
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

export type AuxiliaryPanel = 'closed' | 'workshop';

export type CreativeWorkspaceState = {
  panel: AuxiliaryPanel;
  activeTool: 'edit-video' | 'character' | 'outfit' | 'workshop' | null;
  showDesktopAiTools: boolean;
  /**
   * Whether a loaded playback video still leaves the live tools usable. Surfaces that own their
   * own media lifecycle set this; standalone capture, where the playback video *is* the work in
   * progress, leaves it false so the live tools stay blocked.
   */
  liveToolsAvailableDuringPlayback?: boolean;
  activeCharacterLabel?: string | undefined;
  activeOutfitLabel?: string | undefined;
  activeSessionMode: StudioMode;
  workshopDraft?: PromptBuilderDraft | undefined;
  workshopDrafts: Partial<Record<PromptIntent, PromptBuilderDraft>>;
  recordingActive: boolean;
  sessionModeLocked: boolean;
  hasReferenceImage: boolean;
  referenceUsePending: boolean;
  referenceUseFailure: {
    message: string;
    onRetry: () => void;
    onContinueWithoutReference?: (() => void) | undefined;
  } | null;
  hasPlaybackVideo: boolean;
};

export type CreativeWorkspaceActions = {
  onOpenEditVideo: () => void;
  onOpenCharacter: () => void;
  onOpenOutfit: () => void;
  onOpenWorkshop: () => void;
  onClose: (source: Exclude<AuxiliaryPanel, 'closed'>) => void;
  onWorkshopDraftChange: (draft: PromptBuilderDraft) => void;
  onUseWorkshop: (action: PromptWorkshopAction) => void;
  onSaveWorkshop: (action: SavePromptWorkshopAction) => void;
};

export type CreativeWorkspaceRefs = {
  workshopToggleRef: RefObject<HTMLButtonElement | null>;
  editVideoToggleRef: RefObject<HTMLButtonElement | null>;
  characterToggleRef: RefObject<HTMLButtonElement | null>;
  outfitToggleRef: RefObject<HTMLButtonElement | null>;
};

export type CreativeWorkspaceProps = {
  state: CreativeWorkspaceState;
  actions: CreativeWorkspaceActions;
  refs: CreativeWorkspaceRefs;
};

export type CreativePanelContentProps = Pick<
  CreativeWorkspaceState & CreativeWorkspaceActions,
  | 'workshopDraft'
  | 'workshopDrafts'
  | 'recordingActive'
  | 'hasReferenceImage'
  | 'referenceUsePending'
  | 'referenceUseFailure'
  | 'onWorkshopDraftChange'
  | 'onUseWorkshop'
  | 'onSaveWorkshop'
>;

export const CreativePanelContent = ({
  workshopDraft,
  workshopDrafts,
  recordingActive,
  hasReferenceImage,
  referenceUsePending,
  referenceUseFailure,
  onWorkshopDraftChange,
  onUseWorkshop,
  onSaveWorkshop,
}: CreativePanelContentProps) => {
  const theme = useTheme();

  return (
    <div
      css={[
        creativeOverlayContentStyles(),
        referenceUseFailure ? { gridTemplateRows: 'minmax(0, 1fr) auto' } : {},
      ]}
    >
      <Suspense fallback={deferredWorkspaceFallback}>
        <CharacterPromptWorkshop
          initialDraft={workshopDraft}
          initialDrafts={workshopDrafts}
          hasReferenceImage={hasReferenceImage}
          disabled={recordingActive || referenceUsePending}
          onDraftChange={onWorkshopDraftChange}
          onUse={onUseWorkshop}
          onSave={onSaveWorkshop}
        />
      </Suspense>
      {referenceUseFailure ? (
        <StatusNotice tone="danger" title="Reference image could not be restored" role="alert">
          {referenceUseFailure.message}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: theme.space.xs,
              marginTop: theme.space.xs,
            }}
          >
            <Button size="small" variant="secondary" onClick={referenceUseFailure.onRetry}>
              Retry
            </Button>
            {referenceUseFailure.onContinueWithoutReference ? (
              <Button
                size="small"
                variant="quiet"
                onClick={referenceUseFailure.onContinueWithoutReference}
              >
                Continue without reference
              </Button>
            ) : null}
          </div>
        </StatusNotice>
      ) : null}
    </div>
  );
};

export const CreativeWorkspace = ({ state, actions, refs }: CreativeWorkspaceProps) => {
  const {
    panel,
    activeTool,
    showDesktopAiTools,
    liveToolsAvailableDuringPlayback = false,
    activeCharacterLabel,
    activeOutfitLabel,
    activeSessionMode,
    workshopDraft,
    workshopDrafts,
    recordingActive,
    sessionModeLocked,
    hasReferenceImage,
    referenceUsePending,
    referenceUseFailure,
    hasPlaybackVideo,
  } = state;
  const {
    onOpenEditVideo,
    onOpenCharacter,
    onOpenOutfit,
    onOpenWorkshop,
    onClose,
    onWorkshopDraftChange,
    onUseWorkshop,
    onSaveWorkshop,
  } = actions;
  const { workshopToggleRef, editVideoToggleRef, characterToggleRef, outfitToggleRef } = refs;
  const theme = useTheme();
  const playbackBlocksLiveTools = hasPlaybackVideo && !liveToolsAvailableDuringPlayback;
  const characterWorkshopBlocked =
    playbackBlocksLiveTools ||
    recordingActive ||
    (activeSessionMode !== 'lucy-latest' && sessionModeLocked);
  const liveVideoToolBlocked = playbackBlocksLiveTools || recordingActive;
  const activePanel = panel === 'workshop' ? panel : null;

  return (
    <>
      <nav
        data-studio-tool-rail=""
        css={toolRailStyles(theme)}
        aria-label="Creative workspace tools"
      >
        <Button
          ref={editVideoToggleRef}
          variant={activeTool === 'edit-video' ? 'primary' : 'secondary'}
          disabled={!hasPlaybackVideo || recordingActive}
          aria-label="Edit Video"
          aria-describedby="edit-video-tool-description"
          aria-current={activeTool === 'edit-video' ? 'page' : undefined}
          aria-haspopup="dialog"
          onClick={onOpenEditVideo}
        >
          <ToolIcon name="editVideo" />
          <span data-tool-label>
            <strong>Edit Video</strong>
            <small id="edit-video-tool-description">Open the video editor</small>
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
              aria-current={activeTool === 'character' ? 'page' : undefined}
              aria-haspopup="dialog"
              onClick={onOpenCharacter}
            >
              <ToolIcon name="character" />
              <span data-tool-label>
                <strong>{activeCharacterLabel ?? 'Select Character'}</strong>
                <small>Choose or build an AI character</small>
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
              aria-current={activeTool === 'outfit' ? 'page' : undefined}
              aria-haspopup="dialog"
              onClick={onOpenOutfit}
            >
              <ToolIcon name="outfit" />
              <span data-tool-label>
                <strong>{activeOutfitLabel ?? 'Select Outfit'}</strong>
                <small>Choose or build a try-on outfit</small>
              </span>
            </Button>
          </>
        ) : null}
        <Button
          ref={workshopToggleRef}
          variant={activeTool === 'workshop' ? 'primary' : 'secondary'}
          disabled={characterWorkshopBlocked}
          aria-label="Workshop"
          aria-describedby="workshop-tool-description"
          aria-expanded={panel === 'workshop'}
          aria-haspopup="dialog"
          onClick={() => (panel === 'workshop' ? onClose('workshop') : onOpenWorkshop())}
        >
          <ToolIcon name="workshop" />
          <span data-tool-label>
            <strong>
              <span data-workshop-label-long>Workshop</span>
              <span data-workshop-label-short aria-hidden="true">
                Build
              </span>
            </strong>
            <small id="workshop-tool-description">Advanced · build one visual change</small>
          </span>
        </Button>
        <span title="Prompts and generated references persist locally; manual uploads and takes stay temporary.">
          <ToolIcon name="privacy" />
          Local-first workspace · generated references persist locally
        </span>
      </nav>

      <OverlayPanel
        open={activePanel !== null}
        onClose={() => {
          if (activePanel) onClose(activePanel);
        }}
        title="Prompt Workshop"
        description="Build one clear Add, Replace, or Restyle direction."
        placement="right"
        size="wide"
        height="standard"
        bodyMode="contained"
        closeLabel="Close creative tool"
        returnFocusRef={workshopToggleRef}
        closeOnBackdrop
      >
        {activePanel ? (
          <CreativePanelContent
            workshopDraft={workshopDraft}
            workshopDrafts={workshopDrafts}
            recordingActive={recordingActive}
            hasReferenceImage={hasReferenceImage}
            referenceUsePending={referenceUsePending}
            referenceUseFailure={referenceUseFailure}
            onWorkshopDraftChange={onWorkshopDraftChange}
            onUseWorkshop={onUseWorkshop}
            onSaveWorkshop={onSaveWorkshop}
          />
        ) : null}
      </OverlayPanel>
    </>
  );
};
