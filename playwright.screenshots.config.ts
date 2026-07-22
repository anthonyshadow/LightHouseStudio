import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';

const runningInCi = Boolean((env as unknown as Readonly<Record<string, string | undefined>>).CI);

export default defineConfig({
  testDir: './e2e',
  testMatch: /[/\\]e2e[/\\][^/\\]+\.screenshots\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: runningInCi,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        deviceScaleFactor: 1,
        launchOptions: {
          args: [
            '--disable-font-subpixel-positioning',
            '--disable-gpu',
            '--disable-lcd-text',
            '--disable-skia-runtime-opts',
            '--font-render-hinting=none',
            '--force-color-profile=srgb',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run build:packages && npm run dev --workspace @studio/web -- --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !runningInCi,
    timeout: 120_000,
  },
});
