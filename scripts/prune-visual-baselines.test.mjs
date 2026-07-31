import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { VISUAL_BASELINE_PATHS, VISUAL_CASE_MATRIX } from '../e2e/studioVisualMatrix.ts';
import { curatedBaselines, inspectVisualBaselines } from './prune-visual-baselines.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('visual baseline pruning inventory', () => {
  it('shares the exact 28-case executable matrix', () => {
    expect(VISUAL_CASE_MATRIX).toHaveLength(28);
    expect(VISUAL_BASELINE_PATHS).toHaveLength(28);
    expect(new Set(VISUAL_BASELINE_PATHS).size).toBe(28);
    expect(curatedBaselines).toEqual(new Set(VISUAL_BASELINE_PATHS));
  });

  it('reports retained, missing, and removable files without pruning', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lightframe-visual-inventory-'));
    temporaryRoots.push(root);

    for (const platform of ['chromium-darwin', 'chromium-linux']) {
      for (const baseline of VISUAL_BASELINE_PATHS) {
        const target = path.join(root, platform, baseline);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, '');
      }
    }
    const extra = path.join(root, 'chromium-darwin', 'legacy', 'broad-capture.png');
    await mkdir(path.dirname(extra), { recursive: true });
    await writeFile(extra, '');

    const inventory = await inspectVisualBaselines(root);

    expect(inventory.platformFolders).toEqual(['chromium-darwin', 'chromium-linux']);
    expect(inventory.retained.size).toBe(56);
    expect(inventory.missing).toEqual([]);
    expect(inventory.removable).toEqual(['chromium-darwin/legacy/broad-capture.png']);
    await expect(readdirSafe(extra)).resolves.toBe(true);
  });
});

const readdirSafe = async (file) => {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
};
