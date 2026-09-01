import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BUILD_CLOSURE_BUDGETS = {
  'index.html': 345_000,
  // What every authenticated route pays. The shell owns the intentionally shared TanStack Query
  // remote-state runtime and the session lifecycle — auth state, teardown holds — which must run
  // before anything they protect and is therefore necessarily static. Its budget is deliberately
  // tight, unlike the others: growth here is paid on the Dashboard, on Assets and on every Project
  // list, so a regression is exactly what this number exists to catch.
  //
  // Raised from 720_000 on 2026-08-25, once and deliberately. The UI/UX plan's design-system
  // consolidation replaced five parallel icon sets with one `AppIcon`, which moves a handful of
  // glyphs that only the lazy editor draws into what every route loads — the price of a product
  // that draws one icon per concept. Everything recoverable was recovered first: the Settings
  // panel loads on first open rather than with the shell, and the skeleton, collapsed-section and
  // loading-placeholder primitives left the `ui` barrel for deep imports, because only lazy routes
  // use them and the shell imports that barrel. Those two together gave back 5_836 bytes.
  // `FORBIDDEN_CLOSURE_DEPENDENCIES` is the half that must never be relaxed, and was not.
  //
  // Raised again from 726_000 on 2026-08-28, by 1_000. Every text field in the product now declines
  // browser and password-manager suggestions by default, which is three properties on one object in
  // `FormControls` — 53 bytes over the previous ceiling. Nothing was recoverable this time: the
  // field primitives are what the shell renders, so the constant is in this closure by definition,
  // and the two `data-*` attributes are the half that actually stops a manager offering what was
  // typed into another Project. `FORBIDDEN_CLOSURE_DEPENDENCIES` again untouched.
  //
  // Raised again from 727_000 on 2026-09-01, by 1_000. The primary navigation became real anchors:
  // the rail, the compact bar and the brand are the router's `Link` rather than buttons calling
  // `navigate`, which is what gives an operator middle-click, copy-link and open-in-new-tab on the
  // five destinations they use most, and states them as links to assistive technology. That pulled
  // `Link` into a closure nothing had needed it in — 252 bytes over the previous ceiling, and the
  // navigation is the shell by definition, so there is no lazy boundary to move it behind. What
  // was recoverable was recovered in the same change: the header stopped taking five navigation
  // handlers, and `ProtectedRoute` had already absorbed the duplicated restore-and-wait the
  // not-found route would otherwise have carried. `FORBIDDEN_CLOSURE_DEPENDENCIES` untouched.
  'src/app/shell/AuthenticatedShell.tsx': 728_000,
  // Shell plus capture graph, which is what a Studio route costs. Looser, because a Studio route is
  // where media code belongs; `FORBIDDEN_CLOSURE_DEPENDENCIES` is what keeps it from leaking out.
  'src/studio/StudioApp.tsx': 910_000,
};

/**
 * Modules that must never appear in a given static closure.
 *
 * A byte budget alone is not enough: it can be raised. These name the couplings themselves, so
 * re-importing the capture graph from a surface that outlives it fails the build rather than
 * quietly costing every authenticated route another 300 KB.
 *
 * They match Vite's representative-module chunk names, so a dissolved chunk boundary makes a
 * pattern silently stop matching — which is why each is paired with a budget rather than replacing
 * one.
 */
const PROVIDER_AND_MEDIA_ONLY = [
  /@decartai\/sdk|\bdecart\b|livekit/iu,
  /@mediabunny|\bmediabunny\b/iu,
  /aac-encoder/iu,
  /videoEditRender\.worker/iu,
];

export const FORBIDDEN_CLOSURE_DEPENDENCIES = {
  'index.html': PROVIDER_AND_MEDIA_ONLY,
  'src/app/shell/AuthenticatedShell.tsx': [
    ...PROVIDER_AND_MEDIA_ONLY,
    /useExistingVideoWorkflow/u,
    /videoEditShader/u,
    /TakeReviewActions/u,
    /recording-|\/recording\b/u,
  ],
};

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

  for (const [rootKey, patterns] of Object.entries(FORBIDDEN_CLOSURE_DEPENDENCIES)) {
    for (const key of staticManifestClosure(manifest, rootKey)) {
      const entry = manifest[key];
      const identity = `${key}\n${entry.src ?? ''}\n${entry.file}`;
      if (patterns.some((pattern) => pattern.test(identity))) {
        throw new Error(`Forbidden chunk entered the ${rootKey} static closure: ${key}.`);
      }
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
