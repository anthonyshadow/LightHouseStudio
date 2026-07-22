import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootPath = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@studio/domain': `${rootPath}packages/domain/src/index.ts`,
      '@studio/contracts': `${rootPath}packages/contracts/src/index.ts`,
    },
  },
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    ...(process.env.CI
      ? {
          reporters: ['default', 'junit'] as const,
          outputFile: { junit: 'test-results/unit/junit.xml' },
        }
      : {}),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'apps/api/src/**/*.ts',
        'apps/web/src/**/*.{ts,tsx}',
        'packages/contracts/src/**/*.ts',
        'packages/domain/src/**/*.ts',
      ],
      exclude: ['**/*.test.*', '**/*.d.ts', '**/dist/**', 'e2e/**'],
      thresholds: {
        statements: 81,
        branches: 69,
        functions: 82,
        lines: 83,
      },
    },
  },
});
