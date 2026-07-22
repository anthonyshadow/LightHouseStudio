import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const repositoryRoot = process.cwd();
const sourceRoots = ['apps', 'packages', 'e2e', 'scripts'];
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.mjs', '.js']);
const ignoredDirectories = new Set([
  'coverage',
  'dist',
  'graphify-out',
  'node_modules',
  'playwright-report',
  'screenshots',
  'test-results',
]);

const collectFiles = (entryPath, files) => {
  if (!fs.existsSync(entryPath)) return;
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) {
    if (sourceExtensions.has(path.extname(entryPath))) files.push(path.resolve(entryPath));
    return;
  }

  for (const entry of fs.readdirSync(entryPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ignoredDirectories.has(entry.name)) continue;
    collectFiles(path.join(entryPath, entry.name), files);
  }
};

const files = [];
for (const sourceRoot of sourceRoots) collectFiles(path.join(repositoryRoot, sourceRoot), files);
for (const entry of fs.readdirSync(repositoryRoot, { withFileTypes: true })) {
  if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) {
    files.push(path.join(repositoryRoot, entry.name));
  }
}

const fileSet = new Set(files);
const workspaceAliases = new Map([
  ['@studio/contracts', path.join(repositoryRoot, 'packages/contracts/src/index.ts')],
  ['@studio/domain', path.join(repositoryRoot, 'packages/domain/src/index.ts')],
]);
const edges = new Map(files.map((file) => [file, new Set()]));
const unresolved = [];
const boundaryViolations = [];

const areaFor = (file) => {
  const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
  for (const area of ['apps/api', 'apps/web', 'packages/contracts', 'packages/domain', 'e2e']) {
    if (relative === area || relative.startsWith(`${area}/`)) return area;
  }
  return 'root';
};

const allowedStudioImports = {
  'apps/api': new Set(['@studio/contracts', '@studio/domain']),
  'apps/web': new Set(['@studio/contracts', '@studio/domain']),
  e2e: new Set(['@studio/contracts', '@studio/domain']),
  'packages/contracts': new Set(),
  'packages/domain': new Set(),
  root: new Set(['@studio/contracts', '@studio/domain']),
};

const resolveRelative = (importer, specifier) => {
  const cleanSpecifier = specifier.split(/[?#]/u, 1)[0];
  if (!cleanSpecifier) return null;
  const rawTarget = path.resolve(path.dirname(importer), cleanSpecifier);
  const candidates = [rawTarget];
  const extension = path.extname(rawTarget);

  if (extension === '.js') {
    candidates.push(rawTarget.slice(0, -3) + '.ts', rawTarget.slice(0, -3) + '.tsx');
  } else if (!sourceExtensions.has(extension) && extension !== '.json') {
    for (const candidateExtension of sourceExtensions) {
      candidates.push(`${rawTarget}${candidateExtension}`);
      candidates.push(path.join(rawTarget, `index${candidateExtension}`));
    }
    candidates.push(`${rawTarget}.json`);
  }

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    return path.resolve(candidate);
  }
  return null;
};

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const imports = ts.preProcessFile(source, true, true).importedFiles;
  const sourceArea = areaFor(file);

  for (const imported of imports) {
    const specifier = imported.fileName;
    let target = null;
    if (specifier.startsWith('.')) {
      target = resolveRelative(file, specifier);
      if (!target) {
        unresolved.push(`${path.relative(repositoryRoot, file)} -> ${specifier}`);
        continue;
      }
    } else {
      const studioPackage = [...workspaceAliases.keys()].find(
        (name) => specifier === name || specifier.startsWith(`${name}/`),
      );
      if (!studioPackage) continue;
      if (!allowedStudioImports[sourceArea].has(studioPackage)) {
        boundaryViolations.push(
          `${path.relative(repositoryRoot, file)} cannot import ${specifier}`,
        );
      }
      target = workspaceAliases.get(studioPackage) ?? null;
    }

    if (!target) continue;
    const targetArea = areaFor(target);
    if (specifier.startsWith('.') && sourceArea !== 'root' && targetArea !== sourceArea) {
      boundaryViolations.push(
        `${path.relative(repositoryRoot, file)} crosses into ${path.relative(repositoryRoot, target)}`,
      );
    }
    if (fileSet.has(target)) edges.get(file)?.add(target);
  }
}

const cycles = [];
const visited = new Set();
const active = new Set();
const stack = [];
const cycleKeys = new Set();

const visit = (file) => {
  if (visited.has(file)) return;
  visited.add(file);
  active.add(file);
  stack.push(file);

  for (const target of edges.get(file) ?? []) {
    if (!visited.has(target)) {
      visit(target);
      continue;
    }
    if (!active.has(target)) continue;
    const start = stack.indexOf(target);
    const cycle = [...stack.slice(start), target].map((item) =>
      path.relative(repositoryRoot, item),
    );
    const key = [...new Set(cycle)].sort().join('|');
    if (!cycleKeys.has(key)) {
      cycleKeys.add(key);
      cycles.push(cycle.join(' -> '));
    }
  }

  stack.pop();
  active.delete(file);
};

for (const file of files) visit(file);

const failures = [
  ['Unresolved local imports', unresolved],
  ['Workspace boundary violations', boundaryViolations],
  ['Module cycles', cycles],
].filter(([, findings]) => findings.length > 0);

if (failures.length > 0) {
  for (const [heading, findings] of failures) {
    console.error(`\n${heading}:`);
    for (const finding of findings) console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  const edgeCount = [...edges.values()].reduce((total, targets) => total + targets.size, 0);
  console.log(`Module graph clean: ${files.length} files, ${edgeCount} local edges, zero cycles.`);
}
