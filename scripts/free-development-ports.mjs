import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

/** `lsof` exits non-zero when nothing matches, which is an answer rather than a failure. */
const lsof = (args) => {
  try {
    return execFileSync('lsof', args, { encoding: 'utf8', timeout: 10_000 }).trim();
  } catch {
    return '';
  }
};

const listenersOn = (port) =>
  lsof(['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    .split('\n')
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);

const workingDirectory = (pid) => {
  const output = lsof(['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
  const line = output.split('\n').find((entry) => entry.startsWith('n'));
  return line === undefined ? null : line.slice(1);
};

const describe = (pid) => {
  try {
    return execFileSync('ps', ['-o', 'ppid=,lstart=,command=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 5_000,
    }).trim();
  } catch {
    return '';
  }
};

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * These are watch-mode dev servers: they have been observed to ignore `SIGTERM` and survive their
 * parent, which is how a run from days ago ends up holding today's port. Ask once, then insist.
 */
const stop = async (pid) => {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return true;
  }
  for (let attempt = 0; attempt < 8 && alive(pid); attempt += 1) await wait(250);
  if (!alive(pid)) return true;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    return !alive(pid);
  }
  await wait(250);
  return !alive(pid);
};

/** The ports the development servers bind, read from the files that decide them. */
export const developmentPorts = async (root = repositoryRoot) => {
  const environment = await readFile(path.join(root, '.env.development'), 'utf8').catch(() =>
    readFile(path.join(root, '.env'), 'utf8').catch(() => ''),
  );
  const api = /^PORT=(\d+)\s*$/mu.exec(environment)?.[1];
  const web = /--port\s+(\d+)/u.exec(
    JSON.parse(await readFile(path.join(root, 'apps', 'web', 'package.json'), 'utf8')).scripts
      ?.dev ?? '',
  )?.[1];
  return [
    { name: 'api', port: Number(api ?? 4100) },
    { name: 'web', port: Number(web ?? 4173) },
  ];
};

/**
 * This repository's own development servers, and nothing else.
 *
 * The working directory alone is far too generous — anything at all started from the repository
 * folder shares it, and a shell that happens to be sitting here is not a server to kill. So the
 * command has to name one of the two entrypoints as well.
 */
const DEVELOPMENT_SERVER_COMMANDS = [/\bsrc\/server\.ts\b/u, /\bnode_modules\/\.bin\/vite\b/u];

const ownedByRepository = (pid, root) => {
  const cwd = workingDirectory(pid);
  const insideRepository =
    cwd !== null && (cwd === root.replace(/\/$/u, '') || cwd.startsWith(root));
  if (!insideRepository) return false;
  const command = describe(pid);
  return DEVELOPMENT_SERVER_COMMANDS.some((pattern) => pattern.test(command));
};

export const freeDevelopmentPorts = async (root = repositoryRoot) => {
  const ports = await developmentPorts(root);
  const freed = [];
  const foreign = [];

  for (const { name, port } of ports) {
    for (const pid of listenersOn(port)) {
      if (pid === process.pid) continue;
      // Only ever this repository's own servers. Something else on the port is the operator's
      // business, and guessing wrong would kill work this script knows nothing about.
      if (!ownedByRepository(pid, root)) {
        foreign.push({ name, port, pid, detail: describe(pid) });
        continue;
      }
      freed.push({ name, port, pid, stopped: await stop(pid) });
    }
  }

  if (foreign.length > 0) {
    for (const entry of foreign) {
      console.error(
        `Port ${entry.port} (${entry.name}) is held by a process outside this repository:\n  ${entry.detail}`,
      );
    }
    console.error('Stop it yourself, or change the port, then run again. Nothing was killed.');
    return { ok: false, freed, foreign };
  }

  for (const entry of freed) {
    console.log(
      entry.stopped
        ? `Freed ${entry.name} port ${entry.port} (was pid ${entry.pid}).`
        : `Could not free ${entry.name} port ${entry.port}; pid ${entry.pid} survived.`,
    );
  }
  if (freed.length === 0)
    console.log(`Development ports are free: ${ports.map((entry) => entry.port).join(', ')}.`);
  return { ok: freed.every((entry) => entry.stopped), freed, foreign };
};

const calledDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (calledDirectly) {
  const result = await freeDevelopmentPorts();
  if (!result.ok) process.exitCode = 1;
}
