import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusNotice, Surface } from '@web/ui';
import { StoryColumn, StoryGrid } from '../support/StoryLayout';

const meta = {
  title: 'Primitives/Feedback and Surfaces',
  component: StatusNotice,
  subcomponents: { Surface },
  parameters: {
    docs: {
      description: {
        component:
          'StatusNotice communicates neutral, success, warning, and danger states. Surface supplies semantic containers with three tones and padding densities.',
      },
    },
  },
} satisfies Meta<typeof StatusNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoticeTones: Story = {
  render: () => (
    <StoryColumn>
      {(['neutral', 'success', 'warning', 'danger'] as const).map((tone) => (
        <StatusNotice key={tone} tone={tone} title={`${tone} notice`}>
          This message uses the production {tone} feedback palette.
        </StatusNotice>
      ))}
    </StoryColumn>
  ),
};

export const SurfaceSystem: Story = {
  render: () => (
    <StoryColumn>
      <StoryGrid>
        {(['default', 'soft', 'strong'] as const).map((tone) => (
          <Surface key={tone} tone={tone}>
            <h2>{tone}</h2>
            <p>Semantic studio surface with regular responsive padding.</p>
          </Surface>
        ))}
      </StoryGrid>
    </StoryColumn>
  ),
};
