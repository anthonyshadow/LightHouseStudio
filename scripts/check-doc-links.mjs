import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const collectMarkdown = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectMarkdown(filePath)));
    else if (entry.name.endsWith('.md')) files.push(filePath);
  }
  return files;
};

export const markdownAnchorIds = (source) => {
  const anchors = new Set();
  const counts = new Map();
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
    const base = match[1]
      .toLowerCase()
      .replace(/<[^>]+>/gu, '')
      .replace(/[`*_~]/gu, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/gu, '-');
    if (!base) continue;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  for (const match of source.matchAll(/\bid=["']([^"']+)["']/giu)) anchors.add(match[1]);
  return anchors;
};

export const markdownLinkTargets = (source) =>
  [...source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)].map(
    (match) =>
      match[1]
        .trim()
        .replace(/^<|>$/gu, '')
        .split(/\s+["']/u, 1)[0],
  );

export const checkDocumentationLinks = async (rootDirectory = path.resolve('.')) => {
  const files = [path.join(rootDirectory, 'README.md'), path.join(rootDirectory, 'AGENTS.md')];
  files.push(...(await collectMarkdown(path.join(rootDirectory, 'docs'))));
  const sourceCache = new Map();
  const violations = [];

  for (const sourcePath of files) {
    const source = await readFile(sourcePath, 'utf8');
    sourceCache.set(sourcePath, source);
    for (const rawTarget of markdownLinkTargets(source)) {
      if (/^(?:https?:|mailto:|data:)/iu.test(rawTarget) || rawTarget.startsWith('/')) continue;
      const [rawFileTarget, rawAnchor] = rawTarget.split('#', 2);
      const fileTarget = decodeURIComponent(rawFileTarget ?? '');
      const targetPath = fileTarget
        ? path.resolve(path.dirname(sourcePath), fileTarget)
        : sourcePath;
      try {
        if (!(await stat(targetPath)).isFile()) throw new Error('not a file');
      } catch {
        violations.push(`${path.relative(rootDirectory, sourcePath)} -> ${rawTarget}`);
        continue;
      }
      if (rawAnchor) {
        const targetSource = sourceCache.get(targetPath) ?? (await readFile(targetPath, 'utf8'));
        sourceCache.set(targetPath, targetSource);
        const anchor = decodeURIComponent(rawAnchor).toLowerCase();
        if (!markdownAnchorIds(targetSource).has(anchor)) {
          violations.push(`${path.relative(rootDirectory, sourcePath)} -> ${rawTarget}`);
        }
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Broken documentation links:\n${violations.map((item) => `- ${item}`).join('\n')}`,
    );
  }
  return { checkedFiles: files.length };
};

const calledDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (calledDirectly) {
  try {
    const result = await checkDocumentationLinks();
    console.log(
      `Validated local links and anchors across ${result.checkedFiles} documentation files.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Documentation-link check failed.');
    process.exitCode = 1;
  }
}
