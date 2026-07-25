import type { Meta, StoryObj } from '@storybook/react-vite';
import { studioTheme } from '@web/ui';
import { StoryColumn, StoryGrid, StorySection } from '../support/StoryLayout';

const meta = {
  title: 'Foundations/Design Tokens',
  parameters: {
    docs: {
      description: {
        component:
          'The production studio theme is the single source of truth for color, spacing, typography, radii, shadows, motion, responsive layout, and stacking layers.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const TokenValue = ({ name, value }: { name: string; value: string | number }) => (
  <div
    css={(theme) => ({
      display: 'grid',
      gap: theme.space.xxs,
      padding: theme.space.sm,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.radii.medium,
      background: theme.colors.surfaceSoft,
    })}
  >
    <strong>{name}</strong>
    <code css={(theme) => ({ color: theme.colors.textMuted, overflowWrap: 'anywhere' })}>
      {value}
    </code>
  </div>
);

export const Colors: Story = {
  render: () => (
    <StoryColumn>
      <StorySection
        title="Color system"
        description="Semantic colors are shown with their exact production values."
      >
        <StoryGrid>
          {Object.entries(studioTheme.colors).map(([name, value]) => (
            <div
              key={name}
              css={(theme) => ({
                overflow: 'hidden',
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.radii.medium,
                background: theme.colors.surface,
              })}
            >
              <div css={{ height: '6rem', background: value }} />
              <TokenValue name={name} value={value} />
            </div>
          ))}
        </StoryGrid>
      </StorySection>
    </StoryColumn>
  ),
};

export const Typography: Story = {
  render: () => (
    <StoryColumn>
      <StorySection title="Type families and scale">
        {Object.entries(studioTheme.type).map(([name, value]) => (
          <TokenValue key={name} name={name} value={value} />
        ))}
        {Object.entries(studioTheme.fontSizes).map(([name, value]) => (
          <p key={name} css={{ margin: 0, fontSize: value }}>
            {name} · Lightframe creator studio
          </p>
        ))}
      </StorySection>
    </StoryColumn>
  ),
};

export const SpacingRadiiAndShadows: Story = {
  render: () => (
    <StoryColumn>
      <StorySection title="Spacing">
        <StoryGrid>
          {Object.entries(studioTheme.space).map(([name, value]) => (
            <TokenValue key={name} name={name} value={value} />
          ))}
        </StoryGrid>
      </StorySection>
      <StorySection title="Radii and shadows">
        <StoryGrid>
          {Object.entries({ ...studioTheme.radii, ...studioTheme.shadows }).map(([name, value]) => (
            <div
              key={name}
              css={(theme) => ({
                minHeight: '8rem',
                padding: theme.space.md,
                display: 'grid',
                placeItems: 'center',
                borderRadius: name in studioTheme.radii ? value : theme.radii.large,
                background: theme.colors.surfaceStrong,
                boxShadow: name in studioTheme.shadows ? value : undefined,
              })}
            >
              <TokenValue name={name} value={value} />
            </div>
          ))}
        </StoryGrid>
      </StorySection>
    </StoryColumn>
  ),
};

export const MotionLayoutAndLayers: Story = {
  render: () => (
    <StoryColumn>
      <StorySection
        title="Motion, breakpoints, and layers"
        description="These tokens define interaction timing, responsive boundaries, and z-index ownership."
      >
        <StoryGrid>
          {Object.entries({
            ...studioTheme.motion,
            ...studioTheme.breakpoints,
            ...studioTheme.layers,
          }).map(([name, value]) => (
            <TokenValue key={name} name={name} value={value} />
          ))}
        </StoryGrid>
      </StorySection>
    </StoryColumn>
  ),
};
