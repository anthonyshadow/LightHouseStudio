import { useMemo, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  CreativePanelContent,
  CreativeWorkspace,
  type AuxiliaryPanel,
  type CreativeWorkspaceActions,
  type CreativeWorkspaceState,
} from '@web/studio/CreativeWorkspace';
import { createSeededCreativeAssetRepository } from '../fixtures/creativeAssets';
import { StoryColumn } from '../support/StoryLayout';

const meta = {
  title: 'Studio/Creative Workspace',
  component: CreativeWorkspace,
  subcomponents: { CreativePanelContent },
  parameters: {
    docs: {
      description: {
        component:
          'CreativeWorkspace owns the desktop Character, Outfit, and Workshop preparation rail plus Dock, Edit Video, and Shelf, responsive overlay placement, and cross-feature locks. The story uses the real Recipe Shelf controller with local-only fixture data.',
      },
    },
  },
} satisfies Meta<typeof CreativeWorkspace>;

export default meta;
type Story = StoryObj;

const WorkspaceHarness = () => {
  const repository = useMemo(() => createSeededCreativeAssetRepository(), []);
  const [panel, setPanel] = useState<AuxiliaryPanel>('shelf');
  const dockToggleRef = useRef<HTMLButtonElement>(null);
  const editVideoToggleRef = useRef<HTMLButtonElement>(null);
  const characterToggleRef = useRef<HTMLButtonElement>(null);
  const outfitToggleRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);

  const state: CreativeWorkspaceState = {
    panel,
    activeTool: panel === 'closed' ? 'dock' : panel,
    showDesktopAiTools: true,
    activeSessionMode: 'local',
    libraryMode: 'lucy-latest',
    workshopDrafts: {},
    recordingActive: false,
    sessionModeLocked: false,
    recipeInsertionBlocked: false,
    hasReferenceImage: false,
    referenceUsePending: false,
    referenceUseFailure: null,
    recipeShelfEntryIntent: null,
    hasPlaybackVideo: true,
  };
  const actions: CreativeWorkspaceActions = {
    onOpenDock: fn(),
    onOpenEditVideo: fn(),
    onOpenCharacter: fn(),
    onOpenOutfit: fn(),
    onOpenWorkshop: () => setPanel('workshop'),
    onToggleShelf: () => setPanel((value) => (value === 'shelf' ? 'closed' : 'shelf')),
    onClose: () => setPanel('closed'),
    onLibraryModeChange: fn(),
    onWorkshopDraftChange: fn(),
    onUseWorkshop: fn(),
    onSaveWorkshop: fn(),
    onShelfDirtyChange: fn(),
    onRecipeShelfEntryIntentConsumed: fn(),
    onUseRecipe: fn(),
    onCreateOutfit: fn(),
    onEditOutfit: fn(),
    onSaveOutfitCopy: fn(),
    onOpenSavedWorkshop: fn(),
  };

  return (
    <StoryColumn width="82rem">
      <div
        css={(theme) => ({
          position: 'relative',
          height: '34rem',
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.large,
          background: theme.gradients.stageIdle,
        })}
      >
        <CreativeWorkspace
          repository={repository}
          state={state}
          actions={actions}
          refs={{
            dockToggleRef,
            editVideoToggleRef,
            characterToggleRef,
            outfitToggleRef,
            workshopToggleRef,
            shelfToggleRef,
          }}
        />
      </div>
    </StoryColumn>
  );
};

export const ToolRailAndShelf: Story = {
  render: () => <WorkspaceHarness />,
};
