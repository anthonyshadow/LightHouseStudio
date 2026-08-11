import { open, readdir, readFile } from 'node:fs/promises';
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

const inspectLinkedFile = async (filePath, readSource) => {
  const handle = await open(filePath, 'r');
  try {
    if (!(await handle.stat()).isFile()) throw new Error('not a file');
    return readSource ? await handle.readFile('utf8') : undefined;
  } finally {
    await handle.close();
  }
};

const withoutHtmlTags = (source) => {
  let result = '';
  let tagDepth = 0;
  let remainingTagEnds = 0;
  for (const character of source) {
    if (character === '>') remainingTagEnds += 1;
  }
  for (const character of source) {
    if (character === '<' && remainingTagEnds > 0) {
      tagDepth += 1;
    } else if (character === '>') {
      remainingTagEnds -= 1;
      if (tagDepth > 0) tagDepth -= 1;
      else result += character;
    } else if (tagDepth === 0) {
      result += character;
    }
  }
  return result;
};

export const markdownAnchorIds = (source) => {
  const anchors = new Set();
  const counts = new Map();
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
    const base = withoutHtmlTags(match[1])
      .toLowerCase()
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
      let targetSource = sourceCache.get(targetPath);
      try {
        const inspectedSource = await inspectLinkedFile(
          targetPath,
          rawAnchor !== undefined && targetSource === undefined,
        );
        targetSource ??= inspectedSource;
      } catch {
        violations.push(`${path.relative(rootDirectory, sourcePath)} -> ${rawTarget}`);
        continue;
      }
      if (rawAnchor) {
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
