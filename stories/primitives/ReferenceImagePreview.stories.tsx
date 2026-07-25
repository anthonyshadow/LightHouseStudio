import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReferenceImagePreview } from '@web/ui';
import { StoryColumn, StorySection } from '../support/StoryLayout';

const meta = {
  title: 'Primitives/Reference Image Preview',
  component: ReferenceImagePreview,
  args: {
    assetId: 'storybook-missing-reference',
    alt: 'Generated character reference',
    label: 'Open generated character reference',
  },
  parameters: {
    docs: {
      description: {
        component:
          'ReferenceImagePreview loads immutable local reference assets through the application content endpoint, opens a keyboard-accessible large preview, and provides an explicit unavailable/retry state.',
      },
    },
  },
} satisfies Meta<typeof ReferenceImagePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnavailableFallback: Story = {
  render: (args) => (
    <StoryColumn width="32rem">
      <StorySection title="Reference asset">
        <ReferenceImagePreview {...args} />
      </StorySection>
    </StoryColumn>
  ),
};

export const PanelSize: Story = {
  args: { size: 'panel' },
  render: (args) => (
    <StoryColumn width="32rem">
      <ReferenceImagePreview {...args} />
    </StoryColumn>
  ),
};
