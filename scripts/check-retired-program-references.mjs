import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const retiredTerm = new RegExp(`\\b${'pi' + 'lot'}\\b`, 'giu');
const retiredPhrases = [
  new RegExp(`controlled-${'pi' + 'lot'}`, 'giu'),
  new RegExp(`moderated ${'co' + 'hort'}`, 'giu'),
  new RegExp(`${'parti' + 'cipant'} ${'retire' + 'ment'}`, 'giu'),
  new RegExp(`${'pi' + 'lot'} (?:evidence|qualification)`, 'giu'),
];
const allowedCreativeFixtures = new Map([
  [
    'apps/web/src/orchestration/session/useStudioSession.test.tsx',
    ['An adult copper-haired space ' + ('pi' + 'lot')],
  ],
  [
    'apps/api/src/providers/openai/character-prompt-optimizer.test.ts',
    ['A violet-haired ' + ('pi' + 'lot') + ' in a white flight suit'],
  ],
]);
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

export const checkRetiredProgramReferences = async (rootDirectory = path.resolve('.')) => {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: rootDirectory,
      encoding: 'buffer',
    },
  );
  const files = stdout
    .toString('utf8')
    .split('\0')
    .filter((file) => file && textExtensions.has(path.extname(file)));
  const violations = [];

  for (const relativePath of files) {
    let source;
    try {
      source = await readFile(path.join(rootDirectory, relativePath), 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
    for (const allowed of allowedCreativeFixtures.get(relativePath) ?? []) {
      const index = source.indexOf(allowed);
      if (index < 0) {
        violations.push(`${relativePath}: expected creative fixture is missing`);
      } else {
        source = `${source.slice(0, index)}${source.slice(index + allowed.length)}`;
      }
    }
    for (const pattern of [retiredTerm, ...retiredPhrases]) {
      pattern.lastIndex = 0;
      if (pattern.test(source)) violations.push(`${relativePath}: ${pattern.source}`);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Retired-program references remain:\n${violations.map((item) => `- ${item}`).join('\n')}`,
    );
  }
  return { checkedFiles: files.length };
};

const calledDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (calledDirectly) {
  try {
    const result = await checkRetiredProgramReferences();
    console.log(
      `Validated retired-program removal across ${result.checkedFiles} tracked text files.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Retired-program check failed.');
    process.exitCode = 1;
  }
}
