import type { Preview } from '@storybook/react-vite';
import { StudioDesignProvider } from '@web/ui';

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <StudioDesignProvider>
        <div
          css={(theme) => ({
            width: '100%',
            minHeight: '100dvh',
            padding: theme.space.lg,
            color: theme.colors.text,
            background: theme.gradients.shellAmbient,
          })}
        >
          <Story />
        </div>
      </StudioDesignProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    docs: {
      toc: true,
    },
    a11y: {
      test: 'error',
    },
    options: {
      storySort: {
        order: [
          'Foundations',
          'Primitives',
          'Features',
          [
            'Prompt Authoring',
            'Character Builder',
            'Creative Assets',
            'Media Session',
            'Recording',
            'Live Stage',
            'Voice Effects',
            'Take Review',
            'Legacy Projects',
          ],
          'Studio',
          'Flows',
        ],
      },
    },
  },
};

export default preview;
