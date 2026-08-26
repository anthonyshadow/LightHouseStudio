import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  H264_DEPENDENT_SCENARIO_IDS,
  VISUAL_BASELINE_PATHS,
  VISUAL_CASE_MATRIX,
  platformBaselinePaths,
} from '../e2e/studioVisualMatrix.ts';
import { curatedBaselines, inspectVisualBaselines } from './prune-visual-baselines.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe('visual baseline pruning inventory', () => {
  it('shares the exact 50-case executable matrix', () => {
    expect(VISUAL_CASE_MATRIX).toHaveLength(50);
    expect(VISUAL_BASELINE_PATHS).toHaveLength(50);
    expect(new Set(VISUAL_BASELINE_PATHS).size).toBe(50);
    expect(curatedBaselines).toEqual(new Set(VISUAL_BASELINE_PATHS));
  });

  it('expects a platform to hold only the baselines its browser can produce', () => {
    // Darwin's browser has H.264, so it is expected to hold the whole matrix.
    expect(platformBaselinePaths('chromium-darwin')).toHaveLength(50);
    // Linux's pinned browser does not, so the 19 cases behind that gate are expected to be absent.
    expect(platformBaselinePaths('chromium-linux')).toHaveLength(31);
    /*
     * Written out rather than derived from the same filter the subject uses: a stale id moves both
     * sides of a derived comparison together and proves nothing. Every named scenario has to still
     * be in the matrix, or the suite stops skipping a case Linux cannot run while the inventory
     * starts expecting a baseline nothing there can produce.
     */
    const matrixIds = new Set(VISUAL_CASE_MATRIX.map(({ scenario }) => scenario.id));
    expect([...H264_DEPENDENT_SCENARIO_IDS].filter((id) => !matrixIds.has(id))).toEqual([]);
  });

  it('reports retained, missing, and removable files without pruning', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lightframe-visual-inventory-'));
    temporaryRoots.push(root);

    for (const platform of ['chromium-darwin', 'chromium-linux']) {
      for (const baseline of platformBaselinePaths(platform)) {
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
    expect(inventory.retained.size).toBe(
      platformBaselinePaths('chromium-darwin').length +
        platformBaselinePaths('chromium-linux').length,
    );
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
