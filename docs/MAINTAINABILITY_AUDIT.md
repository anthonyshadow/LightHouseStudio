# Maintainability audit

**Current as of:** 2026-08-07

This document records the repository-wide behavior-preserving cleanup and the placement rules that
follow from it. Product behavior remains defined by the [project README](../README.md),
[Architecture](ARCHITECTURE.md), and the [user stories](userStories/README.md).

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
