import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootPath = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Before the barrel, so the more specific entry wins; it exists to keep the arrangement's
      // clip gestures out of the module graph of everything that imports the domain — see the
      // bundle ledger in `scripts/check-build-manifest.mjs`.
      '@studio/domain/composition': `${rootPath}packages/domain/src/composition/operations.ts`,
      '@studio/domain': `${rootPath}packages/domain/src/index.ts`,
      '@studio/contracts': `${rootPath}packages/contracts/src/index.ts`,
    },
  },
  test: {
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.ts', 'scripts/**/*.test.mjs'],
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
      exclude: [
        '**/*.test.*',
        'apps/api/src/test/bun-*-probe.ts',
        '**/*.d.ts',
        '**/dist/**',
        'e2e/**',
      ],
      thresholds: {
        statements: 81,
        branches: 69,
        functions: 82,
        lines: 83,
      },
    },
  },
});
