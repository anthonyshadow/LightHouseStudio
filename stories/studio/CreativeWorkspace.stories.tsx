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
          'CreativeWorkspace owns the Dock, Take, Workshop, and Shelf tool rail plus the responsive overlay placement and cross-feature locks. The story uses the real Recipe Shelf controller with local-only fixture data.',
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
  const takeToggleRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);
  const shelfToggleRef = useRef<HTMLButtonElement>(null);

  const state: CreativeWorkspaceState = {
    panel,
    activeTool: panel === 'closed' ? 'dock' : panel,
    activeSessionMode: 'local',
    libraryMode: 'lucy-2.5',
    workshopDrafts: {},
    recordingActive: false,
    sessionModeLocked: false,
    recipeInsertionBlocked: false,
    hasReferenceImage: false,
    workshopReferenceImage: null,
    referenceGeneration: { status: 'idle', error: null },
    referenceImagesAvailable: false,
    optimizerModel: null,
    optimizerVersion: null,
    referenceUsePending: false,
    referenceUseFailure: null,
    legacyProjectCount: 2,
    hasTake: true,
  };
  const actions: CreativeWorkspaceActions = {
    onOpenDock: fn(),
    onOpenTake: fn(),
    onOpenWorkshop: () => setPanel('workshop'),
    onToggleShelf: () => setPanel((value) => (value === 'shelf' ? 'closed' : 'shelf')),
    onClose: () => setPanel('closed'),
    onLibraryModeChange: fn(),
    onWorkshopDraftChange: fn(),
    onUseWorkshop: fn(),
    onSaveWorkshop: fn(),
    onOptimizeReference: fn(() =>
      Promise.reject(new Error('Provider optimization is disabled in Storybook.')),
    ),
    onGenerateReference: fn(() => Promise.resolve()),
    onDetachReference: fn(),
    onShelfDirtyChange: fn(),
    onUseRecipe: fn(),
    onOpenSavedWorkshop: fn(),
    onOpenLegacyProjects: fn(),
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
          refs={{ dockToggleRef, takeToggleRef, workshopToggleRef, shelfToggleRef }}
        />
      </div>
    </StoryColumn>
  );
};

export const ToolRailAndShelf: Story = {
  render: () => <WorkspaceHarness />,
};
