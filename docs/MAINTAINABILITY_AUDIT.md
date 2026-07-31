# Maintainability audit

**Current as of:** 2026-07-30

This document records the repository-wide behavior-preserving cleanup and the placement rules that
follow from it. Product behavior remains defined by [Architecture](ARCHITECTURE.md), the
[product state](product-state.md), and the [user stories](userStories/README.md).

## Outcome

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
- correct documentation that described old processing, qualification, baseline, or backend
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
| `scripts`                         | Repository validation, evidence, and maintenance commands                                  |

Keep a hook, helper, type, style, fixture, and component in its owning feature while it has only
that feature as a consumer. Create a named subfolder only when a cohesive group makes navigation
clearer; do not add empty taxonomy. Shared code requires multiple unrelated consumers and one
stable meaning. Provider code stays separate even when implementations look similar because
request, polling, download, billing, and error contracts evolve independently.

Tests remain beside the source they protect for domain, adapter, component, controller, and API
contracts. Cross-boundary browser cases belong in `e2e`; visual states belong in the curated
matrix; physical-device and paid-provider evidence remain manual/live qualification.

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
- Current documents now distinguish process-local video jobs from a durable job system, the
  zero-or-one upload transformation from the retired ordered chain, the nine-row qualification
  matrix from its historical ten-row form, and the 24-case visual matrix from its 29-case budget.

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

## Validation record

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
live-provider qualification were not run. Use those release-only gates exactly as described in
[Testing](TESTING.md) and the [active audit plan](project-audit-implementation-plan.md); do not
convert any of these limitations into passing claims.
