# Project Cleanup Implementation Plan

## Current status

| Item                    | Status                                                                                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Findings document       | `docs/projectCleanupFindings.md`                                                                                                                                                                                                                                  |
| Date generated          | 2026-07-27                                                                                                                                                                                                                                                        |
| Audited branch / commit | `Refactor` / `5c7f3e62c9a14b9f044ae7919747bf4cafda3e52`                                                                                                                                                                                                           |
| Open findings           | 11 unresolved (11 open); TEST-001, TEST-002, and TOOL-001 resolved                                                                                                                                                                                                |
| Remaining phases        | 8                                                                                                                                                                                                                                                                 |
| Important prerequisites | Use Node 24/npm 11; preserve local-first/provider-cost boundaries and persisted legacy data; keep the passing functional, focused-hook, pruning, and cross-platform visual safety gates green during structural work.                                             |
| Known baseline failures | None in the completed safety-net scope: functional E2E passes 128 with 10 intentional skips, and Darwin plus Linux/amd64 visual runs each pass all 29 cases.                                                                                                      |
| Other limitations       | `npm run audit:prod` was not authorized because it sends dependency metadata externally. Disposable Linux installs pass with repository-compatible npm 11.6.2; the Playwright image's npm 11.13 requests broader optional-lock normalization and was not adopted. |
| Graphify status         | Final safety-net refresh completed at 3,711 nodes / 8,389 edges (from 3,699 / 8,342), with only the known non-source `hooks.json` zero-node warning. Direct paths connect all three target hooks to focused tests; module check remains cycle-free.               |

## Execution rules

- Implement only one phase at a time unless phases are explicitly marked safe to combine. None are currently marked safe to combine.
- Begin every implementation by reading current repository instructions, `docs/projectCleanupFindings.md`, this live plan, and affected canonical/user-journey documentation.
- Inspect the branch, commit, and working tree. Never reset, clean, overwrite, or discard user changes.
- Use the installed Graphify integration before and after every phase. Confirm graph conclusions against source, exports, entry points, dynamic imports, configuration, tests, routes, registrations, and framework conventions.
- Preserve behavior, public contracts, persisted data, integrations, accessibility, responsive layout, performance characteristics, and explicit provider-cost boundaries unless a finding explicitly identifies a required behavioral correction.
- Record baseline failures separately from phase-introduced failures.
- Remove a completed phase section and its overview row only after every acceptance criterion and validation check passes. Update the remaining-phase count and prerequisites, but never renumber phase IDs.
- Partially completed phases remain in this document and must accurately list unfinished work. Unresolved work must not be deleted.
- Preserve historical findings in `docs/projectCleanupFindings.md`. Mark resolved findings `Resolved` and append implementation/validation/Graphify evidence; do not delete or renumber findings.
- Newly discovered work receives a new stable finding ID and, if necessary, a new phase. Do not silently expand a phase to absorb unrelated cleanup.
- When no phases remain, replace the overview/phase queue with `All documented cleanup phases have been completed.`, record final commands/results and final Graphify architecture evidence, and ensure every finding is `Resolved`, `Accepted as intentional`, or explicitly `Blocked`.

## Remaining phases overview

| Phase ID  | Title                                            | Finding IDs                  | Risk        | Dependencies                    | Expected outcome                                                                    |
| --------- | ------------------------------------------------ | ---------------------------- | ----------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| PHASE-002 | Remove confirmed retired and unreachable code    | DEAD-001, DEAD-002, DEAD-003 | Medium      | None                            | Smaller compatibility repository and UI/root surface with legacy data preserved     |
| PHASE-003 | Repair Character Builder and shared UI ownership | ARCH-001, ARCH-002           | Medium-high | PHASE-002                       | Feature imports match current product ownership; shared UI has a neutral home       |
| PHASE-004 | Consolidate hardened provider download transport | DUP-001                      | High        | PHASE-003                       | One security-reviewed downloader policy with provider-specific protocols preserved  |
| PHASE-005 | Consolidate reference-asset finalization         | DUP-002                      | Medium      | PHASE-004                       | One typed service-private persistence path for generate/edit/compose                |
| PHASE-006 | Share image-picker/drop presentation             | DUP-003                      | Low-medium  | PHASE-003                       | Shared accessible DOM behavior without merging storage/lifecycle policy             |
| PHASE-007 | Decompose independent Studio root controllers    | COMP-001                     | Medium-high | PHASE-002, PHASE-003, PHASE-006 | Smaller composition root with identical stage/overlay topology                      |
| PHASE-008 | Decompose recipe handoff internals               | STATE-001                    | High        | PHASE-003, PHASE-007            | Focused state workflows behind the unchanged Studio facade                          |
| PHASE-009 | Reconcile final documentation                    | DOC-001                      | Low         | PHASE-002 through PHASE-008     | Correct canonical filename/links and documentation aligned with implemented cleanup |

## Phase sections

### PHASE-002: Remove confirmed retired and unreachable code

#### Objective

Delete only code proven unreachable after Guided-flow retirement and Character Builder migration, while retaining exact compatibility access to browser data.

#### Findings resolved

- `DEAD-001`
- `DEAD-002`
- `DEAD-003`

#### Scope

Guided `projectRepository` authoring/write APIs and tests/types; Character Builder hidden starter-picker JSX/handlers/styles/story text; Studio no-op telemetry/effect/test. Runtime legacy list/read/download/delete/migration consumers are in scope for compatibility tests, not removal.

#### Out of scope

Changing IndexedDB schema/version/data; deleting starter catalog records/assets; reopening Guided projects; refactoring StudioApp beyond removed telemetry; new observability; unrelated Knip findings.

#### Dependencies

No remaining phase prerequisite. The completed safety-net work must remain passing so current journeys and critical hooks stay reliable.

#### Risk assessment

- **Regression risk:** Medium.
- **Architectural risk:** Low-medium.
- **Data/compatibility risk:** High if legacy boundaries are misunderstood; mitigated by fixtures.
- **User-facing risk:** Medium for existing users with retained projects.
- **Rollback difficulty:** Low for code, but never perform data migration/deletion.

#### Implementation sequence

1. Build representative legacy IndexedDB fixtures and pin list, sanitation, artifact download/read, deletion, and Character Builder migration behavior.
2. Reconfirm every repository export/caller through Graphify, source, tests, stories, dynamic imports, and public exports.
3. Remove create/commit/revision/write/flush/persistent-storage/retention-reporting paths and test-only constructors; narrow types/exports to compatibility needs.
4. Remove the constant-false starter picker, handler, artwork-only imports, styles, and stale story claim; retain catalog compatibility data.
5. Remove the telemetry module, test, import, and no-op mount effect after rechecking configuration/dev registrations.
6. Run Knip and graph checks to remove all newly orphaned symbols.

#### Graphify requirements

Before: explain `projectRepository.ts`, trace every runtime consumer, query starter catalog/form and telemetry paths. After: update the graph; confirm removed authoring/telemetry branches have no nodes/edges, retained compatibility paths still reach app entry points, catalog data still reaches legacy hydration, and no cycles/orphans were introduced.

#### Acceptance criteria

Legacy records remain listable, sanitized, downloadable/readable, deletable, and migratable without schema/version changes. No current runtime export permits Guided create/commit. Hidden starter presentation and telemetry have no remaining source/test/style symbols. Knip/module/Graphify checks pass.

#### Required validation

Targeted repository compatibility, Legacy Manager, Builder migration and form tests; Storybook; `npm run quality`; `npm run test:coverage`; `npm run test:e2e`; `graphify update .`.

#### Rollback strategy

Revert source/tests. Because the phase performs no data migrations or runtime record deletion, rollback is code-only. If a compatibility consumer is uncertain, do not delete it; keep the phase open and mark verification work.

#### Documentation updates

Resolve DEAD-001–003 with exact deleted APIs/LOC, retained compatibility surface, fixture evidence, and graph diff. Update architecture/user stories only if observable compatibility descriptions need clarification.

#### Standalone implementation prompt

```text
Implement only PHASE-002 (“Remove confirmed retired and unreachable code”) from the Lightframe Studio cleanup roadmap, resolving DEAD-001, DEAD-002, and DEAD-003.

First read all repository instructions, docs/projectCleanupFindings.md, docs/projectCleanupImplementationPlan.md, architecture/privacy/product-evolution documents, and Guided/Character Builder user journeys. Inspect branch/commit/status; never reset, clean, overwrite, or discard user work. Confirm the completed safety-net gates remain passing.

Preserve public behavior, persisted browser data, accessibility, responsiveness, and integrations. In particular, preserve the exact IndexedDB database/store/schema/version and legacy list/sanitize/read/download/delete/migrate behavior. Never delete or rewrite user records. Retain all starter catalog records/assets used by legacy hydration. Do not add telemetry or refactor unrelated Studio code.

Run relevant baselines. Read Graphify instructions, then explain projectRepository.ts and trace every export to Studio initialization, LegacyProjectManager, Character Builder migration, tests, stories, dynamic imports, routes, and public surfaces. Query the hidden starter picker/catalog and telemetry sinks. Confirm graph evidence with source/config/runtime registration.

Add fixture-based compatibility tests first. Then remove only unreachable Guided create/commit/revision/write/flush/persistence-request/retention-reporting APIs, types, tests, and fixtures; narrow the repository to read/list/download/delete/migration. Remove the constant-false starter picker JSX, handler, artwork-only imports, styles and stale story language, retaining compatibility catalog data. Remove the no-op/recording telemetry module, test, Studio import and mount effect after verifying there is no configured consumer. Remove all resulting orphaned exports/imports without opportunistic cleanup.

Run graphify update . and repeat reachability/path queries. Verify deleted write/telemetry paths are absent, retained legacy and catalog paths still reach runtime, exports are correct, and no cycles/orphans appear. Run targeted compatibility/Builder/Legacy Manager/Storybook tests, npm run quality, npm run test:coverage, and npm run test:e2e. Separate pre-existing failures.

Only after all criteria pass, mark DEAD-001/002/003 Resolved in the findings and append changes/files/validation/Graphify/limitations/PHASE-002. Preserve historical evidence and add new issues under new IDs. Remove PHASE-002 and its overview row from the plan, update counts/dependencies, never renumber phases. Keep the phase if any compatibility uncertainty or validation failure remains.

Report resolved findings, retained data contract, code/tests removed, validation, graph diff, pre-existing failures/new findings, docs, self-removal, and next phase.
```

### PHASE-003: Repair Character Builder and shared UI ownership

#### Objective

Align physical module ownership with the current product: Character Builder owns character generation, generic confirmation UI is shared, and components no longer expose model constructors or import unrelated feature internals.

#### Findings resolved

- `ARCH-001`
- `ARCH-002`

#### Scope

Confirmation dialog and shared UI export; reference-generation hook/source-key helpers; neutral image validation/file constants; Builder imports; direct `characterModel` constructor imports; affected tests/stories/docs.

#### Out of scope

Changing generation/provider behavior; extracting the shared drop-zone (PHASE-006); decomposing recipe handoff/Studio; generic modal/service frameworks; Prompt Workshop Add/Replace/Restyle redesign.

#### Dependencies

PHASE-002.

#### Risk assessment

- **Regression risk:** Medium-high.
- **Architectural risk:** Medium.
- **Data/compatibility risk:** Medium for asset/source identity.
- **User-facing risk:** Medium for generation and dialogs.
- **Rollback difficulty:** Low-medium; primarily moves/import rewrites.

#### Implementation sequence

1. Pin existing dialog focus/stack behavior and generation/source-identity/cancellation/provider-request behavior with tests.
2. Move `ConfirmationDialog` to the existing neutral shared UI/primitive boundary and update narrow exports/consumers.
3. Move character-specific preview generation and source identity from prompt-authoring into Character Builder or a proven focused reference workflow; keep Prompt Workshop object operations local.
4. Move only genuinely shared image validation/file-input constants to a neutral browser/UI boundary.
5. Replace component re-exports of `createEmptyGuidedDesign` with direct model imports.
6. Remove obsolete cross-feature exports/imports and update ownership documentation.

#### Graphify requirements

Before: paths from Studio/Legacy Manager to dialog and Builder to prompt-authoring/media-session; fan-in/out, exports, tests, dynamic imports. After: update; confirm cross-feature edges are removed/redirected, no cycles, no orphan prompt-generation code, shared primitives have only justified consumers, and runtime entry paths are unchanged.

#### Acceptance criteria

No non-Builder feature imports Builder's generic dialog. Builder generation does not depend on prompt-authoring character internals or media-session internals. Model constructors are imported from model modules. All requests, state transitions, a11y, focus, identity, and saved assets remain byte/contract compatible where observable.

#### Required validation

Targeted dialog, generation, Builder, Workshop and reference tests; Storybook a11y; `npm run quality`; `npm run test:coverage`; `npm run test:e2e`; `npm run test:visual`; Graphify/module checks.

#### Rollback strategy

Revert moves and import/export edits as one phase. Do not keep duplicate compatibility re-exports unless a verified external consumer requires a temporary migration path documented as a new finding.

#### Documentation updates

Resolve ARCH-001/002 with before/after paths and ownership decision; update Architecture and relevant user stories if paths/names are described.

#### Standalone implementation prompt

```text
Implement only PHASE-003 (“Repair Character Builder and shared UI ownership”), resolving ARCH-001 and ARCH-002. Read all instructions, docs/projectCleanupFindings.md, docs/projectCleanupImplementationPlan.md, Architecture and Workshop/Builder/reference journeys. Confirm PHASE-002 completion and that the safety-net gates remain passing; inspect branch/commit/status and preserve unrelated user changes.

Preserve all visible behavior, APIs, persisted assets/data, provider requests/cost disclosure, cancellation/locks, source identity, accessibility, responsiveness and OverlayPanel/MediaStage topology. Do not redesign Workshop, create a modal framework, extract the PHASE-006 drop-zone, decompose Studio/handoff, or perform unrelated cleanup.

Run baselines. Read/use installed Graphify before editing: path LegacyProjectManager and Studio to ConfirmationDialog; path useCharacterReferenceGeneration to useReferencePreviewGeneration; map Builder imports from prompt-authoring/media-session, exports, dynamic imports, callers/tests, fan-in/out, cycles and change impact. Confirm with source/config/runtime.

Add/strengthen regression tests where needed. Move generic ConfirmationDialog to the existing neutral shared UI/primitive boundary with the same DOM/focus/stack/dismissal contract. Move character-specific generation/source-key implementation into Character Builder or a narrowly proven reference workflow. Move only genuinely shared image validation/file constants to a neutral boundary. Import createEmptyGuidedDesign from characterModel rather than through a presentation component. Remove obsolete cross-feature exports and update affected tests/docs. Keep Prompt Workshop Add/Replace/Restyle and provider/service contracts unchanged.

Afterward run graphify update ., repeat paths and compare the graph. Verify old cross-feature edges are gone, new shared edges are justified, no cycles/orphans/runtime break occur, and fan-in/out changed as intended. Run targeted suites, Storybook a11y, npm run quality, npm run test:coverage, npm run test:e2e and npm run test:visual; record pre-existing failures separately.

When every criterion passes, mark ARCH-001/002 Resolved with implementation/files/validation/Graphify/limitations/PHASE-003, preserving history. Add new unrelated issues with new IDs. Remove PHASE-003 and its overview row, update counts/prerequisites without renumbering. Otherwise keep the phase.

Report ownership decisions, moves/exports, tests, validation, graph diff, failures/new findings, docs, self-removal, and next phase.
```

### PHASE-004: Consolidate hardened provider download transport

#### Objective

Create one narrowly scoped, security-reviewed implementation of safe remote-image download/bounded response behavior while keeping BFL and Wiro protocols and error semantics independent.

#### Findings resolved

- `DUP-001`

#### Scope

BFL/Wiro safe-image downloaders, repeated bounded byte/JSON and abortable deadline helpers where behavior is demonstrably identical, provider wrappers, and adversarial tests.

#### Out of scope

Unifying provider clients/task state machines, prompts, errors, polling URLs, retries, cleanup, dimension normalization, credentials, routes, or reference service finalization.

#### Dependencies

PHASE-003.

#### Risk assessment

- **Regression risk:** High.
- **Architectural risk:** Medium.
- **Data/compatibility risk:** Low.
- **User-facing/security risk:** High if SSRF, abort, MIME, or size policy changes.
- **Rollback difficulty:** Medium.

#### Implementation sequence

1. Create a shared behavior matrix from both downloader test suites: scheme/host parsing, DNS results, private/reserved addresses, redirect revalidation, pinned connection, byte/MIME limits, abort and deadline.
2. Reconcile any existing behavioral difference explicitly; preserve stricter behavior.
3. Extract an API-internal downloader with narrow dependency injection and policy inputs; keep provider wrappers translating errors/context.
4. Share only aligned bounded-response/delay primitives.
5. Retain separate submission/polling/status/file-cleanup flows and tests, plus a common adversarial contract executed against both wrappers.

#### Graphify requirements

Before/after map both providers through factory/service/routes and downloader/test dependencies. Confirm the two duplicated implementations consolidate into one appropriately consumed node, provider-specific paths remain distinct, no cycle/cross-package violation appears, and no public API changes.

#### Acceptance criteria

Every previous adversarial case passes for both providers; redirect/DNS/private-network checks happen at every hop; deadlines/abort/byte/MIME behavior is unchanged or stricter; BFL/Wiro task protocols/errors/cleanup remain separate; duplicated security implementation is removed.

#### Required validation

Both complete provider suites and reference route/service integration; `npm run quality`; `npm run test:coverage`; `npm run test:production`; `npm run test:e2e`; Graphify/module checks. Live provider smoke remains manual/gated.

#### Rollback strategy

Revert the shared module and restore provider-local implementations/tests. Avoid a staged compatibility layer that leaves two security sources of truth.

#### Documentation updates

Resolve DUP-001 with the exact policy/API and graph consolidation. Update Architecture/LIVE_PROVIDER_SMOKE only if implementation ownership descriptions change.

#### Standalone implementation prompt

```text
Implement only PHASE-004 (“Consolidate hardened provider download transport”), resolving DUP-001. Read all repository instructions, findings/plan, Architecture, privacy and live-provider smoke docs, plus complete BFL/Wiro source and tests. Verify PHASE-003 completion; inspect branch/commit/status and protect user work.

Preserve public contracts and all current or stricter security behavior: URL/scheme rules, DNS/private/reserved rejection on every redirect, address pinning, byte/media limits, abort and one-deadline behavior. Preserve BFL trusted polling URL, Wiro pinned Task API, provider-specific submission/status/errors, Wiro normalization/file cleanup, and no silent fallback. Do not create a generic provider client or change retries/prompts/routes.

Run baselines. Read Graphify instructions and map BFL/Wiro provider factory→service→route paths, downloader callers/tests, fan-in/out, exports and cycles. Confirm textual/behavior duplication from source and build an explicit adversarial behavior matrix before moving code.

Extract one narrow API-internal safe remote-image downloader with explicit dependencies/policy and thin provider wrappers. Share bounded byte/JSON/deadline primitives only where contracts are identical. Execute a common adversarial contract against both wrappers while retaining provider-specific tests. Remove duplicate implementations completely.

Run graphify update . and verify the two security paths converge only at the intended transport, provider protocols remain distinct, consumers/exports are intact, and no cycles/layer violations occur. Run full BFL/Wiro/reference integration tests, npm run quality, npm run test:coverage, npm run test:production and npm run test:e2e. Live provider checks remain manual unless explicitly authorized.

Only after all security/validation criteria pass, mark DUP-001 Resolved with changes/files/tests/Graphify/limitations/PHASE-004. Preserve history; add new findings under new IDs. Remove PHASE-004 and its overview row, update counts/dependencies, never renumber. Keep it if any behavior is unresolved.

Report security invariants, consolidation, provider-specific behavior retained, validation/graph diff, failures/new findings, docs, self-removal and next phase.
```

### PHASE-005: Consolidate reference-asset finalization

#### Objective

Make generate/edit/compose use one typed service-private validation/metadata/persistence path without obscuring their distinct provider operations.

#### Findings resolved

- `DUP-002`

#### Scope

`ReferenceImageService` generate/edit/compose finalization and focused tests.

#### Out of scope

Provider transport, public routes/contracts, prompts, idempotency/coalescing redesign, asset deletion/GC, web UI, or broad service decomposition.

#### Dependencies

PHASE-004.

#### Risk assessment

- **Regression risk:** Medium.
- **Architectural risk:** Low-medium.
- **Data/compatibility risk:** Medium for provenance.
- **User-facing risk:** Medium on generation failure/saved assets.
- **Rollback difficulty:** Low.

#### Implementation sequence

1. Table current operation inputs, derivations, source IDs, metadata/audit fields, validation, persistence order, and errors.
2. Add parity tests for generated/edited/composed records and failure ordering.
3. Extract one private typed finalizer with explicit derivation/source/result/metadata parameters.
4. Keep provider invocation, coordinator/idempotency keys and input checks in separate public operations; remove duplicate finalization blocks.

#### Graphify requirements

Trace service operations to providers/store/routes/tests before and after. Confirm only the intended finalization edges converge, public operation nodes/entry paths remain, no cycles/orphans or fan-out growth occurs.

#### Acceptance criteria

Stored bytes, IDs, owner scope, provenance, metadata/audit values, errors, and persistence/cleanup ordering match prior tests for all operations; one finalization implementation remains; contracts unchanged.

#### Required validation

Reference service/routes/providers tests; contract parity; `npm run quality`; `npm run test:coverage`; `npm run test:production`; Graphify/module checks.

#### Rollback strategy

Revert the private helper and restore explicit branches. No stored-data migration is permitted.

#### Documentation updates

Resolve DUP-002 with parity/graph evidence; update Architecture only if its ownership description becomes inaccurate.

#### Standalone implementation prompt

```text
Implement only PHASE-005 (“Consolidate reference-asset finalization”), resolving DUP-002. Read instructions, findings/plan, Architecture/privacy/image-generation docs, and complete ReferenceImageService/tests. Verify PHASE-004; inspect branch/commit/status and preserve user changes.

Preserve HTTP contracts, bytes/IDs, owner scoping, idempotency/coalescing, derivation/source provenance, audit metadata, provider calls/prompts, error mapping, persistence and provider-cleanup ordering. Do not change provider transport, add GC, redesign the service, or touch web UI.

Run baselines. Use installed Graphify before editing to map generate/edit/compose through provider, coordinator, asset store, routes and tests; inspect callers, exports, fan-in/out/cycles/change impact. Confirm source behavior with a comparison table and add parity tests first.

Extract one private typed finalization method parameterized only by validated provider result, derivation/source relations and operation metadata. Keep each public operation's validation, provider invocation and coordinator key explicit. Remove repeated assertion/byte validation/metadata/persistence blocks without generalizing unrelated logic.

Run graphify update ., repeat paths and verify only finalization edges converge, public operations and consumers remain, no cycles/orphans appear, and fan-out improves. Run full reference service/route/provider and contract tests, npm run quality, npm run test:coverage and npm run test:production.

After all criteria pass, mark DUP-002 Resolved with changes/files/validation/Graphify/limitations/PHASE-005; preserve history and add new IDs for new issues. Remove PHASE-005/overview row, update counts/dependencies without renumbering. Keep it if incomplete.

Report exact consolidation and preserved provenance/order, tests, graph diff, validation/failures/new findings, docs, self-removal, next phase.
```

### PHASE-006: Share image-picker/drop presentation

#### Objective

Remove duplicated drag/drop/file-input accessibility presentation only if a narrow controlled primitive can preserve each feature's different data lifecycle.

#### Findings resolved

- `DUP-003`

#### Scope

Builder and media-session reference image fields, a neutral shared UI primitive, styles, tests and stories.

#### Out of scope

Validation/persistence consolidation, object-URL ownership changes, Builder generation, Recipe Dock policy, generic form frameworks, or visual redesign.

#### Dependencies

PHASE-003.

#### Risk assessment

- **Regression risk:** Low-medium.
- **Architectural risk:** Medium if the primitive becomes broad.
- **Data/compatibility risk:** Low.
- **User-facing risk:** Medium for keyboard/drop/file behavior.
- **Rollback difficulty:** Low.

#### Implementation sequence

1. Compare DOM, labels, drag depth, events, preview/actions, focus and responsive styles; list lifecycle/policy differences.
2. Pin both components with interaction/a11y tests.
3. Design a controlled primitive owning only input/drop/preview/action presentation.
4. Keep validation, errors, persistence, URLs and feature messages in adapters.
5. If the API needs feature-policy flags or excessive props, do not extract; document `Accepted as intentional`.

#### Graphify requirements

Map both leaf fields, parents, validation/storage/URL dependencies and tests. After update, verify both consume one neutral primitive while feature policy edges remain separate; no reverse feature dependency/cycle or orphan styles.

#### Acceptance criteria

Same accessible names, keyboard/click/drop/replace/remove behavior, error text, preview, focus and responsive layout; Builder remains persistent/immutable and Recipe Dock ephemeral; primitive has one coherent presentation responsibility and at least two genuine consumers.

#### Required validation

Both component/Storybook interaction/a11y suites, upload E2E, visual suite, `npm run quality`, Graphify/module checks.

#### Rollback strategy

Revert extraction to two local fields. If the abstraction proves broader/less clear, mark DUP-003 `Accepted as intentional` with evidence and remove the phase only after validation/documentation.

#### Documentation updates

Resolve or accept DUP-003 with the final API/decision and graph evidence.

#### Standalone implementation prompt

```text
Implement only PHASE-006 (“Share image-picker/drop presentation”), resolving DUP-003 or marking it Accepted as intentional if a narrow safe API is disproven. Read all instructions, findings/plan, Architecture/privacy and affected Builder/Recipe Dock journeys. Verify PHASE-003; inspect status and protect user changes.

Preserve exact accessible names, focus, click/keyboard/drop/replace/remove behavior, validation/error text, responsive visuals and lifecycle differences. Builder uploads remain immutable/persistent; Recipe Dock files remain tab-ephemeral with current object-URL ownership. Do not consolidate storage/validation/generation policy or redesign UI.

Run baselines. Use Graphify to map both fields, parents, tests, styles, validation/storage/URL dependencies, exports, fan-in/out and cycles. Confirm DOM/behavior differences in source and tests.

Add interaction/a11y regression tests first. Extract only a controlled neutral image-picker/drop primitive that owns input/drag-depth/preview/action presentation; leave all feature policy/effects in thin adapters. If a clear API requires many feature flags, surprising callbacks, lifecycle knowledge or a generic form framework, stop the extraction, preserve duplication, and document why DUP-003 is Accepted as intentional.

Run graphify update . and confirm both consumers share only the presentation node, feature policy paths remain separate, no reverse dependency/cycle/orphan style exists. Run both component and Storybook interaction/a11y suites, relevant upload E2E, npm run test:visual and npm run quality.

When criteria pass, mark DUP-003 Resolved (or Accepted as intentional with evidence), append implementation/validation/Graphify/limitations/PHASE-006, preserve history, and add new issues under new IDs. Remove PHASE-006 and its overview row, update counts without renumbering; keep it if incomplete.

Report the API or intentional-duplication decision, behavior/lifecycles preserved, tests/visual/graph validation, failures/new findings, docs, self-removal and next phase.
```

### PHASE-007: Decompose independent Studio root controllers

#### Objective

Keep `StudioApp` as the explicit composition boundary and one persistent stage while extracting stable, independently testable lifecycle controllers and pure notice policy.

#### Findings resolved

- `COMP-001`

#### Scope

Legacy-project availability controller, Character Builder launch/discard coordination, stage-notice derivation, and narrowly typed overlay composition where justified.

#### Out of scope

Global state/context/router; moving `MediaStage`; handoff internals (PHASE-008); UI redesign; command/provider/recording policy changes.

#### Dependencies

PHASE-002, PHASE-003, PHASE-006.

#### Risk assessment

- **Regression risk:** Medium-high.
- **Architectural risk:** Medium-high.
- **Data/compatibility risk:** Medium.
- **User-facing risk:** High if stage remount/focus/notice ordering changes.
- **Rollback difficulty:** Medium.

#### Implementation sequence

1. Characterize render/mount topology, stage identity, overlay focus, pending launch promises, notice priority, and legacy state with tests.
2. Extract pure stage-notice derivation.
3. Extract legacy availability/init/count/storage controller around the already narrowed compatibility repository.
4. Extract Builder launch/discard-confirmation controller with explicit settlement/cancellation.
5. Extract overlay composition only where props remain cohesive; leave resource/session ownership visible at root.
6. Verify render topology and runtime side-effect order.

#### Graphify requirements

Explain StudioApp and impact paths before/after. Confirm fan-out/responsibility edges move to focused controllers, app entry still mounts one root/stage, no new global/singleton/cycle/feature reversal, and new units have direct tests.

#### Acceptance criteria

One persistent `MediaStage` and existing overlay system remain at identical topology; stage/player continuity and exact geometry pass; notice priority, legacy count/errors, Builder launch/discard settlement and focus are unchanged; root has clearly fewer lifecycle responsibilities without prop-bag indirection.

#### Required validation

New controller/pure tests; Studio composition/Storybook; `npm run quality`; `npm run test:coverage`; `npm run test:e2e`; `npm run test:visual`; `npm run test:production`; Graphify/module checks.

#### Rollback strategy

Re-inline focused hooks/components by reverting the phase. No persisted-data or API migration.

#### Documentation updates

Resolve COMP-001 with responsibility/fan-out/topology evidence; update Architecture only if ownership wording changes.

#### Standalone implementation prompt

```text
Implement only PHASE-007 (“Decompose independent Studio root controllers”), resolving COMP-001. Read instructions, findings/plan, Architecture, all affected Studio/legacy/Builder/media/overlay journeys and tests. Verify PHASE-002/003/006; inspect branch/commit/status and protect user changes.

Preserve the sole route, StudioApp composition role, exactly one persistent MediaStage/video/player, resource/session ownership, OverlayPanel system/focus, provider consent, command behavior, notice priority, responsive geometry, legacy compatibility and Builder launch/discard semantics. Do not introduce global state/context/router, move the stage, decompose recipe handoff, redesign UI or hide effects in generic utilities.

Run baselines and add characterization tests for mount identity, pending promise settlement, notice priority, legacy availability/errors and overlay focus. Use Graphify before editing to explain StudioApp, callers/entrypoint, fan-out, dynamic panels, hooks/adapters/tests and change-impact paths; verify source/render topology.

Extract: (1) pure stage-notice derivation, (2) a focused legacy availability/init/count/storage controller over the narrowed compatibility repository, and (3) a focused Character Builder launch/discard-confirmation controller with explicit settlement/cancellation. Extract overlay JSX only when it forms a narrow typed composition unit. Keep media/realtime/recording ownership visible at Studio root and avoid prop-bag indirection.

Run graphify update . and compare fan-out/edges. Confirm the entrypoint still mounts one root/stage, responsibilities moved to tested units, and no cycle/global/singleton/reverse-feature edge appears. Run controller/pure tests, Studio/Storybook suites, npm run quality, npm run test:coverage, npm run test:e2e, npm run test:visual and npm run test:production.

Only after all behavior/topology criteria pass, mark COMP-001 Resolved with files/tests/Graphify before-after/limitations/PHASE-007; preserve history and add new IDs. Remove PHASE-007/overview row, update counts/dependencies without renumbering. Keep it if any validation fails.

Report responsibilities extracted, topology invariants, tests/validation, graph changes, failures/new findings, docs, self-removal and next phase.
```

### PHASE-008: Decompose recipe handoff internals

#### Objective

Separate active identity, reference hydration, Workshop coordination, and Builder preload/attribution internally while retaining one stable facade and source of truth.

#### Findings resolved

- `STATE-001`

#### Scope

`useReferenceRecipeHandoff.ts`, focused internal hooks/reducers/helpers, tests, and only necessary caller adjustments.

#### Out of scope

Changing public facade semantics; adding a global store/cache; provider/API changes; Workshop/Builder redesign; Studio root work already completed.

#### Dependencies

PHASE-003 and PHASE-007.

#### Risk assessment

- **Regression risk:** High.
- **Architectural risk:** High if multiple sources of truth emerge.
- **Data/compatibility risk:** Medium for saved recipe/reference identity.
- **User-facing risk:** High across Shelf/Workshop/Builder.
- **Rollback difficulty:** Medium.

#### Implementation sequence

1. Build a state/effect matrix for exact identity, hydration start/success/failure/retry/stale/abort, recent attribution, Workshop blocking/save/open, and Builder preload.
2. Add focused tests for uncovered transitions and concurrent/stale operations.
3. Extract pure identity/reducer logic, hydration controller, Workshop coordinator, and Builder preload/attribution unit with explicit inputs/outputs.
4. Keep `useReferenceRecipeHandoff` as the single caller facade and authoritative composition of those units.
5. Remove duplicated derived state/effects and prove no duplicate request/commit.

#### Graphify requirements

Explain the hook, all 15+ dependencies, callers and tests. After update, verify cohesive internal clusters, unchanged facade callers/export, no cycle/cross-feature ownership reversal, no duplicated hydration entry, and lower direct fan-out.

#### Acceptance criteria

Facade API and every state/effect matrix outcome remain unchanged; stale async work cannot commit; hydration/retry is not duplicated; exact identity, attribution, draft blocking/replacement and preload behavior pass; new units are independently testable and narrowly owned.

#### Required validation

Focused hook/unit tests; recipe/reference/Workshop/Builder suites; `npm run quality`; `npm run test:coverage`; `npm run test:e2e`; `npm run test:visual`; Graphify/module checks.

#### Rollback strategy

Revert extracted units and facade wiring together. Do not maintain parallel old/new flows.

#### Documentation updates

Resolve STATE-001 with state matrix, public facade confirmation, coverage and graph fan-out evidence; update Architecture only if internal ownership descriptions are present.

#### Standalone implementation prompt

```text
Implement only PHASE-008 (“Decompose recipe handoff internals”), resolving STATE-001. Read all instructions, findings/plan, Architecture and Recipe Shelf/Workshop/Character Builder/reference journeys. Verify PHASE-003/007; inspect branch/commit/status and protect user work.

Preserve useReferenceRecipeHandoff's public facade and exact recipe identity, owner-scoped hydration/retry/error behavior, recent attribution, Workshop draft blocking/replacement/open/save behavior, Builder preload, cancellation/operation-token semantics, accessibility and provider-cost boundaries. Do not add global state/cache/context, redesign UI, change API/provider behavior or keep parallel sources of truth.

Run baselines. Before editing use installed Graphify to explain useReferenceRecipeHandoff, map all callers, imports/exports/tests, hydration and identity paths, Builder/Workshop edges, fan-in/out, cycles/dynamic imports and change impact. Confirm source effects and create a state/effect matrix covering success/failure/retry/stale/abort and cross-tool transitions. Add missing focused tests first.

Extract narrowly owned internals: pure active-recipe identity/reducer logic; one reference hydration/retry controller; Workshop coordination; Builder preload/recent-attribution. Keep the original facade as their authoritative composition. Inputs/outputs and side effects must be explicit; remove duplicated derived state/effects and prove a single hydration/commit path.

Run graphify update . and repeat queries. Verify facade callers/export unchanged, dependencies form cohesive internal clusters, direct fan-out decreases, no cycles/reverse ownership/orphans/duplicate entry paths appear. Run all focused and recipe/reference/Workshop/Builder tests, npm run quality, npm run test:coverage, npm run test:e2e and npm run test:visual.

After every matrix/validation criterion passes, mark STATE-001 Resolved with implementation/files/tests/coverage/Graphify/limitations/PHASE-008; preserve history and add new IDs. Remove PHASE-008/overview row, update counts/dependencies without renumbering. Keep it if incomplete.

Report facade/state decisions, extracted units, async guarantees, tests/coverage, graph diff, validation/failures/new findings, docs, self-removal and next phase.
```

### PHASE-009: Reconcile final documentation

#### Objective

Correct the canonical image-generation filename/link and perform a final evidence-based documentation and architecture validation after all cleanup phases.

#### Findings resolved

- `DOC-001`

#### Scope

Rename `docs/Image_Generartion.md` to `docs/Image_Generation.md`; update all internal links; reconcile docs affected by completed findings; final Graphify/module/validation record.

#### Out of scope

New production cleanup, rewriting historical rationale, claiming the project is defect-free, or dependency/product changes.

#### Dependencies

PHASE-002 through PHASE-008.

#### Risk assessment

- **Regression risk:** Low.
- **Architectural risk:** Low.
- **Data/compatibility risk:** None.
- **User-facing risk:** Low; possible external bookmarks.
- **Rollback difficulty:** Low.

#### Implementation sequence

1. Search all links and external-publication assumptions for the misspelled path.
2. Rename the file and update repository references; do not duplicate canonical content.
3. Re-read documentation map and completed finding notes for contradictions.
4. Run final Graphify architecture/cycle/reachability checks and complete project validation.
5. Ensure all findings have final allowed status and finalize the live plan as instructed.

#### Graphify requirements

Before/after query the image-generation/reference flow and docs references where supported; update the graph; confirm no code/module edge changed, no broken document path, zero cycles, and final architecture matches findings. Use link search/check because Graphify markdown coverage may be incomplete.

#### Acceptance criteria

Correct filename exists; misspelled path has no internal references; documentation map links resolve; current docs do not contradict implemented ownership/visual/compatibility state; every finding has an allowed final status; final validations and Graphify result are recorded.

#### Required validation

Repository link search/check; `npm run quality`; `npm run test:coverage`; `npm run test:e2e`; `npm run test:visual`; `npm run test:production`; `npm run audit:prod` when explicitly authorized; `graphify update .`; final Graphify query and module check.

#### Rollback strategy

Revert rename/link edits. If external link compatibility is required, document a supported redirect mechanism rather than keeping two divergent copies.

#### Documentation updates

Resolve DOC-001. Ensure findings history remains; when this is the final completed phase, replace the phase queue with the required completion statement and final evidence.

#### Standalone implementation prompt

```text
Implement only PHASE-009 (“Reconcile final documentation”), resolving DOC-001 and finalizing the documented cleanup queue. Read all instructions, docs/projectCleanupFindings.md, docs/projectCleanupImplementationPlan.md, README documentation map, Architecture, image-generation/privacy/live-smoke/user-journey docs. Confirm PHASE-002 through PHASE-008 are complete and the safety-net gates remain passing; inspect branch/commit/status and preserve user changes.

Do not implement new cleanup, rewrite historical rationale, change behavior/contracts/data, update dependencies or claim the project is defect-free. Preserve external bookmarks where the actual documentation host has a supported redirect mechanism; do not keep duplicate divergent canonical documents.

Run baselines. Read Graphify instructions and query the current image-generation/reference architecture, doc/source references, entry paths, cycles and final finding impact. Confirm markdown links with repository search because Graphify may not model all links.

Rename docs/Image_Generartion.md to docs/Image_Generation.md, update every internal reference and verify links. Re-read canonical docs against the completed finding records and correct only factual contradictions caused by implemented phases, preserving PRODUCT_EVOLUTION.md/LESSONS.md history.

Run graphify update . and final architecture queries; verify zero unintended code-edge changes/cycles/orphans and correct docs path. Run link checks/search, npm run quality, npm run test:coverage, npm run test:e2e, npm run test:visual, npm run test:production and npm run audit:prod only with explicit authorization. Record environmental/pre-existing limitations accurately.

After all criteria pass, mark DOC-001 Resolved with rename/links/validation/Graphify/limitations/PHASE-009. Confirm every finding is Resolved, Accepted as intentional, or explicitly Blocked. Preserve all historical findings. Remove PHASE-009 and its overview row, update remaining count to zero, and replace the remaining-phases section with “All documented cleanup phases have been completed.” Record final commands/results and final Graphify check. Do not claim all defects are eliminated.

Report DOC-001, files/links/docs changed, final validation/Graphify, remaining limitations/statuses, new findings if any, and confirmation the plan has no remaining phases.
```
