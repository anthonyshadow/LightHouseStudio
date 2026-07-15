import { useTheme } from '@emotion/react';
import type { ReactNode, RefObject } from 'react';
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
  type PromptWorkshopAction,
  type SavePromptWorkshopAction,
} from '../features/prompt-authoring';
import { Button, SegmentedControl, StatusNotice } from '../ui';
import {
  auxiliaryStyles,
  creativePanelStyles,
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
  children?: ReactNode;
  panel: AuxiliaryPanel;
  activeSessionMode: StudioMode;
  libraryMode: ModelMode;
  workshopDraft?: PromptBuilderDraft | undefined;
  repository: CreativeAssetRepository;
  recordingActive: boolean;
  sessionModeLocked: boolean;
  recipeInsertionBlocked: boolean;
  hasReferenceImage: boolean;
  workshopToggleRef: RefObject<HTMLButtonElement | null>;
  shelfToggleRef: RefObject<HTMLButtonElement | null>;
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

export const CreativeWorkspace = ({
  children,
  panel,
  activeSessionMode,
  libraryMode,
  workshopDraft,
  repository,
  recordingActive,
  sessionModeLocked,
  recipeInsertionBlocked,
  hasReferenceImage,
  workshopToggleRef,
  shelfToggleRef,
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

  return (
    <>
      <nav css={toolRailStyles(theme)} aria-label="Creative workspace tools">
        <Button
          ref={workshopToggleRef}
          variant={panel === 'workshop' ? 'primary' : 'secondary'}
          disabled={characterWorkshopBlocked}
          aria-expanded={panel === 'workshop'}
          aria-controls="creative-tool-panel"
          onClick={() => (panel === 'workshop' ? onClose('workshop') : onOpenWorkshop())}
        >
          Character workshop
        </Button>
        <Button
          ref={shelfToggleRef}
          variant={panel === 'shelf' ? 'primary' : 'secondary'}
          disabled={recordingActive}
          aria-expanded={panel === 'shelf'}
          aria-controls="creative-tool-panel"
          onClick={onToggleShelf}
        >
          Recipe Shelf
        </Button>
        {panel !== 'closed' ? (
          <Button variant="quiet" onClick={() => onClose(panel)}>
            Close creative tool
          </Button>
        ) : null}
      </nav>

      <div css={auxiliaryStyles(theme)}>
        {panel !== 'closed' ? (
          <div id="creative-tool-panel" css={creativePanelStyles(theme)}>
            {panel === 'workshop' ? (
              <CharacterPromptWorkshop
                initialDraft={workshopDraft}
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
                </div>
                {recipeInsertionBlocked ? (
                  <StatusNotice role="status" tone="warning">
                    {recordingActive
                      ? 'Finish the take before inserting a recipe. You can keep browsing and editing this shelf.'
                      : 'Release camera & mic before inserting a recipe for another model. You can keep browsing and editing this shelf.'}
                  </StatusNotice>
                ) : null}
                <RecipeShelf
                  key={libraryMode}
                  repository={repository}
                  activeMode={libraryMode}
                  promptUseDisabled={recipeInsertionBlocked}
                  onDirtyChange={onShelfDirtyChange}
                  onUsePrompt={onUseRecipe}
                  onOpenCharacterWorkshop={onOpenSavedWorkshop}
                />
              </>
            )}
          </div>
        ) : null}
        {children}
      </div>
    </>
  );
};
