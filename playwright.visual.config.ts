import { defineConfig, devices } from '@playwright/test';
import { env, platform } from 'node:process';

const runningInCi = Boolean((env as unknown as Readonly<Record<string, string | undefined>>).CI);
const snapshotPlatform = `chromium-${platform}`;

/**
 * Where the suite expects the app, owned once.
 *
 * The dev server, the readiness probe and the harness's own "no provider traffic" guard all have to
 * agree on this origin, and the Linux capture adds a container forwarder that has to publish it.
 * Read it, do not restate it.
 */
export const VISUAL_BASE_URL = 'http://127.0.0.1:4173';

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
    baseURL: VISUAL_BASE_URL,
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
    command: 'bun run build:packages && bun run --filter @studio/web dev -- --strictPort',
    url: VISUAL_BASE_URL,
    reuseExistingServer: !runningInCi,
    timeout: 120_000,
  },
});
