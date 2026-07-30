import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const CHECKER_PATH = fileURLToPath(new URL('./check-module-graph.mjs', import.meta.url));
const temporaryRoots = [];

const writeFixture = async (root, relativePath, source) => {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
};

const runChecker = (root) =>
  spawnSync(process.execPath, [CHECKER_PATH], {
    cwd: root,
    encoding: 'utf8',
  });

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('module graph checker', () => {
  it('scans Storybook roots and resolves @web imports into the web graph', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lightframe-module-graph-'));
    temporaryRoots.push(root);

    await Promise.all([
      writeFixture(root, 'apps/web/src/example.ts', 'export const example = true;\n'),
      writeFixture(
        root,
        'stories/Example.stories.ts',
        "import { example } from '@web/example';\nexport default { example };\n",
      ),
      writeFixture(
        root,
        '.storybook/preview.ts',
        "import { example } from '@web/example';\nexport default { example };\n",
      ),
    ]);

    const result = runChecker(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Module graph clean: 3 files, 2 local edges, zero cycles.');
  });

  it('reports cycles contained in the stories root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lightframe-module-graph-'));
    temporaryRoots.push(root);

    await Promise.all([
      writeFixture(root, 'stories/first.ts', "import './second';\n"),
      writeFixture(root, 'stories/second.ts', "import './first';\n"),
    ]);

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Module cycles:');
    expect(result.stderr).toContain('stories/first.ts -> stories/second.ts -> stories/first.ts');
  });
});
