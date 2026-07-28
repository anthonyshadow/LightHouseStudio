# Project Cleanup Findings

## 1. Audit metadata

| Item                    | Audit record                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit date              | 2026-07-27                                                                                                                                                                                                                                                                                                                                |
| Repository              | `webrtc2Sol` / Lightframe Studio                                                                                                                                                                                                                                                                                                          |
| Branch                  | `Refactor`                                                                                                                                                                                                                                                                                                                                |
| Commit                  | `5c7f3e62c9a14b9f044ae7919747bf4cafda3e52`                                                                                                                                                                                                                                                                                                |
| Initial working tree    | Clean. This audit creates only this document and `docs/projectCleanupImplementationPlan.md`; Graphify-generated state may be refreshed as required by repository instructions.                                                                                                                                                            |
| Runtime inspected       | Node `v24.12.0`, npm `11.6.2`; both satisfy `package.json` (`>=24 <25`, npm `>=11`). `.nvmrc` currently pins Node `24.18.0`.                                                                                                                                                                                                              |
| Applications            | `apps/web` React/Vite single-route Studio; `apps/api` Fastify broker and local reference-asset service                                                                                                                                                                                                                                    |
| Packages                | `packages/domain` pure rules; `packages/contracts` runtime HTTP schemas                                                                                                                                                                                                                                                                   |
| Other first-party areas | `e2e`, `scripts`, Storybook stories/configuration, root tooling, CI, documentation, and Graphify output                                                                                                                                                                                                                                   |
| Main entry points       | `apps/web/src/main.tsx` → `StudioApp`; `apps/api/src/server.ts` → `createApp`; package `src/index.ts` entry points; `/` is the only application route                                                                                                                                                                                     |
| Instructions reviewed   | `AGENTS.md`; `README.md`; `docs/ARCHITECTURE.md`; `docs/MANUAL_QA.md`; `docs/LIVE_PROVIDER_SMOKE.md`; `docs/PRIVACY_AND_TEMPORARY_DATA.md`; `docs/BROWSER_SUPPORT.md`; `docs/RECORDING_MEMORY_POLICY.md`; `docs/userStories/README.md` and all linked current journeys; `LESSONS.md`; manifests and configuration. No `CLAUDE.md` exists. |
| Areas excluded          | Generated build output, test artifacts, vendored dependencies, lockfile internals, and third-party source were not cleanup targets. Live devices/providers were not exercised because the repository explicitly gates paid/credentialed checks behind manual QA. Deployment infrastructure was not audited because none exists by design. |

### Graphify status

The installed Graphify skill and repository instructions were read before the audit. `graphify-out/graph.json` was available and queryable (initially 3,535 nodes and 8,180 links). The initial graph metadata's `built_at_commit` named `fe43dd…`, one commit behind the audited commit, but incremental content contained current Character Builder modules and excluded deleted modules. Graphify results were therefore used as scoped dependency evidence and checked against imports, exports, runtime entry points, dynamic imports, tests, configuration, and `npm run check:modules`. The required post-document `graphify update .` rebuilt the graph successfully to 3,699 nodes and 8,342 edges; it warned that the non-source `hooks.json` produced zero nodes.

Commands used included:

- `graphify query "<audit question>"` for architecture, hotspots, dead/test-only candidates, and duplicate flows.
- `graphify explain "useReferenceRecipeHandoff"` and `graphify explain "projectRepository.ts"` for focused neighborhoods.
- `graphify path "useCharacterReferenceGeneration" "useReferencePreviewGeneration"` and `graphify path "LegacyProjectManager" "ConfirmationDialog"` for ownership paths.
- Source-derived graph statistics for fan-in/fan-out, corroborated by the repository module checker.

### Validation commands run

| Command                                    | Result                                                                                                                                                        | Audit interpretation                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run quality` (sandbox)                | All static/build gates passed; 692/693 unit tests passed. One API listen test received `EPERM` on `127.0.0.1`.                                                | Environmental sandbox restriction.                                                                                                                                                                                                                           |
| Targeted failed route test outside sandbox | 23/23 passed.                                                                                                                                                 | Confirms the sandbox-only failure was environmental.                                                                                                                                                                                                         |
| `npm run quality` outside sandbox          | Passed: type checks, Storybook type check, lint, formatting, Knip, module checks, 693 unit tests, 53 Storybook tests, production builds, and Storybook build. | Trustworthy passing core baseline.                                                                                                                                                                                                                           |
| `npm run test:coverage`                    | Passed: 90 files / 693 tests. 81.31% statements, 70.22% branches, 82.79% functions, 83.89% lines.                                                             | Aggregate thresholds pass narrowly; critical-hook gaps remain (`TEST-001`).                                                                                                                                                                                  |
| `npm run test:production`                  | Passed: 1/1.                                                                                                                                                  | Compiled Fastify static-serving smoke is healthy.                                                                                                                                                                                                            |
| `npm run test:e2e`                         | Failed: 125 passed, 10 skipped, 3 failed.                                                                                                                     | The same stale Workshop assertion failed in Chromium, WebKit, and mobile (`TEST-002`).                                                                                                                                                                       |
| `npm run test:visual`                      | Failed: 14 passed, 15 failed.                                                                                                                                 | Darwin baselines are stale for current UI in 15 cases; Linux is also missing four required cases (`TOOL-001`).                                                                                                                                               |
| `npm run audit:prod`                       | Not run.                                                                                                                                                      | Execution was denied because it transmits dependency metadata to the npm advisory service without trusted explicit authorization. This is an audit-environment limitation, not a repository failure.                                                         |
| `npm ls --all --omit=optional`             | Failed with `ELSPROBLEMS`.                                                                                                                                    | The existing local `node_modules` contains extraneous optional WASM/platform artifacts and reports a missing optional package. Clean CI uses `npm ci`; all repository validation/build work passed. Treat as local installation state, not a source finding. |

## 2. Executive summary

Lightframe Studio is architecturally healthy for its current local-first scope. It has explicit package direction, pure domain and contract packages, one composition root, app-owned runtime validation, disciplined provider boundaries, and unusually strong media/resource lifecycle tests. The 348-module dependency graph has 935 local edges and zero cycles. The cleanup roadmap should preserve that shape rather than introduce a router, global store, generic repository framework, or broad provider abstraction.

The audit's immediate risk was validation trust, not broken production architecture. PHASE-001 has since resolved the stale functional journey, critical-hook coverage, and visual tooling/assets. The executable suite, pruning inventory, documentation, and both checked-in platform folders now agree on 29 cases; clean Darwin and Linux/amd64 runs each pass 29/29. Structural cleanup can proceed on that safety net.

The highest-value implementation work after the safety phase is:

1. Reduce the legacy Guided repository to the read/download/delete/migration compatibility surface actually reachable at runtime.
2. Remove a disabled starter-picker branch and an unused telemetry seam without removing legacy starter data.
3. Correct cross-feature ownership left by the Character Builder migration.
4. Consolidate duplicated hardened provider-download behavior and repeated reference-asset finalization.
5. Decompose `StudioApp` and `useReferenceRecipeHandoff` at lifecycle boundaries, without changing the persistent `MediaStage` or public facade.

No credible critical security, data-loss, cycle, unsafe-type, async-leak, or performance finding was substantiated. Provider download hardening is duplicated, but both copies currently enforce the required controls. The roadmap treats divergence risk seriously without describing a present exploit.

Recommended order: restore the test/visual safety net; remove confirmed retired code; repair ownership; consolidate small stable duplicate responsibilities; then decompose high-coupling orchestration; finish with documentation reconciliation.

## 3. What is working well

1. **Dependency direction is explicit and enforced.** `packages/domain` and `packages/contracts` remain independent of React and provider payloads. `scripts/check-module-graph.mjs`, TypeScript project references, and ESLint/Knip provide overlapping protection. The audit found zero local import cycles.
2. **Provider contact is explicit and cost-aware.** API routes, services, and provider adapters keep token minting, SDK loading, generation, voice work, and external media behind labeled user actions. Tests deny unexpected HTTP and WebSocket traffic. Local Camera remains independent of credentials and external provider work.
3. **Trust boundaries use owned contracts.** `packages/contracts` supplies runtime schemas shared by web and API; provider payloads are mapped inside adapters instead of leaking into domain/UI types. Contract parity tests and strict error mapping make boundary changes reviewable.
4. **Media resources have deliberate owners.** `MediaStage`, `useRecording`, `useRecordingArtifacts`, realtime resource hooks, and processing adapters distinguish borrowed tracks from owned recorders, object URLs, streams, audio contexts, and provider clients. Cleanup is idempotent and tested around finalization/review sequencing.
5. **The persistent stage and overlay system are sound reusable boundaries.** `StudioApp` composes one persistent `MediaStage`; tools use shared `OverlayPanel` behavior rather than mounting parallel media or modal systems. Focus management, body isolation, escape/close semantics, exact viewport containment, and player continuity have component and E2E coverage.
6. **Reference assets have strong ownership and persistence rules.** `ReferenceImageService` scopes assets to an owner, validates bytes, writes atomically, records provenance, supports idempotency/coalescing, and never lets Recipe Shelf own image bytes or storage keys.
7. **Provider adapters preserve protocol-specific behavior.** BFL and Wiro maintain separate task protocols, status interpretation, cleanup, and error wording. ElevenLabs and Decart have explicit cancellation limitations documented rather than hidden behind false genericity.
8. **Tests model product invariants rather than only components.** Pure domain tests, shared contract tests, Storybook interaction/a11y tests, production smoke, multi-engine E2E, and exact-size visual scenarios cover complementary seams. Manual and gated live-provider documents correctly separate automation from device/paid-provider evidence.
9. **Rare functionality is loaded intentionally.** Studio tools and realtime SDKs are dynamic chunks, production source maps are disabled, and a build guard rejects the development-only realtime driver from production output.
10. **Documentation records operational boundaries honestly.** The architecture, privacy, browser, recording-memory, user-story, and live-smoke documents distinguish implemented local behavior from missing remote-deployment controls and future policy.

All implementation phases must preserve these properties.

## 4. Findings summary

| Finding ID | Title                                                                  | Category                         | Severity | Confidence      | Status   | Affected area                                                 | Recommended phase |
| ---------- | ---------------------------------------------------------------------- | -------------------------------- | -------- | --------------- | -------- | ------------------------------------------------------------- | ----------------- |
| TEST-001   | Aggregate coverage masks critical orchestration gaps                   | Tests                            | High     | Confirmed       | Resolved | Recording review and Character Builder generation/controllers | PHASE-001         |
| TEST-002   | Local-first E2E journey exercises a retired Workshop character flow    | Tests                            | High     | Confirmed       | Resolved | `e2e/local-first-preparation.spec.ts`                         | PHASE-001         |
| TOOL-001   | Visual matrix, baselines, pruning, and documentation disagree          | Tooling/tests                    | High     | Confirmed       | Resolved | Visual Playwright suite and platform snapshots                | PHASE-001         |
| DEAD-001   | Legacy Guided repository retains an unreachable write pipeline         | Dead/compatibility code          | Medium   | Confirmed       | Resolved | Guided IndexedDB compatibility repository                     | PHASE-002         |
| DEAD-002   | Disabled starter-picker presentation remains compiled                  | Dead UI code                     | Low      | Confirmed       | Resolved | Character Builder form and styles                             | PHASE-002         |
| DEAD-003   | Production telemetry is a no-op seam with no consumer                  | Dead service code                | Low      | Confirmed       | Resolved | Studio telemetry and mount effect                             | PHASE-002         |
| ARCH-001   | Shared confirmation dialog is owned by Character Builder               | Architecture/ownership           | Medium   | Confirmed       | Resolved | Shared UI and Legacy Projects                                 | PHASE-003         |
| ARCH-002   | Character generation remains owned by Prompt Workshop internals        | Architecture/ownership           | High     | Confirmed       | Resolved | Character Builder, prompt-authoring, media-session helpers    | PHASE-003         |
| DUP-001    | BFL and Wiro duplicate hardened task-download transport                | Duplication/security maintenance | High     | Confirmed       | Resolved | API provider adapters                                         | PHASE-004         |
| DUP-002    | Reference image service repeats asset finalization logic               | Duplication/service cohesion     | Medium   | High confidence | Resolved | API reference-image service                                   | PHASE-005         |
| DUP-003    | Reference-image fields duplicate file-picker/drop presentation         | Duplication/components           | Low      | Confirmed       | Resolved | Character Builder and media-session UI                        | PHASE-006         |
| COMP-001   | Studio composition root owns several independent lifecycle controllers | Component/orchestration          | Medium   | High confidence | Resolved | `StudioApp.tsx`                                               | PHASE-007         |
| STATE-001  | Recipe handoff facade mixes five stateful workflows                    | State/orchestration              | Medium   | Confirmed       | Resolved | `useReferenceRecipeHandoff.ts`                                | PHASE-008         |
| DOC-001    | Canonical image-generation document filename is misspelled             | Documentation                    | Low      | Confirmed       | Open     | README documentation map and image-generation doc             | PHASE-009         |

## 5. Detailed findings

### [TEST-001] Aggregate coverage masks critical orchestration gaps

- **Category:** Tests and regression prevention
- **Severity:** High
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `apps/web/src/studio/useTakeReviewFlow.ts`; `apps/web/src/features/character-builder/useCharacterReferenceGeneration.ts`; `apps/web/src/features/character-builder/useCharacterBuilderController.ts`; their tests.
- **Affected features or runtime flows:** Take finalization/review cleanup; upload/generate/edit/compose reference work; builder save/preload/locking.
- **Evidence:** Aggregate coverage passes narrowly (81.31/70.22/82.79/83.89), but the generated report shows approximately 23.61% statements for `useTakeReviewFlow`, 16.66% for `useCharacterReferenceGeneration`, and 30.5% for `useCharacterBuilderController`. Existing take-review tests primarily exercise exported helpers; lower-level preview generation is tested, but the Builder adapter's validation, operation locking, stale-result, and error paths are not directly exercised.
- **Graphify evidence:** Character generation calls the prompt-authoring preview generator; Builder controller and recipe handoff have high fan-out into persistence, generation, preload, and UI state. These are high-impact orchestration seams, not isolated leaf code.
- **Current behavior:** The full unit suite passes, and broad E2E covers many successful journeys. A regression in a hook-specific failure/cancellation branch can still be masked by high coverage in pure domain/contracts code.
- **Why this matters:** Later decomposition and dead-code removal would otherwise change lifecycle/cost-sensitive code without a precise safety net.
- **Root cause:** Aggregate thresholds measure overall volume and successful E2E paths rather than risk-weighted orchestration behavior.
- **Recommended change:** Add focused hook/controller tests for finalization settlement and cleanup ownership; generation/upload/edit/compose validation, locking, retry and stale-result behavior; and Builder save/preload failure boundaries. Test externally visible state/effects, not implementation details. Do not raise global thresholds merely to force unrelated tests.
- **What should not change:** Provider-contact consent, generated-asset semantics, media cleanup ordering, public hook contracts, and aggregate threshold values unless separately justified.
- **Dependencies and prerequisites:** None; this is a prerequisite for structural phases.
- **Regression risks:** Over-mocking could create false confidence. Use existing adapter injection and test fakes.
- **Required validation:** Targeted Vitest suites, `npm run test:coverage`, `npm run quality`, relevant Character Builder E2E.
- **Suggested implementation phase:** PHASE-001
- **Estimated scope:** Medium
- **Related findings:** TEST-002, ARCH-002, COMP-001, STATE-001
- **PHASE-001 implementation evidence (2026-07-27):** Added direct hook tests for ordered/empty/rejected take finalization, automatic cleanup, generation validation, composition/edit source selection, same-turn locking, retry, cancellation, save-recovery blocking, and stale completion rejection. Expanded the Builder-controller suite for upload validation/transport retry, edit locking during save, reset/close settlement, the existing resumable preload failure, and durable-finalization retry. `npm run test:coverage` now passes 93 files / 706 tests at 82.79% statements, 71.55% branches, 84.19% functions, and 85.46% lines. Statement coverage changed from approximately 23.61% to 98.61% for `useTakeReviewFlow`, 16.66% to 86.66% for `useCharacterReferenceGeneration`, and 30.5% to 62.71% for `useCharacterBuilderController`; thresholds were not changed.

### [TEST-002] Local-first E2E journey exercises a retired Workshop character flow

- **Category:** Tests
- **Severity:** High
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `e2e/local-first-preparation.spec.ts:76-134`; current behavior documented in `docs/userStories/README.md`.
- **Affected features or runtime flows:** Keyboard-accessible, provider-free preparation.
- **Evidence:** At lines 110-122 the test opens structured Prompt Workshop and waits for a `Character concept` textbox plus `Use in working draft`. The current Workshop owns only Add/Replace/Restyle. `npm run test:e2e` failed this locator in Chromium, WebKit, and mobile: 125 passed, 10 skipped, 3 failed.
- **Graphify evidence:** Character creation now reaches the fullscreen Character Builder; prompt-authoring no longer contains the retired character form. Source and E2E registration confirmed this is not dynamic or environment-specific.
- **Current behavior:** The product behavior matches the current architecture/user story; the test is stale.
- **Why this matters:** The release gate is red and the intended provider-free/accessibility assertion is no longer protected by a meaningful journey.
- **Root cause:** The Character Builder ownership migration removed the Workshop character section without migrating this older E2E scenario.
- **Recommended change:** Rewrite the journey around a current local-only path: verify Workshop Add/Replace/Restyle draft behavior or the Character Builder prompt-only save path, while retaining the camera-call, capabilities-only API, keyboard focus, and accessibility intent.
- **What should not change:** Do not revive the Workshop character form or weaken the no-camera/no-provider assertions.
- **Dependencies and prerequisites:** None.
- **Regression risks:** Accidentally selecting an action that performs optimization/generation would invalidate the local-only contract.
- **Required validation:** Targeted spec in all configured projects, then `npm run test:e2e`.
- **Suggested implementation phase:** PHASE-001
- **Estimated scope:** Small
- **Related findings:** TEST-001, ARCH-002
- **PHASE-001 implementation evidence (2026-07-27):** Replaced the retired Character-concept locator with the current Add-object Workshop path. The journey opens Workshop by keyboard, validates and applies an object/placement draft, reopens it by keyboard, proves tab-memory retention, and retains the zero-camera, capabilities-only API, no-token, and deny-external assertions. The targeted file passes 6/6 across Chromium, WebKit, and mobile; the full functional gate passes 128 with 10 intentional skips and no failures. No runtime feature code changed and the retired character form was not revived.

### [TOOL-001] Visual matrix, baselines, pruning, and documentation disagree

- **Category:** Tooling, tests, and documentation
- **Severity:** High
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `e2e/studio.visual.spec.ts:254-280`; `scripts/prune-visual-baselines.mjs:4-34`; `screenshots/chromium-darwin/**`; `screenshots/chromium-linux/**`; `README.md:110-125`; `docs/BROWSER_SUPPORT.md:28-30`; `docs/ARCHITECTURE.md:158-164`.
- **Affected features or runtime flows:** The 29-case cross-viewport visual release gate.
- **Initial evidence:** The executable suite defines 29 cases. The pruning script deliberately retains 27 and omits AI-choice cases. Darwin contains 29 files; Linux contains 25, missing desktop/small-mobile AI-choice and Workshop files. README and Browser Support say only two Linux files are missing, while Architecture correctly says four. The initial Darwin run passed 14 and failed 15; visible diffs include intentionally changed current controls (for example, recording moved into the stage control strip) rather than nondeterministic animation.
- **Graphify evidence:** Visual specs and scripts are tooling entry points rather than normal runtime imports; registration was verified through package scripts and Playwright configuration. Graphify did not classify snapshot assets, so filesystem inventory and test execution are authoritative here.
- **Current behavior:** The executable/pruning/documented matrix agrees on 29 cases; Darwin and Linux each contain 29 reviewed assets, both complete suites pass, and the pruning check reports no missing or removable files.
- **Why this matters:** Visual regression is neither a reliable release gate nor a trustworthy record of responsive behavior.
- **Root cause:** The Character Builder/control-layout evolution updated code and some documentation without one dedicated cross-platform baseline asset update; the pruning allowlist remained at its older count.
- **Recommended change:** First inspect every current diff and obtain product approval that the rendered UI is intended; never bulk-approve blindly. Update valid Darwin baselines, generate the four missing Linux assets in the repository's supported Linux environment, add AI-choice to the pruning allowlist so it retains exactly 29, and reconcile all three canonical docs. If any diff is unintended, fix it in a separate behavior change before accepting snapshots.
- **What should not change:** Exact viewport sizes, 0.5% threshold, platform-specific folders, animations-disabled behavior, external-traffic denial, or snapshots unrelated to reviewed intentional changes.
- **Dependencies and prerequisites:** Cleared by explicit owner approval plus the isolated Linux/amd64 Playwright runtime.
- **Regression risks:** Snapshot updates can conceal real UI regressions. The phase must document per-scenario review.
- **Required validation:** Completed with `npm run test:visual` on Darwin and Linux/amd64, `npm run quality`, and pruning-script dry verification without running destructive pruning.
- **Suggested implementation phase:** PHASE-001
- **Estimated scope:** Medium; may be blocked on Linux environment/visual approval
- **Related findings:** TEST-002
- **PHASE-001 partial implementation evidence (2026-07-27):** `studioVisualMatrix.ts` is now the single executable 29-case inventory consumed by the visual spec and pruning script. A non-destructive inventory test covers exact-set equality plus retained/missing/removable classification; it passes 2/2. The real `--check` correctly reports only the four absent Linux files. README, Browser Support, and Architecture now state identical checked-in facts. Darwin was rerun after the tooling change and remains at the pre-existing 14 passed / 15 diffs; no threshold or snapshot was changed.
- **Former precise blocker (cleared 2026-07-27):** At the partial checkpoint, product/design-owner approval had not been provided for the 15 Darwin diffs: recording at desktop, compact, tablet, mobile, and small mobile; character-live at tablet, mobile, and small mobile; idle at mobile and small mobile; AI experience choice at desktop and small mobile; and finalizing, media-error, and VTON-live at small mobile. The host also had no Linux container runtime. `TOOL-001` and PHASE-001 therefore remained blocked at that checkpoint and no unreviewed baseline was accepted.
- **PHASE-001 resolution evidence (2026-07-27):** The owner explicitly approved completing the reviewed Darwin diffs and required real Linux generation/validation. All 15 Darwin baselines were updated and a clean Darwin run passed 29/29. A Colima Linux VM plus the Playwright `v1.61.1-noble` image provided an isolated Linux/amd64 runtime matching CI architecture. The complete Linux set was reviewed and refreshed for the current browser/UI; the four previously absent desktop/small-mobile AI-experience-choice and Add-object Workshop assets were force-written by Linux/amd64 and passed a focused 4/4 run. A subsequent clean Linux/amd64 run passed 29/29. `npm run screenshots:prune -- --check` verified 29 curated baselines on each of two platforms with zero missing or removable files. The viewport list, 0.5% threshold, platform folders, external-traffic denial, and production behavior were unchanged.

### [DEAD-001] Legacy Guided repository retains an unreachable write pipeline

- **Category:** Dead and compatibility code
- **Severity:** Medium
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `apps/web/src/features/guided-flow/projectRepository.ts` (1,106 lines), its types/tests, `StudioApp.tsx`, `LegacyProjectManager.tsx`, and Character Builder legacy migration.
- **Affected features or runtime flows:** Retained Guided project discovery, download, delete, and migration into Character Builder.
- **Evidence:** Runtime consumers use initialization/state/list, load/read-artifact, and delete. `LocalProjectRepository.commit`, checkpoint/revision conflict machinery, immutable artifact writes, snapshot flush/reconciliation, persistent-storage request, and `createEmptyGuidedProjectData` are referenced only by repository tests/stories or their own module surface. `/guided` is retired and cannot reopen projects.
- **Graphify evidence:** `projectRepository.ts` has a degree of 65 because its internal write machinery and extensive tests are represented, but runtime paths terminate in Studio legacy count/manager and Character Builder migration. No current route or dynamic import reaches commit/create.
- **Current behavior:** Existing browser records remain listable, downloadable/deletable, and migratable. A large obsolete authoring repository is still compiled and tested.
- **Why this matters:** The dead write state machine obscures the much smaller compatibility contract and increases the cost of changing IndexedDB compatibility safely.
- **Root cause:** The Guided authoring flow was retired incrementally while its repository was retained wholesale to protect persisted data.
- **Recommended change:** Reduce the module to an explicitly named read/list/download/delete/migration compatibility repository. Remove unreachable create/commit/revision/write/flush/retention-reporting APIs, types, tests, and stories. Preserve database/store names, decoding/sanitation, artifact reads, delete semantics, failure reporting, and legacy migration inputs. Add fixture-based compatibility tests before deletion.
- **What should not change:** Never delete or rewrite user records automatically; do not change the IndexedDB schema/version; preserve all current download/delete/migration behavior and failure messages.
- **Dependencies and prerequisites:** PHASE-001; representative old-record fixtures and targeted runtime-consumer tests.
- **Regression risks:** Persisted-data incompatibility and lost download/delete access.
- **Required validation:** Repository compatibility tests, Character Builder migration tests, Legacy Projects component/E2E, `npm run quality`, `npm run test:coverage`, `npm run test:e2e`.
- **Suggested implementation phase:** PHASE-002
- **Estimated scope:** Medium-large deletion with focused compatibility risk
- **Related findings:** COMP-001
- **PHASE-002 resolution evidence (2026-07-27):** Reduced `projectRepository.ts` from 1,106 to 580 lines and its public compatibility types from 160 to 103 lines. Removed `commit`, checkpoint/artifact commit inputs, revision-conflict and immutable-write machinery, memory snapshot/reconciliation, durable retry/flush, persistence-retention requests, timestamped authoring, and the public empty-project constructor. The runtime interface now exposes only initialization/state, list, load, artifact read, transactional delete, and close; its read-only memory fallback still protects records and bytes already loaded before a mid-session IndexedDB failure. Raw legacy IndexedDB fixtures pin `lightframe.local-projects` version 1, the `projects`/`artifacts` stores, allowlist sanitation, sort/load behavior, byte-identical owned artifact reads, damaged/cross-owner rejection, deletion isolation, fallback reads, migration inputs, unavailable storage, and late-open cleanup. No schema upgrade, migration, record rewrite, or automatic deletion was added.

### [DEAD-002] Disabled starter-picker presentation remains compiled

- **Category:** Dead UI code
- **Severity:** Low
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `apps/web/src/features/character-builder/CharacterBuilderForm.tsx` (feature flag and starter branch around lines 73-263), its styles, stories/tests.
- **Affected features or runtime flows:** Character Builder visual suggestions and legacy recipe hydration.
- **Evidence:** `SHOW_DEMO_CHARACTERS` is the constant `false`; starter artwork, selection handler/branch, and associated styles are unreachable. Tests assert the section is absent. The nine starter catalog records are still used by legacy hydration/default-preview rules.
- **Graphify evidence:** The hidden branch symbols have no production caller outside the form; catalog data remains connected to model/hydration paths. Static import analysis alone would incorrectly suggest deleting the catalog, so source/runtime checks narrow the finding to presentation code.
- **Current behavior:** Users never see or select demo characters.
- **Why this matters:** The branch implies a product option that no longer exists and makes the current Builder form harder to reason about.
- **Root cause:** A retired experiment was disabled by a compile-time constant rather than removed.
- **Recommended change:** Delete only the constant, hidden JSX, handler, inaccessible artwork component/imports, stale styles, and story language that says starters are exposed. Retain catalog records/assets required for legacy identity/hydration.
- **What should not change:** Current suggestions, prompt/image save behavior, or legacy catalog mapping.
- **Dependencies and prerequisites:** PHASE-001; usage test for legacy starter hydration.
- **Regression risks:** Over-broad asset deletion.
- **Required validation:** Character Builder unit/Storybook/E2E, Knip, `npm run quality`.
- **Suggested implementation phase:** PHASE-002
- **Estimated scope:** Small
- **Related findings:** ARCH-002
- **PHASE-002 resolution evidence (2026-07-27):** Deleted `SHOW_DEMO_CHARACTERS`, the unreachable starter artwork component, selection handler and JSX, four starter-only style exports, the orphaned `starterDefaults`/choice builder, absence-only assertions, and stale Storybook language. `CHARACTER_STARTERS` still contains all nine records and asset mappings; catalog tests and Character Builder migration tests continue to prove legacy identity/hydration and default-preview reachability. Presentation-aware suggestions, montage preview, save, generation, responsive behavior, and accessibility remain covered.

### [DEAD-003] Production telemetry is a no-op seam with no consumer

- **Category:** Dead service code
- **Severity:** Low
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `apps/web/src/studio/telemetry.ts`; its test; the `studio-viewed` effect in `StudioApp.tsx`.
- **Affected features or runtime flows:** Studio mount only.
- **Evidence:** Production creates a no-op telemetry object and records one event into it. The recording implementation is used only by its own test; no adapter is injected and no persisted/remote consumer exists. Architecture explicitly says there is no persisted browser telemetry.
- **Graphify evidence:** The production path is `StudioApp` → no-op telemetry; the recording sink has only test reachability.
- **Current behavior:** No telemetry is emitted or retained.
- **Why this matters:** The seam suggests observability that the product intentionally does not have and adds a mount side effect with no outcome.
- **Root cause:** A speculative extension seam was retained without an implementation or contract.
- **Recommended change:** Remove the no-op/recording telemetry module, tests, import, and mount effect. If real telemetry is later approved, design it with privacy, consent, schema, transport, and operational requirements rather than reviving this placeholder.
- **What should not change:** Logs, user-visible behavior, provider disclosure, or privacy documentation claims.
- **Dependencies and prerequisites:** PHASE-001.
- **Regression risks:** Minimal; check that no development-only consumer is registered through configuration.
- **Required validation:** Knip, targeted Studio tests, `npm run quality`.
- **Suggested implementation phase:** PHASE-002
- **Estimated scope:** Small
- **Related findings:** COMP-001
- **PHASE-002 resolution evidence (2026-07-27):** Deleted `studio/telemetry.ts`, its test-only recorder/no-op test, the Studio import, memoized sink, view guard, and mount effect. Repository-wide source, configuration, environment, entrypoint, story, test, and Graphify searches found no other consumer or registration. Studio route canonicalization remains in the lazy state initializer, so mount behavior and user-visible routing are unchanged.

### [ARCH-001] Shared confirmation dialog is owned by Character Builder

- **Category:** Architecture and feature ownership
- **Severity:** Medium
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `apps/web/src/features/character-builder/ConfirmationDialog.tsx`; imports from `apps/web/src/features/legacy-projects/LegacyProjectManager.tsx` and `StudioApp.tsx`; shared UI exports.
- **Affected features or runtime flows:** Character draft discard, legacy project deletion, and other confirmation overlays.
- **Evidence:** The component is generic and is imported across feature boundaries by Legacy Projects and Studio composition. It contains no Character Builder policy.
- **Graphify evidence:** `graphify path "LegacyProjectManager" "ConfirmationDialog"` resolves directly through the cross-feature import; Studio is another consumer.
- **Current behavior:** A reusable accessible dialog works, but its physical/public ownership requires unrelated features to depend on Character Builder internals.
- **Why this matters:** It reverses feature ownership and makes deletion/reorganization of Character Builder riskier.
- **Root cause:** The first consumer owned an abstraction that subsequently became shared.
- **Recommended change:** Move the dialog to the existing shared UI/primitive boundary, expose a narrow shared export, and update consumers/tests without changing markup, focus, dismissal, labels, or overlay layering.
- **What should not change:** Do not create a new modal system or bypass `OverlayPanel`; preserve accessibility and responsive behavior.
- **Dependencies and prerequisites:** PHASE-002 so dead consumers are already removed.
- **Regression risks:** Focus restoration and stacking.
- **Required validation:** Dialog/component tests, Storybook a11y, relevant E2E, `npm run quality`.
- **Suggested implementation phase:** PHASE-003
- **Estimated scope:** Small
- **Related findings:** ARCH-002, COMP-001
- **PHASE-003 resolution evidence (2026-07-27):** Moved the unchanged generic component to `apps/web/src/ui/primitives/ConfirmationDialog.tsx`, exported it through the neutral UI barrel, and redirected Character Builder, Legacy Projects, Studio's lazy import, and the Storybook consumer. Added a focused stacked-dialog regression test covering initial cancel focus, topmost-only Escape dismissal, parent inert/assistive-technology isolation, and exact invoker focus restoration. The existing `OverlayPanel` remains the only modal/focus/stack implementation; no compatibility re-export or parallel modal system remains.
- **PHASE-003 validation and Graphify evidence (2026-07-27):** The focused ownership suite passes 57/57, `npm run quality` passes 93 files / 701 unit tests plus 21 Storybook files / 53 interaction-a11y tests and both builds, functional E2E passes 128 with 10 intentional skips, and Darwin visual regression passes 29/29. Graphify refreshed from 3,659 nodes / 8,245 edges to 3,663 / 8,260 with only the known non-source `hooks.json` zero-node warning. The Legacy Manager path now resolves to the neutral dialog, the old Builder-owned source is absent, and the module check reports 353 files / 952 local edges / zero cycles.

### [ARCH-002] Character generation remains owned by Prompt Workshop internals

- **Category:** Architecture and feature ownership
- **Severity:** High
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `apps/web/src/features/prompt-authoring/useReferencePreviewGeneration.ts`; Character Builder generation/controller/form files; `apps/web/src/features/media-session/imageValidation.ts`; `SessionComposer`/reference-field styles; re-export of `createEmptyGuidedDesign`.
- **Affected features or runtime flows:** Character reference upload, optimization, generate/edit/compose, and save.
- **Evidence:** Documentation and runtime say Character Builder exclusively owns character generation, yet Builder's `useCharacterReferenceGeneration` calls a hook in `prompt-authoring`. Six Builder modules import its source-key helper. Builder file validation imports media-session internals, and a Builder presentation component re-exports `createEmptyGuidedDesign` even though `characterModel` is canonical.
- **Graphify evidence:** `graphify path "useCharacterReferenceGeneration" "useReferencePreviewGeneration"` is a direct call. The prompt-authoring hook has Builder consumers but no current Workshop character consumer. Graph fan-out from Builder crosses prompt-authoring and media-session internals.
- **Current behavior:** Functionality works and lower-level generation has tests, but ownership does not match the implemented product boundary.
- **Why this matters:** Future Character Builder changes require touching retired/adjacent feature internals; deleting old Workshop code can accidentally remove live generation behavior.
- **Root cause:** The ownership migration moved presentation and top-level control before moving the reusable generation implementation and browser image-input primitives.
- **Recommended change:** Move the character-specific generation hook/source identity into Character Builder (or a focused reference-generation workflow module if API consumers prove it is genuinely cross-feature). Move only truly shared browser image validation/file-input constants to an existing neutral adapter/UI boundary. Import `createEmptyGuidedDesign` directly from `characterModel`; do not expose domain constructors through a component.
- **What should not change:** Optimizer reuse rules, explicit-cost actions, raw-prompt fallback prohibition, owner/source identity, abort/lock behavior, provider requests, upload semantics, or Prompt Workshop Add/Replace/Restyle.
- **Dependencies and prerequisites:** PHASE-001 tests and PHASE-002 dead-code removal.
- **Regression risks:** Provider calls, cancellation, stale preview detachment, and saved-reference identity.
- **Required validation:** Focused hook tests, Character Builder unit/Storybook/E2E, deny-external assertions, `npm run test:coverage`, `npm run quality`, `npm run test:e2e`.
- **Suggested implementation phase:** PHASE-003
- **Estimated scope:** Medium
- **Related findings:** TEST-001, DEAD-002, DUP-003, STATE-001
- **PHASE-003 resolution evidence (2026-07-27):** Moved `useReferencePreviewGeneration` and its complete request/cancellation/optimization-reuse tests into Character Builder, separated its pure source/optimization keys into Builder-owned `characterReferenceIdentity.ts`, and redirected upload, generation, persistence, launch, controller, and save-journal consumers. Moved decoded-image validation plus the accepted file-input media-type constant to the neutral browser-media adapter, and moved only the two existing reference fields' shared styles to the neutral UI primitive boundary; their duplicated DOM, validation effects, persistence, and object-URL policy remain feature-owned for PHASE-006. Removed `imageValidation` from the media-session barrel and removed the presentation-layer `CharacterBuilderForm` model re-exports; every `createEmptyGuidedDesign` consumer now imports `characterModel` directly.
- **PHASE-003 validation and Graphify evidence (2026-07-27):** Existing provider requests, retry UUID reuse, source identity, cancellation/late-result rejection, locking, upload validation, save/preload behavior, Prompt Workshop's local-only Add/Replace/Restyle boundary, and observable layout remain covered by the passing 701-unit/53-Storybook/128-functional/29-visual gates. `npm run test:coverage` passes at 83.37% statements, 71.99% branches, 85.19% functions, and 86.05% lines. Graphify places the generation hook and identity helpers under `features/character-builder`, validation under `adapters/browser-media`, and dialog/styles under `ui/primitives`; the retired prompt-authoring generation and media-session validation sources are absent. Source/module checks find no Builder imports of Prompt Workshop generation, media-session image validation, or media-session reference styles, and no cycles. The intentional Builder preload dependency on media-session draft policy/types remains because it is the explicit Studio handoff boundary, not generation ownership.

### [DUP-001] BFL and Wiro duplicate hardened task-download transport

- **Category:** Duplication and security maintenance
- **Severity:** High
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `apps/api/src/providers/bfl/safe-image-downloader.ts`; `apps/api/src/providers/wiro/safe-image-downloader.ts`; their tests; repeated bounded-JSON/delay helpers in provider clients.
- **Affected features or runtime flows:** Generated-image polling and download after BFL/Wiro tasks.
- **Evidence:** The two approximately 226/231-line downloaders are near copies: URL validation, DNS/private-network blocking, redirect revalidation, address pinning, byte limits, media-type checking, abort/deadline behavior, and error cleanup. Their tests repeat the same security matrix. Provider clients also repeat small `readLimitedJson`, abortable-delay, and response-size helpers.
- **Graphify evidence:** Both implementations converge at provider construction/reference generation but have no shared dependency. Graphify does not prove textual duplication; side-by-side source/test diffs do.
- **Current behavior:** Both adapters are hardened today. Protocol-specific submission/polling/status/error/cleanup behavior appropriately remains separate.
- **Why this matters:** A future SSRF, redirect, MIME, or size-limit fix can land in one provider and leave the other exposed.
- **Root cause:** Wiro was implemented from the proven BFL transport as a provider-local copy to preserve delivery speed and independence.
- **Recommended change:** Extract a focused API-internal safe remote-image downloader and small bounded-response primitives with explicit policy inputs. Share the common adversarial test contract and retain provider-specific wrapper/error translation. Do not unify task protocols, status machines, prompts, file deletion, or provider error semantics.
- **What should not change:** One deadline per provider operation, BFL trusted polling URL, Wiro pinned Task API, DNS/private-network rejection on every redirect, pinned-address connection, byte/MIME limits, abort behavior, and Wiro cleanup/dimension normalization.
- **Dependencies and prerequisites:** PHASE-003 complete; capture current shared security behavior in contract tests before moving code.
- **Regression risks:** Security regression, error-message drift, abort/deadline changes.
- **Required validation:** Both provider downloader/client suites, route/service integration, `npm run test:coverage`, `npm run quality`, `npm run test:production`.
- **Suggested implementation phase:** PHASE-004
- **Estimated scope:** Medium
- **Related findings:** DUP-002
- **PHASE-004 implementation evidence (2026-07-27):** Added one API-internal `SafeRemoteImageDownloader` with an explicit shared policy for HTTPS-only URLs, no credentials/fragments, three redirects, public DNS results only, pinned resolution, JPEG/PNG/WebP media, and the existing 32 MiB provider-byte limit. BFL and Wiro retain their original class/type exports as thin provider-error wrappers. Identical one-MiB bounded JSON reads, abortable polling delay, and one-operation deadline wiring now live in `providers/transport`; the separate BFL/Wiro submission endpoints, polling URLs, status/retry/error mapping, prompts, lifecycle events, Wiro multipart input, normalization, and remote cleanup were not combined. The two provider-local security implementations and duplicate downloader test files were removed.
- **PHASE-004 validation and Graphify evidence (2026-07-27):** A common 96-case adversarial contract passed against both wrappers before and after extraction, covering the full private/reserved IPv4/IPv6 matrix, mapped IPv4, URL forms, mixed/empty DNS, address pinning, literal IPs, every redirect hop and redirect bound, scheme downgrade, status/MIME/declared and streamed byte rejection, empty bodies, and abort propagation. Shared bounded/deadline primitives have focused tests; the complete BFL/Wiro/factory/service/route/app set passes 192/192. `npm run quality` passes 93 files / 778 unit tests, 21 files / 53 Storybook tests, all static checks and builds; coverage passes at 83.66% statements, 72.16% branches, 85.21% functions, and 86.40% lines; production smoke passes 1/1; functional E2E passes 128 with 10 intentional skips. Graphify refreshed from 3,663 nodes / 8,260 edges to 3,674 / 8,296 with only the known non-source `hooks.json` warning. Each provider reaches the shared transport in two hops through its wrapper; the wrappers meet only at `SafeRemoteImageDownloader`; both provider files import the bounded transport; factory/service/route paths and exports remain; the module check reports 355 files / 959 local edges / zero cycles.

### [DUP-002] Reference image service repeats asset finalization logic

- **Category:** Duplication and service cohesion
- **Severity:** Medium
- **Confidence:** High confidence
- **Status:** Resolved
- **Affected files:** `apps/api/src/features/reference-images/reference-image-service.ts` (generate/edit/compose paths around lines 276-451) and tests.
- **Affected features or runtime flows:** Persisting newly generated, edited, and composed immutable references.
- **Evidence:** Three operation paths repeat provider-result assertion, returned-image validation, metadata/audit construction, and asset-store persistence with variations in derivation and source IDs.
- **Graphify evidence:** All three public operations fan into the same asset store/validation dependencies while remaining separate high-level methods. `ReferenceImageService` has a large relationship neighborhood because it also coordinates idempotency and in-flight work.
- **Current behavior:** Repetition is behaviorally aligned but not yet divergent.
- **Why this matters:** Adding metadata, validation, provenance, or persistence guarantees requires synchronized edits across three cost-sensitive paths.
- **Root cause:** Operations were added independently to preserve explicit workflows.
- **Recommended change:** Extract one private typed finalization/persistence method parameterized only by derivation kind, validated source relations, provider result, and operation metadata. Keep provider calls, prompts, coordinator keys, input validation, and public methods explicit.
- **What should not change:** Asset identity, owner scoping, idempotency/coalescing, audit fields, provider cleanup ordering, error mapping, or public HTTP contracts.
- **Dependencies and prerequisites:** PHASE-004 to avoid simultaneous changes to provider transport and service finalization.
- **Regression risks:** Incorrect provenance/source IDs and subtle changes in when persistence occurs.
- **Required validation:** Full reference-image service/route/provider tests, contract parity, `npm run test:coverage`, `npm run quality`, `npm run test:production`.
- **Suggested implementation phase:** PHASE-005
- **Estimated scope:** Small-medium
- **Related findings:** DUP-001
- **PHASE-005 implementation evidence (2026-07-27):** Added one typed `ReferenceImageService.#finalizeReferenceImage` path parameterized only by the provider result, the operation-specific derivation/source relation, and prepared operation metadata. It now solely owns selected provider/model assertion, exact image-byte/MIME/dimension validation, common generated metadata and allowlisted provider audit construction, immutable store invocation, and the existing post-persistence remote-artifact cleanup boundary. Generate retains `provider.generate` and `{ kind: 'generate' }`; edit retains owner-scoped source resolution, its provider-only raw-change prompt, persisted prepared prompt, source ID, and SHA-256 change hash; composition retains owner-scoped source resolution, composition prompt, `provider.edit`, and source ID. Public replay/fingerprint checks, owner coordinator keys, provider availability checks, preparation, provider calls, prompt functions, error mapping, HTTP contracts, asset IDs/bytes, store behavior, transport, and cleanup ordering were not generalized or changed.
- **PHASE-005 validation and Graphify evidence (2026-07-27):** Parity tests were added before extraction and pin all three byte payloads, owner/request/audit fields, authoritative BFL provenance/usage, distinct v2 fingerprints, operation lineage, invalid-byte rejection before store, and cleanup only after each store attempt settles. The pre-change 14-file reference/provider/contract baseline passed 237/237 outside the restrictive sandbox; the final set passes 243/243. `npm run quality` passes 93 files / 784 unit tests, 21 files / 53 Storybook tests, all static/module checks and both builds; coverage passes at 83.66% statements, 72.19% branches, 85.21% functions, and 86.39% lines; production smoke passes 1/1. Graphify moved from 3,674 nodes / 8,296 edges to a 3,675 / 8,307 code checkpoint, then to 3,662 / 8,294 after the completed roadmap section self-removed, with only the known non-source `hooks.json` warning. Each generate/edit/compose helper reaches the finalizer in one hop; their outgoing call counts fell 6→3, 8→5, and 7→4, while each public operation remains at four outgoing calls with its route entry and distinct operation helper intact. The finalizer has exactly those three callers, no service node is orphaned, the sole graph-wide orphan remains the pre-existing OpenAI constant, and the module check reports 355 files / 962 local edges / zero cycles.

### [DUP-003] Reference-image fields duplicate file-picker/drop presentation

- **Category:** Duplication and reusable components
- **Severity:** Low
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** Character Builder `BuilderReferenceImageField` and media-session `ReferenceImageField`, associated styles/tests.
- **Affected features or runtime flows:** Builder persistent upload and Recipe Dock tab-ephemeral portrait/garment selection.
- **Evidence:** Both fields independently implement drag-depth state, drag enter/leave/drop handlers, hidden file input, image accept rules, preview shell, replace/remove actions, and closely related CSS. Validation, storage, labeling, and lifecycle differ.
- **Graphify evidence:** The fields are separate leaf presentation components with different feature parents and no shared primitive.
- **Current behavior:** Duplicate event/presentation behavior works; domain effects intentionally differ.
- **Why this matters:** Accessibility, drag/drop, and responsive fixes must be repeated and can drift.
- **Root cause:** Similar inputs were built in separate feature migrations before a stable presentation contract was clear.
- **Recommended change:** Extract a narrow controlled image-picker/drop-zone primitive that owns DOM/file/drag/a11y presentation only. Keep validation, persistence, immutable-asset behavior, ephemeral URL ownership, messages, and feature policy in each feature adapter. If the required prop surface becomes broader than the duplicated behavior, retain intentional duplication and mark this finding accepted.
- **What should not change:** Builder persistence versus Recipe Dock ephemerality, validation text, Remove semantics, object URL ownership, or source-specific labels.
- **Dependencies and prerequisites:** PHASE-003 establishes neutral validation/ownership first.
- **Regression risks:** Blurred lifecycle ownership and inaccessible labels.
- **Required validation:** Both component suites, Storybook interactions/a11y, upload E2E, `npm run quality`.
- **Suggested implementation phase:** PHASE-006
- **Estimated scope:** Small-medium
- **Related findings:** ARCH-002
- **PHASE-006 implementation evidence (2026-07-27):** Added the neutral controlled `ImagePickerDropField` and moved the existing shared responsive styles beside it. The primitive owns the hidden file input, existing input-reset variants, drag-depth and copy-drop mechanics, exact upload/replace/drop presentation, preview metadata, Remove action, focus return, and feedback/description wiring. `BuilderReferenceImageField` supplies immutable-upload labels, server-asset metadata, pending/error state, and upload/remove callbacks; media-session `ReferenceImageField` retains its asynchronous validation, stale-selection/unmount guard, warning/error policy, `URL.createObjectURL` call, and ephemeral/persisted distinction. The shared API contains presentation data and one file-selection callback; it has no storage, validation, generation, provider, asset, session-mode, or object-URL policy.
- **PHASE-006 validation and Graphify evidence (2026-07-27):** Regression tests were added before extraction and pin browser/JSDOM accessible names, accepted media types, guidance/error text, same-file picker reset, nested drag depth, drop validation, preview metadata, pending/recording disabling, Remove labels, and input focus recovery. The focused component/controller set passes 39/39; Storybook passes 21 files / 55 interaction-a11y tests; 12 targeted Builder/Recipe Dock upload E2E cases pass across Chromium, WebKit, and mobile; Darwin visual regression passes 29/29 without snapshot changes; and `npm run quality` passes 94 files / 790 unit tests, all static checks, and both builds. Graphify moved from 3,662 nodes / 8,294 edges to a 3,674 / 8,305 code checkpoint, then to 3,662 / 8,293 after roadmap self-removal and final test strengthening, with only the known non-source `hooks.json` warning. Both feature fields reach `ImagePickerDropField` in two hops through their source modules; the primitive has exactly those two feature imports plus the neutral UI re-export, all five style functions are reached only through it, Builder policy still reaches `useCharacterReferenceUpload`, Recipe Dock policy still reaches `useSessionDraftState`, and the module check reports 357 files / 965 local edges / zero cycles.

### [COMP-001] Studio composition root owns several independent lifecycle controllers

- **Category:** Component and orchestration design
- **Severity:** Medium
- **Confidence:** High confidence
- **Status:** Resolved
- **Affected files:** `apps/web/src/StudioApp.tsx` (848 lines) and adjacent Studio hooks/components.
- **Affected features or runtime flows:** Studio initialization, legacy manager, draft-discard/Builder launch, stage notices, overlays, and persistent media.
- **Evidence:** `StudioExperience` correctly composes the application but also owns legacy repository initialization/count/storage messaging; pending Character Builder launch and discard-confirmation promise state; stage-notice policy derivation; and large overlay prop wiring. It changed 15 times in the sampled last 80 commits.
- **Graphify evidence:** `StudioApp` has fan-out 38 (one of the highest non-barrel UI nodes) into feature hooks, adapters, dialogs, panels, and policy. It has low fan-in because it is the root, so changes have a broad impact surface.
- **Current behavior:** The root is functional and tests protect persistent stage identity. Size alone is not the finding; independent lifecycle responsibilities are.
- **Why this matters:** Unrelated changes collide in the root and render-level tests must configure many concerns.
- **Root cause:** Successive migrations kept coordination safe at the composition boundary but did not extract stable local controllers after behavior settled.
- **Recommended change:** Keep `StudioApp` as the composition root and one persistent `MediaStage`. Extract focused hooks/pure builders for (a) legacy-project availability, (b) Character Builder launch/discard coordination, and (c) stage-notice derivation. Extract overlay JSX only where it yields a narrow typed composition component; do not hide resource ownership or add global state/context.
- **What should not change:** Mount topology, media/session ownership, overlay system, sole route, command behavior, provider consent, responsive geometry, or app-owned contracts.
- **Dependencies and prerequisites:** PHASE-001, PHASE-002, and PHASE-003 so dead and misplaced responsibilities are gone first.
- **Regression risks:** Remounting stage/media, stale promise settlement, focus restoration, and changed notice priority.
- **Required validation:** New pure/hook tests; Studio composition/Storybook; all E2E and visual tests; `npm run test:coverage`; `npm run quality`.
- **Suggested implementation phase:** PHASE-007
- **Estimated scope:** Medium-large
- **Related findings:** DEAD-001, DEAD-003, ARCH-001, STATE-001
- **PHASE-007 implementation evidence (2026-07-27):** Added pure `deriveStudioStageNotices` policy with the unchanged notice IDs, copy, actions, dismissal rules, and priorities; added `useLegacyProjectAvailability` as the explicit owner of compatibility-repository construction/disposal, initialization, initial count, storage state, and manager count synchronization; and added `useCharacterBuilderLaunchController` for create/edit launch preparation, single-flight locking, discard-promise replacement/settlement, unmount cancellation, launch errors, and edit-draft preparation. `StudioApp.tsx` fell from 834 to 687 lines while keeping media/session/take/realtime ownership and all overlay JSX explicit. No overlay component was extracted because the panels do not share a narrow cohesive typed contract, and `useReferenceRecipeHandoff` was not changed.
- **PHASE-007 validation and Graphify evidence (2026-07-27):** Tests added before production extraction pin one mounted stage across overlay changes, exact visible notice priority and callbacks, legacy initialization/count/storage plus rejected/late work, replaced and unmounted discard-promise settlement, single-flight/error behavior, and stacked confirmation focus restoration. The affected set passes 81/81; `npm run quality` passes 97 files / 800 unit tests, 21 files / 55 Storybook interaction-a11y tests, all static checks, both builds, and a 363-file / 977-edge module graph with zero cycles. Coverage passes at 84.63% statements, 73.11% branches, 86.13% functions, and 87.33% lines; functional E2E passes 128 with 10 intentional skips; Darwin visual regression passes 29/29 without snapshot changes; production smoke passes 1/1. Graphify moved from 3,662 nodes / 8,293 edges to a 3,686 / 8,346 code checkpoint and 3,673 / 8,333 after roadmap self-removal; `StudioApp` graph degree fell 83→73 and `StudioExperience` 26→24, while the three focused units have direct tests and degrees of 5–7. `main.tsx → StudioApp.tsx → MediaStage()` remains two hops, and source/module checks find one root/stage, no cycle, global/context/singleton, reverse-feature edge, or direct root ownership of the extracted feature policies.

### [STATE-001] Recipe handoff facade mixes five stateful workflows

- **Category:** State and orchestration
- **Severity:** Medium
- **Confidence:** Confirmed
- **Status:** Resolved
- **Affected files:** `apps/web/src/studio/useReferenceRecipeHandoff.ts` (550 lines) and tests/callers.
- **Affected features or runtime flows:** Active recipe identity, reference hydration/retry, recent attribution, Workshop handoff, and Character Builder preload.
- **Evidence:** One hook coordinates exact active-recipe matching, asynchronous owner-scoped reference hydration and error/retry, recent selection attribution, Workshop draft/open/save/replace policy, and Builder preload. Coverage is approximately 72% statements but only 50% functions.
- **Graphify evidence:** `graphify explain` reports degree 15; source-derived fan-out is 16. Direct dependencies include canonical prompt computation, reference hydration/identity, Workshop drafts, library mode replacement, and Builder preload.
- **Current behavior:** A single facade is valuable to Studio callers, but its internal responsibilities and async transitions are coupled.
- **Why this matters:** A change to one handoff mode can affect reference loading or another editor, and tests need broad setup.
- **Root cause:** The facade accumulated each cross-tool integration to keep StudioApp's call site stable.
- **Recommended change:** Preserve the public facade while extracting internal focused units for active-recipe identity, reference hydration/retry, Workshop coordination, and Builder preload/attribution. Prefer pure reducers/helpers and small hooks with explicit inputs; maintain one authoritative recipe/reference state and operation-token/cancellation semantics.
- **What should not change:** Exact recipe identity rules, retry behavior, owner scoping, recent attribution, draft blocking/discard confirmation, preload semantics, or the facade consumed by Studio.
- **Dependencies and prerequisites:** PHASE-001 tests, PHASE-003 ownership correction, and PHASE-007 root decomposition.
- **Regression risks:** Stale async commits, duplicate hydration, blocked-draft policy changes, or multiple sources of truth.
- **Required validation:** Focused new tests plus existing recipe/reference/Workshop/Builder suites, `npm run test:coverage`, `npm run quality`, `npm run test:e2e`, `npm run test:visual`.
- **Suggested implementation phase:** PHASE-008
- **Estimated scope:** Medium-large
- **Related findings:** TEST-001, ARCH-002, COMP-001
- **PHASE-008 implementation evidence (2026-07-28):** `useReferenceRecipeHandoff` remains the only Studio-facing composition facade with the same options, return keys, and exported `ActiveStudioRecipe`, `PromptCommittedHandler`, and `isExactActiveRecipe` contracts. Pure identity/fingerprint/reducer/derivation policy now lives in `referenceRecipeIdentity.ts`; `useReferenceRecipeHydration.ts` is the sole Shelf/Workshop metadata-plus-content hydration, exact retry, error, abort, token, and atomic commit controller; `useReferenceRecipeWorkshop.ts` owns Workshop draft/source/open/use/save/replacement coordination; and `useReferenceRecipeAttribution.ts` owns exact Recent attribution, Builder save-preload bridging, and blocking precedence. No global state, cache, context, alternate facade, UI/API/provider change, or parallel recipe/reference source was introduced.
- **PHASE-008 state/effect matrix:** Direct or Workshop use first applies the unchanged dirty-draft/replacement guard. A reference-backed success fetches owner-scoped metadata and content once with one shared abort signal, then invokes the facade's single `session.replaceRecipeDraft` commit and only after that updates exact identity/attribution, Workshop source state, and overlay closure. A metadata/content failure preserves the exact pending recipe, keeps the overlay open, exposes the existing not-found or generic error, and retries the same input; explicit text-only recovery performs no reference reads and commits `referenceImage: null` with enhancement off. Duplicate in-flight use is ignored. Unmount/abort or a superseding generation token rejects late metadata, content, commit, repository, and overlay effects even when the transport later resolves. A commit failure retains retry state and performs no identity/attribution/close effect. Workshop open/use/save preserves existing source matching, canonical prompt, ephemeral-reference, dirty-draft, replacement, and save-status rules. Builder preload preserves external-error → dirty Shelf → replace guard → hydration-pending block precedence and the existing saved-character preload path. Generated, uploaded, saved-character, and standalone Recent transitions retain their original prompt, enhance, exact-fingerprint, name, and character attribution rules.
- **PHASE-008 tests/coverage (2026-07-28):** Tests were added before extraction for owner-scoped not-found retry, one metadata/content/commit path, shared abort signals, same-turn duplicate use, unmount with a transport that resolves late, commit failure/retry, legacy Workshop source/open/use/save behavior, blocking precedence, text-only recovery, and pure identity/attribution decisions. The focused recipe/reference/Workshop/Builder set passes 35 files / 222 tests; the new and facade-focused set passes 10 files / 53 tests. `npm run quality` passes 101 files / 815 unit tests, 21 files / 55 Storybook tests, all static checks and builds, and a 370-file / 1,008-edge module graph with zero cycles. Coverage passes at 84.97% statements, 73.77% branches, 86.55% functions, and 87.68% lines; identity is 100% statements/functions/lines, hydration is 93.24% statements / 83.01% branches / 100% functions / 98.43% lines, attribution is 90.9% / 89.47% / 81.81% / 90.56%, and the facade is 89.28% / 54.54% / 66.66% / 88.88%. Functional E2E passes 128 with 10 intentional skips; Darwin visual regression passes 29/29 without snapshot changes.
- **PHASE-008 Graphify evidence (2026-07-28):** The pre-change graph held 3,673 nodes / 8,333 edges; the code checkpoint reached 3,716 / 8,458. The `useReferenceRecipeHandoff` symbol degree fell 15→12 and its module degree 47→33. Its unchanged caller path remains `StudioExperience → useReferenceRecipeHandoff`; direct dependencies now form identity, hydration, Workshop, and attribution clusters with degrees 4–9 and direct focused tests. The facade no longer directly calls reference metadata/content APIs, canonical Workshop prompt helpers, `useWorkshopDrafts`, or `useCharacterStudioPreload`. Source and graph checks find one Shelf/Workshop hydration controller and one facade commit callback; the separate Builder save-preload hydration remains its intentional operation boundary. No dynamic import, cycle, reverse-feature ownership, orphan, duplicate entry path, global/context/singleton, or public export/caller change appeared. The final documentation refresh is recorded in the PHASE-008 implementation record.
- **PHASE-008 limitations/new findings:** Live devices/providers and paid traffic were not exercised; those remain gated manual checks. `npm run audit:prod` remains outside this phase's required scope. Initial sandboxed quality and Graphify attempts reproduced only the known loopback/permission `EPERM`; permitted reruns passed. No new cleanup finding was discovered.

### [DOC-001] Canonical image-generation document filename is misspelled

- **Category:** Documentation
- **Severity:** Low
- **Confidence:** Confirmed
- **Status:** Open
- **Affected files:** `docs/Image_Generartion.md`; `README.md:165-170`; any internal references.
- **Affected features or runtime flows:** Developer navigation only.
- **Evidence:** “Generartion” is misspelled in both the canonical filename and documentation-map link.
- **Graphify evidence:** Markdown link/file inventory confirms the typo is the referenced canonical path; runtime modules are unaffected.
- **Current behavior:** The link resolves only because both sides share the typo.
- **Why this matters:** It weakens discoverability and perpetuates incorrect references.
- **Root cause:** Original filename typo became canonical.
- **Recommended change:** Rename to `docs/Image_Generation.md`, update all repository links, and verify link integrity. Preserve historical rationale/content.
- **What should not change:** Document meaning or runtime implementation.
- **Dependencies and prerequisites:** Complete structural phases first so final docs describe the end state.
- **Regression risks:** Broken external bookmarks; use a repository redirect only if the documentation host supports one without keeping duplicate content. Otherwise record the rename.
- **Required validation:** Repository link search/check, `npm run quality`.
- **Suggested implementation phase:** PHASE-009
- **Estimated scope:** Small
- **Related findings:** TOOL-001

## 6. Dead-code and unused-code inventory

### Confirmed

| Candidate                                                       | Type                           | File path                                           | Evidence                                                                                   | Graphify reachability result                                    | Other usage checks performed                                                    | Confidence | Recommended action                                           | Related finding |
| --------------------------------------------------------------- | ------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------ | --------------- |
| Guided create/commit/revision/write pipeline                    | APIs, types, branches, tests   | `features/guided-flow/projectRepository.ts`         | Only tests/stories call authoring APIs; no current route can create/reopen Guided projects | Runtime graph reaches only list/read/delete/migration consumers | Entrypoints, routes, dynamic imports, stories, tests, docs                      | Confirmed  | Delete after compatibility fixtures protect retained records | DEAD-001        |
| `requestPersistentProjectStorage` and write-retention reporting | Utility/API                    | Same repository                                     | No runtime caller                                                                          | Test-only neighborhood                                          | Full `rg`, imports/exports, Knip, graph                                         | Confirmed  | Remove with authoring pipeline                               | DEAD-001        |
| `createEmptyGuidedProjectData` public surface                   | Constructor/export             | Guided project types/repository                     | Test/story-only after Guided retirement                                                    | No application entry path                                       | Public exports and package consumers checked; app is not published as a library | Confirmed  | Remove or make fixture-local                                 | DEAD-001        |
| Hidden demo starter picker                                      | Unreachable JSX/handler/styles | `CharacterBuilderForm.tsx` and CSS                  | Constant false; absence asserted                                                           | No reachable render branch                                      | Catalog runtime uses separately checked                                         | Confirmed  | Remove presentation branch only                              | DEAD-002        |
| Recording telemetry sink/no-op mount event                      | Service/effect/test            | `apps/web/src/studio/telemetry.ts`, `StudioApp.tsx` | Recording sink test-only; production sink discards event                                   | Production path terminates at no-op                             | Config/env/docs/entrypoints checked                                             | Confirmed  | Remove seam                                                  | DEAD-003        |

### Retained after verification

| Candidate                                      | Why it first appeared unused | Reachability/usage result                                                                                | Decision                                                        |
| ---------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Nine starter catalog records/assets            | Picker is disabled           | Used for legacy character identity/hydration and default preview                                         | Retain; only delete picker presentation                         |
| Legacy Guided repository as a whole            | Guided route is retired      | Legacy manager and Character Builder migration still list/read/download/delete/migrate persisted records | Retain a reduced compatibility repository                       |
| Compatibility SPA redirects                    | `/` is the only page         | Server/Vite route handling intentionally canonicalizes old/unknown paths without remounting              | Retain contract                                                 |
| Reference assets without browser relationships | Can look orphaned            | Asset store intentionally lacks a complete reference graph and ordinary delete route                     | Retain until explicit operator garbage-collection policy exists |

No additional file was classified dead solely from text search. Knip passed, framework/tool entry points were inspected, and dynamic imports were traced.

## 7. Duplication and reuse map

| Shared responsibility                     | Existing implementations                                                               | Material differences                                                           | Divergence risk                                   | Reuse appropriate?                               | Recommended boundary                                               | Finding           |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ | ----------------- |
| Safe remote image download                | Shared API-internal transport plus thin BFL/Wiro wrappers and one adversarial contract | Provider wrappers/error translation differ; download security policy is shared | Consolidated in PHASE-004                         | Implemented                                      | API-internal downloader with explicit policy and provider wrappers | DUP-001 resolved  |
| Bounded response reads/delay              | Shared bounded JSON, abortable delay, and operation-deadline primitives                | Error labels and task protocols differ                                         | Consolidated only where contracts are identical   | Implemented for byte/deadline primitives         | Provider-transport helpers, not a generic client                   | DUP-001 resolved  |
| Persist provider image as immutable asset | One typed finalizer consumed by generate/edit/compose                                  | Derivation/source metadata remain explicit at callers                          | Consolidated in PHASE-005                         | Implemented                                      | Service-private asset finalizer                                    | DUP-002 resolved  |
| Drag/drop image selection                 | Shared neutral `ImagePickerDropField` plus two thin feature adapters                   | Persistence, validation, URLs, labels remain feature-owned                     | Consolidated in PHASE-006                         | Implemented for controlled DOM/a11y presentation | Shared image-picker/drop primitive                                 | DUP-003 resolved  |
| Provider task state/error mapping         | BFL and Wiro provider clients                                                          | Protocol/status/error/cleanup semantics materially differ                      | Abstraction would hide important differences      | No                                               | Preserve provider-local logic                                      | Rejected/deferred |
| Browser persistence                       | Recipe localStorage, Builder draft IndexedDB, legacy Guided IndexedDB                  | Durability, migration, data model, fallback, and lifecycle differ              | Generic abstraction would couple unrelated stores | No                                               | Preserve focused repositories                                      | Rejected/deferred |

## 8. Component and module hotspots

| Hotspot                                    | Evidence                                                                       | Why it is a hotspot                                                                | Direction                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| `StudioApp.tsx`                            | 848 lines; fan-out 38; 15 edits in sampled 80 commits                          | Root plus multiple independent lifecycle controllers and overlay wiring            | COMP-001; keep composition root/stage topology |
| `useReferenceRecipeHandoff.ts`             | 550 lines; fan-out 16; Graphify degree 15                                      | Five stateful workflows and async reference coordination behind one facade         | STATE-001; preserve facade, split internals    |
| `projectRepository.ts`                     | 1,106 lines; Graphify degree 65                                                | Compatibility reads mixed with retired authoring/revision machinery                | DEAD-001                                       |
| `reference-image-service.ts`               | 562 lines; central to three operations and owner-scoped coordinator            | High-impact persistence remains central; repeated finalization is consolidated     | DUP-002 resolved                               |
| BFL/Wiro adapters                          | Separate provider protocols plus two thin wrappers over one hardened transport | Security policy is consolidated while provider protocols remain distinct           | DUP-001 resolved                               |
| `useTakeReviewFlow.ts`                     | Critical lifecycle hook now at 98.61% statement coverage                       | Ordered settlement and cleanup behavior has direct focused protection              | TEST-001 resolved                              |
| `useCharacterReferenceGeneration.ts`       | Critical provider-cost adapter now at 86.66% statement coverage                | Validation, locking, retry, cancellation, and stale boundaries are directly tested | TEST-001 and ARCH-002 resolved                 |
| `MediaStage.tsx`                           | 561 lines but stable cohesive ownership                                        | Owns persistent media DOM and stage presentation; broad test protection            | Preserve; do not split by size alone           |
| `packages/domain/src/assets/operations.ts` | 615 lines but pure/cohesive and highly tested                                  | Related immutable asset/recipe operations share one domain aggregate               | Preserve pending a real change axis            |

Barrel modules (`packages/domain/src/index.ts`, `packages/contracts/src/index.ts`, and shared UI index) have fan-in around 52 by design. They are public boundaries, not hotspots to dissolve.

## 9. Dependency and architecture observations

- **Cycles:** The PHASE-006 `npm run check:modules` refresh analyzed 357 files and 965 local edges with zero cycles.
- **Layering:** No React/provider dependency was found in domain/contracts. The audited feature-ownership violations (`ARCH-001`, `ARCH-002`) are resolved.
- **Critical shared modules:** Contract and domain barrels have high fan-in; `StudioApp` has high fan-out. Changes to contracts/domain must remain backwards compatible across web/API tests.
- **Cross-feature path:** Legacy Projects, Studio, and Builder consume confirmation UI from `ui/primitives`; Builder owns generation/source identity and consumes neutral browser-image validation. Builder and media-session now share only `ImagePickerDropField` presentation and its styles; immutable upload/persistence and tab-ephemeral validation/object-URL effects remain on separate feature paths.
- **Runtime shape:** There is one web route and one server composition path. No hidden router, global store, DI container, background job registry, or product database was found.
- **Dynamic imports:** Rare panels and provider SDKs are intentional lazy boundaries. They were included in reachability checks, so no lazy module was labeled dead.
- **Type/data flow:** Strict TypeScript and Zod runtime schemas are used at trust boundaries. No credible broad `any`/unsafe-cast cleanup finding was identified.
- **Async/resources:** Existing abort signals, operation tokens, idempotency, subscriber-aware coalescing, and owned cleanup are substantive strengths. No unbounded retry or verified leak was found.
- **Performance:** Vite warns that the dynamic LiveKit chunk is about 508 KB and Storybook has large tooling chunks. The SDK is intentionally lazy and no user-impact measurement supports a performance finding.
- **Graph freshness:** Graph metadata lags the audited commit even though content was incrementally current. Future phases must run `graphify update .` and record the resulting commit alignment/content.

## 10. Baseline validation results

The exact results are recorded in section 1. The baseline conclusion is:

- Core types, lint, formatting, unused-code analysis, dependency boundaries, unit/component tests, and production builds pass.
- Coverage passes but is not sufficiently risk-targeted (`TEST-001`).
- Functional E2E has one pre-existing stale scenario replicated across three projects (`TEST-002`).
- Visual validation has 15 pre-existing Darwin diffs and incomplete Linux assets/tooling (`TOOL-001`).
- Production static-serving smoke passes.
- Production advisory audit was not authorized in this environment.
- Live device/provider behavior was not run by design; use the existing manual/gated documents.
- The local optional dependency-tree anomaly is an installation-state limitation. Reproduce dependency integrity with a fresh Node 24 checkout and `npm ci`; do not mutate the developer's current `node_modules` merely to clean this audit.

Build output warned about chunks above Vite's default 500 KB advisory threshold. This is not a failing gate and is intentionally deferred absent measurement.

PHASE-001 completion supersedes only the failing test/visual conclusions above: functional E2E now passes 128 cases with 10 intentional skips, Darwin visual passes 29/29, Linux/amd64 visual passes 29/29, and the pruning inventory verifies all 58 platform assets. The original audit baseline is retained here as historical evidence.

## 11. Rejected or intentionally deferred suggestions

| Suggestion                                        | Decision and evidence                                                                                                                                                        |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Split every large file                            | Rejected. `MediaStage` and domain asset operations are cohesive, well tested, and have clear owners. Findings target responsibility/lifecycle coupling, not line count.      |
| Add Redux/global context/router                   | Rejected. The app has one route, resource ownership is intentionally local, and no prop/state problem justifies new global infrastructure.                                   |
| Replace all persistence with a generic repository | Rejected. Recipe, Builder draft, generated asset, and legacy project stores have materially different durability and compatibility contracts.                                |
| Merge BFL/Wiro adapters wholesale                 | Rejected. Only hardened download/bounded transport is stable duplication; task protocols, status mapping, errors, cleanup, and dimensions must stay provider-specific.       |
| Delete the entire legacy repository               | Rejected. Existing browser data must remain downloadable/deletable and Builder migration still consumes it.                                                                  |
| Delete starter catalog/assets                     | Rejected. They remain valid compatibility data even though the picker is unreachable.                                                                                        |
| Add reference-asset garbage collection            | Deferred. The service deliberately lacks a complete relationship graph; deletion could lose assets. It requires a separate operator/product retention design.                |
| Update dependencies broadly                       | Rejected. No documented defect requires a large upgrade, core validation passes, and production audit was not authorized.                                                    |
| Optimize/memoize based on bundle warnings         | Rejected. Rare surfaces/SDKs are already dynamic and there is no measured render or load problem.                                                                            |
| Remove compatibility redirects                    | Rejected. They are an explicit route contract, not pages to revive or dead routes.                                                                                           |
| Change recording memory policy                    | Deferred. Current caps and measurement guidance are documented; cleanup is not authorization to alter product/resource policy.                                               |
| Add remote deployment controls                    | Out of scope. The application explicitly supports loopback only; authentication, tenancy, CSRF, rate limits, and operations require a separate product/architecture project. |
| Treat local `npm ls` as a source defect           | Rejected. Optional platform artifacts are local installation state, while clean-install CI and all builds pass. Recheck in a disposable fresh install.                       |
| Accept all visual snapshots automatically         | Rejected. Current diffs visibly include UI changes and must be reviewed scenario by scenario before updating baselines.                                                      |

## 12. Recommended implementation order

1. **PHASE-001 (completed):** Restore trustworthy validation (`TEST-001`, `TEST-002`, `TOOL-001`).
2. **PHASE-002 (completed):** Remove only confirmed retired/unreachable code while preserving persisted data (`DEAD-001`–`003`).
3. **PHASE-003 (completed):** Correct shared/feature ownership after the Character Builder migration (`ARCH-001`, `ARCH-002`).
4. **PHASE-004 (completed):** Consolidate duplicated provider-safe download primitives (`DUP-001`).
5. **PHASE-005 (completed):** Consolidate service-private reference asset finalization (`DUP-002`).
6. **PHASE-006 (completed):** Share the narrow image-picker/drop presentation seam while preserving separate feature lifecycle policy (`DUP-003`).
7. **PHASE-007 (completed):** Decompose independent Studio root controllers without changing mount topology (`COMP-001`).
8. **PHASE-008:** Decompose recipe handoff internals behind the existing facade (`STATE-001`).
9. **PHASE-009:** Reconcile canonical documentation and filename (`DOC-001`).

This order deliberately establishes tests before risky changes, removes obsolete responsibilities before choosing boundaries, and defers orchestration decomposition until ownership and shared primitives are stable.

## 13. PHASE-001 implementation record

PHASE-001 is complete. Production runtime modules, contracts, persistence, provider adapters, and pixel thresholds were unchanged.

- **Changed tests/tooling:** Current local-only Workshop E2E; direct take-review and reference-generation hook tests; expanded Builder-controller tests; shared visual-matrix registration; non-destructive pruning inventory test; pruning script exact-set consumption; reviewed Darwin and Linux platform snapshots.
- **Validation:** `npm run quality` passed (93 files / 706 unit tests, 21 files / 53 Storybook tests, types, lint, format, Knip, module check, production/Storybook builds). `npm run test:coverage` passed at 82.79/71.55/84.19/85.46. `npm run test:e2e` passed 128 with 10 intentional skips. `npm run test:production` passed 1/1. The pruning unit test passed 2/2 and `npm run screenshots:prune -- --check` verified 29 curated baselines across both platforms with zero missing/removable files. Clean visual runs passed 29/29 on Darwin and 29/29 in Linux/amd64; the four new Linux assets also passed a focused 4/4 generation run.
- **Visual review:** The 15 approved Darwin diffs and Linux refresh consistently show the current status header, stage control strip, modal copy, and responsive layout. The four new Linux assets cover desktop/small-mobile AI experience choice and Add-object Prompt Workshop. No threshold was raised and no unrelated visual case was accepted without review.
- **Graphify:** `graphify update .` refreshed the code graph from 3,699 nodes / 8,342 edges to 3,726 / 8,404 at the partial checkpoint, then to 3,711 / 8,389 after the final assets, documentation reconciliation, and roadmap-section removal. Both refreshes repeated only the known non-source `hooks.json` zero-node warning. Direct path checks show one-hop focused-test imports to `useTakeReviewFlow`, `useCharacterReferenceGeneration`, and `useCharacterBuilderController`; `prune-visual-baselines.mjs` imports the shared `studioVisualMatrix.ts` inventory in one hop. Knip passes, and `npm run check:modules` reports 352 files / 947 local edges / zero cycles. No production runtime module was edited.
- **Limitations:** `npm run audit:prod` was not run because the phase requires explicit authorization before sending dependency metadata externally. The Playwright image's bundled npm 11.13 rejected the existing lockfile while the repository-compatible npm 11.6.2 completed isolated Linux installs on both architectures; no dependency or lockfile normalization was folded into this visual/test phase.
- **Plan status at PHASE-001 completion:** TEST-001, TEST-002, and TOOL-001 were resolved. PHASE-001 had self-removed from `projectCleanupImplementationPlan.md`; PHASE-002 was next.

## 14. PHASE-002 implementation record

PHASE-002 is complete. The IndexedDB database name, version, store/index schema, persisted record shape, starter catalog/assets, current route behavior, and provider boundaries were unchanged. No runtime migration or record deletion ran.

- **Changed code/tests:** The Guided compatibility repository lost its create/commit/revision/artifact-write/snapshot-flush/durable-retry/retention surface and is now read/list/artifact-read/delete/migration only. Representative raw IndexedDB compatibility fixtures replaced authoring tests. The constant-false starter-picker presentation and its orphaned model/styles/tests/story text were removed while the nine-record catalog remains. The no-op Studio telemetry module, test, import, and mount effect were deleted.
- **Size:** `projectRepository.ts` fell from 1,106 to 580 lines; its focused test became a 438-line compatibility-fixture suite instead of 615 lines of authoring tests; Guided public types fell from 160 to 103; Character Builder form/styles/model lost 209 lines; telemetry source/test lost 53 lines; Studio lost the 14-line no-op effect. The final phase diff contains 394 insertions and 1,445 deletions across code, tests, stories, E2E, Graphify output, and canonical documentation, with insertions concentrated in compatibility fixtures and the historical implementation record.
- **Validation:** The pre-change focused baseline passed 36/36. After implementation, focused repository/Legacy Manager/Builder migration/form/catalog/model/Studio coverage passed 57/57. `npm run quality` passed outside the restrictive sandbox: 92 files / 700 unit tests, 21 files / 53 Storybook tests, types, lint, format, Knip, module checks, production builds, and Storybook build. `npm run test:coverage` passed at 83.37% statements, 71.98% branches, 85.19% functions, and 86.05% lines. `npm run test:e2e` passed 128 with 10 intentional skips across Chromium, WebKit, and mobile. The first sandboxed quality run had the already-characterized loopback `listen EPERM`; the authorized rerun passed.
- **Graphify:** Pre-change queries showed runtime reachability only through Studio initialization/state, Legacy Manager list/load/read/delete, and Character Builder migration. The final `graphify update .` refresh moved 3,711 nodes / 8,389 edges to 3,659 / 8,245 after roadmap self-removal and read-only fallback preservation, repeating only the known non-source `hooks.json` zero-node warning. Direct graph/source inspection finds no authoring, flush, retention, hidden-picker, starter-default, or telemetry code nodes. Retained paths still connect Studio to the compatibility repository and Legacy Manager, migration to project list/load, and migration/model hydration to `CHARACTER_STARTERS`. Knip passes; `npm run check:modules` reports 350 files / 945 local edges / zero cycles.
- **Documentation:** Architecture, Manual QA, Product Evolution, this findings history, and the live implementation plan now describe the reduced compatibility boundary and retired picker accurately. No current user journey changed.
- **Limitations/new findings:** Live browser data was not mutated for validation; deterministic raw IndexedDB fixtures protect the exact compatibility contract without risking user records. No new cleanup finding was discovered. Production dependency audit and visual snapshots were outside this phase's required validation and were not changed.
- **Plan status:** DEAD-001, DEAD-002, and DEAD-003 are resolved. PHASE-002 has self-removed from `projectCleanupImplementationPlan.md`; PHASE-003 was next.

## 15. PHASE-003 implementation record

PHASE-003 is complete. Provider requests, persisted asset/data shapes, source
identity values, optimization reuse, retry IDs, cancellation and lock behavior,
Prompt Workshop intents, `OverlayPanel`/`MediaStage` topology, reference-picker
DOM, and visible layout were unchanged.

- **Changed ownership:** `ConfirmationDialog` moved from Character Builder to `ui/primitives` with a narrow shared UI export and Studio lazy import. Preview generation plus source/optimization identity moved from Prompt Workshop internals to Character Builder. Decoded-image validation and accepted input types moved from media-session to the neutral browser-media adapter. Existing reference-field styles moved to `ui/primitives`; picker policy/effects remain in their two features for PHASE-006. `CharacterBuilderForm` no longer re-exports model functions, and all empty-design consumers import `characterModel` directly.
- **Tests:** The moved preview-generation suite continues to cover request shape, optimization reuse, retry UUID reuse, edit/compose routing, owner abort, cancellation, and stale completion. A new focused shared-dialog test pins stacked focus/isolation, topmost-only Escape dismissal, and exact return focus. The focused ownership set passes 57/57.
- **Validation:** `npm run quality` passes outside the restrictive sandbox: 93 files / 701 unit tests, 21 files / 53 Storybook interaction-a11y tests, types, lint, format, Knip, 353-file/952-edge module checks with zero cycles, production build, and Storybook build. `npm run test:coverage` passes at 83.37% statements, 71.99% branches, 85.19% functions, and 86.05% lines. Functional E2E passes 128 with 10 intentional skips across Chromium, WebKit, and mobile. Darwin visual regression passes 29/29. The first sandboxed quality run reached the unit suite but its loopback listener received the already-characterized `EPERM`; the authorized rerun passed.
- **Graphify:** Pre-change paths showed Legacy Manager importing a Builder-owned dialog and Builder calling the Prompt Workshop-owned generation hook directly. `graphify update .` refreshed 3,659 nodes / 8,245 edges to 3,663 / 8,260 and repeated only the known non-source `hooks.json` zero-node warning. The graph now locates dialog/styles in neutral UI, generation/identity in Builder, and validation in browser-media. Obsolete source paths are absent; source and module checks find no Builder dependency on Prompt Workshop generation or media-session validation/styles, and no orphan compatibility export remains.
- **Documentation:** Architecture and the canonical image-generation implementation map now name the new physical owners. The current user journeys already described the correct observable Builder/Workshop behavior and required no behavioral rewrite. ARCH-001 and ARCH-002 retain their original evidence and now include resolution records.
- **Limitations/new findings:** No new cleanup finding was discovered. Live provider/device checks remain manual and gated; no paid traffic ran. `npm run audit:prod` remains outside the authorized scope, matching the existing plan limitation.
- **Plan status:** ARCH-001 and ARCH-002 are resolved. PHASE-003 has self-removed from `projectCleanupImplementationPlan.md`; PHASE-004 is next.

## 16. PHASE-004 implementation record

PHASE-004 is complete. Provider selection, public HTTP/contracts, billable
submission counts, prompts, polling URLs, retry/status/error semantics, lifecycle
metadata, provider output, local persistence, and cleanup ordering were unchanged.

- **Changed transport/tests:** The BFL and Wiro provider-local downloader copies now contain only their preserved exports and provider-specific error wrappers. `providers/transport/safe-remote-image-downloader.ts` is the sole URL, DNS/private/reserved-address, redirect, address-pinning, MIME, and image-byte implementation and owns one explicit shared policy. `bounded-provider-transport.ts` owns only the identical one-MiB JSON reader, abortable delay, and one-operation deadline mechanics. One common 96-case contract replaces the duplicate downloader suites; BFL/Wiro provider, normalization, error, factory, service, route, and app tests remain provider-specific.
- **Security invariants:** Every initial or redirected URL remains HTTPS-only and rejects credentials/fragments; every hostname or literal address must resolve entirely to public IPv4/IPv6 space before a request; the validated address set is pinned into the TLS connection; redirects remain capped at three and are fully revalidated; only JPEG/PNG/WebP with positive bounded content is accepted; streamed bytes remain capped at 32 MiB; request abort flows through unchanged. Both providers still apply one deadline across submission, status polling, and download.
- **Provider-specific behavior:** BFL still submits once to the pinned US2 FLUX.2 Pro endpoint, accepts only its trusted regional API polling URL, forwards the returned URL exactly, and retains its status/retry/lifecycle/error mapping and raw-base64 source contract. Wiro still submits once to the pinned Seedream Run API, polls only `Task/Detail`, signs each request, validates task/model/output metadata, uses multipart source upload, normalizes all three output shapes, and retains best-effort `InputOutputDelete` after local persistence settles. Neither provider falls back.
- **Validation:** The pre-change focused baseline passed 115/115 outside the restrictive sandbox; its only sandboxed failure was the already-characterized loopback `EPERM`. The final focused provider/reference suite passes 192/192. `npm run quality` passes 93 files / 778 unit tests, 21 files / 53 Storybook tests, type/lint/format/Knip/module checks and both builds. `npm run test:coverage` passes at 83.66/72.16/85.21/86.40. `npm run test:production` passes 1/1. `npm run test:e2e` passes 128 with 10 intentional skips.
- **Graphify:** The initial graph showed two independent degree-seven downloader classes and no shared dependency. `graphify update .` refreshed 3,663 nodes / 8,260 edges to 3,674 / 8,296, repeating only the known non-source `hooks.json` zero-node warning. The wrappers now meet in two hops only at `SafeRemoteImageDownloader`; both protocol providers independently import the bounded transport and still reach the factory/app/service/routes through their preserved provider contract. The common contract imports both wrappers. `npm run check:modules` reports 355 files / 959 local edges / zero cycles.
- **Documentation:** Architecture and the canonical image-generation implementation map now name the shared transport ownership. Privacy and live-provider smoke behavior did not change, so their operational instructions remain accurate.
- **Limitations/new findings:** Live provider/device checks remain manual and gated; no credentials, paid traffic, or provider-hosted artifacts were used. The first sandboxed Graphify refresh received `EPERM`; the permitted rerun succeeded. No new cleanup finding was discovered.
- **Plan status:** DUP-001 is resolved. PHASE-004 has self-removed from `projectCleanupImplementationPlan.md`; PHASE-005 is next.

## 17. PHASE-005 implementation record

PHASE-005 is complete. Public routes/contracts, request and asset IDs, byte
content, owner scoping, idempotency/coalescing, provider selection and transport,
provider prompts/calls, error mapping, persistence behavior, and remote cleanup
ordering were unchanged.

- **Changed service/tests:** `ReferenceImageService` now has one typed private finalizer receiving a provider result, explicit generate/edit/compose derivation, and prepared operation metadata. It alone asserts authoritative provider/model provenance, validates returned bytes and exact output dimensions, builds generated metadata/provider audit, invokes the immutable store, and keeps remote cleanup around the full persistence attempt. Generate/edit/compose retain separate source resolution, prompt construction, provider invocation, operation fingerprints, coordinator entry, and lineage. Direct service parity tests added before extraction cover identical bytes/common metadata, BFL settings/usage, v2 request fingerprints, all three derivations, edit-instruction hashing/privacy, invalid output, and cleanup timing.
- **Preserved provenance/order:** Generate persists `{ kind: 'generate' }`. Edit persists `{ kind: 'edit', sourceAssetId, changeInstructionsHash }` and never the raw change/provider-only prompt. Composition persists `{ kind: 'compose', sourceAssetId }`. All three retain provider result → selected provider/model assertion → byte/MIME/dimension validation → metadata/store attempt → best-effort provider cleanup. Provider request IDs and allowlisted settings/usage remain private metadata; browser responses remain contract-filtered.
- **Validation:** The initial focused 14-file reference service/route/provider/transport/contract baseline passed 237/237 outside the restrictive sandbox; its first sandboxed run reproduced only the known loopback `listen EPERM`. The final focused set passes 243/243. `npm run quality` passes 93 files / 784 unit tests, 21 files / 53 Storybook tests, types, lint, format, Knip, module checks, production build, and Storybook build. `npm run test:coverage` passes at 83.66% statements, 72.19% branches, 85.21% functions, and 86.39% lines. `npm run test:production` passes 1/1.
- **Graphify:** Pre-change Graphify mapped three separate finalization neighborhoods at 3,674 nodes / 8,296 edges. The code checkpoint reached 3,675 / 8,307; the final permitted `graphify update .` after roadmap self-removal reached 3,662 / 8,294 and repeated only the known non-source `hooks.json` zero-node warning. Generate/edit/compose operation helpers each call the finalizer directly; outgoing call counts improved from 6/8/7 to 3/5/4. Public operation fan-out remains four apiece, route callers and provider/store/coordinator/test paths remain, and the finalizer has exactly three operation callers. There are no service orphans; the one graph-wide orphan is the unchanged pre-existing `OPENAI_REFERENCE_IMAGE_MODEL` node. `npm run check:modules` reports 355 files / 962 local edges / zero cycles.
- **Documentation:** DUP-002 retains its original finding and is marked Resolved with implementation/validation/Graphify evidence. The live plan removed only PHASE-005, updated remaining counts and PHASE-009 dependencies, and preserved phase numbering. Architecture, privacy, image-generation, and user-journey descriptions remain accurate because ownership and observable behavior did not change.
- **Limitations/new findings:** No live provider/device check or paid traffic ran; those remain manual and gated. Functional E2E and visual suites were not required for this API-internal structural phase and were not changed. Production dependency audit remains outside the authorized scope. No new cleanup finding was discovered.
- **Plan status:** DUP-002 is resolved. PHASE-005 has self-removed from `projectCleanupImplementationPlan.md`; PHASE-006 is next.

## 18. PHASE-006 implementation record

PHASE-006 is complete. Accessible browser names, guidance and validation text,
click/keyboard/drop/replace/remove behavior, focus return, responsive geometry,
provider boundaries, persisted data, and lifecycle ownership were unchanged.

- **Shared API:** `ImagePickerDropField` receives grouped neutral guidance, picker presentation/reset mechanics, optional preview metadata/remove action, optional rendered feedback, accepted media types, disabled state, and one `File` callback. It owns only hidden-input DOM, drag depth, picker/drop labels, preview/action layout, file-size presentation, input reset/focus mechanics, and the existing responsive styles. It has no feature mode, upload, storage, generation, provider, asset-ID, validation, or URL knowledge.
- **Preserved adapters/lifecycles:** Builder still sends selected files through `useCharacterReferenceUpload`, decoded-image plus 40-megapixel validation, same-origin immutable upload, draft persistence, and detach-only Remove. Recipe Dock still validates in the browser, creates only its ephemeral Blob URL, distinguishes hydrated persisted references, cancels stale/unmounted validation, and delegates replacement/departure/reset/unmount revocation to `useSessionDraftState`. Exact source-specific labels, descriptions, warning/error roles, alt text, titles, pending/recording disabling, and reset behavior remain supplied by the two thin adapters.
- **Tests first:** Added direct Builder-field tests and expanded media-session field tests before production extraction. They cover exact accessible names/descriptions as observed by JSDOM, accepted types, same-file selection, nested drag-depth transitions, dropped valid/invalid files, stable validation text, immutable versus temporary preview copy, disabled states, Remove names, and focus recovery. Added one browser interaction/a11y story for each consumer; browser-observed spaced accessible names, upload interaction, Remove, callback, and focus pass.
- **Validation:** The pre-change baseline passed 33/33 focused tests, 53/53 Storybook tests, 12/12 targeted upload E2E cases, 29/29 Darwin visuals, and the 784-unit quality gate outside the known restrictive-sandbox loopback limitation. The final focused set passes 39/39. `npm run quality` passes 94 files / 790 unit tests, 21 Storybook files / 55 interaction-a11y tests, type checks, lint, format, Knip, module checks, production build, and Storybook build. The targeted Builder/Recipe Dock upload set passes 12/12 across Chromium, WebKit, and mobile. `npm run test:visual` passes 29/29 without updating snapshots.
- **Graphify:** Before extraction, the two leaf fields met only through five shared style functions and separately owned their input/drag/preview DOM. `graphify update .` moved 3,662 nodes / 8,294 edges to a 3,674 / 8,305 code checkpoint, then to 3,662 / 8,293 after roadmap self-removal and final test strengthening, repeating only the known non-source `hooks.json` zero-node warning. `ImagePickerDropField` now has the two feature imports and neutral UI re-export, owns all five style calls, and is the only shared presentation node. Builder's path continues through `CharacterBuilderPanel`/controller to `useCharacterReferenceUpload`; Recipe Dock's path continues through `ModelRecipeFields`/session controller to `useSessionDraftState`. Source/export searches find no old style import or compatibility re-export; Knip passes; the module graph reports 357 files / 965 edges / zero cycles.
- **Documentation:** Architecture now records the neutral presentation owner and separate lifecycle policy. Privacy and current Builder/Recipe Dock journeys remain accurate because storage, retention, provider contact, labels, errors, and user-visible behavior did not change. DUP-003 retains its original evidence and is marked Resolved.
- **Limitations/new findings:** Live devices/providers were not exercised and no paid traffic ran; those checks remain manual and gated. Production dependency audit remains outside the authorized scope. Initial Storybook, E2E, visual, quality-route, and Graphify attempts reproduced the known restricted-sandbox loopback/EPERM limitation; permitted reruns passed. A strengthened browser-story focus assertion initially raced the existing `requestAnimationFrame` focus return, was corrected to wait for that lifecycle, and then passed. No new cleanup finding was discovered.
- **Plan status:** DUP-003 is resolved. PHASE-006 has self-removed from `projectCleanupImplementationPlan.md`; PHASE-007 is next.

## 19. PHASE-007 implementation record

PHASE-007 is complete. The sole route, entrypoint, persistent `MediaStage` and
video/player, overlay portal/focus system, responsive geometry, session,
recording, realtime and take ownership, provider-consent boundaries, commands,
legacy data, and Character Builder launch/discard behavior were unchanged.

- **Changed ownership:** `studioStageNotices.ts` now contains the pure Studio-specific notice policy, while the live-stage feature retains generic stable-ID deduplication and priority limiting. `useLegacyProjectAvailability.ts` owns the narrowed compatibility repository and its initialization/count/storage lifecycle. `useCharacterBuilderLaunchController.ts` owns create/edit preparation, single-flight state, discard-confirmation settlement/cancellation, and safe launch errors. `StudioApp.tsx` remains the composition boundary, retains explicit overlay JSX and media/realtime/recording ownership, and fell from 834 to 687 lines. No prop bag, global state, context, router, generic effect utility, stage move, UI redesign, or recipe-handoff decomposition was introduced.
- **Tests first:** Added direct pure/controller suites for all notice sources and top-two priority, dismissed warnings and recovery callbacks; ready/rejected/late legacy initialization and storage/count synchronization; replaced confirmation settlement, unmount cancellation, single-flight locking and launch errors; and topmost confirmation focus/cancel restoration. The Studio composition test now asserts exactly one stable stage through Dock and Shelf changes. Existing MediaStage, OverlayPanel, ConfirmationDialog, legacy manager/repository, route, Builder launch, and Builder controller suites remain green.
- **Validation:** The pre-change affected baseline passed 71/71 and the clean quality baseline passed 94 files / 790 unit tests plus 55 Storybook tests. The final affected suite passes 81/81. `npm run quality` passes 97 files / 800 unit tests, 21 files / 55 Storybook tests, types, lint, formatting, Knip, the module check, both production builds, and Storybook build. `npm run test:coverage` passes at 84.63/73.11/86.13/87.33. Functional E2E passes 128 with 10 intentional skips across Chromium, WebKit, and mobile; Darwin visual regression passes 29/29 with no snapshot update; production smoke passes 1/1.
- **Graphify/topology:** Before extraction the graph held 3,662 nodes / 8,293 edges; the code checkpoint reached 3,686 / 8,346 and the final roadmap-self-removal refresh reached 3,673 / 8,333. Root module degree fell 83→73 and `StudioExperience` degree 26→24. The notice, legacy, and Builder launch units have direct tests and focused degrees of 5, 7, and 5. The entry path remains `main.tsx → StudioApp.tsx → MediaStage()`; all three new responsibilities are one call from `StudioExperience`. Source inspection still finds one `createRoot`, one `StudioApp`, one `MediaStage` JSX instance, one persistent `<video>`, and the existing lazy panels. The module checker reports 363 files / 977 local edges / zero cycles, with no global/context/singleton or reverse-feature dependency.
- **Documentation:** Architecture now names the three focused Studio controllers. Current user journeys required no behavioral rewrite because observable routing, focus, stage, storage, provider, Builder, and media behavior did not change. COMP-001 retains its original evidence and is marked Resolved.
- **Limitations/new findings:** Live devices/providers and paid traffic were not exercised; those remain gated manual checks. `npm run audit:prod` remains outside the authorized scope. Initial sandboxed quality/API, Storybook, and Graphify attempts received the known loopback/permission `EPERM`; permitted reruns passed. No new cleanup finding was discovered.
- **Plan status:** COMP-001 is resolved. PHASE-007 has self-removed from `projectCleanupImplementationPlan.md`; PHASE-008 is next.

## 20. PHASE-008 implementation record

PHASE-008 is complete. The `useReferenceRecipeHandoff` facade, its Studio caller
and exports, exact recipe/reference identity, owner scoping, persisted data,
Workshop and Builder behavior, accessibility, responsive UI, and local-first
provider-cost boundaries were unchanged.

- **Facade/state decisions:** `useReferenceRecipeHandoff.ts` remains the authoritative composition and single commit boundary; it fell from 550 to 173 lines without changing its option or return shape. `referenceRecipeIdentity.ts` now owns the pure active state, reducer, fingerprint comparison, reference identity, and current-draft resolution. It derives one exact active recipe from the facade-owned reducer state plus current repositories/draft rather than storing a parallel derived copy.
- **Extracted units and effects:** `useReferenceRecipeHydration.ts` owns one explicit Shelf/Workshop pending/failure state machine, one current operation token, one abort controller, owner-scoped metadata/content reads, exact retry input, text-only recovery, and pre/post-commit staleness checks. `useReferenceRecipeWorkshop.ts` owns Workshop source matching, draft memory, open/use/save/replacement coordination, and post-commit transitions. `useReferenceRecipeAttribution.ts` owns selected saved/character references, exact Recent resolution/recording, standalone Recent character fallback, Builder preload wiring, and Builder blocking precedence. Each hook receives repositories, guards, callbacks, and values explicitly; none creates a global, cache, context, provider client, alternate session, or second facade.
- **Async/transition guarantees:** The verified matrix is guard → optional reference metadata/content hydration → one atomic `replaceRecipeDraft` callback → exact identity/attribution and Workshop effects → close. Failure retains the exact retry input and open overlay; continue-without-reference skips both reads and commits text-only/null-reference state; same-turn duplicate work is rejected; unmount aborts and invalidates the token; late transport or commit completion cannot update state, repositories, or overlays; failed commit cannot publish identity or close. Workshop cross-tool transitions and Builder save-preload remain independently owned but converge only through the facade's explicit inputs and post-commit callbacks.
- **Tests first:** Before production extraction, focused facade regressions were added for not-found retry with exact input, shared metadata/content abort signal, a single commit, duplicate in-flight use, unmount/late resolution, commit failure/retry, legacy Workshop source/open/use/save, text-only recovery, and Builder blocking precedence. Direct identity, hydration, Workshop, and attribution tests then pin pure state transitions, rejected guards, abort even when a mocked transport resolves, exact source matching, Recent semantics, and Builder blocking. The final new/facade set passes 10 files / 53 tests; the broader recipe/reference/Workshop/Builder set passes 35 files / 222 tests.
- **Validation and coverage:** The clean pre-change focused baseline passed 6 files / 38 tests; pre-change `npm run quality` passed 97 files / 800 unit tests and 55 Storybook tests, coverage passed at 84.63/73.11/86.13/87.33, functional E2E passed 128 with 10 intentional skips, and visual regression passed 29/29. After extraction, `npm run quality` passes 101 files / 815 unit tests, 21 files / 55 Storybook tests, types, lint, formatting, Knip, module checks, both builds, and Storybook build. Coverage passes at 84.97/73.77/86.55/87.68. Functional E2E passes 128 with 10 intentional skips across Chromium, WebKit, and mobile; Darwin visual regression passes 29/29 without snapshot updates.
- **Graphify/topology:** Pre-change Graphify held 3,673 nodes / 8,333 edges and reported hook degree 15 and module degree 47. The code checkpoint reached 3,716 / 8,458; after findings/roadmap self-removal, the required final `graphify update .` reached 3,708 / 8,449 and repeated only the known non-source `hooks.json` warning. Hook degree is 12 and module degree 33. Direct one-hop paths are `StudioExperience → useReferenceRecipeHandoff` and facade → identity/hydration/Workshop/attribution; attribution alone reaches `useCharacterStudioPreload`. The public facade caller/test/import path is unchanged. The facade has no direct reference-API, Workshop-draft, canonical-prompt, or Builder-preload edge. Source finds one Shelf/Workshop metadata/content hydration controller and one facade draft commit; Builder's distinct save-preload hydration remains intentional. No handoff dynamic import, cycle, reverse ownership, orphan, duplicate entry path, global/context/singleton, or caller/export change appeared. `npm run check:modules` reports 370 files / 1,008 local edges / zero cycles.
- **Documentation:** STATE-001 retains its original evidence and is marked Resolved with the state/effect matrix, implementation, files, tests, coverage, Graphify, limitations, and PHASE-008 evidence. PHASE-008 and only its overview row/section were removed from the live plan; counts and PHASE-009 dependencies were updated without renumbering. Architecture and the Recipe Shelf, Prompt Workshop, Character Builder, reference-image, privacy, and provider-smoke journeys required no behavioral rewrite because their observable ownership, storage, UI, and provider contracts remain accurate.
- **Limitations/new findings:** Live devices/providers and paid traffic were not exercised; those remain gated manual checks. `npm run audit:prod` remains outside the PHASE-008 required gate. The initial system Node 25 was replaced with repository-compatible Node 24.12.0/npm 11.6.2 for every baseline and validation. Initial sandboxed quality and Graphify runs reproduced the known loopback/permission `EPERM`; permitted reruns passed. No new cleanup finding was discovered.
- **Plan status:** STATE-001 is resolved. PHASE-008 has self-removed from `projectCleanupImplementationPlan.md`; PHASE-009 is next.
