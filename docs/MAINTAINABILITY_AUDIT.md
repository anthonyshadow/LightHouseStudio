# Maintainability audit

**Cleanup records current as of:** 2026-08-12
**Status:** mixed — the dated cleanup sections below are historical records; the placement rules
and the sections titled _Current deferred and approval-required findings_ and _Deferred findings_
remain **open** and are why this document was not archived in the 2026-08-16 restructure.

This document records the repository-wide behavior-preserving cleanup and the placement rules that
follow from it. Product behavior remains defined by the [project README](../README.md),
[Architecture](ARCHITECTURE.md), and the [user flows](user-flows/README.md). Product- and
UX-level findings are tracked separately in
[gaps and usability audit](user-flows/gaps-and-usability-audit.md); this document stays focused on
code maintainability.

## 2026-08-12 architecture and performance cleanup

The approved repository audit cleanup has been implemented without changing product workflows,
HTTP contracts, persistence authority, provider selection, or media ownership.

- Existing Video now separates reducer/state policy, source adoption, accepted-job lifetime,
  result finalization, Voice composition, recipe hydration, recent-outfit presentation, and
  confirmation UI. The public workflow hook remains the feature coordinator rather than a second
  media owner.
- Character Wardrobe now has one temporary variant-draft owner and separate library, default-voice,
  and variant-editor views. Uncommitted reference cleanup and cancellation remain draft-owned.
- Studio activity locks are pure policy. `StudioWorkspace` receives grouped route, controller,
  stage, activity, and action models, while Existing Video, Outfit, and Character overlay families
  are independently mounted presentation boundaries. `StudioApp` remains the sole composition
  root and `MediaStage` remains persistent.
- Project and Campaign dialogs are route-adjacent modules, and both Project-location workflows use
  one paginated Campaign picker. Drizzle Project row mapping and file-backed Project validation/
  migration schemas are separated from repository transaction and filesystem mechanics.
- Browser API transport, capabilities, realtime credentials, reference images, and creative-library
  synchronization are focused adapters behind one compatibility barrel. Creative-library 404 and
  revision-conflict 409 handling still use the centralized authentication/error transport.
- Saved Video list reads select the current Version plus one grouped Version count for the bounded
  page instead of materializing every Version. Expired direct uploads are claimed in stable retry
  order with `FOR UPDATE SKIP LOCKED`, preventing one persistent cleanup failure from starving later
  rows. Additive migration `0017` adds only the supporting processing-expiry and reference-activity
  indexes.
- Unreferenced generic media/processing barrels, one unused Saved Video predicate, one unused schema
  aggregate, and the duplicate Studio visual-matrix wrapper were removed. No dependency was
  removed. In particular, `@neondatabase/serverless` is intentionally retained: development uses
  local PostgreSQL, production uses Neon PostgreSQL, and both remain behind the documented Drizzle
  persistence boundary.

The cleanup reused and strengthened existing tests; it added no test case solely to improve a
coverage number.

### 2026-08-12 validation

- Focused domain, contract, API repository/service, Project persistence, browser-adapter, route,
  Existing Video, Wardrobe, and Studio component suites passed. The complete Vitest rerun passed
  210 files with 1,492 cases passing and six intentionally skipped cases.
- Application, package, API, Storybook, and E2E types; ESLint; Prettier; normal Knip; module,
  script-reference, documentation, retired-program, Drizzle-generation, and diff checks passed.
- Production application/package builds, build-manifest budgets, and the Storybook static build
  passed. The provider-free entry measured 318,756 of 345,000 bytes and the authenticated Studio
  closure measured 930,505 of 1,000,000 bytes.
- Twenty-two targeted Chromium journeys passed across application routing, Projects and Campaigns,
  Existing Video upload/editing, exact Wardrobe variants, persisted character updates, and
  reference-image recovery. No external provider was contacted.
- The curated visual run matched 23 of 31 scenarios, including the changed desktop Campaign,
  Existing Video upload, processing, result, and editor surfaces. Eight narrow-viewport images
  retain known baseline drift from earlier committed Campaign-navigation and 320px header-layout
  work; an unchanged rerun reproduced only those header pixels. Those unrelated baselines were not
  overwritten as part of this cleanup.
- No production migration, production database connection, paid provider call, or live/device
  smoke was run. Migration `0017` was generated and inspected locally only.

## 2026-08-09 test, quality, and performance audit

### Executive summary

The current architecture is healthy and its boundaries are enforced: Knip reports no dead files or
dependencies, the 644-file / 2,004-edge local module graph has zero cycles, and type checking,
linting, formatting, builds, the dependency audit, the built production smoke, and all 63
functional browser cases pass. The suite is not broadly over-tested; most of its size protects
security, ownership, persistence, provider cost, media lifetime, and asynchronous state. The main
opportunity is to remove a small set of implementation-specific or duplicated tests while leaving
those high-risk contracts intact.

The audit found one real correctness/performance defect. A terminal video-job response seeded into
TanStack Query uses the server's zero-millisecond poll value as a one-millisecond stale window.
Instrumentation can therefore make the observer issue one unnecessary status request before the
terminal response settles. The implementation will return a validated terminal seed before
constructing the observer and retain the existing no-resubmission contract.

The authenticated Studio static closure is also at 1,025,796 of its 1,032,000-byte budget (99.4%).
Several route- or action-only surfaces are still imported eagerly. They can be split at existing
UI ownership boundaries without changing the persistent stage or media lifecycle.

### Pre-change measurements

| Measure                                                                            |                           Baseline |
| ---------------------------------------------------------------------------------- | ---------------------------------: |
| Production TypeScript/TSX lines (`apps` and `packages`, generated output excluded) |                             74,360 |
| Automated test lines                                                               |                             49,869 |
| Vitest files / cases                                                               |                        188 / 1,359 |
| Functional Playwright cases / wall time                                            |                   63 / 2.1 minutes |
| Production smoke cases                                                             |                                  1 |
| Curated visual cases                                                               |                                 29 |
| Provider-free entry static closure                                                 |            317,440 / 345,000 bytes |
| Authenticated Studio static closure                                                |        1,025,796 / 1,032,000 bytes |
| Module graph                                                                       | 644 files / 2,004 edges / 0 cycles |

The default Vitest run completed discovery and 1,353 non-listener cases in 23.83 seconds; its six
real-socket cases were blocked by the restricted audit sandbox and then passed 6/6 with loopback
listener access. The fresh coverage run exposed the terminal-seed request above and stopped at
1,358/1,359, so the older 2026-08-08 coverage artifact is not treated as a current passing result.

### Test audit

| Classification | Logical test groups                                                                                                                                                                                                                                                 | Decision                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Keep           | Domain and contract policy; authentication, Origin/Host, ownership, bounded transport, provider sanitization, persistence, R2/direct upload, media cleanup, state races, focus/destructive actions, property tests, production smoke, and the 29-case visual matrix | These tests protect costly, destructive, security-sensitive, or lifecycle-sensitive regressions at the lowest practical layer.          |
| Improve        | Terminal video-job polling, optional-surface Studio composition, and global web-network setup                                                                                                                                                                       | Make terminal polling deterministic, extend the existing stage-identity assertion across lazy loading, and load MSW only for web tests. |
| Replace        | API route inventory's parallel recorder model                                                                                                                                                                                                                       | Compare the two real Elysia inventories directly, including their explicit HEAD siblings and conditional cloud routes.                  |
| Remove         | Static IconButton rendering; compiler-emitted cache-call counts; repeated chunk-warning configuration; and four browser cases already owned by router, component, or visual tests                                                                                   | These assert framework/configuration implementation or duplicate stronger retained coverage without a distinct regression.              |

The four removed functional browser cases are noncanonical route redirection, configured visual
switch confirmation, Builder step availability across layouts, and Edit Video rail placement.
Their behavior remains covered respectively by `AppRouter`, `ExistingVideoPanel`,
`CharacterBuilderPanel` plus the visual matrix, and `CreativeWorkspace` plus the editor matrix.

### Risk-based coverage matrix

| Feature / workflow                                | Failure impact                                 | Current coverage                                                | Recommended coverage                                                                        | Type                   | Priority | Reason                                                           |
| ------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------- | -------- | ---------------------------------------------------------------- |
| Terminal accepted video job                       | Duplicate reads and misleading resume activity | Existing test becomes timing-sensitive under coverage           | Return the terminal seed before Query observation; assert one notification and zero fetches | Controller/integration | P0       | Prevents unnecessary API work and stabilizes the coverage gate.  |
| Persistent Studio stage across deferred tools     | Media restart, lost take, or focus regression  | Strong composition and E2E coverage                             | Extend the existing identity test across Suspense fallbacks                                 | Component              | P1       | Code splitting must not create a second media owner.             |
| Route inventory and HEAD parity                   | Unintended public/conditional route surface    | Duplicate recorder and real-runtime tests                       | Retain only exact real-runtime local/cloud inventories                                      | API integration        | P1       | Preserves the security oracle with less parallel implementation. |
| Local/Neon/R2 persistence and provider boundaries | Data loss, ownership leak, or paid retry       | Extensive repository/service/provider coverage                  | Keep unchanged                                                                              | Integration/property   | P1       | Failure consequences justify the current breadth.                |
| Static leaf presentation and compiler internals   | Cosmetic or implementation-only drift          | Dedicated unit/build-output cases plus stronger UI/build checks | Remove the dedicated low-signal cases                                                       | Component/build        | P3       | No distinct user or release regression remains unprotected.      |

No additional feature-level P0 or P1 test gap was found. New cases are not justified merely to
raise coverage.

### Code quality, performance, and scalability findings

- Fix now: early-return terminal job seeds; lazy-load optional Studio surfaces; remove the parallel
  route model and low-value test fixtures; avoid loading MSW in non-web suites.
- Keep: `StudioApp`, `ApplicationRuntime`, and `VideoJobService` remain cohesive composition or
  lifecycle owners. Their line counts do not justify high-risk decomposition.
- Keep: provider-specific wrappers remain separate where request, billing, error, or cleanup
  contracts can diverge. Knip and the module graph found no safe dead-code or dependency removal.
- Defer: Neon gallery paging uses offsets and recomputes facets, the local saved-video repository
  scans and rewrites an owner library, and provider orchestration remains process-local. These are
  acceptable for the implemented loopback single-operator product. Keyset paging, incremental
  local indexes, distributed workers, and public observability belong to a separately approved
  high-volume or public architecture.
- Retain: the large media/editor/provider chunks are already lazy and excluded from the
  provider-free entry closure. No speculative cache, worker, queue, or memoization is warranted.

### Implementation outcome

The planned cleanup is complete. Terminal seeded video jobs now notify once and return without a
Query observer or follow-up read. Studio defers Existing Video, Saved Videos, saved-character and
saved-outfit libraries, Outfit Selector, and Outfit Builder behind accessible Suspense fallbacks.
Composition coverage exercises every new boundary while retaining one stage node, panel focus,
media ownership, and provider-free startup. MSW starts only for web Vitest files, the API route
oracle compares the two real Elysia inventories, and the specified low-signal unit/build and four
duplicated browser cases are removed.

Functional validation exposed a second correctness issue: IndexedDB returned creative-library
records in primary-key order, while domain sanitation requires newest-first order. Random UUID
ordering could therefore be misclassified as damaged persisted data and fail closed to a
session-only empty library on refresh. The adapter now reads through its timestamp indexes in
canonical newest-first order, and sanitation compares object keys independently of insertion
order while retaining array order, unknown-field detection, normalization, and corruption
recovery. An existing persistence test and the retained refresh journey were strengthened without
adding a test case.

No public route, HTTP schema, database schema, browser storage shape, provider contract, media
owner, or exported type changed.

### Before and after measurements

| Measure                       |                             Before |                              After |            Variance |
| ----------------------------- | ---------------------------------: | ---------------------------------: | ------------------: |
| Production TypeScript/TSX LOC |                             74,360 |                             74,421 |        +61 (+0.08%) |
| Automated test LOC            |                             49,869 |                             49,639 |       -230 (-0.46%) |
| Vitest files / cases          |                        188 / 1,359 |                        187 / 1,353 |  -1 file / -6 cases |
| Vitest wall time              |                      23.83 seconds |                      23.51 seconds |       -0.32 seconds |
| Functional Playwright         |                   63 / 2.1 minutes |                   59 / 2.1 minutes |            -4 cases |
| Production smoke              |                                  1 |                    1 / 5.9 seconds |           unchanged |
| Curated visual matrix         |                                 29 |                   29 / 1.2 minutes |           unchanged |
| Total executed cases          |                              1,452 |                              1,442 |           -10 cases |
| Entry static closure          |            317,440 / 345,000 bytes |            317,622 / 345,000 bytes |       +182 (+0.06%) |
| Studio static closure         |        1,025,796 / 1,032,000 bytes |          902,293 / 1,000,000 bytes |  -123,503 (-12.04%) |
| Module graph                  | 644 files / 2,004 edges / 0 cycles | 643 files / 1,994 edges / 0 cycles | -1 file / -10 edges |

The final Studio budget is the next 10,000-byte boundary above 110% of the measured 902,293-byte
closure: 1,000,000 bytes. This leaves about 10% regression headroom. The provider-free entry budget
and lazy media/worker boundaries are unchanged. The expected 187/1,353 Vitest inventory, 59
functional cases, and 1,442 total executed cases all matched exactly.

Fresh coverage passed in 27.62 seconds with 81.67% statements, 73.37% branches, 82.22% functions,
and 84.46% lines. A direct coverage percentage comparison is intentionally omitted because the
pre-change fresh run failed on the terminal-seed defect; the older artifact was not a passing
baseline for this audit.

### 2026-08-09 validation

- `bun run quality` passed application, Storybook, and E2E types; ESLint; Prettier; normal Knip;
  module, script-reference, documentation, and retired-program checks; 187 Vitest files and 1,353
  cases; package, web, API, manifest, and Storybook builds.
- `bun run test:coverage`, `bun run check:dead-code:production`, `bun run test:production`, and
  `bun run test:e2e` passed. The functional matrix passed 59/59, including the strengthened
  persisted-reference refresh journey; its focused race regression also passed 5/5.
- `bun run test:visual` passed 29/29 without baseline regeneration, and
  `node scripts/prune-visual-baselines.mjs --check` verified 29 curated baselines across two
  platforms with zero prunable files.
- `bun run audit:all` reported no known dependency vulnerability at the configured gate.

No live provider, Neon, R2, paid service, public ingress, physical device, destructive migration,
or manual assistive-technology check was used. Offset Neon pagination/facets, whole-library local
JSON work, and process-local orchestration remain documented redesign candidates only for an
explicitly approved public or high-volume product.

## 2026-08-07 persistence-readiness implementation

The repository-wide phase 0–6 implementation addressed the cloud-readiness audit without changing
the loopback product boundary:

- corrected Pruna safety enablement, voice-cache partitioning, and unbounded expired-job
  tombstones; batched saved-voice membership lookups;
- made auth/session, byte, reference-image, saved-video, voice, creative-library, and job
  persistence injectable and asynchronous at the owning composition boundary;
- added Drizzle migrations and transactional Neon adapters with separated password credentials,
  durable sessions, immutable video versions, idempotency receipts, owner-scoped relationships,
  processing state, and database-level gallery pagination/facets;
- added private R2 streaming/multipart writes, app-owned SHA-256 verification, range reads, opaque
  keys, database lifecycle states, abort cleanup, and local/shadow/Neon startup modes;
- added accepted-provider-job restart recovery without resubmission, configurable global/provider
  admission, and a cross-instance active-owner uniqueness guard;
- added revision-CAS creative-library sync that preserves local data on divergence, plus a
  non-destructive idempotent local-data inventory/backfill and rollback runbook; and
- removed unreachable Guided/legacy project repositories, UI wiring, fixtures, stories, and
  migration tests after their reset window, while retaining persisted-schema compatibility fields
  that current data may still contain.

Automatic orphan/account media garbage collection, public ingress/accounts/tenancy, distributed
workers, backup/PITR evidence, and live Neon/R2 validation remain outside this implementation.
Explicit Saved Video and saved-reference deletion use the narrower relationship-checked R2 policy;
other detached bytes still require retention approval before deletion.

### 2026-08-07 validation

- `pnpm quality` passed: application, Storybook, and E2E types; ESLint; Prettier; Knip; documentation,
  script-reference, retired-program, and build-manifest checks; a 595-file / 1,781-edge module graph
  with zero cycles; 163 Vitest files and 1,208 tests; package, web, and API builds; and the static
  Storybook build.
- Coverage passed the unchanged repository thresholds with 81.02% statements, 72.60% branches,
  82.24% functions, and 83.72% lines.
- `drizzle-kit check --config drizzle.config.ts` passed for the seven ordered migrations, and the
  schema/repository suites cover the database constraints, transaction paths, R2 lifecycle wrapper,
  persistence-mode factories, paging delegation, durable-job restoration, and creative-library CAS
  behavior.
- `pnpm audit:prod` reported no known production vulnerabilities at the high-severity gate.
- `graphify update .` rebuilt the generated relationship index with 5,482 nodes, 13,082 edges, and
  327 communities. SQL migrations remain outside Graphify's semantic index because its optional
  SQL parser is not installed; Drizzle's migration validator covers that chain instead.

No live Neon database, R2 bucket, paid provider, public ingress, destructive backfill, physical
device, or assistive-technology validation was performed. The normal local implementation gate is
green; the release-only E2E, production, visual, manual, backup/restore, and live-provider gates
remain required before deployment.

## 2026-08-05 simplification pass

A repository-wide exact-body audit covered 312 production files and 488 source-and-test files.
It found seven production clone groups and eight groups in the wider test-aware scan. The
behavior-preserving cleanup:

- makes the domain image MIME type and filename-extension mapping canonical, then reuses the
  contract-owned MIME schema at API validation boundaries;
- shares provider-independent video-job HTTP failure classification while leaving each
  provider's request, polling, download, and safe-error behavior in its adapter;
- reuses the video editor's time formatter and exact visually-hidden styling;
- removes repeated option-grid, option-button, and prompt-issue rendering inside their owning
  components; and
- reuses identical test capability setup, Recipe Dock actions, and visual-page settling helpers.

The production exact-clone count fell from seven groups to one. The remaining two-line timestamp
fallback stays local because its consumers belong to IndexedDB draft persistence and localStorage
asset persistence with different transaction models. Independent expected-data builders,
repository fakes, and small deferred-promise fixtures also stay local so tests do not share the
implementation or accidentally become tautological.

No public route, HTTP payload, persisted schema, provider choice or fallback, recording behavior,
rendered DOM, CSS selector, media ownership, or cleanup lifecycle changed.

### 2026-08-05 validation

- `pnpm quality` passed: application and Storybook types, ESLint, Prettier, Knip, a 497-file /
  1,491-edge module graph with zero cycles, 132 Vitest files and 1,063 tests, all builds, and static
  Storybook.
- `pnpm test:coverage` passed with 81.49% statements, 73.47% branches, 83.05% functions, and 84.11%
  lines. The focused responsive/accessibility and local-first Playwright specs passed 11/11.
- `pnpm test:visual` passed 25/29. A clean checkout of the pre-refactor commit reproduced the same
  four pixel diffs with the same counts, confirming pre-existing stale baselines for Character
  Builder, take review, upload chooser, and upload processing. No baseline was regenerated.

No live or paid provider call, physical-device check, or assistive-technology pass was performed.

## 2026-08-02 follow-up audit

A fresh top-to-bottom audit compared the current repository with the 2026-07-30 cleanup, traced
the changed runtime through Graphify and source/tests, and re-ran static, unit, integration,
browser, visual, dependency, asset, link, and build inventories. The architecture remains sound;
no broad migration, large-file split, provider merge, route change, persisted-shape change, or
dependency removal was justified.

The behavior-preserving cleanup:

- centralizes browser Voice capability detection while retaining the prior exported type;
- gives reference-image content URLs one narrow, zero-side-effect route builder while retaining
  the existing API-client export;
- reuses one exact saved-prompt-to-selection mapping and one visual-completion branch while
  preserving the submitted Voice snapshot and retry behavior;
- centralizes saved/recent VTO migration parsing without merging their distinct validity rules;
- moves the repeated video-intent check to the HTTP security boundary, preserving exact route
  messages and Origin checks, and reuses the contract-owned reference-image MIME allowlist;
- makes production-only file/dependency Knip analysis usable, removes ineffective Graphify ignore
  patterns, and patches the high-severity `brace-expansion` development-tool chain within its
  compatible release line; and
- corrects stale E2E locators and documentation for exact model IDs, capture settings, Storybook,
  the 29-case visual matrix, and current retention behavior.

No public route, HTTP payload, persisted schema, provider selection/fallback, recording limit,
rendered UI, CSS selector, media node, or cleanup owner changed.

### Current deferred and approval-required findings

- `StudioApp`, `MediaStage`, existing-video orchestration, provider adapters, and persistence
  modules remain cohesive at their current ownership boundaries. Line count alone does not justify
  lifecycle-sensitive decomposition.
- Recent-prompt and character selection mappings remain separate because they intentionally carry
  different attribution fields. Cross-feature reference-image UI placement, outfit-copy seed
  typing, prompt-recipe equality, and test-only compatibility exports need separate scoped work.
- The full audit still has one low-severity Windows development-server advisory through
  `tsup`'s declared `esbuild@0.27.x` range. Forcing `0.28.1` underneath that incompatible range is
  not an acceptable cleanup.
- Nine Linux visual baselines are missing and none are removable. Live/paid provider, physical
  device, real-codec, memory, and assistive-technology validation remain open.

### 2026-08-02 validation

- `pnpm quality` passed: types, Storybook types, ESLint, Prettier, normal Knip, a 458-file / 1,340-edge
  module graph with zero cycles, 118 Vitest files and 918 tests, all builds, and static Storybook.
- `pnpm check:dead-code:production` passed for production files, dependencies, unlisted imports,
  and unresolved imports. The full production export view still contains deliberate test/Storybook
  seams and is not used as an automatic removal list.
- `pnpm test:coverage` passed with 82.23% statements, 73.32% branches, 83.61% functions, and 84.88%
  lines. `pnpm test:production` passed 1/1.
- `pnpm test:e2e` improved from the 43-pass / 16-failure baseline to 44 passes / 15 failures. Every
  remaining failure reaches the known synthetic recorder-to-H.264/AAC transcode limitation; the
  stale locator no longer masks that boundary.
- `pnpm test:visual` passed 27/29. The two setup failures hit the same recording-transcode boundary
  before screenshot comparison; no baseline was regenerated. Inventory still reports exactly nine
  missing Linux baselines and zero removable baselines.
- `pnpm audit:prod` passed with no known vulnerabilities. `pnpm audit:all` now reports only the one
  low-severity `esbuild` development-tool advisory described above.
- `graphify update .` completed with 4,280 nodes, 9,896 edges, and 238 communities after the source
  changes.

No live provider calls or physical/manual validation was performed.

### SEC-008 retention follow-up

After the Product Owner selected Decision A, the video-job service implemented one immutable
`acceptedAt + 60 minutes` deadline for active and ready states. One unreferenced nearest-deadline
timer enforces abandoned-job cleanup; request-time checks defend the boundary; delivery leases
protect streams admitted before expiry; expired tombstones prevent duplicate job IDs; tracked and
guarded asynchronous work cannot resurrect expired or closed jobs; and startup/shutdown purge the
temporary root whether or not Decart is configured. The browser treats expired/missing accepted
jobs as terminal, preserves the last healthy video, and requires another explicit provider
submission. Deterministic service, route, and workflow tests cover expiry, delivery, release,
owner isolation, late completion, shutdown, and no automatic resubmission. This local cleanup does
not claim provider cancellation or provider-side deletion.

## 2026-07-30 outcome

The repository already had sound dependency direction, feature locality, test placement, and
resource ownership. The audit found no defensible reason for a broad folder migration, framework
change, route change, provider consolidation, or new shared abstraction.

The implemented cleanup is deliberately narrow:

- remove production files and exports with no production consumer;
- remove tests that existed only for those dead implementations;
- reuse domain-owned upload container and codec types;
- replace a test-only pass-through alias with its canonical implementation;
- remove API validation wrappers used only by their own tests;
- represent the mutually exclusive existing-video choice as one internal value while preserving
  the hook's public array/index contract; and
- correct documentation that described old processing, validation, baseline, or backend
  boundaries.

No files were moved, no folders were introduced, no dependencies were added or removed, and no
public route, HTTP contract, persisted shape, provider behavior, UI flow, or product CSS selector
changed.

## Resulting ownership map

| Location                          | Add here                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `packages/domain/src`             | Pure product rules, lifecycle policy, durable domain types, and validation                 |
| `packages/contracts/src`          | App-owned Zod HTTP schemas and request/response types                                      |
| `apps/web/src/app`                | Browser routing, route metadata, and provider-free application boundaries                  |
| `apps/web/src/studio`             | Studio composition and cross-feature handoff owned by the mounted runtime                  |
| `apps/web/src/features/<feature>` | Feature presentation, feature-only hooks, view models, styles, and narrowly scoped helpers |
| `apps/web/src/orchestration`      | Cross-component async sequencing and browser resource lifecycles                           |
| `apps/web/src/adapters`           | Browser, same-origin API, media-processing, storage, and provider SDK adapters             |
| `apps/web/src/ui/primitives`      | Reusable application-wide UI primitives with multiple real consumers                       |
| `apps/api/src/features/<feature>` | Route-level application services and feature validation                                    |
| `apps/api/src/providers/<name>`   | Provider-specific payloads, transport, polling, parsing, and safe error mapping            |
| `apps/api/src/http`               | Loopback/origin policy and provider-independent HTTP lifetime behavior                     |
| `apps/api/src/config`             | Typed server environment and startup-selected configuration                                |
| `stories`                         | Typed component and flow review states                                                     |
| `e2e`                             | Critical cross-boundary browser journeys                                                   |
| `scripts`                         | Repository validation and maintenance commands                                             |

Keep a hook, helper, type, style, fixture, and component in its owning feature while it has only
that feature as a consumer. Create a named subfolder only when a cohesive group makes navigation
clearer; do not add empty taxonomy. Shared code requires multiple unrelated consumers and one
stable meaning. Provider code stays separate even when implementations look similar because
request, polling, download, billing, and error contracts evolve independently.

Tests remain beside the source they protect for domain, adapter, component, controller, and API
contracts. Cross-boundary browser cases belong in `e2e`; visual states belong in the curated
matrix; physical-device and paid-provider results remain manual/live validation.

## Cleanup record

### Removed

- `apps/web/src/features/live-stage/useAudioLevel.ts` and its implementation-only test;
- `apps/web/src/features/character-builder/CharacterChoiceDrawer.tsx`, its Storybook-only
  metadata entry, and its four exclusive style helpers;
- the unused `preserveChoiceForProfile` alias;
- the API-only `decodeStrictBase64` and `validateReferenceImage` test facades; and
- the matching stale barrel export/imports, Superdesign inventory entries, and no-op visual-test
  audio-meter overrides.

The source, test, and Storybook cleanup removed approximately 372 net lines. No dependency met the
complete proof required for removal, so package manifests and the lockfile were left unchanged.

### Simplified

- Existing-video state now stores `ExistingVideoStep | null`; the existing `steps`,
  `completedStepCount`, indexed submission, retry, and output interfaces remain compatible.
- Recording upload metadata now consumes `UploadedVideoContainer` and `UploadedVideoCodec` from
  the domain package.
- Reference-image provider audit metadata now derives its return type from the store input instead
  of repeating the provider settings and usage shape.
- The 2026-07-30 documents distinguished process-local video jobs from a durable job system, the
  zero-or-one upload transformation from the retired ordered chain and the then-current 24-case
  visual matrix from its 29-case budget.

## Deferred findings

These changes may be valuable, but their lifecycle or regression surface is too large for a
repository-wide cleanup:

- split `StudioApp` only at proven composition-ownership boundaries;
- extract `MediaStage` media binding or control-visibility lifecycles only with dedicated
  characterization coverage;
- split legacy project persistence types from storage mechanics only as an atomic migration-safe
  phase;
- separate existing-video visual-plan rendering and styles only as an intentional UI refactor;
- consolidate reference-image service mappings only where provider-specific behavior remains
  explicit; and
- tighten production-only dead-export analysis separately from the normal test-aware Knip gate.

Test-facing compatibility exports and provider helpers that appear redundant were retained when
production intent, external consumption, or provider divergence could not be disproved. Large files
were not split merely by line count. Accounts, remote exposure, cloud persistence, new providers,
route expansion, and storage-model changes remain product/architecture decisions requiring
separate approval.

## 2026-07-30 validation record

Before cleanup, `pnpm quality` and the built production smoke passed. Functional E2E had 41 passes
and 12 recording-path failures; the repeated finalization failures reported that the browser
environment could not transcode raw recording output to H.264 MP4. Upload-specific journeys
passed. The visual inventory check also already reported four missing Linux existing-video
baselines. These are baseline limitations, not cleanup regressions.

Post-change validation:

- `pnpm quality` passed: types, Storybook types, ESLint, Prettier, Knip, 435 files and 1,250 local
  module edges with zero cycles, 112 Vitest files and 833 tests, package/web/API builds, and the
  static Storybook build.
- `pnpm test:coverage` passed with 82.14% statements, 72.67% branches, 83.66% functions, and 84.91%
  lines.
- `pnpm test:production` passed its one built-origin entry/Studio/health smoke.
- `pnpm test:e2e` reported 40 passes and 13 failures. Twelve remained in the known recording-path
  failure class. The additional uploaded-draft case passed immediately when rerun alone, so it was
  transient rather than a reproducible cleanup regression. After the final compatibility
  correction, the focused workflow/panel suite passed 11/11 and all six existing-video browser
  journeys passed.
- `node scripts/prune-visual-baselines.mjs --check` still reports only the same four missing Linux
  existing-video baselines. No visual snapshots were regenerated because this cleanup did not
  alter rendered product UI.
- `graphify update .` completed with 4,051 nodes, 9,220 edges, and 237 communities.

`pnpm audit:all` could not reach the registry in the restricted environment, and permission to send
dependency metadata externally was not granted. Physical-device, assistive-technology, and paid
live-provider validation were not run. Use those release-only gates exactly as described in
[Testing](TESTING.md), [Manual QA](MANUAL_QA.md), and
[Live provider smoke](LIVE_PROVIDER_SMOKE.md); do not convert any of these limitations into passing
claims.
