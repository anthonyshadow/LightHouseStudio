import { defineConfig, devices } from '@playwright/test';
import { env } from 'node:process';

const runningInCi = Boolean((env as unknown as Readonly<Record<string, string | undefined>>).CI);

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/*.test.ts', '**/*.visual.spec.ts', '**/*.production.spec.ts'],
  fullyParallel: true,
  /*
   * Axe plus synthetic audio/video contexts are intentionally resource-heavy; cap concurrency so
   * the local dev server remains stable on laptops and CI runners.
   *
   * One worker on a runner, where two WebKit contexts running media journeys on two cores is how
   * "Target page, context or browser has been closed" appears at the first interaction of tests
   * that touch nothing in common. That signature is a browser being killed, not a product failure,
   * and the same specs pass locally in seconds. A workstation keeps both workers.
   */
  workers: runningInCi ? 1 : 2,
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
    // CI supplies PostgreSQL as a service container, so the Docker Compose step inside `dev`
    // is neither needed nor available there.
    command: runningInCi ? 'bun run dev:ci' : 'bun run dev',
    /*
     * Ready means both servers. `dev` starts the API and Vite concurrently, and the web root
     * answers as soon as Vite binds, whether or not the API is up yet — so the specs that
     * authenticate against the real API rather than a route harness could begin against a stack
     * that is only half started, and would report a 502 login as if it were a product failure.
     * This path is served by Vite and answered by the API through its proxy, so it is 200 only
     * once both are up. The production smoke config gates on the same endpoint.
     */
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: !runningInCi,
    timeout: 120_000,
  },
});
