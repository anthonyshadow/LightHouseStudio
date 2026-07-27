import { readdir, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { VISUAL_BASELINE_PATHS } from '../e2e/studioVisualMatrix.ts';

const DEFAULT_SCREENSHOTS_ROOT = path.resolve('screenshots');

export const curatedBaselines = new Set(VISUAL_BASELINE_PATHS);

if (curatedBaselines.size !== 29) {
  throw new Error(`Expected 29 curated baselines, got ${curatedBaselines.size}.`);
}

const collectFiles = async (root) => {
  const files = [];
  const directories = [];
  const collect = async (directory) => {
    directories.push(directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(target);
      else if (entry.isFile()) files.push(target);
    }
  };
  await collect(root);
  return { directories, files };
};

export const inspectVisualBaselines = async (screenshotsRoot = DEFAULT_SCREENSHOTS_ROOT) => {
  const platformFolders = (await readdir(screenshotsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
    .map((entry) => entry.name)
    .sort();
  if (platformFolders.length === 0) {
    throw new Error('No platform-specific visual baselines found.');
  }

  const retained = new Set(
    platformFolders.flatMap((platformFolder) =>
      [...curatedBaselines].map((baseline) => `${platformFolder}/${baseline}`),
    ),
  );
  const { directories, files } = await collectFiles(screenshotsRoot);
  const relativeFiles = new Set(files.map((file) => path.relative(screenshotsRoot, file)));

  return {
    directories,
    files,
    platformFolders,
    retained,
    missing: [...retained].filter((file) => !relativeFiles.has(file)),
    removable: [...relativeFiles].filter((file) => !retained.has(file)),
  };
};

export const pruneVisualBaselines = async (screenshotsRoot = DEFAULT_SCREENSHOTS_ROOT) => {
  const inventory = await inspectVisualBaselines(screenshotsRoot);
  if (inventory.missing.length > 0) {
    throw new Error(
      `Refusing to prune before all curated baselines exist:\n${inventory.missing.join('\n')}`,
    );
  }

  for (const relative of inventory.removable) {
    await rm(path.join(screenshotsRoot, relative));
  }
  for (const directory of inventory.directories.toReversed()) {
    if (directory === screenshotsRoot) continue;
    await rmdir(directory).catch((error) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOTEMPTY') return;
      throw error;
    });
  }
  return inventory;
};

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  const checkOnly = process.argv.includes('--check');
  const inventory = await inspectVisualBaselines();
  if (inventory.missing.length > 0) {
    throw new Error(`Visual baseline inventory is incomplete:\n${inventory.missing.join('\n')}`);
  }
  if (checkOnly) {
    console.log(
      `Verified ${curatedBaselines.size} curated baselines across ${inventory.platformFolders.length} platforms; ${inventory.removable.length} non-curated files would be pruned.`,
    );
  } else {
    await pruneVisualBaselines();
    console.log(
      `Retained ${inventory.retained.size} curated baselines across ${inventory.platformFolders.length} platforms and removed ${inventory.removable.length} broad captures.`,
    );
  }
}
