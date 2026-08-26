import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { VISUAL_BASE_URL } from '../playwright.visual.config.ts';

/**
 * Regenerate the `chromium-linux` visual baselines from a macOS (or any non-Linux) workstation.
 *
 * The baseline folder is chosen by the *runner's* platform, not the browser's, so a Linux baseline
 * needs a Linux runner. This drives the pinned Playwright container against a dev server running
 * here on the host, which keeps the two platforms' baselines coming from one working tree and one
 * set of capture settings.
 *
 * Two details are load-bearing:
 *
 * - The dev server binds `0.0.0.0` so the container can reach it. The committed `dev` script binds
 *   loopback, which is right for everyday use and unreachable from a container.
 * - Inside the container the app is served on *its* loopback by `loopback-forward.mjs`, which the
 *   Linux config starts and waits for. The e2e harness blocks every request whose host is not
 *   `127.0.0.1` or `localhost`; that guard is how the suite proves it contacts no provider, so it
 *   is worked around rather than widened.
 */
const PORT = new URL(VISUAL_BASE_URL).port;

/*
 * The container's browser has to be the one the mounted `node_modules` drives, so the image tag is
 * read from the installed Playwright rather than written down beside it. A version bump that left
 * the two out of step would capture baselines from a different Chromium than CI compares them
 * with — silently, and only visible as a diff nobody can reproduce.
 */
const playwrightVersion = createRequire(import.meta.url)('@playwright/test/package.json').version;
const IMAGE = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;

const run = (command, args, options = {}) =>
  spawnSync(command, args, { stdio: 'inherit', ...options });

/** Resolves once the server answers, or rejects as soon as there is nothing left to wait for. */
const waitForServer = async (url, server) => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`The dev server exited before it answered on port ${PORT}.`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`The dev server did not answer on port ${PORT}.`);
};

const captureLinuxVisualBaselines = async (passthrough) => {
  const root = path.resolve(import.meta.dirname, '..');

  if (run('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('Docker is unavailable. Start Docker and retry.');
  }

  if (run('bun', ['run', 'build:packages'], { cwd: root }).status !== 0) {
    throw new Error('Could not build the workspace packages the dev server needs.');
  }

  const server = spawn(
    'bunx',
    ['--bun', 'vite', '--host', '0.0.0.0', '--port', PORT, '--strictPort'],
    {
      cwd: path.join(root, 'apps', 'web'),
      stdio: 'ignore',
      detached: true,
    },
  );

  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`, server);

    const result = run('docker', [
      'run',
      '--rm',
      '--add-host=host.docker.internal:host-gateway',
      '-v',
      `${root}:/work`,
      '-w',
      '/work',
      '-e',
      'CI=1',
      '-e',
      'HOME=/tmp',
      IMAGE,
      'npx',
      'playwright',
      'test',
      '--config',
      'playwright.visual.linux.config.ts',
      ...passthrough,
    ]);

    if (result.status !== 0) throw new Error('The Linux visual run reported failures.');
  } finally {
    if (server.pid !== undefined) {
      try {
        process.kill(-server.pid);
      } catch {
        server.kill();
      }
    }
  }
};

captureLinuxVisualBaselines(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
