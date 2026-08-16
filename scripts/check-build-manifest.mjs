import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BUILD_CLOSURE_BUDGETS = {
  'index.html': 345_000,
  // The authenticated Studio owns the intentionally shared TanStack Query remote-state runtime.
  // The guardrail's job is to keep optional surfaces lazy, not to freeze the shell: dialogs and
  // panels reachable only after a specific outcome belong in their own chunks (SaveVideoSuccessPanel,
  // SessionExpiryNotice, ConfirmationDialog), while session-lifecycle code that must run before any
  // of them — auth state, teardown holds, exit guards — is necessarily static.
  // Raised from 1_000_000 when session-expiry handling landed; the previous value had drifted to
  // 0.1% headroom, so it fired on any shell change at all rather than on a real regression.
  'src/studio/StudioApp.tsx': 1_050_000,
};

const forbiddenEntryDependencies = [
  /@decartai\/sdk|\bdecart\b/iu,
  /@mediabunny|\bmediabunny\b/iu,
  /aac-encoder/iu,
  /videoEditRender\.worker/iu,
];

export const staticManifestClosure = (manifest, rootKey) => {
  if (manifest[rootKey] === undefined) throw new Error(`Missing build-manifest entry: ${rootKey}.`);
  const closure = new Set();
  const visit = (key) => {
    if (closure.has(key)) return;
    const entry = manifest[key];
    if (entry === undefined) throw new Error(`Missing imported build-manifest entry: ${key}.`);
    closure.add(key);
    for (const imported of entry.imports ?? []) visit(imported);
  };
  visit(rootKey);
  return closure;
};

export const checkBuildManifest = async (
  outputDirectory = path.resolve('apps/web/dist'),
  budgets = BUILD_CLOSURE_BUDGETS,
) => {
  const manifestPath = path.join(outputDirectory, '.vite', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const results = [];

  for (const [rootKey, maximumBytes] of Object.entries(budgets)) {
    const closure = staticManifestClosure(manifest, rootKey);
    let byteLength = 0;
    for (const key of closure) {
      const entry = manifest[key];
      byteLength += (await stat(path.join(outputDirectory, entry.file))).size;
    }
    if (byteLength > maximumBytes) {
      throw new Error(
        `${rootKey} static closure is ${byteLength} bytes; its budget is ${maximumBytes} bytes.`,
      );
    }
    results.push({ rootKey, byteLength, maximumBytes });
  }

  const entryClosure = staticManifestClosure(manifest, 'index.html');
  for (const key of entryClosure) {
    const entry = manifest[key];
    const identity = `${key}\n${entry.src ?? ''}\n${entry.file}`;
    if (forbiddenEntryDependencies.some((pattern) => pattern.test(identity))) {
      throw new Error(`Provider/media-only chunk entered the / static closure: ${key}.`);
    }
  }
  return results;
};

const calledDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (calledDirectly) {
  try {
    const results = await checkBuildManifest();
    for (const result of results) {
      console.log(
        `${result.rootKey}: ${result.byteLength}/${result.maximumBytes} static bytes (${Math.round((result.byteLength / result.maximumBytes) * 100)}% of budget)`,
      );
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Build-manifest integrity check failed.',
    );
    process.exitCode = 1;
  }
}
