import { useTheme } from '@emotion/react';
import type { ModelModeId } from '@studio/domain';
import { lazy, Suspense, type ReactNode, type RefObject } from 'react';
import type {
  ActiveRecipeIdentity,
  RecipeShelfEntryIntent,
  RecipeSelection,
} from '../features/creative-assets/RecipeShelf.types';
import {
  useRecipeShelfController,
  type RecipeShelfController,
} from '../features/creative-assets/useRecipeShelfController';
import type {
  CreativeAssetRepository,
  RecentPrompt,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../features/creative-assets/types';
import type { StudioMode } from '../features/media-session';
import type {
  PromptWorkshopAction,
  SavePromptWorkshopAction,
} from '../features/prompt-authoring/CharacterPromptWorkshop';
import type { PromptBuilderDraft, PromptIntent } from '../features/prompt-authoring/model';
import { Button, OverlayPanel, SegmentedControl, StatusNotice } from '../ui';
import {
  creativeOverlayContentStyles,
  libraryModeStyles,
  toolRailStyles,
} from './StudioApp.styles';

const CharacterPromptWorkshop = lazy(() =>
  import('../features/prompt-authoring/CharacterPromptWorkshop').then((module) => ({
    default: module.CharacterPromptWorkshop,
  })),
);
const RecipeShelfView = lazy(() =>
  import('../features/creative-assets/RecipeShelf').then((module) => ({
    default: module.RecipeShelfView,
  })),
);
const deferredWorkspaceFallback = <p role="status">Loading studio tool…</p>;

type ToolIconName =
  'dock' | 'editVideo' | 'character' | 'outfit' | 'workshop' | 'shelf' | 'privacy';

const ToolIcon = ({ name }: { name: ToolIconName }) => {
  const paths: Record<ToolIconName, ReactNode> = {
    dock: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M9 3v18M9 10h12" />
      </>
    ),
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
    shelf: (
      <>
        <path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3-1 3 15-4 1z" />
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

export type AuxiliaryPanel = 'closed' | 'workshop' | 'shelf';
export type ModelMode = ModelModeId;

const libraryModeOptions = [
  { value: 'lucy-latest', label: 'Character recipes', shortLabel: 'Character' },
  { value: 'lucy-vton-latest', label: 'Try-on recipes', shortLabel: 'Try-On' },
] as const;

export type CreativeWorkspaceState = {
  panel: AuxiliaryPanel;
  activeTool: 'dock' | 'edit-video' | 'character' | 'outfit' | 'workshop' | 'shelf' | null;
  showDesktopAiTools: boolean;
  activeCharacterLabel?: string | undefined;
  activeOutfitLabel?: string | undefined;
  activeSessionMode: StudioMode;
  libraryMode: ModelMode;
  workshopDraft?: PromptBuilderDraft | undefined;
  workshopDrafts: Partial<Record<PromptIntent, PromptBuilderDraft>>;
  recordingActive: boolean;
  sessionModeLocked: boolean;
  recipeInsertionBlocked: boolean;
  hasReferenceImage: boolean;
  referenceUsePending: boolean;
  referenceUseFailure: {
    message: string;
    onRetry: () => void;
    onContinueWithoutReference?: (() => void) | undefined;
  } | null;
  legacyProjectCount?: number | undefined;
  activeRecipe?: ActiveRecipeIdentity | undefined;
  recipeShelfEntryIntent: RecipeShelfEntryIntent | null;
  hasPlaybackVideo: boolean;
};

export type CreativeWorkspaceActions = {
  onOpenDock: () => void;
  onOpenEditVideo: () => void;
  onOpenCharacter: () => void;
  onOpenOutfit: () => void;
  onOpenWorkshop: () => void;
  onToggleShelf: () => void;
  onClose: (source: Exclude<AuxiliaryPanel, 'closed'>) => void;
  onLibraryModeChange: (mode: ModelMode) => void;
  onWorkshopDraftChange: (draft: PromptBuilderDraft) => void;
  onUseWorkshop: (action: PromptWorkshopAction) => void;
  onSaveWorkshop: (action: SavePromptWorkshopAction) => void;
  onShelfDirtyChange: (dirty: boolean) => void;
  onRecipeShelfEntryIntentConsumed: (id: number) => void;
  onUseRecipe: (selection: RecipeSelection) => void;
  onCreateCharacter?: (() => void) | undefined;
  onEditCharacter?: ((asset: SavedCharacterPrompt) => void) | undefined;
  onCreateOutfit: () => void;
  onEditOutfit: (asset: SavedPrompt) => void;
  onSaveOutfitCopy: (asset: SavedPrompt | RecentPrompt) => void;
  onOpenSavedWorkshop: (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => void;
  onOpenLegacyProjects?: (() => void) | undefined;
};

export type CreativeWorkspaceRefs = {
  workshopToggleRef: RefObject<HTMLButtonElement | null>;
  shelfToggleRef: RefObject<HTMLButtonElement | null>;
  dockToggleRef: RefObject<HTMLButtonElement | null>;
  editVideoToggleRef: RefObject<HTMLButtonElement | null>;
  characterToggleRef: RefObject<HTMLButtonElement | null>;
  outfitToggleRef: RefObject<HTMLButtonElement | null>;
  legacyManagerToggleRef?: RefObject<HTMLButtonElement | null> | undefined;
};

export type CreativeWorkspaceProps = {
  repository: CreativeAssetRepository;
  state: CreativeWorkspaceState;
  actions: CreativeWorkspaceActions;
  refs: CreativeWorkspaceRefs;
};

export type CreativePanelContentProps = Pick<
  CreativeWorkspaceState &
    CreativeWorkspaceActions &
    CreativeWorkspaceRefs & { repository: CreativeAssetRepository },
  | 'libraryMode'
  | 'workshopDraft'
  | 'workshopDrafts'
  | 'repository'
  | 'recordingActive'
  | 'recipeInsertionBlocked'
  | 'hasReferenceImage'
  | 'referenceUsePending'
  | 'referenceUseFailure'
  | 'activeRecipe'
  | 'legacyManagerToggleRef'
  | 'legacyProjectCount'
  | 'onWorkshopDraftChange'
  | 'onUseWorkshop'
  | 'onSaveWorkshop'
  | 'onShelfDirtyChange'
  | 'onUseRecipe'
  | 'onCreateCharacter'
  | 'onEditCharacter'
  | 'onOpenSavedWorkshop'
  | 'onOpenLegacyProjects'
> & {
  panel: Exclude<AuxiliaryPanel, 'closed'>;
  shelfController: RecipeShelfController;
};

export const CreativePanelContent = ({
  panel,
  libraryMode,
  workshopDraft,
  workshopDrafts,
  repository,
  recordingActive,
  recipeInsertionBlocked,
  hasReferenceImage,
  referenceUsePending,
  referenceUseFailure,
  activeRecipe,
  legacyManagerToggleRef,
  legacyProjectCount = 0,
  onWorkshopDraftChange,
  onUseWorkshop,
  onSaveWorkshop,
  onShelfDirtyChange,
  onUseRecipe,
  onCreateCharacter,
  onEditCharacter,
  onOpenSavedWorkshop,
  onOpenLegacyProjects,
  shelfController,
}: CreativePanelContentProps) => {
  const theme = useTheme();

  return (
    <div
      css={[
        creativeOverlayContentStyles(theme, panel),
        referenceUseFailure
          ? {
              gridTemplateRows:
                panel === 'shelf' ? 'auto minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto',
            }
          : {},
      ]}
    >
      {panel === 'workshop' ? (
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
      ) : (
        <>
          {recipeInsertionBlocked || (legacyProjectCount > 0 && onOpenLegacyProjects) ? (
            <div css={libraryModeStyles(theme)}>
              {recipeInsertionBlocked ? (
                <StatusNotice role="status" tone="warning">
                  {recordingActive
                    ? 'Finish the take before inserting a recipe. You can keep browsing and editing this shelf.'
                    : 'Release camera & mic before inserting a recipe for another model. You can keep browsing and editing this shelf.'}
                </StatusNotice>
              ) : null}
              {legacyProjectCount > 0 && onOpenLegacyProjects ? (
                <Button
                  ref={legacyManagerToggleRef}
                  variant="secondary"
                  onClick={onOpenLegacyProjects}
                >
                  Manage Legacy Projects ({legacyProjectCount})
                </Button>
              ) : null}
            </div>
          ) : null}
          <Suspense fallback={deferredWorkspaceFallback}>
            <RecipeShelfView
              activeMode={libraryMode}
              embedded
              promptUseDisabled={recipeInsertionBlocked || referenceUsePending}
              repository={repository}
              controller={shelfController}
              {...(activeRecipe !== undefined ? { activeRecipe } : {})}
              onDirtyChange={onShelfDirtyChange}
              onUsePrompt={onUseRecipe}
              {...(onCreateCharacter ? { onCreateCharacter } : {})}
              {...(onEditCharacter ? { onEditCharacter } : {})}
              onOpenCharacterWorkshop={onOpenSavedWorkshop}
            />
          </Suspense>
        </>
      )}
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

export const CreativeWorkspace = ({ repository, state, actions, refs }: CreativeWorkspaceProps) => {
  const {
    panel,
    activeTool,
    showDesktopAiTools,
    activeCharacterLabel,
    activeOutfitLabel,
    activeSessionMode,
    libraryMode,
    workshopDraft,
    workshopDrafts,
    recordingActive,
    sessionModeLocked,
    recipeInsertionBlocked,
    hasReferenceImage,
    referenceUsePending,
    referenceUseFailure,
    legacyProjectCount = 0,
    activeRecipe,
    recipeShelfEntryIntent,
    hasPlaybackVideo,
  } = state;
  const {
    onOpenDock,
    onOpenEditVideo,
    onOpenCharacter,
    onOpenOutfit,
    onOpenWorkshop,
    onToggleShelf,
    onClose,
    onLibraryModeChange,
    onWorkshopDraftChange,
    onUseWorkshop,
    onSaveWorkshop,
    onShelfDirtyChange,
    onRecipeShelfEntryIntentConsumed,
    onUseRecipe,
    onCreateCharacter,
    onEditCharacter,
    onCreateOutfit,
    onEditOutfit,
    onSaveOutfitCopy,
    onOpenSavedWorkshop,
    onOpenLegacyProjects,
  } = actions;
  const {
    workshopToggleRef,
    shelfToggleRef,
    dockToggleRef,
    editVideoToggleRef,
    characterToggleRef,
    outfitToggleRef,
    legacyManagerToggleRef,
  } = refs;
  const theme = useTheme();
  const characterWorkshopBlocked =
    recordingActive || (activeSessionMode !== 'lucy-latest' && sessionModeLocked);
  const activePanel = panel === 'closed' ? null : panel;
  const shelfController = useRecipeShelfController({
    repository,
    activeMode: libraryMode,
    onUsePrompt: onUseRecipe,
    ...(onCreateCharacter ? { onCreateCharacter } : {}),
    ...(onEditCharacter ? { onEditCharacter } : {}),
    onCreateOutfit,
    onEditOutfit,
    onSaveOutfitCopy,
    onOpenCharacterWorkshop: onOpenSavedWorkshop,
    onDirtyChange: onShelfDirtyChange,
    ...(activeRecipe !== undefined ? { activeRecipe } : {}),
    entryIntent: recipeShelfEntryIntent,
    onEntryIntentConsumed: onRecipeShelfEntryIntentConsumed,
  });

  return (
    <>
      <nav
        data-studio-tool-rail=""
        css={toolRailStyles(theme)}
        aria-label="Creative workspace tools"
      >
        <Button
          ref={dockToggleRef}
          variant={activeTool === 'dock' ? 'primary' : 'secondary'}
          disabled={recordingActive}
          aria-label="Dock"
          aria-describedby="dock-tool-description"
          aria-current={activeTool === 'dock' ? 'page' : undefined}
          aria-haspopup="dialog"
          onClick={onOpenDock}
        >
          <ToolIcon name="dock" />
          <span data-tool-label>
            <strong>Dock</strong>
            <small id="dock-tool-description">Set up camera or AI</small>
          </span>
        </Button>
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
              disabled={recordingActive}
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
              disabled={recordingActive}
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
        <Button
          ref={shelfToggleRef}
          variant={activeTool === 'shelf' ? 'primary' : 'secondary'}
          disabled={recordingActive}
          aria-label="Shelf"
          aria-describedby="shelf-tool-description"
          aria-expanded={panel === 'shelf'}
          aria-haspopup="dialog"
          onClick={onToggleShelf}
        >
          <ToolIcon name="shelf" />
          <span data-tool-label>
            <strong>Shelf</strong>
            <small id="shelf-tool-description">Reuse saved work</small>
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
        title={panel === 'workshop' ? 'Prompt Workshop' : 'Recipe Shelf'}
        description={
          panel === 'workshop'
            ? 'Build one clear Add, Replace, or Restyle direction.'
            : 'Browse and manage browser-local Character and Try-On recipes.'
        }
        headerActions={
          panel === 'shelf' ? (
            <SegmentedControl
              label="Recipe model"
              value={libraryMode}
              options={libraryModeOptions}
              disabled={sessionModeLocked}
              onChange={onLibraryModeChange}
            />
          ) : undefined
        }
        placement={panel === 'shelf' ? 'bottom' : 'right'}
        size="wide"
        height={panel === 'shelf' ? 'tall' : 'standard'}
        bodyMode="contained"
        closeLabel="Close creative tool"
        returnFocusRef={panel === 'workshop' ? workshopToggleRef : shelfToggleRef}
        closeOnBackdrop
      >
        {activePanel ? (
          <CreativePanelContent
            panel={activePanel}
            libraryMode={libraryMode}
            workshopDraft={workshopDraft}
            workshopDrafts={workshopDrafts}
            repository={repository}
            recordingActive={recordingActive}
            recipeInsertionBlocked={recipeInsertionBlocked}
            hasReferenceImage={hasReferenceImage}
            referenceUsePending={referenceUsePending}
            referenceUseFailure={referenceUseFailure}
            {...(activeRecipe !== undefined ? { activeRecipe } : {})}
            {...(legacyManagerToggleRef ? { legacyManagerToggleRef } : {})}
            legacyProjectCount={legacyProjectCount}
            onWorkshopDraftChange={onWorkshopDraftChange}
            onUseWorkshop={onUseWorkshop}
            onSaveWorkshop={onSaveWorkshop}
            onShelfDirtyChange={onShelfDirtyChange}
            onUseRecipe={onUseRecipe}
            {...(onCreateCharacter ? { onCreateCharacter } : {})}
            {...(onEditCharacter ? { onEditCharacter } : {})}
            onOpenSavedWorkshop={onOpenSavedWorkshop}
            {...(onOpenLegacyProjects ? { onOpenLegacyProjects } : {})}
            shelfController={shelfController}
          />
        ) : null}
      </OverlayPanel>
    </>
  );
};
