import { defineConfig, devices } from '@playwright/test';

const productionPort = 4180;
const baseURL = `http://127.0.0.1:${productionPort}`;
const productionSmokePasswordHash =
  '$argon2id$v=19$m=19456,t=2,p=1$WRvUgoh8fgWiicw0BRoQCA$WllCsxbSgWmQ89hYW4aBQiV6qmlu2OE8iau4RUpsz4A';

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
    command: `LIGHTFRAME_ENV_SOURCE=process NODE_ENV=production PORT=${productionPort} AUTH_JWT_SECRET=lightframe-production-smoke-signing-key-2026-only DEMO_AUTH_PREFILL=false DEMO_USER_PASSWORD=lightframe-demo DEMO_USER_PASSWORD_HASH='${productionSmokePasswordHash}' bun run start`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
