import type { Meta, StoryObj } from '@storybook/react-vite';
import { LegacyProjectManager } from '@web/features/legacy-projects/LegacyProjectManager';
import { createLegacyProjectRepository, readyProjectStorage } from '../../fixtures/legacyProjects';
import { StoryColumn } from '../../support/StoryLayout';

const meta = {
  title: 'Features/Legacy Projects/Project Manager',
  component: LegacyProjectManager,
  args: {
    repository: createLegacyProjectRepository(),
    storage: readyProjectStorage,
  },
  parameters: {
    docs: {
      description: {
        component:
          'The compatibility project manager lists older guided-flow projects, communicates storage health, restores focus for destructive confirmation, and exposes explicit download/delete actions.',
      },
    },
  },
} satisfies Meta<typeof LegacyProjectManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SavedProjects: Story = {
  render: (args) => (
    <StoryColumn width="58rem">
      <LegacyProjectManager {...args} />
    </StoryColumn>
  ),
};

export const SessionOnlyStorage: Story = {
  args: {
    repository: createLegacyProjectRepository(),
    storage: {
      health: 'session-only',
      durable: false,
      notice: 'Projects are available only until this tab closes.',
    },
  },
  render: (args) => (
    <StoryColumn width="58rem">
      <LegacyProjectManager {...args} />
    </StoryColumn>
  ),
};
