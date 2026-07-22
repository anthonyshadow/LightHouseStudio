import { useTheme } from '@emotion/react';
import type { ModelModeId } from '@studio/domain';
import { lazy, Suspense, type RefObject } from 'react';
import type {
  ActiveRecipeIdentity,
  RecipeSelection,
} from '../features/creative-assets/RecipeShelf.types';
import {
  useRecipeShelfController,
  type RecipeShelfController,
} from '../features/creative-assets/useRecipeShelfController';
import type {
  CreativeAssetRepository,
  SavedCharacterPrompt,
} from '../features/creative-assets/types';
import type { StudioMode } from '../features/media-session';
import type {
  OptimizeWorkshopReferencePrompt,
  PromptWorkshopAction,
  SavePromptWorkshopAction,
  WorkshopReferenceGenerationInput,
} from '../features/prompt-authoring/CharacterPromptWorkshop';
import type {
  ReferenceGenerationState,
  WorkshopReferenceImage,
} from '../features/prompt-authoring/ReferenceImageGenerator';
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

export type AuxiliaryPanel = 'closed' | 'workshop' | 'shelf';
export type ModelMode = ModelModeId;

const libraryModeOptions = [
  { value: 'lucy-2.5', label: 'Character recipes', shortLabel: 'Character' },
  { value: 'lucy-vton-3', label: 'Try-on recipes', shortLabel: 'Try-On' },
] as const;

export type CreativeWorkspaceState = {
  panel: AuxiliaryPanel;
  activeSessionMode: StudioMode;
  libraryMode: ModelMode;
  workshopDraft?: PromptBuilderDraft | undefined;
  workshopDrafts: Partial<Record<PromptIntent, PromptBuilderDraft>>;
  recordingActive: boolean;
  sessionModeLocked: boolean;
  recipeInsertionBlocked: boolean;
  hasReferenceImage: boolean;
  workshopReferenceImage: WorkshopReferenceImage | null;
  referenceGeneration: ReferenceGenerationState;
  referenceImagesAvailable: boolean;
  referenceImageModel?: string | null;
  optimizerModel: string | null;
  optimizerVersion: string | null;
  referenceUsePending: boolean;
  referenceUseFailure: {
    message: string;
    onRetry: () => void;
    onContinueWithoutReference: () => void;
  } | null;
  legacyProjectCount?: number | undefined;
  activeRecipe?: ActiveRecipeIdentity | undefined;
  hasTake: boolean;
};

export type CreativeWorkspaceActions = {
  onOpenDock: () => void;
  onOpenTake: () => void;
  onOpenWorkshop: () => void;
  onToggleShelf: () => void;
  onClose: (source: Exclude<AuxiliaryPanel, 'closed'>) => void;
  onLibraryModeChange: (mode: ModelMode) => void;
  onWorkshopDraftChange: (draft: PromptBuilderDraft) => void;
  onUseWorkshop: (action: PromptWorkshopAction) => void;
  onSaveWorkshop: (action: SavePromptWorkshopAction) => void;
  onOptimizeReference: OptimizeWorkshopReferencePrompt;
  onGenerateReference: (
    input: WorkshopReferenceGenerationInput,
    signal: AbortSignal,
  ) => void | Promise<void>;
  onDetachReference: () => void;
  onRetryReferenceRestore?: (() => void) | undefined;
  onShelfDirtyChange: (dirty: boolean) => void;
  onUseRecipe: (selection: RecipeSelection) => void;
  onOpenSavedWorkshop: (draft: PromptBuilderDraft, asset: SavedCharacterPrompt) => void;
  onOpenLegacyProjects?: (() => void) | undefined;
};

export type CreativeWorkspaceRefs = {
  workshopToggleRef: RefObject<HTMLButtonElement | null>;
  shelfToggleRef: RefObject<HTMLButtonElement | null>;
  dockToggleRef: RefObject<HTMLButtonElement | null>;
  takeToggleRef: RefObject<HTMLButtonElement | null>;
  legacyManagerToggleRef?: RefObject<HTMLButtonElement | null> | undefined;
};

type CreativeWorkspaceProps = {
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
  | 'sessionModeLocked'
  | 'recipeInsertionBlocked'
  | 'hasReferenceImage'
  | 'workshopReferenceImage'
  | 'referenceGeneration'
  | 'referenceImagesAvailable'
  | 'referenceImageModel'
  | 'optimizerModel'
  | 'optimizerVersion'
  | 'referenceUsePending'
  | 'referenceUseFailure'
  | 'activeRecipe'
  | 'legacyManagerToggleRef'
  | 'legacyProjectCount'
  | 'onLibraryModeChange'
  | 'onWorkshopDraftChange'
  | 'onUseWorkshop'
  | 'onSaveWorkshop'
  | 'onOptimizeReference'
  | 'onGenerateReference'
  | 'onDetachReference'
  | 'onRetryReferenceRestore'
  | 'onShelfDirtyChange'
  | 'onUseRecipe'
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
  sessionModeLocked,
  recipeInsertionBlocked,
  hasReferenceImage,
  workshopReferenceImage,
  referenceGeneration,
  referenceImagesAvailable,
  referenceImageModel = null,
  optimizerModel,
  optimizerVersion,
  referenceUsePending,
  referenceUseFailure,
  activeRecipe,
  legacyManagerToggleRef,
  legacyProjectCount = 0,
  onLibraryModeChange,
  onWorkshopDraftChange,
  onUseWorkshop,
  onSaveWorkshop,
  onOptimizeReference,
  onGenerateReference,
  onDetachReference,
  onRetryReferenceRestore,
  onShelfDirtyChange,
  onUseRecipe,
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
            generatedReferenceImage={workshopReferenceImage}
            referenceGeneration={referenceGeneration}
            referenceImagesAvailable={referenceImagesAvailable}
            referenceImageModel={referenceImageModel}
            optimizerModel={optimizerModel}
            optimizerVersion={optimizerVersion}
            disabled={recordingActive || referenceUsePending}
            onDraftChange={onWorkshopDraftChange}
            onUse={onUseWorkshop}
            onSave={onSaveWorkshop}
            onOptimizeReference={onOptimizeReference}
            onGenerateReference={onGenerateReference}
            onDetachReference={onDetachReference}
            {...(onRetryReferenceRestore ? { onRetryReferenceRestore } : {})}
          />
        </Suspense>
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
            <Button
              size="small"
              variant="quiet"
              onClick={referenceUseFailure.onContinueWithoutReference}
            >
              Continue without reference
            </Button>
          </div>
        </StatusNotice>
      ) : null}
    </div>
  );
};

export const CreativeWorkspace = ({ repository, state, actions, refs }: CreativeWorkspaceProps) => {
  const {
    panel,
    activeSessionMode,
    libraryMode,
    workshopDraft,
    workshopDrafts,
    recordingActive,
    sessionModeLocked,
    recipeInsertionBlocked,
    hasReferenceImage,
    workshopReferenceImage,
    referenceGeneration,
    referenceImagesAvailable,
    referenceImageModel = null,
    optimizerModel,
    optimizerVersion,
    referenceUsePending,
    referenceUseFailure,
    legacyProjectCount = 0,
    activeRecipe,
    hasTake,
  } = state;
  const {
    onOpenDock,
    onOpenTake,
    onOpenWorkshop,
    onToggleShelf,
    onClose,
    onLibraryModeChange,
    onWorkshopDraftChange,
    onUseWorkshop,
    onSaveWorkshop,
    onOptimizeReference,
    onGenerateReference,
    onDetachReference,
    onRetryReferenceRestore,
    onShelfDirtyChange,
    onUseRecipe,
    onOpenSavedWorkshop,
    onOpenLegacyProjects,
  } = actions;
  const {
    workshopToggleRef,
    shelfToggleRef,
    dockToggleRef,
    takeToggleRef,
    legacyManagerToggleRef,
  } = refs;
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
    ...(activeRecipe !== undefined ? { activeRecipe } : {}),
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
        <span title="Prompts and generated references persist locally; manual uploads and takes stay temporary.">
          Local-first workspace · generated references persist locally
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
            workshopReferenceImage={workshopReferenceImage}
            referenceGeneration={referenceGeneration}
            referenceImagesAvailable={referenceImagesAvailable}
            referenceImageModel={referenceImageModel}
            optimizerModel={optimizerModel}
            optimizerVersion={optimizerVersion}
            referenceUsePending={referenceUsePending}
            referenceUseFailure={referenceUseFailure}
            {...(activeRecipe !== undefined ? { activeRecipe } : {})}
            {...(legacyManagerToggleRef ? { legacyManagerToggleRef } : {})}
            legacyProjectCount={legacyProjectCount}
            onLibraryModeChange={onLibraryModeChange}
            onWorkshopDraftChange={onWorkshopDraftChange}
            onUseWorkshop={onUseWorkshop}
            onSaveWorkshop={onSaveWorkshop}
            onOptimizeReference={onOptimizeReference}
            onGenerateReference={onGenerateReference}
            onDetachReference={onDetachReference}
            {...(onRetryReferenceRestore ? { onRetryReferenceRestore } : {})}
            onShelfDirtyChange={onShelfDirtyChange}
            onUseRecipe={onUseRecipe}
            onOpenSavedWorkshop={onOpenSavedWorkshop}
            {...(onOpenLegacyProjects ? { onOpenLegacyProjects } : {})}
            shelfController={shelfController}
          />
        ) : null}
      </OverlayPanel>
    </>
  );
};
