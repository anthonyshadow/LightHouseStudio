import type { Preview } from '@storybook/react-vite';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { createRemoteStateQueryClient } from '@web/application/remote-state/RemoteStateProvider';
import { StudioDesignProvider } from '@web/ui';

const StoryRemoteStateProvider = ({ children }: PropsWithChildren) => {
  const [queryClient] = useState(createRemoteStateQueryClient);
  useEffect(
    () => () => {
      queryClient.clear();
    },
    [queryClient],
  );
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <StoryRemoteStateProvider>
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
      </StoryRemoteStateProvider>
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
