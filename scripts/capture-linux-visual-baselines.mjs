import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import process from 'node:process';

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
 * - Inside the container the app is served on *its* loopback by `loopback-forward.mjs`, because the
 *   e2e harness blocks every request whose host is not `127.0.0.1` or `localhost`. That guard is
 *   how the suite proves it contacts no provider, so it is worked around here rather than widened.
 */
const PORT = 4173;
const IMAGE = 'mcr.microsoft.com/playwright:v1.62.1-noble';

const run = (command, args, options = {}) =>
  spawnSync(command, args, { stdio: 'inherit', ...options });

const waitForServer = async (url, attempts = 60) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return false;
};

export const captureLinuxVisualBaselines = async (passthrough = []) => {
  const root = path.resolve(import.meta.dirname, '..');

  if (run('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('Docker is unavailable. Start Docker and retry.');
  }

  if (run('bun', ['run', 'build:packages'], { cwd: root }).status !== 0) {
    throw new Error('Could not build the workspace packages the dev server needs.');
  }

  const server = spawn(
    'bunx',
    ['--bun', 'vite', '--host', '0.0.0.0', '--port', String(PORT), '--strictPort'],
    { cwd: path.join(root, 'apps', 'web'), stdio: 'ignore', detached: true },
  );

  try {
    if (!(await waitForServer(`http://127.0.0.1:${PORT}/`))) {
      throw new Error(`The dev server did not answer on port ${PORT}.`);
    }

    const containerCommand = [
      'node scripts/loopback-forward.mjs &',
      'sleep 1;',
      'npx playwright test --config playwright.visual.linux.config.ts',
      ...passthrough.map((argument) => JSON.stringify(argument)),
    ].join(' ');

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
      '-e',
      `VISUAL_BASE_URL=http://127.0.0.1:${PORT}`,
      IMAGE,
      'bash',
      '-lc',
      containerCommand,
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
    await Promise.race([
      once(server, 'close'),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
};

if (import.meta.filename === process.argv[1]) {
  captureLinuxVisualBaselines(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
