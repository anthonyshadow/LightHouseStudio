# Testing strategy

Lightframe Studio uses the smallest test layer that can prove a meaningful product or engineering
contract. A test belongs in the repository only when its failure would identify a user-visible,
security, data, lifecycle, provider, accessibility, or release regression.

The [MVP acceptance runbook](MVP_ACCEPTANCE.md) maps the 17 objective criteria and owns
exact-candidate results. This strategy describes retained test authority; it does not claim that an
unrecorded candidate command passed.

## Retained layers

| Layer                      | Owns                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Domain and contract tests  | Pure policy, validation, migrations, schemas, safe errors, recording limits, and state rules       |
| Component/controller tests | Async races, resource cleanup, focus/inert behavior, destructive confirmation, and complex state   |
| API integration tests      | Loopback/origin policy, route schemas, provider intent, bounded transport, and safe normalization  |
| Real Bun listener probes   | Pre-parse security, body ceilings, HEAD/static behavior, disconnects, bind ownership, and shutdown |
| Functional Playwright      | Critical journeys, persistent-stage ownership, recovery, responsive actions, and network denial    |
| Production smoke           | Built entry, direct Studio, and health routes from one loopback origin                             |
| Development database smoke | Local PostgreSQL migrations, transaction rollback, seeded-user write, and cleanup                  |
| Curated visual regression  | High-risk composition at the five canonical viewports; always explicit                             |
| Manual/live validation     | Physical media, codecs, memory, assistive technology, downloads, and paid provider behavior        |

Storybook remains a typed, statically built review catalog. Its previous browser sweep rendered
every story in addition to component and journey tests, so it is no longer a separate automated
test suite. Selected story `play` functions remain useful interactive examples when a reviewer
opens those stories.

## Commands

| Command                                 | Scope                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `bun run test`                          | Default essential non-visual Vitest suite, including API integration tests        |
| `bun run test:unit`                     | Domain, contracts, web adapters, components, and controllers                      |
| `bun run test:integration`              | API routes/providers, Vite integration, and repository utility scripts            |
| `bun run test:coverage`                 | Explicit coverage gate using the retained Vitest suite                            |
| `bun run test:e2e`                      | Focused functional browser journeys                                               |
| `bun run test:production`               | Built loopback static-serving smoke; run `bun run build` first                    |
| `bun run test:visual`                   | Explicit curated visual regression suite                                          |
| `bun run test:visual:update`            | Intentionally regenerate curated baselines for an approved visual change          |
| `bun run test:visual:linux`             | Check the `chromium-linux` baselines from a Mac, via the pinned Playwright image  |
| `bun run test:visual:linux:update`      | Regenerate them the same way                                                      |
| `bun run screenshots:capture`           | Broad non-baseline screenshot artifact for manual design review                   |
| `bun run test:all`                      | Vitest, build, production smoke, functional E2E, and visual regression            |
| `bun run quality`                       | Normal implementation gate: types, lint, format, architecture, Vitest, and builds |
| `bun run check:dead-code:production`    | Production file/dependency reachability; excludes test-only exports               |
| `bun run db:smoke:development`          | Local PostgreSQL connection, transaction, seeded-user, and cleanup smoke          |
| `bun run --filter @studio/api db:check` | Validate Drizzle migration history                                                |

`bun run lint` raises Node's heap to 8 GB. Type-aware linting builds TypeScript programs for the
whole workspace in a single process and peaks just over 4 GB; on the default heap ESLint dies with
an out-of-memory fatal error rather than reporting lint results. Raise it further rather than
lowering it if the workspace grows.

Type-aware lint rules and `bun run typecheck` do not use the same compiler: `tsc` resolves to the
native TypeScript, while `typescript-eslint` loads the `typescript` package. Code that only one of
them accepts fails the gate, so a lint error with no matching type error is still a real typing
problem — check it against both before treating it as a false positive.

The focused Project repository transaction test runs automatically in the CI database environment.
Against the isolated local development database, run it explicitly after migrations:

```bash
LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST=true node --env-file=.env.development \
  ./node_modules/vitest/vitest.mjs run \
  apps/api/src/infrastructure/database/project-repository.postgres.integration.test.ts
```

Campaign and Project-processing migration/repository integration cases use the same isolated
database gate and run with the Project case when `LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST=true`;
ordinary tests never contact Neon or a provider.

`test:unit` and `test:integration` are useful focused subsets; `bun run test` runs both categories
once through a single Node-backed Vitest invocation. Bun owns package installation and the API
runtime, but `bun test` is a different runner and is not an alias for this retained suite. Selected
Vitest cases spawn the pinned Bun executable with `--no-env-file` to exercise the production
listener rather than Node's framework-neutral request harness.

## Critical automated journeys

The retained suite protects:

- provider-free entry, accessible Login, correct/incorrect credentials, 24-hour cookie attributes,
  restore/revoke/expiry behavior, deny-by-default private APIs, trusted mutation Origin, and no
  automatic media/AI before authenticated Studio entry;
- Dashboard at `/dashboard`, the focused creator at `/studio/create`, direct Saved Video review at
  UUID-only `/studio/:videoId`, canonical Campaign/Project routes, and `/assets/*` libraries inside
  one persistent authenticated shell; legacy organization and Recipe URLs replace-normalize without
  loops, centralized logout cleanup remains intact, and organization routes mount no media stage at
  all while Studio routes mount exactly one;
- idempotent Save Video, immutable append-only replacement, cross-owner denial, metadata-first
  gallery pagination, lazy thumbnail fallback, range content delivery, tombstones, local-only byte
  retention, and relationship-safe retryable deletion of R2 versions/thumbnails;
- reusable Character create/edit/save/preload and atomic reference hydration;
- Lucy 2.5 and VTO explicit Start/Apply, safe fallback, and independent 300-second boundaries;
- recording source pinning, duplicate Stop coalescing, recorder/sidecar/transcode ordering, forced
  H.264/AAC MP4 configuration, no-raw-fallback failure, playback, Download, Release, and confirmed
  Discard;
- immutable-original local and ElevenLabs Voice processing;
- local video-edit normalization/history, worker progress/cancellation/stale-result handling,
  offset-aware output limits, persistent-stage preview, keyboard crop, atomic source replacement,
  downstream Voice sidecars, and pre-provider aspect gating;
- upload and primary local-record adoption into the editor; discoverable Character Swap, Virtual
  Try On, and Voice; Original/Result synchronization; strict visual-before-voice ordering;
  latest-result cleanup; and post-generation MP4 validation;
- advanced live AI entry, Start/Apply behavior, Latest Take review, and cleanup remain independent
  from the primary post-recording workflow;
- versioned/sanitized user-scoped creative-library and Character Builder persistence, recovery,
  legacy Recipe-shaped record/key compatibility, Neon creative-library CAS conflict safety, and
  destructive actions without any user-facing Recipe route, card, chooser, count, or Studio tool;
- storage-neutral byte streams, private opaque R2 keys, lifecycle registration, range reads,
  exact-scope direct-part signing, staged upload ownership/expiry, post-upload declaration and
  media verification, abandoned multipart cleanup, local/shadow path preservation,
  database-level gallery paging, durable-session boundaries, accepted-job restart without a second
  billable submission, admission limits, and bounded expired-job tombstones;
- revision-granular Project media lineage, strict/canonical snapshots, normalized exact Saved Video
  Version references, immutable initiating/producing provenance, concurrent exact-versus-mismatched
  replay, active-job archive blocking, bounded current/history reads, migration preflight, and
  Project-retained byte cleanup across Saved Video/reference/generic paths;
- versioned local Project parsing, backup and prepared-journal recovery, restart-safe create
  receipts, owner isolation, lifecycle CAS, bounded active/archived lists, authenticated route
  validation/Origin policy, and local/shadow/relational authority composition;
- immutable Project-source domain/contracts; upload/finalized-record acceptance; exact active
  Saved Video Version reuse without a byte copy or output target; owner/ready/inspection checks;
  local prepared-journal recovery; relational source transaction/replay; retention-aware losing
  cleanup; controlled metadata plus range/HEAD content; and response-loss idempotency;
- recognized protected Project list/overview/workspace routes and Login return, one shared
  Studio/media-stage owner, bounded Project controller pagination, replay-safe named and quick
  creation, open/refresh, lifecycle cache invalidation, stale-rename preservation,
  focus/announcements, explicit Assets exit,
  accepted-source fresh hydration/object-URL delegation, cancellable staging, Project-switch and
  late-completion isolation, and no implicit provider start;
- URL-owned Project-session hydration, bounded semantic coalescing, exact response-loss
  convergence, stale-CAS proposal preservation, explicit reapply/discard, cache publication,
  Project/global-library switch flushing, conflict stay behavior, and hard-unload protection;
- Project snapshot-v2/V1-migration parity; exact applied Character/Variant, Outfit, Voice,
  prompt/reference/treatment/live/edit mapping; prompt-only VTO without a fabricated Outfit;
  owner-safe missing/changed creative-resource explanation, saved-Voice relationship validation
  without provider intent/contact, and live mode/capture restoration without media acquisition;
  explicit checkpoint coalescing; one-stage configuration beside current Project media; recoverable
  Character Swap/VTO Start; and truthful provider-Voice/live gating;
- local and relational Project working-media adoption for inspected/checksummed local renders and
  exact same-owner retained Media Asset/Saved Video Versions; source immutability, used-by versus
  produced-by lineage, output-pointer clearing, CAS/replay/fingerprint conflict, prepared-journal
  restart, controlled range content, retention-aware cleanup, Project-switch guarding, and
  response-loss reconciliation;
- Project-processing contracts and policy for current-attempt phases, finite safe errors, exact
  replay, explicit cost-aware retry, and stale-result rejection; local/relational pre-submit
  Project-revision admission; restart recovery with a durable provider identity; ambiguous
  no-identity submission without resubmission; shadow trace failure isolation; active/archive
  interlock; owner/Origin/provider-intent routes; durable current `job-result` promotion and stale
  historical `job-output` retention; and proof that neither result path creates a Saved Video;
- Project browser processing adapters/controllers for exact command routing, same-key response-loss
  replay, queued refresh/reopen reconnect without submit, finite status/copy, explicit
  duplicate-cost retry acknowledgement, retained-result Project-authority refresh, and denial of
  the legacy Project video-job path;
- atomic Project output save for new Saved Videos and explicit append targets; producing-revision
  versus completed post-save-revision provenance; same-asset reuse; exact/mismatched receipt
  replay; append and Project CAS; local composite-journal restart at every commit boundary;
  relational transaction/concurrency; tombstoned-library Project retention/content; and browser
  response-loss refresh reconciliation without a duplicate Version;
- bounded metadata-only Project revision/output/processing cursors; distinct producing and
  output-reference revisions; exact old-Version selection, preview, reuse, and Download; retained
  tombstoned Project content; explicit stale-result adoption; legacy **No Project** videos without
  producer backfill; and proof that these actions do not move the Saved Video pointer or infer an
  existing-video save target;
- a no-provider Chromium journey from reusable Character selection through one Project semantic
  checkpoint, local edit/Render preview, explicit working-media adoption, and refresh, including
  denial of unexpected external HTTP and WebSocket traffic;
- Campaign domain/contract parity, v1→v2 local migration, restart-safe receipts, owner/CAS and
  active-membership rules, relational same-owner/restrict constraints, authenticated routes,
  create/detail/post-create offer/New Project, move/detach, virtual No
  Campaign filtering, non-cascading lifecycle, blocked nonempty tombstone, and archived-empty
  tombstone;
- Project asset-membership domain/contract parity, deterministic local and relational backfill,
  unique attach replay, cursor bounds, owner isolation, archived read-only behavior, unavailable
  resources, bounded Saved Video summary resolution, and detach without source/history/resource
  deletion;
- Project-context Video save/attach/return and recoverable partial attachment failure,
  Character/Outfit creation and Voice attachment without leaving Project context, route-stable
  Saved Video preview, refresh-safe direct review, current-Version selection, explicit Edit, stale
  request abort, size limits, and safe missing/wrong-owner navigation;
- Quick Create accessibility and Project-context propagation for only Videos, Characters, Outfits,
  and Voices, with provider gating and no Recipe entry;
- pre-`0010`→`0021` PostgreSQL compatibility with valid historical Project rows, independent legacy
  Saved Video/Voice/creative-resource usability, truthful unassigned lineage, and current
  source/processing/output authorities; local Project v1–6→v7 and Saved Video legacy-format
  idempotent reopen/recovery without fabricated relations;
- app-owned saved-voice membership, first-read claim, owner-checked preview/conversion, and proof
  that relationship removal never calls provider voice deletion;
- loopback Host/Origin, explicit provider intent, bounded response/stream handling, SSRF-resistant
  image downloads/imports, DNS pinning, redirect/byte/content limits, safe errors, and no provider fallback;
- a route crash recorded as one bounded local diagnostic behind a generic fallback, a stale
  lazy-chunk failure told apart from a crash, and cloud creative-library recovery through retry,
  keep-local and keep-cloud;
- bounded name search and honest totals: contract bounds on the search term, repositories counting
  one row past the ceiling, cursors bound to the criteria that issued them, and list surfaces
  debouncing, clearing, announcing the settled result and naming an empty term;
- export placement: the domain aspect list and the resolution each produces, the browser
  support gate, the chooser's copy/crop preview, and render progress, cancellation and failure
  leaving the save path intact;
- **Duplicate Project**: the domain rule's stale-version conflict, by-reference snapshot,
  cleared last output and derived phase; route replay under `Idempotency-Key`; retention through
  the duplicate's own asset links; and the browser dialog's Campaign default and post-create step;
- URL-backed Project source presentation: the single narrowing from presentable media to owned
  bytes, ranged content delivery, and acquisition of complete bytes only when an operation needs
  them;
- the read-only account panel and the static "How Lightframe works" explainer, including their
  mutual exclusion with the status menu, and Saved Video preview generation from a frame or an
  uploaded image without touching saved Versions;
- creative-library export to a file and import back, including the replace confirmation and the
  file carrying records rather than reference bytes;
- one media stage per Studio visit, shared overlay focus/inert/Escape behavior, dominant recording Stop,
  200% text, and constrained mobile scrolling; and
- unexpected external HTTP and WebSocket denial in ordinary automated tests.

## Local MVP acceptance boundary

The exact local-MVP candidate must include one connected no-paid-provider browser journey across
Campaign or
standalone Project creation, durable source, creative checkpoint/local edit, accepted synthetic
processing recovery, new-video and Add-Version save, bounded history, exact old-Version Download,
leave/resume, and non-cascading archive. Focused browser cases cover CAS conflict, response-loss
replay, refresh during accepted processing, missing reusable resource, cleanup retention, Campaign
archive, Project switching, exact old-Version Download, and legacy **No Project** videos.

Lower-layer tests remain authoritative for exhaustive owner/CAS/schema/idempotency matrices, but do
not replace those named browser boundaries. Conversely, one browser happy path does not replace the
full forward PostgreSQL fixture, local-format upgrades, repository transaction tests, focused
accessibility checks, or curated visual cases. The completed exact-candidate results are recorded in
[MVP acceptance](MVP_ACCEPTANCE.md). Its local-only GO does not extend to the manual and live gates
below.

Physical devices, real codecs and browser memory, assistive-technology output, completed browser
downloads, live provider entitlement/output/retention, paid-provider behavior, real Neon migration
and restore, and live R2 multipart/inventory behavior remain outside ordinary automation. Database
and R2 unit tests use fakes and never require credentials or external traffic. The dedicated CI
database job starts ephemeral PostgreSQL, applies migrations, and uses fake R2 configuration; it
does not receive GitHub Environment secrets or contact Neon/R2. Manual/live checks use
`MANUAL_QA.md`, `LIVE_PROVIDER_SMOKE.md`, and `CLOUD_PERSISTENCE.md`.

## Browser and visual scope

Chromium runs the full functional journey set. WebKit runs one focused cross-browser media smoke.
The touch project runs that smoke plus the dedicated control-timeout/recording-Stop case. A
browser-specific test must be tagged in its title with `@cross-browser` or `@touch`; do not run
every desktop journey under every engine by default.

The current visual matrix contains 50 cases within the 50-case review budget. It retains Local live
and recording at all five canonical viewports, plus selected entry, idle, Character, Builder,
creative-library, playback, existing-video setup at all five viewports, processing/result, VTO,
Voice, finalizing, permission-error, the video editor at all five canonical viewports, Assets at all
five canonical viewports plus its filter sheet at tablet and both phone sizes, desktop Campaigns
workspace, Project output review at all five canonical viewports, and the Project output destination
choice on desktop and small mobile. Visual tests are not part of `bun run test`, `bun run quality`,
or ordinary push/pull-request CI.

Run `bun run test:visual` when:

- work materially changes layout, responsive behavior, overlays, stage composition, typography,
  design tokens, or a protected visual state;
- reviewing an intentional baseline or visual-matrix change; or
- validating an exact release candidate.

Run `bun run screenshots:capture` only for broad manual design review. Its 125 captures are artifacts,
not assertions or baselines.

### Safe baseline updates

1. Make the intentional UI or matrix change.
2. Run `bun run test:visual` and inspect the failure against the product contract. **Confirm that
   only the cases you meant to change are failing** — step 3 rewrites every baseline, so a suite
   that is already broadly red (wrong platform, missing fonts, a renderer difference) must be
   understood before you continue.
3. Run `bun run test:visual:update` only when the new rendering is approved.
4. Inspect every changed Darwin/Linux image at every affected viewport.
5. Run `node scripts/prune-visual-baselines.mjs --check`.
6. Run `bun run test:visual` again without update mode.

Never regenerate a baseline merely to make a failure pass. Do not run `screenshots:prune` until
every required platform baseline exists.

`test:visual:update` passes `--update-snapshots=all`, so it rewrites every curated baseline rather
than only the ones that failed. That is deliberate. Playwright's default update mode rewrites only
failing baselines, and the suite's `maxDiffPixelRatio` of 0.005 is wide enough to absorb a label or
a sentence — so a copy change would leave a stale image committed while the suite stayed green.
That had already happened: `06-voice/voice-browser-loaded.png` and three `07-existing-video/*`
baselines were still showing a retired shell design long after it was replaced.

The trade is that step 4 is not optional. Compare the images themselves, not the list of changed
files: an update run touches baselines you did not intend to change, and re-encoding noise looks
identical to real drift in `git status`.

## CI behavior

Ordinary pushes and pull requests run:

1. dependency audit;
2. `bun run quality`, including the static Storybook build;
3. the built production smoke;
4. focused functional Playwright journeys;
5. an isolated PostgreSQL migration/transaction smoke with fake R2 configuration;
6. on pull requests and `develop`/`main` pushes, CodeQL JavaScript/TypeScript analysis with the
   `security-extended` query suite; and
7. on pull requests, dependency review for newly introduced direct and transitive vulnerabilities
   and denied licenses.

The required `Quality` check aggregates the essential, functional-browser, and database jobs. Repository
branch protection also requires the separate `Dependency Review` and `CodeQL` checks. CodeQL runs
weekly in addition to ordinary push and pull-request analysis. GitHub Actions are pinned to full
commit SHAs; the `github-actions` Dependabot entry remains responsible for proposing pin updates.

Coverage, curated visual regression, and broad screenshot capture run only through
`workflow_dispatch`. Exact-candidate release work still runs the full release command list in the
project README, including coverage and visual regression.

## Adding or retaining a test

Before adding a test, identify the regression and choose the lowest layer that observes it.

- Prefer one table/loop inside a logical contract test for input matrices that share setup and
  outcome.
- Use pure tests for policy and validation; do not repeat the same rule through several UI cases.
- Add component/controller coverage for races, cleanup, focus, destructive actions, and state that
  a pure test cannot observe.
- Add E2E only for a critical cross-boundary journey or browser behavior.
- Add a visual baseline only when geometry/composition is itself the contract.
- Do not test framework behavior, static copy, class names, exact DOM structure, or basic markup
  unless a product/accessibility contract depends on it.
- Do not add a regression at multiple layers without documenting what unique failure each layer
  catches.

When removing a test, verify that a stronger retained layer protects the meaningful behavior and
that fixtures, mocks, dependencies, snapshots, screenshots, and documentation do not become
orphaned.
