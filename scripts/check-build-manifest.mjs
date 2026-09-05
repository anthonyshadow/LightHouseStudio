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
  //
  // Lowered from 728_000 to 724_000 on 2026-09-03. Subtitles became a field of the edit
  // specification, whose normalization and equality every route that reads a Project snapshot
  // pays for, plus the contract's cue schema and one rail glyph — 1_515 bytes of growth. Finding
  // where the rest of the first build's 2_494 had gone recovered far more than that: a
  // barrel-exported module with a top-level `Object.freeze` is kept in every closure that imports
  // the barrel whether or not anything there uses it, and the video-editing rules had two. Written
  // as plain objects, the whole rules module left this closure (5_675 bytes), and the layout,
  // stacking and timing rules that only the editor, its worker and the placement chooser use live
  // in a module `rules.ts` never imports. The ceiling follows the closure down so the next accidental
  // freeze fails the build. `FORBIDDEN_CLOSURE_DEPENDENCIES` untouched.
  //
  // Raised from 724_000 on 2026-09-04, and the Studio ceiling with it, for a reason unlike every
  // entry above: no product code grew. The 37-package dependency bump changed how the bundler
  // splits chunks — 114 emitted files became 82, and this closure went from 35 chunks to 15 — so
  // each entry reaches coarser chunks and counts code it does not run. Total shipped JavaScript
  // grew 1.9% (5_531_159 to 5_638_292 bytes) while this closure grew 1.6% and Studio's grew 18%.
  //
  // The cause was not isolated, and the ledger should say so rather than imply it was. Pinning
  // Vite back to 8.2.1 does not restore the old split, nor does pinning `@vitejs/plugin-react`;
  // regenerating the lockfile from the bumped manifests reproduces it exactly; forcing `rolldown`
  // to 1.2.1 breaks the package build outright. What is verified is the half that matters most:
  // `FORBIDDEN_CLOSURE_DEPENDENCIES` passes on every closure, so no provider, media or capture
  // module has entered a surface that outlives it. This ceiling is a measurement of the bundler's
  // new granularity, not permission for the graph to grow — recovering the split is worth its own
  // change, and these numbers go back down when it lands.
  //
  // Raised from 736_000 on 2026-09-05 for slice 2.3 (variant sets), measured 735_408 → 742_865.
  // The save flow itself stays out of this closure — the loop, its preparation record and the
  // per-placement progress list are in `ProjectRouteSurface`'s own chunk — but three things the
  // slice adds are carried by every authenticated route: the domain's placement-set rules and
  // primary derivation, the contract's raised rendition cap with its distinctness refinement, and
  // the surfaces that recognise siblings (the gallery's grouping, the overview card's per-member
  // rows, History's placement summaries). `FORBIDDEN_CLOSURE_DEPENDENCIES` still passes, so no
  // provider, media or capture module entered a surface that outlives it.
  'src/app/shell/AuthenticatedShell.tsx': 743_000,
  // Shell plus capture graph, which is what a Studio route costs. Looser, because a Studio route is
  // where media code belongs; `FORBIDDEN_CLOSURE_DEPENDENCIES` is what keeps it from leaking out.
  //
  // Raised from 910_000 on 2026-09-04. Two causes, kept apart: the chunking change above accounts
  // for 166_066 bytes of it, and the local editor's honest export probe for 942 — measured by
  // building this tree against the pre-bump lockfile, where every budget still passes.
  //
  // Raised from 1_078_000 on 2026-09-05 for slice 2.3, measured 1_077_504 → 1_078_171. The Studio
  // save dialog makes one placement at a time and is untouched by the slice; what it carries is
  // the same shared domain and contract growth the shell closure records above.
  //
  // Raised again from 1_079_000 on 2026-09-05 for slice 2.4 (resilient intake), measured
  // 1_078_171 → 1_080_920. Two things a Studio route now carries: the remembered upload keys that
  // let a reload resume an upload instead of restarting it, and the intake's convert-or-refuse
  // branch with the copy that explains it. The encoder itself is not new here — `useRecording`
  // already put it in this closure — so deferring its import moves nothing but split overhead,
  // measured at 171 bytes worse.
  'src/studio/StudioApp.tsx': 1_081_000,
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
