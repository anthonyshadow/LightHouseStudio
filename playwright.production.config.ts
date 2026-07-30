import { defineConfig, devices } from '@playwright/test';

const productionPort = 4180;
const baseURL = `http://127.0.0.1:${productionPort}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /[/\\]studio\.production\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/production' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `NODE_ENV=production PORT=${productionPort} pnpm start`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
