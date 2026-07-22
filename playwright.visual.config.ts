import { defineConfig, devices } from '@playwright/test';
import { env, platform } from 'node:process';

const runningInCi = Boolean((env as unknown as Readonly<Record<string, string | undefined>>).CI);
const snapshotPlatform = `chromium-${platform}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: /[/\\]studio\.visual\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: runningInCi,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/visual' }]],
  outputDir: 'test-results/visual',
  snapshotPathTemplate: `{testDir}/../screenshots/${snapshotPlatform}/{arg}{ext}`,
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.005,
    },
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
  projects: [{ name: snapshotPlatform }],
  webServer: {
    command: 'npm run build:packages && npm run dev --workspace @studio/web -- --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !runningInCi,
    timeout: 120_000,
  },
});
