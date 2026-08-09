import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const referencedRootScripts = (source) => {
  const commands = new Set();
  for (const match of source.matchAll(/\bbun\s+run\s+([a-z][a-z0-9:_-]*)/giu)) {
    const command = match[1];
    commands.add(command);
  }
  return commands;
};

const collectFiles = async (directory, extensions) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(filePath, extensions)));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(filePath);
  }
  return files;
};

export const checkScriptReferences = async (rootDirectory = path.resolve('.')) => {
  const packageJson = JSON.parse(await readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
  const scripts = new Set(Object.keys(packageJson.scripts ?? {}));
  const files = [path.join(rootDirectory, 'README.md'), path.join(rootDirectory, 'AGENTS.md')];
  files.push(...(await collectFiles(path.join(rootDirectory, 'docs'), ['.md'])));
  files.push(
    ...(await collectFiles(path.join(rootDirectory, '.github', 'workflows'), ['.yml', '.yaml'])),
  );

  const missing = [];
  for (const filePath of files) {
    const source = await readFile(filePath, 'utf8');
    for (const command of referencedRootScripts(source)) {
      if (!scripts.has(command)) missing.push({ command, filePath });
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Unknown root Bun commands:\n${missing
        .map(
          ({ command, filePath }) =>
            `- ${path.relative(rootDirectory, filePath)}: bun run ${command}`,
        )
        .join('\n')}`,
    );
  }
  return { checkedFiles: files.length };
};

const calledDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (calledDirectly) {
  try {
    const result = await checkScriptReferences();
    console.log(`Validated root Bun command references across ${result.checkedFiles} files.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Script-reference check failed.');
    process.exitCode = 1;
  }
}
