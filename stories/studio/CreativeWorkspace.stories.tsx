import { useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  CreativeWorkspace,
  type CreativeWorkspaceActions,
  type CreativeWorkspaceState,
} from '@web/studio/CreativeWorkspace';
import { StoryColumn } from '../support/StoryLayout';

const meta = {
  title: 'Studio/Creative Workspace',
  component: CreativeWorkspace,
  parameters: {
    docs: {
      description: {
        component:
          'CreativeWorkspace owns the desktop Character, Outfit, and Edit Video preparation rail, responsive overlay placement, and cross-feature locks. Retired Recipe Shelf and Prompt Workshop controls are intentionally absent.',
      },
    },
  },
} satisfies Meta<typeof CreativeWorkspace>;

export default meta;
type Story = StoryObj;

const WorkspaceHarness = () => {
  const editVideoToggleRef = useRef<HTMLButtonElement>(null);
  const characterToggleRef = useRef<HTMLButtonElement>(null);
  const outfitToggleRef = useRef<HTMLButtonElement>(null);

  const state: CreativeWorkspaceState = {
    activeTool: null,
    recordingActive: false,
    hasPlaybackVideo: true,
  };
  const actions: CreativeWorkspaceActions = {
    onOpenEditVideo: fn(),
    onOpenCharacter: fn(),
    onOpenOutfit: fn(),
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
          }}
        />
      </div>
    </StoryColumn>
  );
};

export const ToolRail: Story = {
  render: () => <WorkspaceHarness />,
};
