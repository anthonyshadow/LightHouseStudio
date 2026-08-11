import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDockerComposeCommand } from './docker-compose-command.mjs';

const commands = {
  up: ['up', '-d', '--wait', 'postgres'],
  down: ['down'],
  logs: ['logs', 'postgres'],
  reset: ['down', '--volumes'],
};

const command = process.argv[2];
if (!(command in commands)) {
  throw new Error('Use development-compose.mjs with up, down, logs, or reset.');
}

const dockerConfig = path.resolve('.lightframe-data/docker-config');
await mkdir(dockerConfig, { recursive: true });
await writeFile(path.join(dockerConfig, 'config.json'), '{}\n', {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
}).catch((error) => {
  if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
});

const dockerContext = execFileSync('docker', ['context', 'show'], { encoding: 'utf8' }).trim();
const dockerHost = execFileSync(
  'docker',
  ['context', 'inspect', dockerContext, '--format', '{{.Endpoints.docker.Host}}'],
  { encoding: 'utf8' },
).trim();
const composeEnvironment = {
  ...process.env,
  DOCKER_CONFIG: dockerConfig,
  DOCKER_HOST: dockerHost,
};
const composeCommand = resolveDockerComposeCommand(({ executable, prefixArguments }) => {
  try {
    execFileSync(executable, [...prefixArguments, 'version'], {
      env: composeEnvironment,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
});

const child = spawn(
  composeCommand.executable,
  [...composeCommand.prefixArguments, '--env-file', 'compose.env', ...commands[command]],
  {
    cwd: process.cwd(),
    env: composeEnvironment,
    stdio: 'inherit',
  },
);
const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    if (signal !== null) reject(new Error(`Docker Compose stopped with signal ${signal}.`));
    else resolve(code ?? 1);
  });
});
process.exitCode = exitCode;
