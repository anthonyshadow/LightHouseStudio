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
| ARCH-001   | Shared confirmation dialog is owned by Character Builder               | Architecture/ownership           | Medium   | Confirmed       | Open     | Shared UI and Legacy Projects                                 | PHASE-003         |
| ARCH-002   | Character generation remains owned by Prompt Workshop internals        | Architecture/ownership           | High     | Confirmed       | Open     | Character Builder, prompt-authoring, media-session helpers    | PHASE-003         |
| DUP-001    | BFL and Wiro duplicate hardened task-download transport                | Duplication/security maintenance | High     | Confirmed       | Open     | API provider adapters                                         | PHASE-004         |
| DUP-002    | Reference image service repeats asset finalization logic               | Duplication/service cohesion     | Medium   | High confidence | Open     | API reference-image service                                   | PHASE-005         |
| DUP-003    | Reference-image fields duplicate file-picker/drop presentation         | Duplication/components           | Low      | Confirmed       | Open     | Character Builder and media-session UI                        | PHASE-006         |
| COMP-001   | Studio composition root owns several independent lifecycle controllers | Component/orchestration          | Medium   | High confidence | Open     | `StudioApp.tsx`                                               | PHASE-007         |
| STATE-001  | Recipe handoff facade mixes five stateful workflows                    | State/orchestration              | Medium   | Confirmed       | Open     | `useReferenceRecipeHandoff.ts`                                | PHASE-008         |
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
- **Status:** Open
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

### [ARCH-002] Character generation remains owned by Prompt Workshop internals

- **Category:** Architecture and feature ownership
- **Severity:** High
- **Confidence:** Confirmed
- **Status:** Open
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

### [DUP-001] BFL and Wiro duplicate hardened task-download transport

- **Category:** Duplication and security maintenance
- **Severity:** High
- **Confidence:** Confirmed
- **Status:** Open
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

### [DUP-002] Reference image service repeats asset finalization logic

- **Category:** Duplication and service cohesion
- **Severity:** Medium
- **Confidence:** High confidence
- **Status:** Open
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

### [DUP-003] Reference-image fields duplicate file-picker/drop presentation

- **Category:** Duplication and reusable components
- **Severity:** Low
- **Confidence:** Confirmed
- **Status:** Open
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

### [COMP-001] Studio composition root owns several independent lifecycle controllers

- **Category:** Component and orchestration design
- **Severity:** Medium
- **Confidence:** High confidence
- **Status:** Open
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

### [STATE-001] Recipe handoff facade mixes five stateful workflows

- **Category:** State and orchestration
- **Severity:** Medium
- **Confidence:** Confirmed
- **Status:** Open
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

| Shared responsibility                     | Existing implementations                                                | Material differences                                                            | Divergence risk                                   | Reuse appropriate?                            | Recommended boundary                                               | Finding           |
| ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| Safe remote image download                | BFL and Wiro `safe-image-downloader.ts` plus parallel adversarial tests | Provider wrappers/error translation differ; download security policy is aligned | High: SSRF/redirect/size fix may land once        | Yes                                           | API-internal downloader with explicit policy and provider wrappers | DUP-001           |
| Bounded response reads/delay              | Small helpers in BFL/Wiro clients                                       | Error labels and task protocols differ                                          | Medium                                            | Only for byte/deadline primitives             | Provider-transport helpers, not a generic client                   | DUP-001           |
| Persist provider image as immutable asset | Generate/edit/compose branches in `ReferenceImageService`               | Derivation/source metadata differ                                               | Medium                                            | Yes, as one private typed method              | Service-private asset finalizer                                    | DUP-002           |
| Drag/drop image selection                 | Builder and media-session reference fields                              | Persistence, validation, URLs, labels differ                                    | Low-medium                                        | Yes only for controlled DOM/a11y presentation | Shared image-picker/drop primitive                                 | DUP-003           |
| Provider task state/error mapping         | BFL and Wiro provider clients                                           | Protocol/status/error/cleanup semantics materially differ                       | Abstraction would hide important differences      | No                                            | Preserve provider-local logic                                      | Rejected/deferred |
| Browser persistence                       | Recipe localStorage, Builder draft IndexedDB, legacy Guided IndexedDB   | Durability, migration, data model, fallback, and lifecycle differ               | Generic abstraction would couple unrelated stores | No                                            | Preserve focused repositories                                      | Rejected/deferred |

## 8. Component and module hotspots

| Hotspot                                    | Evidence                                                            | Why it is a hotspot                                                                | Direction                                      |
| ------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| `StudioApp.tsx`                            | 848 lines; fan-out 38; 15 edits in sampled 80 commits               | Root plus multiple independent lifecycle controllers and overlay wiring            | COMP-001; keep composition root/stage topology |
| `useReferenceRecipeHandoff.ts`             | 550 lines; fan-out 16; Graphify degree 15                           | Five stateful workflows and async reference coordination behind one facade         | STATE-001; preserve facade, split internals    |
| `projectRepository.ts`                     | 1,106 lines; Graphify degree 65                                     | Compatibility reads mixed with retired authoring/revision machinery                | DEAD-001                                       |
| `reference-image-service.ts`               | 559 lines; central to three operations and owner-scoped coordinator | Correctly central but repeats finalization and has high-impact persistence paths   | DUP-002                                        |
| BFL/Wiro adapters                          | Wiro provider 576 lines plus two ~230-line downloaders              | Security transport duplicated while provider protocols remain distinct             | DUP-001                                        |
| `useTakeReviewFlow.ts`                     | Critical lifecycle hook now at 98.61% statement coverage            | Ordered settlement and cleanup behavior has direct focused protection              | TEST-001 resolved                              |
| `useCharacterReferenceGeneration.ts`       | Critical provider-cost adapter now at 86.66% statement coverage     | Validation, locking, retry, cancellation, and stale boundaries are directly tested | TEST-001 resolved / ARCH-002 remains           |
| `MediaStage.tsx`                           | 561 lines but stable cohesive ownership                             | Owns persistent media DOM and stage presentation; broad test protection            | Preserve; do not split by size alone           |
| `packages/domain/src/assets/operations.ts` | 615 lines but pure/cohesive and highly tested                       | Related immutable asset/recipe operations share one domain aggregate               | Preserve pending a real change axis            |

Barrel modules (`packages/domain/src/index.ts`, `packages/contracts/src/index.ts`, and shared UI index) have fan-in around 52 by design. They are public boundaries, not hotspots to dissolve.

## 9. Dependency and architecture observations

- **Cycles:** `npm run check:modules` analyzed 348 files and 935 local edges with zero cycles.
- **Layering:** No React/provider dependency was found in domain/contracts. The actionable violations are feature ownership, not package-direction violations (`ARCH-001`, `ARCH-002`).
- **Critical shared modules:** Contract and domain barrels have high fan-in; `StudioApp` has high fan-out. Changes to contracts/domain must remain backwards compatible across web/API tests.
- **Cross-feature path:** Legacy Projects imports a dialog from Character Builder; Character Builder imports generation from prompt-authoring and image helpers/styles from media-session.
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
3. **PHASE-003:** Correct shared/feature ownership after the Character Builder migration (`ARCH-001`, `ARCH-002`).
4. **PHASE-004:** Consolidate duplicated provider-safe download primitives (`DUP-001`).
5. **PHASE-005:** Consolidate service-private reference asset finalization (`DUP-002`).
6. **PHASE-006:** Extract the narrow image-picker/drop presentation seam if its API stays focused (`DUP-003`).
7. **PHASE-007:** Decompose independent Studio root controllers without changing mount topology (`COMP-001`).
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
- **Plan status:** DEAD-001, DEAD-002, and DEAD-003 are resolved. PHASE-002 has self-removed from `projectCleanupImplementationPlan.md`; PHASE-003 is next.
