import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { StudioDesignProvider, VisuallyHidden } from '@web/ui';
import { StoryColumn, StorySection } from '../support/StoryLayout';

const meta = {
  title: 'Primitives/Accessibility Utilities',
  component: VisuallyHidden,
  subcomponents: { StudioDesignProvider },
  args: {
    children: 'Screen-reader-only status',
  },
  parameters: {
    docs: {
      description: {
        component:
          'VisuallyHidden preserves semantic content for assistive technology without changing layout. StudioDesignProvider supplies the Emotion theme and production global reset used by every story.',
      },
    },
  },
} satisfies Meta<typeof VisuallyHidden>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ScreenReaderStatus: Story = {
  render: () => (
    <StoryColumn width="38rem">
      <StorySection title="Visible context">
        <p>The live region below remains in the accessibility tree but is visually clipped.</p>
        <VisuallyHidden>
          <span role="status">Character direction updated.</span>
        </VisuallyHidden>
      </StorySection>
    </StoryColumn>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(
      'Character direction updated.',
    );
  },
};
