import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { developmentPorts } from './free-development-ports.mjs';

const repositoryLike = async (environment, webDevScript) => {
  const root = await mkdtemp(path.join(tmpdir(), 'lightframe-dev-ports-'));
  if (environment !== null) await writeFile(path.join(root, '.env.development'), environment);
  await mkdir(path.join(root, 'apps', 'web'), { recursive: true });
  await writeFile(
    path.join(root, 'apps', 'web', 'package.json'),
    JSON.stringify({ scripts: { dev: webDevScript } }),
  );
  return `${root}${path.sep}`;
};

describe('developmentPorts', () => {
  it('reads the ports from the files that decide them', async () => {
    const root = await repositoryLike(
      'DATABASE_MODE=postgres\nPORT=4100\n',
      'vite --host 127.0.0.1 --port 4173',
    );
    await expect(developmentPorts(root)).resolves.toEqual([
      { name: 'api', port: 4100 },
      { name: 'web', port: 4173 },
    ]);
  });

  it('follows those files when they move, rather than assuming the usual pair', async () => {
    const root = await repositoryLike('PORT=5200\n', 'vite --host 127.0.0.1 --port 5273');
    await expect(developmentPorts(root)).resolves.toEqual([
      { name: 'api', port: 5200 },
      { name: 'web', port: 5273 },
    ]);
  });

  it('falls back to the documented defaults when neither file states one', async () => {
    const root = await repositoryLike(null, 'vite --host 127.0.0.1');
    await expect(developmentPorts(root)).resolves.toEqual([
      { name: 'api', port: 4100 },
      { name: 'web', port: 4173 },
    ]);
  });
});
