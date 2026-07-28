# Project Cleanup Implementation Plan

## Current status

| Item                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Findings document       | `docs/projectCleanupFindings.md`                                                                                                                                                                                                                                                                                                                                                                                            |
| Date generated          | 2026-07-27                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Audited branch / commit | `Refactor` / `5c7f3e62c9a14b9f044ae7919747bf4cafda3e52`                                                                                                                                                                                                                                                                                                                                                                     |
| Open findings           | 3 unresolved (3 open); TEST-001, TEST-002, TOOL-001, DEAD-001, DEAD-002, DEAD-003, ARCH-001, ARCH-002, DUP-001, DUP-002, and DUP-003 resolved                                                                                                                                                                                                                                                                               |
| Remaining phases        | 3                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Important prerequisites | Use Node 24/npm 11; preserve local-first/provider-cost boundaries and persisted legacy data; keep the passing functional, focused-hook, pruning, and cross-platform visual safety gates green during structural work.                                                                                                                                                                                                       |
| Known baseline failures | None in the completed safety-net scope: functional E2E passes 128 with 10 intentional skips, and Darwin plus Linux/amd64 visual runs each pass all 29 cases.                                                                                                                                                                                                                                                                |
| Other limitations       | `npm run audit:prod` was not authorized because it sends dependency metadata externally. Disposable Linux installs pass with repository-compatible npm 11.6.2; the Playwright image's npm 11.13 requests broader optional-lock normalization and was not adopted.                                                                                                                                                           |
| Graphify status         | PHASE-006 moved the graph from 3,662 nodes / 8,294 edges to a 3,674 / 8,305 code checkpoint, then to 3,662 / 8,293 after roadmap self-removal and final test strengthening, with only the known non-source `hooks.json` zero-node warning. Builder and Recipe Dock now consume one neutral `ImagePickerDropField`; immutable upload policy and tab-ephemeral validation/object-URL policy remain on separate feature paths. |

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

| Phase ID  | Title                                         | Finding IDs | Risk        | Dependencies                | Expected outcome                                                                    |
| --------- | --------------------------------------------- | ----------- | ----------- | --------------------------- | ----------------------------------------------------------------------------------- |
| PHASE-007 | Decompose independent Studio root controllers | COMP-001    | Medium-high | None                        | Smaller composition root with identical stage/overlay topology                      |
| PHASE-008 | Decompose recipe handoff internals            | STATE-001   | High        | PHASE-007                   | Focused state workflows behind the unchanged Studio facade                          |
| PHASE-009 | Reconcile final documentation                 | DOC-001     | Low         | PHASE-007 through PHASE-008 | Correct canonical filename/links and documentation aligned with implemented cleanup |

## Phase sections

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

None.

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

PHASE-007.

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

PHASE-007 through PHASE-008. PHASE-004 through PHASE-006 are complete.

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
Implement only PHASE-009 (“Reconcile final documentation”), resolving DOC-001 and finalizing the documented cleanup queue. Read all instructions, docs/projectCleanupFindings.md, docs/projectCleanupImplementationPlan.md, README documentation map, Architecture, image-generation/privacy/live-smoke/user-journey docs. Confirm PHASE-003 through PHASE-008 are complete and the safety-net gates remain passing; inspect branch/commit/status and preserve user changes.

Do not implement new cleanup, rewrite historical rationale, change behavior/contracts/data, update dependencies or claim the project is defect-free. Preserve external bookmarks where the actual documentation host has a supported redirect mechanism; do not keep duplicate divergent canonical documents.

Run baselines. Read Graphify instructions and query the current image-generation/reference architecture, doc/source references, entry paths, cycles and final finding impact. Confirm markdown links with repository search because Graphify may not model all links.

Rename docs/Image_Generartion.md to docs/Image_Generation.md, update every internal reference and verify links. Re-read canonical docs against the completed finding records and correct only factual contradictions caused by implemented phases, preserving PRODUCT_EVOLUTION.md/LESSONS.md history.

Run graphify update . and final architecture queries; verify zero unintended code-edge changes/cycles/orphans and correct docs path. Run link checks/search, npm run quality, npm run test:coverage, npm run test:e2e, npm run test:visual, npm run test:production and npm run audit:prod only with explicit authorization. Record environmental/pre-existing limitations accurately.

After all criteria pass, mark DOC-001 Resolved with rename/links/validation/Graphify/limitations/PHASE-009. Confirm every finding is Resolved, Accepted as intentional, or explicitly Blocked. Preserve all historical findings. Remove PHASE-009 and its overview row, update remaining count to zero, and replace the remaining-phases section with “All documented cleanup phases have been completed.” Record final commands/results and final Graphify check. Do not claim all defects are eliminated.

Report DOC-001, files/links/docs changed, final validation/Graphify, remaining limitations/statuses, new findings if any, and confirmation the plan has no remaining phases.
```
