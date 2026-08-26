import { defineConfig } from '@playwright/test';
import visualConfig, { VISUAL_BASE_URL } from './playwright.visual.config';

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
 * flags, the origin, the 0.5% tolerance — is inherited rather than restated, because a baseline
 * captured under settings that differ from the suite's is worse than no baseline at all.
 */
export default defineConfig({
  ...visualConfig,
  /*
   * Not the dev server: that runs on the host, outside this container, and is the caller's to start
   * and stop. This is the forwarder that republishes it on the container's own loopback, because
   * the e2e harness aborts every request whose host is not `127.0.0.1` or `localhost` — the guard
   * that proves the suite contacts no provider, so it is worked around rather than widened.
   *
   * Playwright polls the origin until it answers, which is also what proves the host's server
   * behind the forwarder came up. The container is `--rm`, so there is never one to reuse.
   */
  webServer: {
    command: `node scripts/loopback-forward.mjs ${new URL(VISUAL_BASE_URL).port}`,
    url: VISUAL_BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  /*
   * More patience, and only patience. A container shares the workstation's CPU with the dev server
   * it is driving, so readiness predicates that settle instantly on the host — a video reaching
   * `HAVE_METADATA`, a stage frame settling — can outrun the default five seconds. Waiting longer
   * changes no pixel; lowering a readiness bar would, which is why nothing here relaxes one.
   */
  timeout: 120_000,
  expect: { ...visualConfig.expect, timeout: 30_000 },
});
