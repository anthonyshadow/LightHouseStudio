import { useTheme } from '@emotion/react';
import type { RefObject } from 'react';
import {
  RecipeShelfView,
  useRecipeShelfController,
  type CreativeAssetRepository,
  type RecipeSelection,
  type RecipeShelfController,
  type SavedCharacterPrompt,
} from '../features/creative-assets';
import type { StudioMode } from '../features/media-session';
import {
  CharacterPromptWorkshop,
  type PromptBuilderDraft,
  type PromptIntent,
  type PromptWorkshopAction,
  type SavePromptWorkshopAction,
} from '../features/prompt-authoring';
import { Button, OverlayPanel, SegmentedControl, StatusNotice } from '../ui';
import {
  creativeOverlayContentStyles,
  libraryModeStyles,
  toolRailStyles,
} from './StudioApp.styles';

export type AuxiliaryPanel = 'closed' | 'workshop' | 'shelf';
export type ModelMode = 'lucy-2.5' | 'lucy-vton-3';

const libraryModeOptions = [
  { value: 'lucy-2.5', label: 'Character recipes', shortLabel: 'Character' },
  { value: 'lucy-vton-3', label: 'Try-on recipes', shortLabel: 'Try-On' },
] as const;

type CreativeWorkspaceProps = {
  panel: AuxiliaryPanel;
  activeSessionMode: StudioMode;
  libraryMode: ModelMode;
  workshopDraft?: PromptBuilderDraft | undefined;
  workshopDrafts: Partial<Record<PromptIntent, PromptBuilderDraft>>;
  repository: CreativeAssetRepository;
  recordingActive: boolean;
  sessionModeLocked: boolean;
  recipeInsertionBlocked: boolean;
  hasReferenceImage: boolean;
  workshopToggleRef: RefObject<HTMLButtonElement | null>;
  shelfToggleRef: RefObject<HTMLButtonElement | null>;
  dockToggleRef: RefObject<HTMLButtonElement | null>;
  takeToggleRef: RefObject<HTMLButtonElement | null>;
  hasTake: boolean;
  onOpenDock(): void;
  onOpenTake(): void;
  onOpenWorkshop(): void;
  onToggleShelf(): void;
  onClose(source: Exclude<AuxiliaryPanel, 'closed'>): void;
  onLibraryModeChange(mode: ModelMode): void;
  onWorkshopDraftChange(draft: PromptBuilderDraft): void;
  onUseWorkshop(action: PromptWorkshopAction): void;
  onSaveWorkshop(action: SavePromptWorkshopAction): void;
  onShelfDirtyChange(dirty: boolean): void;
  onUseRecipe(selection: RecipeSelection): void;
  onOpenSavedWorkshop(draft: PromptBuilderDraft, asset: SavedCharacterPrompt): void;
};

export type CreativePanelContentProps = Pick<
  CreativeWorkspaceProps,
  | 'libraryMode'
  | 'workshopDraft'
  | 'workshopDrafts'
  | 'repository'
  | 'recordingActive'
  | 'sessionModeLocked'
  | 'recipeInsertionBlocked'
  | 'hasReferenceImage'
  | 'onLibraryModeChange'
  | 'onWorkshopDraftChange'
  | 'onUseWorkshop'
  | 'onSaveWorkshop'
  | 'onShelfDirtyChange'
  | 'onUseRecipe'
  | 'onOpenSavedWorkshop'
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
  sessionModeLocked,
  recipeInsertionBlocked,
  hasReferenceImage,
  onLibraryModeChange,
  onWorkshopDraftChange,
  onUseWorkshop,
  onSaveWorkshop,
  onShelfDirtyChange,
  onUseRecipe,
  onOpenSavedWorkshop,
  shelfController,
}: CreativePanelContentProps) => {
  const theme = useTheme();

  return (
    <div css={creativeOverlayContentStyles(theme, panel)}>
      {panel === 'workshop' ? (
        <CharacterPromptWorkshop
          initialDraft={workshopDraft}
          initialDrafts={workshopDrafts}
          hasReferenceImage={hasReferenceImage}
          disabled={recordingActive}
          onDraftChange={onWorkshopDraftChange}
          onUse={onUseWorkshop}
          onSave={onSaveWorkshop}
        />
      ) : (
        <>
          <div css={libraryModeStyles(theme)}>
            <SegmentedControl
              label="Recipe model"
              value={libraryMode}
              options={libraryModeOptions}
              disabled={sessionModeLocked}
              onChange={onLibraryModeChange}
            />
            {recipeInsertionBlocked ? (
              <StatusNotice role="status" tone="warning">
                {recordingActive
                  ? 'Finish the take before inserting a recipe. You can keep browsing and editing this shelf.'
                  : 'Release camera & mic before inserting a recipe for another model. You can keep browsing and editing this shelf.'}
              </StatusNotice>
            ) : null}
          </div>
          <RecipeShelfView
            activeMode={libraryMode}
            embedded
            promptUseDisabled={recipeInsertionBlocked}
            repository={repository}
            controller={shelfController}
            onDirtyChange={onShelfDirtyChange}
            onUsePrompt={onUseRecipe}
            onOpenCharacterWorkshop={onOpenSavedWorkshop}
          />
        </>
      )}
    </div>
  );
};

export const CreativeWorkspace = ({
  panel,
  activeSessionMode,
  libraryMode,
  workshopDraft,
  workshopDrafts,
  repository,
  recordingActive,
  sessionModeLocked,
  recipeInsertionBlocked,
  hasReferenceImage,
  workshopToggleRef,
  shelfToggleRef,
  dockToggleRef,
  takeToggleRef,
  hasTake,
  onOpenDock,
  onOpenTake,
  onOpenWorkshop,
  onToggleShelf,
  onClose,
  onLibraryModeChange,
  onWorkshopDraftChange,
  onUseWorkshop,
  onSaveWorkshop,
  onShelfDirtyChange,
  onUseRecipe,
  onOpenSavedWorkshop,
}: CreativeWorkspaceProps) => {
  const theme = useTheme();
  const characterWorkshopBlocked =
    recordingActive || (activeSessionMode !== 'lucy-2.5' && sessionModeLocked);
  const activePanel = panel === 'closed' ? null : panel;
  const shelfController = useRecipeShelfController({
    repository,
    activeMode: libraryMode,
    onUsePrompt: onUseRecipe,
    onOpenCharacterWorkshop: onOpenSavedWorkshop,
    onDirtyChange: onShelfDirtyChange,
  });

  return (
    <>
      <nav css={toolRailStyles(theme)} aria-label="Creative workspace tools">
        <Button
          ref={dockToggleRef}
          variant="secondary"
          disabled={recordingActive}
          aria-haspopup="dialog"
          onClick={onOpenDock}
        >
          Dock
        </Button>
        <Button
          ref={takeToggleRef}
          variant="secondary"
          disabled={!hasTake || recordingActive}
          aria-haspopup="dialog"
          onClick={onOpenTake}
        >
          Take
        </Button>
        <Button
          ref={workshopToggleRef}
          variant={panel === 'workshop' ? 'primary' : 'secondary'}
          disabled={characterWorkshopBlocked}
          aria-expanded={panel === 'workshop'}
          aria-haspopup="dialog"
          onClick={() => (panel === 'workshop' ? onClose('workshop') : onOpenWorkshop())}
        >
          Workshop
        </Button>
        <Button
          ref={shelfToggleRef}
          variant={panel === 'shelf' ? 'primary' : 'secondary'}
          disabled={recordingActive}
          aria-expanded={panel === 'shelf'}
          aria-haspopup="dialog"
          onClick={onToggleShelf}
        >
          Shelf
        </Button>
        <span title="Prompts persist in this browser profile; images and takes stay temporary.">
          Local-first workspace · private media stays temporary
        </span>
      </nav>

      <OverlayPanel
        open={activePanel !== null}
        onClose={() => {
          if (activePanel) onClose(activePanel);
        }}
        title={panel === 'workshop' ? 'Character Workshop' : 'Recipe Shelf'}
        description={
          panel === 'workshop'
            ? 'Build a clear character direction with the supported structured prompt fields.'
            : 'Browse and manage browser-local Character and Try-On recipes.'
        }
        placement={panel === 'shelf' ? 'bottom' : 'right'}
        size="wide"
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
            sessionModeLocked={sessionModeLocked}
            recipeInsertionBlocked={recipeInsertionBlocked}
            hasReferenceImage={hasReferenceImage}
            onLibraryModeChange={onLibraryModeChange}
            onWorkshopDraftChange={onWorkshopDraftChange}
            onUseWorkshop={onUseWorkshop}
            onSaveWorkshop={onSaveWorkshop}
            onShelfDirtyChange={onShelfDirtyChange}
            onUseRecipe={onUseRecipe}
            onOpenSavedWorkshop={onOpenSavedWorkshop}
            shelfController={shelfController}
          />
        ) : null}
      </OverlayPanel>
    </>
  );
};
