import { useTheme } from '@emotion/react';
import type { RefObject } from 'react';
import {
  RecipeShelf,
  type CreativeAssetRepository,
  type RecipeSelection,
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
import { Button, OverlayPanel, SegmentedControl, StatusNotice, Surface } from '../ui';
import {
  creativeOverlayContentStyles,
  inlineCreativeBodyStyles,
  inlineCreativeHeaderStyles,
  inlineCreativePanelStyles,
  libraryModeStyles,
  mobileToolButtonStyles,
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
  renderPanelInOverlay?: boolean;
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
          <RecipeShelf
            key={libraryMode}
            repository={repository}
            activeMode={libraryMode}
            embedded
            promptUseDisabled={recipeInsertionBlocked}
            onDirtyChange={onShelfDirtyChange}
            onUsePrompt={onUseRecipe}
            onOpenCharacterWorkshop={onOpenSavedWorkshop}
          />
        </>
      )}
    </div>
  );
};

export type DesktopCreativePanelProps = CreativePanelContentProps & {
  onClose(): void;
};

export const DesktopCreativePanel = ({
  panel,
  onClose,
  ...contentProps
}: DesktopCreativePanelProps) => {
  const theme = useTheme();
  const title = panel === 'workshop' ? 'Character Workshop' : 'Recipe Shelf';
  const description =
    panel === 'workshop'
      ? 'Structured prompt builder'
      : 'Browser-local Character and Try-On recipes';
  const titleId = `creative-inline-${panel}-title`;

  return (
    <Surface
      as="section"
      aria-labelledby={titleId}
      padding="compact"
      css={inlineCreativePanelStyles(theme)}
    >
      <header css={inlineCreativeHeaderStyles(theme)}>
        <div>
          <h2 id={titleId} tabIndex={-1}>
            {title}
          </h2>
          <p>{description}</p>
        </div>
        <Button aria-label="Close creative tool" size="small" variant="quiet" onClick={onClose}>
          Close
        </Button>
      </header>
      <div css={inlineCreativeBodyStyles()}>
        <CreativePanelContent panel={panel} {...contentProps} />
      </div>
    </Surface>
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
  renderPanelInOverlay = true,
}: CreativeWorkspaceProps) => {
  const theme = useTheme();
  const characterWorkshopBlocked =
    recordingActive || (activeSessionMode !== 'lucy-2.5' && sessionModeLocked);
  const activePanel = panel === 'closed' ? null : panel;

  return (
    <>
      <nav css={toolRailStyles(theme)} aria-label="Creative workspace tools">
        <Button
          ref={dockToggleRef}
          css={mobileToolButtonStyles()}
          variant="secondary"
          disabled={recordingActive}
          aria-haspopup="dialog"
          onClick={onOpenDock}
        >
          Dock
        </Button>
        <Button
          ref={takeToggleRef}
          css={mobileToolButtonStyles()}
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
          aria-haspopup={renderPanelInOverlay ? 'dialog' : undefined}
          onClick={() => (panel === 'workshop' ? onClose('workshop') : onOpenWorkshop())}
        >
          Workshop
        </Button>
        <Button
          ref={shelfToggleRef}
          variant={panel === 'shelf' ? 'primary' : 'secondary'}
          disabled={recordingActive}
          aria-expanded={panel === 'shelf'}
          aria-haspopup={renderPanelInOverlay ? 'dialog' : undefined}
          onClick={onToggleShelf}
        >
          Shelf
        </Button>
        <span title="Prompts persist in this browser profile; images and takes stay temporary.">
          Local-first workspace · private media stays temporary
        </span>
      </nav>

      <OverlayPanel
        open={renderPanelInOverlay && activePanel !== null}
        onClose={() => {
          if (activePanel) onClose(activePanel);
        }}
        title={panel === 'workshop' ? 'Character Workshop' : 'Recipe Shelf'}
        description={
          panel === 'workshop'
            ? 'Build a clear character direction with the supported structured prompt fields.'
            : 'Browse and manage browser-local Character and Try-On recipes.'
        }
        placement={panel === 'shelf' ? 'fullscreen' : 'right'}
        size={panel === 'workshop' ? 'wide' : 'standard'}
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
          />
        ) : null}
      </OverlayPanel>
    </>
  );
};
