import { readdir, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';

const screenshotsRoot = path.resolve('screenshots');
const viewportFolders = [
  '01-full-desktop-1440x960',
  '02-compact-desktop-1280x720',
  '03-tablet-portrait-834x1112',
  '04-mobile-portrait-390x844',
  '05-small-mobile-320x568',
];
const coreBaselines = [
  '01-studio/local-idle.png',
  '01-studio/local-recording.png',
  '01-studio/character-ai-live.png',
];
const focusedBaselines = [
  '01-studio/local-finalizing.png',
  '01-studio/stage-media-error.png',
  '01-studio/virtual-try-on-ai-live.png',
  '03-character-workshop/transform-character.png',
  '05-capture-settings/local-before-preview.png',
  '06-take-review/latest-take.png',
];

const retained = new Set(
  viewportFolders.flatMap((viewport) => coreBaselines.map((baseline) => `${viewport}/${baseline}`)),
);
for (const viewport of [viewportFolders[0], viewportFolders[4]]) {
  for (const baseline of focusedBaselines) retained.add(`${viewport}/${baseline}`);
}
if (retained.size !== 27) throw new Error(`Expected 27 curated baselines, got ${retained.size}.`);

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
await collect(screenshotsRoot);

const relativeFiles = new Set(files.map((file) => path.relative(screenshotsRoot, file)));
const missing = [...retained].filter((file) => !relativeFiles.has(file));
if (missing.length > 0) {
  throw new Error(`Refusing to prune before all curated baselines exist:\n${missing.join('\n')}`);
}

const removed = [];
for (const file of files) {
  const relative = path.relative(screenshotsRoot, file);
  if (retained.has(relative)) continue;
  await rm(file);
  removed.push(relative);
}
for (const directory of directories.toReversed()) {
  if (directory === screenshotsRoot) continue;
  await rmdir(directory).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOTEMPTY') return;
    throw error;
  });
}

console.log(
  `Retained ${retained.size} curated baselines and removed ${removed.length} broad captures.`,
);
