import { defineConfig } from '@playwright/test';
import { env } from 'node:process';
import visualConfig from './playwright.visual.config';

/**
 * The visual suite, run against a dev server that is already running somewhere else.
 *
 * `chromium-linux` baselines have to be produced by a Linux browser, and this repository's
 * `snapshotPathTemplate` derives that folder from the *runner's* platform — so the runner has to be
 * on Linux too, not just the browser. On a macOS workstation that means the pinned Playwright
 * container (`bun run test:visual:linux`), driving the host's dev server across the container
 * boundary.
 *
 * Everything that decides a pixel — viewports, colour scheme, locale, timezone, font-rendering
 * flags, the 0.5% tolerance — is inherited rather than restated, because a baseline captured under
 * settings that differ from the suite's is worse than no baseline at all.
 */
// Typed the way the sibling configs type it: `node:process` resolves to an error type here.
const baseUrl =
  (env as unknown as Readonly<Record<string, string | undefined>>).VISUAL_BASE_URL ??
  'http://host.docker.internal:4173';

export default defineConfig({
  ...visualConfig,
  // The server is the caller's to start and stop: it runs on the host, outside this container.
  webServer: undefined,
  /*
   * More patience, and only patience. A container shares the workstation's CPU with the dev server
   * it is driving, so readiness predicates that settle instantly on the host — a video reaching
   * `HAVE_METADATA`, a stage frame settling — can outrun the default five seconds. Waiting longer
   * changes no pixel; lowering a readiness bar would, which is why nothing here relaxes one.
   */
  timeout: 120_000,
  expect: { ...visualConfig.expect, timeout: 30_000 },
  use: {
    ...visualConfig.use,
    baseURL: baseUrl,
  },
});
