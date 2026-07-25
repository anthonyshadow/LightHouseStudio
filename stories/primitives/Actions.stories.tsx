import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { Button, IconButton } from '@web/ui';
import { StoryColumn, StoryGrid, StorySection } from '../support/StoryLayout';

const meta = {
  title: 'Primitives/Actions',
  component: Button,
  subcomponents: { IconButton },
  args: {
    children: 'Continue',
    onClick: fn(),
  },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'quiet', 'danger'] },
    size: { control: 'radio', options: ['small', 'regular'] },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Button and IconButton provide the studio action vocabulary, including semantic variants, compact sizing, busy state, native disabled behavior, and accessible icon-only labels.',
      },
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    variant: 'primary',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Continue' }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const AllVariants: Story = {
  render: () => (
    <StoryColumn>
      <StorySection title="Button variants">
        <StoryGrid>
          {(['primary', 'secondary', 'quiet', 'danger'] as const).map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
        </StoryGrid>
      </StorySection>
      <StorySection title="States">
        <StoryGrid>
          <Button disabled>Disabled</Button>
          <Button busy>Working…</Button>
          <Button size="small">Compact</Button>
          <IconButton label="Add reference image">
            <span aria-hidden="true">＋</span>
          </IconButton>
        </StoryGrid>
      </StorySection>
    </StoryColumn>
  ),
};
