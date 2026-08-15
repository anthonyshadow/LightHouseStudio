import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  CreativePanelContent,
  CreativeWorkspace,
  type AuxiliaryPanel,
  type CreativeWorkspaceActions,
  type CreativeWorkspaceState,
} from '@web/studio/CreativeWorkspace';
import { StoryColumn } from '../support/StoryLayout';

const meta = {
  title: 'Studio/Creative Workspace',
  component: CreativeWorkspace,
  subcomponents: { CreativePanelContent },
  parameters: {
    docs: {
      description: {
        component:
          'CreativeWorkspace owns the desktop Character, Outfit, Workshop, and Edit Video preparation rail, responsive overlay placement, and cross-feature locks. Retired Recipe Shelf controls are intentionally absent.',
      },
    },
  },
} satisfies Meta<typeof CreativeWorkspace>;

export default meta;
type Story = StoryObj;

const WorkspaceHarness = () => {
  const [panel, setPanel] = useState<AuxiliaryPanel>('closed');
  const editVideoToggleRef = useRef<HTMLButtonElement>(null);
  const characterToggleRef = useRef<HTMLButtonElement>(null);
  const outfitToggleRef = useRef<HTMLButtonElement>(null);
  const workshopToggleRef = useRef<HTMLButtonElement>(null);

  const state: CreativeWorkspaceState = {
    panel,
    activeTool: panel === 'closed' ? null : panel,
    showDesktopAiTools: true,
    activeSessionMode: 'local',
    workshopDrafts: {},
    recordingActive: false,
    sessionModeLocked: false,
    hasReferenceImage: false,
    referenceUsePending: false,
    referenceUseFailure: null,
    hasPlaybackVideo: true,
  };
  const actions: CreativeWorkspaceActions = {
    onOpenEditVideo: fn(),
    onOpenCharacter: fn(),
    onOpenOutfit: fn(),
    onOpenWorkshop: () => setPanel('workshop'),
    onClose: () => setPanel('closed'),
    onWorkshopDraftChange: fn(),
    onUseWorkshop: fn(),
    onSaveWorkshop: fn(),
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
          state={state}
          actions={actions}
          refs={{
            editVideoToggleRef,
            characterToggleRef,
            outfitToggleRef,
            workshopToggleRef,
          }}
        />
      </div>
    </StoryColumn>
  );
};

export const ToolRail: Story = {
  render: () => <WorkspaceHarness />,
};
