import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

const config: StorybookConfig = {
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.@(ts|tsx)'],
  staticDirs: ['../apps/web/public'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    defaultName: 'Documentation',
  },
  typescript: {
    reactDocgen: 'react-docgen',
    check: false,
  },
  viteFinal(viteConfig) {
    return {
      ...viteConfig,
      oxc: {
        jsx: {
          runtime: 'automatic',
          importSource: '@emotion/react',
        },
      },
      resolve: {
        ...viteConfig.resolve,
        alias: {
          ...viteConfig.resolve?.alias,
          '@web': `${projectRoot}/apps/web/src`,
          '@studio/domain': `${projectRoot}/packages/domain/src/index.ts`,
          '@studio/contracts': `${projectRoot}/packages/contracts/src/index.ts`,
        },
      },
    };
  },
};

export default config;
