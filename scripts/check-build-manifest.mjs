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
  // Raised from 743_000 on 2026-09-05 for the findings the cleanup pass deferred, measured
  // 742_876 → 743_276. The render hook now shows progress once per animation frame (a pending
  // value, its frame and the cancellation of both), and "saved together" became one domain relation
  // that the gallery, the export panel and the Project surfaces share instead of each comparing set
  // ids by hand — the shared code is a little larger than the four comparisons it replaced.
  // Raised from 744_000 on 2026-09-06 for slice 2.5 (durable AI outcomes), measured 743_276 →
  // 749_287. The Account panel is reachable from every authenticated route, so its new AI activity
  // section is carried by all of them: the ledger contract, the query and its five states with the
  // copy each outcome needs. The tick, the reconciler and the ledger stores are server-side and
  // add nothing here. `FORBIDDEN_CLOSURE_DEPENDENCIES` still passes.
  //
  // 2026-09-13, and the entry has to record a miss before it records a slice. A clean build at
  // `e8d0890d` — slice 3.2's read-authority switch — measures 750_547, so the 750_000 ceiling was
  // already 547 bytes red when it landed. It was reported green because this check reads whatever
  // `apps/web/dist` holds and nothing had rebuilt it: `0f819c9e` and `245aa415` both measure
  // 749_092, which is the number the stale manifest was still answering with. The cost was the
  // sources collection's contract — the collection item, its list response and their refinements —
  // which is in this closure because every authenticated route parses Project responses through it.
  //
  // Slice 3.4 (the workspace Media area) then took it to 750_866, and its review round to 750_999 —
  // one byte of headroom, which is not a budget. Rather than raise it a third time, the structural
  // cause the ledger had already named got fixed: `projectsApi.ts` was in this closure entirely,
  // for two imports. The shell owns durable Project processing, which needs `getProject`, and its
  // creation launcher reads the membership list — so every source, working-media, output and
  // rendition call was paid for on the Dashboard, on Assets and on every Project list. Those two
  // are now `projectAuthorityApi.ts` and `projectAssetsApi.ts`, `projectsApi` re-exports them so no
  // caller moved, and `projectsApi` has left this closure: 750_999 → 744_988.
  //
  // **Lowered** from 750_000 to 746_000, below where slice 3.2 found it, so the next module that
  // wanders in fails the build instead of eating the recovery. `FORBIDDEN_CLOSURE_DEPENDENCIES`
  // still passes, so the capture graph has not followed the Record control into the shell.
  //
  // Raised from 746_000 to 749_000 on 2026-09-14 for slice 4.1 (the arrangement editor), measured
  // 745_003 -> 748_710. The lowered ceiling did exactly what it was lowered for: it failed the
  // build rather than absorbing this.
  //
  // The cause, verified rather than assumed — an earlier draft of this entry blamed
  // `@studio/domain` being built to a single `dist/index.js`, which is simply not what the web
  // build consumes: `apps/web/vite.config.ts` aliases `@studio/domain` to
  // `packages/domain/src/index.ts`, so Rollup sees the domain's individual source modules. Unused
  // exports *are* shaken out of them (`validateComposition`'s message is in no chunk). What is not
  // shaken is a module whose exports something does use: the barrel chain
  // `@studio/domain` -> `composition/index.ts` -> `export * from './operations'` puts the
  // arrangement's clip operations in the module graph of every file that imports the domain barrel,
  // and chunk assignment follows that graph rather than the tree-shaken binding set. So operations
  // only the lazily loaded editor calls are emitted into the shared chunk every route loads, and
  // the Dashboard pays for them.
  //
  // Two recoveries were tried and measured at zero, and are recorded so they are not tried again:
  // narrowing `projects/rules.ts` off the composition barrel, and moving `compositionClipDurationMs`
  // to `composition/types.ts` so the snapshot validator no longer reaches `sequence.ts`. Neither
  // moves a byte, because neither changes the barrel edge above. The fix that would work is a chunk
  // rule — a `manualChunks` entry, or a domain subpath entry the editor imports instead of the
  // barrel — which is a build-config change and not a slice's to make in passing.
  //
  // 749_000 rather than a round number above it, so the headroom stays in the hundreds and the next
  // arrival fails the same way this one did.
  //
  // Raised from 749_000 to 750_000 on 2026-09-16, measured 748_964 -> 749_131. Two shared
  // primitives learned something every caller had been working around. `OverlayPanel` now refuses
  // input while it animates out — `inert` plus capture guards for the engines that do not
  // implement it — because it stays on screen for 220 ms after it is told to close, so a control
  // that both closed it and acted could be pressed twice; that was a real bug in one caller and a
  // trap laid for the other forty. And `VisuallyHidden` forwards every `span` attribute instead of
  // dropping all but `role`, which had made `aria-live` on it a silent no-op that neither the type
  // checker nor a test could catch. Both are in this closure by definition: the shell renders the
  // overlays and imports the `ui` barrel.
  //
  // What was recoverable was recovered first, and it is the recovery this ledger already named:
  // the new `announcement` primitive — the live region and the count that makes a repeat of a
  // sentence audible — is *not* exported from the `ui` barrel, because only lazily loaded surfaces
  // announce anything and the shell imports that barrel. Reached by its path, the way `Skeleton`
  // and `LoadingPlaceholder` are, it costs this closure nothing; exported, it cost 852 bytes.
  //
  // The barrel edge above is closed as of 2026-09-16, and the recovery it promised is real:
  // `composition/index.ts` no longer re-exports `./operations`, and the arrangement editor — the
  // only thing that calls those gestures — reaches them at `@studio/domain/composition`, an alias
  // in `apps/web/vite.config.ts` and `tsconfig.base.json`. Measured 749_131 -> 746_905 here and
  // 1_101_258 -> 1_098_391 for Studio, so both closures gained about two kilobytes rather than
  // spending another thousand.
  //
  // A `manualChunks` entry was tried first and made it *worse* (Studio 1_101_114 -> 1_101_258):
  // splitting the module into its own chunk does not remove the static import edge, so the closure
  // still reaches it and now pays the chunk overhead too. Recorded so it is not tried again — the
  // edge is the thing, not the chunk.
  //
  // The ceilings are deliberately not lowered to the new numbers. The arrangement's own work is
  // what the headroom was recovered for; lowering now would spend the recovery on a second round
  // of ledger entries.
  'src/app/shell/AuthenticatedShell.tsx': 750_000,
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
  // Raised from 1_081_000 on 2026-09-05 for the deferred findings, measured 1_080_798 → 1_081_561:
  // the shell's growth above, carried here too, plus the save hook taking its owner as a parameter
  // and looking up a remembered upload key for that owner rather than for nobody.
  // Raised from 1_082_000 on 2026-09-06 for slice 2.5, measured 1_081_561 → 1_086_995: the shell's
  // growth above, carried here too, and nothing else. A Studio route mounts the same Account panel.
  // Then 1_086_995 → 1_087_085 on the slice's cleanup pass, which moved the month total into a
  // domain helper and gave the operation label a fallback, so the surface carries a little shared
  // code in place of a hand-written sum.
  // Raised from 1_088_000 on 2026-09-07 for slice 2.6 (the retake loop), measured 1_087_085 →
  // 1_089_350. Three things land in this closure: the launch hook's confirmation and its mirrored
  // guard refs, the shared take-discard question, and a fifth control on the review surface whose
  // row now wraps rather than shrinking its children below their labels.
  // Then 1_089_350 → 1_090_167 on the slice's review pass, which is the honesty costing bytes: a
  // refusal notice on the Project Record button and another on the recording action, each with the
  // copy that says what to do next, plus the answers the launch and the retake now give so a caller
  // can render them.
  // Then 1_090_167 → 1_091_682 on 2026-09-07, closing the Phase 2 verification gaps: the Project
  // source picker now routes through the converting intake instead of uploading raw, and each extra
  // placement says when its crop would cut a caption region the cut uses. Both are the acceptance
  // criteria failing in the product rather than in a test, so this is the fix costing bytes.
  // Raised from 1_092_000 on 2026-09-12 for slice 3.1 (snapshot v3), measured 1_091_682 →
  // 1_091_943: 261 bytes, all of it the domain's transform helpers, which every Project surface now
  // reads its creative setup through instead of five fields it read directly. The composition rules
  // are in the same barrel and cost nothing here — nothing on a Studio route calls them yet — and
  // the arrangement's own editor is Phase 4, behind the lazy editor chunk this closure already
  // excludes. It peaked at 1_092_103 before the slice's cleanup pass, which collapsed three
  // enumerations of a revision's held media into one and gave the read maps a single validation
  // owner.
  // Raised from 1_093_000 on 2026-09-13, carrying the shell's entry above. Slice 3.2's switch stage
  // put this closure at 1_093_398 — 398 red, unnoticed for the same stale-manifest reason — and
  // slice 3.4 with its review round measures 1_093_398 → 1_095_110. A Studio route pays for the
  // collection contract and the four collection calls exactly as every other authenticated route
  // does; what is local to this closure is smaller: the launch guard lost a condition, the bridge
  // renders the artifact id it already tracked, and the exit guard reads one claimed-take fact
  // instead of composing three. The last 300 bytes are the shell split above, which this closure
  // does not benefit from — a Studio route renders the Project surfaces and so reaches all three
  // modules either way, and pays their split overhead instead.
  //
  // Raised from 1_096_000 to 1_100_000 on 2026-09-14 for slice 4.1, measured 1_095_125 ->
  // 1_099_531. It carries the shell's entry above for the same reason — the domain barrel edge
  // described there — plus what is genuinely local to a Studio route: the arrangement is reached
  // from here, so this closure also pays the `lazy()` boundary and the props that reach it. The
  // editor surface itself is lazily loaded and is *not* in this number.
  //
  // Raised from 1_100_000 to 1_101_000 on 2026-09-15 for slice 4.2 (stitched rendering), measured
  // 1_099_536 -> 1_100_130; the shell moved 748_716 -> 748_788, seventy-two bytes for the one rule
  // the stage column gained (it steps aside while an arrangement is being edited), which sits in
  // a chunk both closures share. The rest is local to a Studio route, as it should be: the worker
  // runner that the single-clip render already paid for (`renderVideoEdit.ts`, in this closure)
  // was extracted so the arrangement render could share it, and it learned one more message — the
  // plan a stitched render posts before any paid work — plus the props that report an arrangement
  // render up to the exit guard. The concat loop, the render hook and the surface are all in the
  // lazy arrangement chunk, and the new domain module for the video half of the normalization
  // policy is consumed only by the worker, which is built outside this manifest graph — so it
  // costs neither closure a byte. 1_101_000 rather than a round number above it, for the same
  // reason as the shell's: the headroom stays in the hundreds and the next arrival fails the same
  // way this one did.
  'src/studio/StudioApp.tsx': 1_101_000,
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
    /stitchComposition/u,
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
