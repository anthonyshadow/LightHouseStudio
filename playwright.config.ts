import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';

const runningInCi = Boolean((env as unknown as Readonly<Record<string, string | undefined>>).CI);

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/*.test.ts', '**/*.visual.spec.ts', '**/*.production.spec.ts'],
  fullyParallel: true,
  // Axe plus synthetic audio/video contexts are intentionally resource-heavy; cap concurrency so
  // the local dev server remains stable on laptops and CI runners.
  workers: 2,
  forbidOnly: runningInCi,
  retries: runningInCi ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      grepInvert: /@(cross-browser|touch)/u,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      grep: /@cross-browser/u,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile',
      grep: /@(cross-browser|touch)/u,
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !runningInCi,
    timeout: 120_000,
  },
});
