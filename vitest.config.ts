import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootPath = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@studio/domain': `${rootPath}packages/domain/src/index.ts`,
      '@studio/contracts': `${rootPath}packages/contracts/src/index.ts`,
      '@studio/testing': `${rootPath}packages/testing/src/index.ts`,
    },
  },
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.test.*', '**/dist/**', 'e2e/**'],
    },
  },
});
